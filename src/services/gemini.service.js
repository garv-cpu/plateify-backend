const { getGeminiModel } = require("../config/gemini");

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const GEMINI_MAX_ATTEMPTS = 3;

const prompt = `You are Plateify's senior food recognition and recipe generation system.
Analyze the provided food image directly using multimodal visual understanding.

Identify the most likely meal, cuisine, visible ingredients, nutrition estimates, and a practical recipe a home cook can follow.
Be conservative: if the image is ambiguous, use a lower confidence score and choose the most visually supported answer.

Return ONLY valid JSON. Do not wrap it in markdown. Do not include explanations outside JSON.

The JSON object must exactly match this shape:
{
  "mealName": "string",
  "cuisine": "string",
  "description": "string",
  "ingredients": ["string"],
  "recipe": ["string"],
  "nutrition": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0
  },
  "confidence": 0,
  "cookingTime": "string",
  "servingSize": 1,
  "difficulty": "Easy"
}

Rules:
- mealName must be a concise dish name.
- cuisine must be the most likely cuisine or "Global" when unclear.
- ingredients must list visually likely ingredients and essential inferred recipe ingredients.
- recipe must contain ordered preparation and cooking steps as plain strings.
- nutrition values are estimated grams except calories, which is kcal.
- confidence must be a number from 0 to 1.
- cookingTime must be a concise total cooking time such as "25 min".
- servingSize must be a positive integer.
- difficulty must be one of "Easy", "Medium", or "Hard".`;

const extractJson = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini did not return a JSON object");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
};

const toNumber = (value, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toPositiveInt = (value, fallback = 1) => {
  const numeric = Math.round(toNumber(value, fallback));
  return numeric > 0 ? numeric : fallback;
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const name = item.name || item.ingredient || item.instruction || item.step;
        const quantity = item.quantity ? ` ${item.quantity}` : "";
        const unit = item.unit ? ` ${item.unit}` : "";
        return `${name || ""}${quantity}${unit}`.trim();
      }
      return "";
    })
    .filter(Boolean);
};

const normalizeConfidence = (value) => {
  const numeric = toNumber(value, 0);
  if (numeric > 1 && numeric <= 100) return Number((numeric / 100).toFixed(2));
  return Math.min(1, Math.max(0, Number(numeric.toFixed(2))));
};

const validateMealAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== "object") {
    throw new Error("Gemini response is not an object");
  }

  const nutrition = analysis.nutrition && typeof analysis.nutrition === "object" ? analysis.nutrition : {};
  const normalized = {
    mealName: String(analysis.mealName || analysis.dishName || "").trim(),
    cuisine: String(analysis.cuisine || "Global").trim(),
    description: String(analysis.description || "").trim(),
    ingredients: toStringArray(analysis.ingredients),
    recipe: toStringArray(analysis.recipe || analysis.steps),
    nutrition: {
      calories: Math.round(toNumber(nutrition.calories, 0)),
      protein: Math.round(toNumber(nutrition.protein, 0)),
      carbs: Math.round(toNumber(nutrition.carbs, 0)),
      fat: Math.round(toNumber(nutrition.fat, 0))
    },
    confidence: normalizeConfidence(analysis.confidence),
    cookingTime: String(analysis.cookingTime || analysis.cookTime || analysis.prepTime || "Unknown").trim(),
    servingSize: toPositiveInt(analysis.servingSize || analysis.servings, 1),
    difficulty: ["Easy", "Medium", "Hard"].includes(analysis.difficulty) ? analysis.difficulty : "Medium"
  };

  const validationErrors = [];
  if (!normalized.mealName) validationErrors.push("mealName is required");
  if (!normalized.cuisine) validationErrors.push("cuisine is required");
  if (!normalized.description) validationErrors.push("description is required");
  if (normalized.ingredients.length === 0) validationErrors.push("ingredients must not be empty");
  if (normalized.recipe.length === 0) validationErrors.push("recipe must not be empty");
  if (normalized.nutrition.calories <= 0) validationErrors.push("nutrition.calories must be positive");
  if (normalized.confidence <= 0) validationErrors.push("confidence must be positive");

  if (validationErrors.length > 0) {
    throw new Error(`Invalid Gemini meal analysis: ${validationErrors.join(", ")}`);
  }

  return normalized;
};

const imageUrlToInlineData = async (imageUrl) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(imageUrl, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`Unable to download uploaded image for Gemini analysis: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    throw new Error(`Cloudinary URL did not return an image content type: ${mimeType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("Downloaded image is empty");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Downloaded image exceeds Gemini analysis size limit");
  }

  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    }
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const mapMealAnalysisToRecipe = (analysis) => ({
  dishName: analysis.mealName,
  cuisine: analysis.cuisine,
  description: analysis.description,
  prepTime: "Unknown",
  cookTime: analysis.cookingTime,
  servings: analysis.servingSize,
  difficulty: analysis.difficulty,
  ingredients: analysis.ingredients.map((ingredient) => ({
    name: ingredient,
    quantity: "As needed",
    unit: ""
  })),
  steps: analysis.recipe.map((instruction, index) => ({
    stepNumber: index + 1,
    instruction
  })),
  nutritionEstimate: {
    calories: analysis.nutrition.calories,
    protein: `${analysis.nutrition.protein}g`,
    carbs: `${analysis.nutrition.carbs}g`,
    fat: `${analysis.nutrition.fat}g`
  },
  confidence: analysis.confidence,
  tags: [analysis.cuisine, analysis.difficulty].filter(Boolean)
});

const createJsonModel = () =>
  getGeminiModel({
    temperature: 0.25,
    topP: 0.85,
    topK: 32,
    responseMimeType: "application/json"
  });

const generateIngredientSwap = async ({ recipe, ingredientIndex, newIngredient, reason }) => {
  const ingredient = recipe.ingredients[ingredientIndex];
  if (!ingredient) {
    throw new Error("Ingredient index is out of range");
  }

  const oldIngredient = ingredient.name;
  const affectedSteps = recipe.steps.filter((step) =>
    step.instruction.toLowerCase().includes(oldIngredient.toLowerCase().split(" ")[0])
  );
  const stepsToRewrite = affectedSteps.length ? affectedSteps : recipe.steps;
  const model = createJsonModel();
  const swapPrompt = `You are a professional chef updating only affected recipe steps.
Return ONLY valid JSON:
{
  "updatedIngredient": { "name": "string", "quantity": "string", "unit": "string" },
  "updatedSteps": [{ "stepNumber": 1, "instruction": "string" }]
}

Recipe: ${recipe.dishName}
Original ingredient: ${oldIngredient}
Replacement ingredient: ${newIngredient}
Reason: ${reason || "Not provided"}
Current steps to revise:
${stepsToRewrite.map((step) => `${step.stepNumber}. ${step.instruction}`).join("\n")}

Rules:
- Rewrite only the listed steps.
- Keep stepNumber values unchanged.
- Adapt cooking technique if needed for the replacement.
- Do not alter unrelated steps.`;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log("[Gemini] Ingredient swap request", { recipeId: recipe._id.toString(), ingredientIndex, attempt });
      const result = await model.generateContent(swapPrompt);
      const json = extractJson(result.response.text());
      const updatedSteps = Array.isArray(json.updatedSteps)
        ? json.updatedSteps
            .map((step) => ({
              stepNumber: toPositiveInt(step.stepNumber, 0),
              instruction: String(step.instruction || "").trim()
            }))
            .filter((step) => step.stepNumber > 0 && step.instruction)
        : [];

      if (!json.updatedIngredient || !json.updatedIngredient.name || updatedSteps.length === 0) {
        throw new Error("Gemini swap response failed validation");
      }

      return {
        updatedIngredient: {
          name: String(json.updatedIngredient.name).trim(),
          quantity: String(json.updatedIngredient.quantity || ingredient.quantity || "As needed").trim(),
          unit: String(json.updatedIngredient.unit || ingredient.unit || "").trim()
        },
        updatedSteps
      };
    } catch (error) {
      console.error("[Gemini] Ingredient swap attempt failed", { attempt, message: error.message });
      if (attempt < GEMINI_MAX_ATTEMPTS) await delay(300 * attempt);
    }
  }

  return null;
};

const remixRecipe = async ({ recipe, remixType }) => {
  const model = createJsonModel();
  const remixPrompt = `${prompt}

Remix this existing recipe into a ${remixType} version.
Existing recipe:
${JSON.stringify({
  mealName: recipe.dishName,
  cuisine: recipe.cuisine,
  description: recipe.description,
  ingredients: recipe.ingredients.map((item) => `${item.name} ${item.quantity || ""} ${item.unit || ""}`.trim()),
  recipe: recipe.steps.map((step) => step.instruction),
  nutrition: recipe.nutritionEstimate,
  cookingTime: recipe.cookTime,
  servingSize: recipe.servings,
  difficulty: recipe.difficulty
})}

Return the same required JSON shape. Make the recipe genuinely match the ${remixType} constraint.`;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log("[Gemini] Recipe remix request", { recipeId: recipe._id.toString(), remixType, attempt });
      const result = await model.generateContent(remixPrompt);
      return validateMealAnalysis(extractJson(result.response.text()));
    } catch (error) {
      console.error("[Gemini] Recipe remix attempt failed", { attempt, message: error.message });
      if (attempt < GEMINI_MAX_ATTEMPTS) await delay(300 * attempt);
    }
  }

  return null;
};

const analyzeMealImage = async (imageUrl) => {
  const startedAt = Date.now();
  console.log("[Gemini] Meal image analysis started", { imageUrl });

  const model = createJsonModel();
  const imagePart = await imageUrlToInlineData(imageUrl);

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log("[Gemini] Sending multimodal request", { attempt, maxAttempts: GEMINI_MAX_ATTEMPTS });
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      const analysis = validateMealAnalysis(extractJson(text));

      console.log("[Gemini] Meal image analysis completed", {
        attempt,
        durationMs: Date.now() - startedAt,
        mealName: analysis.mealName,
        confidence: analysis.confidence
      });

      return analysis;
    } catch (error) {
      console.error("[Gemini] Meal image analysis attempt failed", {
        attempt,
        durationMs: Date.now() - startedAt,
        message: error.message
      });

      if (attempt < GEMINI_MAX_ATTEMPTS) {
        await delay(350 * attempt);
      }
    }
  }

  console.error("[Gemini] Meal image analysis failed after retries", {
    attempts: GEMINI_MAX_ATTEMPTS,
    durationMs: Date.now() - startedAt
  });
  return null;
};

const generateRecipeFromImage = async (imageUrl) => {
  const analysis = await analyzeMealImage(imageUrl);
  return analysis ? mapMealAnalysisToRecipe(analysis) : null;
};

module.exports = {
  analyzeMealImage,
  generateRecipeFromImage,
  mapMealAnalysisToRecipe,
  generateIngredientSwap,
  remixRecipe
};
