const OpenAI = require("openai");

const OPENAI_MAX_ATTEMPTS = 3;
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
const OPENAI_MODEL = process.env.OPENAI_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

let lastMealAnalysisError = null;

const mealAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: ["mealName", "cuisine", "description", "ingredients", "nutrition", "confidence"],
  properties: {
    mealName: { type: "string" },
    cuisine: { type: "string" },
    description: { type: "string" },
    ingredients: { type: "array", items: { type: "string" } },
    nutrition: {
      type: "object",
      additionalProperties: false,
      required: ["calories", "protein", "carbs", "fat"],
      properties: {
        calories: { type: "number" },
        protein: { type: "number" },
        carbs: { type: "number" },
        fat: { type: "number" }
      }
    },
    confidence: { type: "number" }
  }
};

const recipeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["recipeName", "ingredients", "steps", "cookTime", "servings", "tips", "difficulty"],
  properties: {
    recipeName: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "unit"],
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          unit: { type: "string" }
        }
      }
    },
    steps: { type: "array", items: { type: "string" } },
    cookTime: { type: "string" },
    servings: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
    difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] }
  }
};

const swapSchema = {
  type: "object",
  additionalProperties: false,
  required: ["updatedIngredient", "updatedSteps"],
  properties: {
    updatedIngredient: {
      type: "object",
      additionalProperties: false,
      required: ["name", "quantity", "unit"],
      properties: {
        name: { type: "string" },
        quantity: { type: "string" },
        unit: { type: "string" }
      }
    },
    updatedSteps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["stepNumber", "instruction"],
        properties: {
          stepNumber: { type: "number" },
          instruction: { type: "string" }
        }
      }
    }
  }
};

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }

  // Central OpenAI SDK client. Keep this server-side only so API keys never reach mobile clients.
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: 0
  });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toNumber = (value, fallback = 0) => {
  const numeric = typeof value === "number" ? value : Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toPositiveInt = (value, fallback = 1) => {
  const numeric = Math.round(toNumber(value, fallback));
  return numeric > 0 ? numeric : fallback;
};

const normalizeConfidence = (value) => {
  const numeric = toNumber(value, 0);
  if (numeric > 1 && numeric <= 100) return Number((numeric / 100).toFixed(2));
  return Math.min(1, Math.max(0, Number(numeric.toFixed(2))));
};

const responseJson = (response) => {
  const text = response.output_text || "";
  if (!text) throw new Error("OpenAI response did not include output_text");
  return JSON.parse(text);
};

const classifyOpenAIError = (error) => {
  const status = error?.status || error?.code;
  const message = error?.message || String(error || "");
  const lower = message.toLowerCase();

  if (!process.env.OPENAI_API_KEY) {
    return { code: "OPENAI_CONFIG_ERROR", message: "OPENAI_API_KEY is required", retryable: false, statusCode: 500 };
  }

  if (status === 401 || lower.includes("invalid api key")) {
    return { code: "OPENAI_AUTH_FAILED", message: "OpenAI authentication failed. Check OPENAI_API_KEY.", retryable: false, statusCode: 500 };
  }

  if (status === 429 && (lower.includes("quota") || lower.includes("billing"))) {
    return {
      code: "OPENAI_QUOTA_EXCEEDED",
      message: "OpenAI quota or billing limit was reached. Check project billing, usage limits, or use another API key.",
      retryable: false,
      statusCode: 429
    };
  }

  if (status === 408 || status === 409 || status === 429 || status >= 500 || error?.name === "APIConnectionTimeoutError") {
    return { code: "OPENAI_TEMPORARY_FAILURE", message, retryable: true, statusCode: status === 429 ? 429 : 502 };
  }

  return { code: "OPENAI_API_FAILED", message, retryable: false, statusCode: status && Number(status) >= 400 ? Number(status) : 502 };
};

const callOpenAIJson = async ({ name, schema, input, logContext }) => {
  const client = getOpenAIClient();

  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log("[OpenAI] Structured request", { name, attempt, model: OPENAI_MODEL, ...logContext });
      const response = await client.responses.create({
        model: OPENAI_MODEL,
        input,
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema
          }
        }
      });
      return responseJson(response);
    } catch (error) {
      const openAIError = classifyOpenAIError(error);
      console.error("[OpenAI] Structured request failed", {
        name,
        attempt,
        code: openAIError.code,
        message: openAIError.message,
        ...logContext
      });

      if (!openAIError.retryable || attempt === OPENAI_MAX_ATTEMPTS) {
        throw Object.assign(new Error(openAIError.message), openAIError);
      }

      await delay(400 * attempt);
    }
  }

  throw new Error("OpenAI request failed");
};

const validateMealAnalysis = (analysis) => {
  const nutrition = analysis.nutrition && typeof analysis.nutrition === "object" ? analysis.nutrition : {};
  const normalized = {
    mealName: String(analysis.mealName || "").trim(),
    cuisine: String(analysis.cuisine || "Global").trim(),
    description: String(analysis.description || "").trim(),
    ingredients: Array.isArray(analysis.ingredients) ? analysis.ingredients.map((item) => String(item).trim()).filter(Boolean) : [],
    nutrition: {
      calories: Math.round(toNumber(nutrition.calories, 0)),
      protein: Math.round(toNumber(nutrition.protein, 0)),
      carbs: Math.round(toNumber(nutrition.carbs, 0)),
      fat: Math.round(toNumber(nutrition.fat, 0))
    },
    confidence: normalizeConfidence(analysis.confidence)
  };

  const validationErrors = [];
  if (!normalized.mealName) validationErrors.push("mealName is required");
  if (!normalized.cuisine) validationErrors.push("cuisine is required");
  if (!normalized.description) validationErrors.push("description is required");
  if (normalized.ingredients.length === 0) validationErrors.push("ingredients must not be empty");
  if (normalized.nutrition.calories <= 0) validationErrors.push("nutrition.calories must be positive");
  if (normalized.confidence <= 0) validationErrors.push("confidence must be positive");
  if (validationErrors.length) throw new Error(`Invalid OpenAI meal analysis: ${validationErrors.join(", ")}`);

  return normalized;
};

const validateRecipe = (recipe) => {
  const normalized = {
    recipeName: String(recipe.recipeName || "").trim(),
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients
          .map((ingredient) => ({
            name: String(ingredient.name || "").trim(),
            quantity: String(ingredient.quantity || "As needed").trim(),
            unit: String(ingredient.unit || "").trim()
          }))
          .filter((ingredient) => ingredient.name)
      : [],
    steps: Array.isArray(recipe.steps) ? recipe.steps.map((step) => String(step).trim()).filter(Boolean) : [],
    cookTime: String(recipe.cookTime || "Unknown").trim(),
    servings: String(recipe.servings || "1").trim(),
    tips: Array.isArray(recipe.tips) ? recipe.tips.map((tip) => String(tip).trim()).filter(Boolean) : [],
    difficulty: ["Easy", "Medium", "Hard"].includes(recipe.difficulty) ? recipe.difficulty : "Medium"
  };

  const validationErrors = [];
  if (!normalized.recipeName) validationErrors.push("recipeName is required");
  if (normalized.ingredients.length === 0) validationErrors.push("ingredients must not be empty");
  if (normalized.steps.length === 0) validationErrors.push("steps must not be empty");
  if (!normalized.cookTime) validationErrors.push("cookTime is required");
  if (validationErrors.length) throw new Error(`Invalid OpenAI recipe: ${validationErrors.join(", ")}`);

  return normalized;
};

const analyzeMealImage = async (imageUrl) => {
  const startedAt = Date.now();
  lastMealAnalysisError = null;

  try {
    // OpenAI Vision integration point: Cloudinary URL is passed directly as an image input.
    const result = await callOpenAIJson({
      name: "plateify_meal_analysis",
      schema: mealAnalysisSchema,
      logContext: { imageUrl },
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Analyze this food image. Identify the dish, cuisine, visible and likely ingredients, nutrition estimates, and confidence. Return only the requested JSON."
            },
            { type: "input_image", image_url: imageUrl, detail: "high" }
          ]
        }
      ]
    });

    const analysis = validateMealAnalysis(result);
    console.log("[OpenAI] Meal image analysis completed", {
      durationMs: Date.now() - startedAt,
      mealName: analysis.mealName,
      confidence: analysis.confidence
    });
    return analysis;
  } catch (error) {
    const openAIError = classifyOpenAIError(error);
    lastMealAnalysisError = openAIError;
    console.error("[OpenAI] Meal image analysis failed", {
      durationMs: Date.now() - startedAt,
      code: openAIError.code,
      message: openAIError.message
    });
    return null;
  }
};

const generateRecipe = async (mealData) => {
  const result = await callOpenAIJson({
    name: "plateify_recipe",
    schema: recipeSchema,
    logContext: { mealName: mealData.mealName },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Create a practical home-cook recipe from this meal analysis. Preserve the cuisine and make steps realistic.
Meal analysis:
${JSON.stringify(mealData)}`
          }
        ]
      }
    ]
  });

  return validateRecipe(result);
};

const mapMealAnalysisToRecipe = (analysis, generatedRecipe) => {
  const recipe = generatedRecipe || {
    recipeName: analysis.mealName,
    ingredients: analysis.ingredients.map((ingredient) => ({ name: ingredient, quantity: "As needed", unit: "" })),
    steps: analysis.recipe || [],
    cookTime: analysis.cookingTime || "Unknown",
    servings: analysis.servingSize || 1,
    difficulty: analysis.difficulty || "Medium",
    tips: []
  };

  return {
    dishName: recipe.recipeName || analysis.mealName,
    cuisine: analysis.cuisine,
    description: analysis.description,
    prepTime: "Unknown",
    cookTime: recipe.cookTime,
    servings: toPositiveInt(recipe.servings, 1),
    difficulty: recipe.difficulty,
    ingredients: recipe.ingredients,
    steps: recipe.steps.map((instruction, index) => ({
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
    tags: [analysis.cuisine, recipe.difficulty].filter(Boolean)
  };
};

const generateIngredientSwap = async ({ recipe, ingredientIndex, newIngredient, reason }) => {
  const ingredient = recipe.ingredients[ingredientIndex];
  if (!ingredient) throw new Error("Ingredient index is out of range");

  const stepsToRewrite = recipe.steps.filter((step) =>
    step.instruction.toLowerCase().includes(ingredient.name.toLowerCase().split(" ")[0])
  );
  const targetSteps = stepsToRewrite.length ? stepsToRewrite : recipe.steps;

  const result = await callOpenAIJson({
    name: "plateify_ingredient_swap",
    schema: swapSchema,
    logContext: { recipeId: recipe._id.toString(), ingredientIndex },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Update only affected recipe steps for an ingredient replacement.
Recipe: ${recipe.dishName}
Original ingredient: ${ingredient.name}
Replacement ingredient: ${newIngredient}
Reason: ${reason || "Not provided"}
Steps to revise:
${targetSteps.map((step) => `${step.stepNumber}. ${step.instruction}`).join("\n")}`
          }
        ]
      }
    ]
  });

  const updatedSteps = Array.isArray(result.updatedSteps)
    ? result.updatedSteps
        .map((step) => ({
          stepNumber: toPositiveInt(step.stepNumber, 0),
          instruction: String(step.instruction || "").trim()
        }))
        .filter((step) => step.stepNumber > 0 && step.instruction)
    : [];

  if (!result.updatedIngredient?.name || updatedSteps.length === 0) return null;

  return {
    updatedIngredient: {
      name: String(result.updatedIngredient.name).trim(),
      quantity: String(result.updatedIngredient.quantity || ingredient.quantity || "As needed").trim(),
      unit: String(result.updatedIngredient.unit || ingredient.unit || "").trim()
    },
    updatedSteps
  };
};

const remixRecipe = async ({ recipe, remixType }) => {
  const analysis = validateMealAnalysis({
    mealName: recipe.dishName,
    cuisine: recipe.cuisine,
    description: recipe.description || `${recipe.dishName} remixed as ${remixType}.`,
    ingredients: recipe.ingredients.map((item) => `${item.name} ${item.quantity || ""} ${item.unit || ""}`.trim()),
    nutrition: {
      calories: recipe.nutritionEstimate?.calories || 0,
      protein: recipe.nutritionEstimate?.protein || 0,
      carbs: recipe.nutritionEstimate?.carbs || 0,
      fat: recipe.nutritionEstimate?.fat || 0
    },
    confidence: recipe.confidence || 0.8
  });

  const generated = await generateRecipe({
    ...analysis,
    remixType,
    instruction: `Make this recipe genuinely ${remixType}.`
  });

  return {
    ...analysis,
    mealName: generated.recipeName,
    ingredients: generated.ingredients.map((ingredient) => `${ingredient.name} ${ingredient.quantity || ""} ${ingredient.unit || ""}`.trim()),
    recipe: generated.steps,
    cookingTime: generated.cookTime,
    servingSize: toPositiveInt(generated.servings, 1),
    difficulty: generated.difficulty
  };
};

const getLastMealAnalysisError = () => lastMealAnalysisError;

module.exports = {
  analyzeMealImage,
  generateRecipe,
  mapMealAnalysisToRecipe,
  generateIngredientSwap,
  remixRecipe,
  getLastMealAnalysisError
};
