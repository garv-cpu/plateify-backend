const { getGeminiModel } = require("../config/gemini");

const prompt = `You are a professional chef and food expert. Analyze this food photo carefully.
Return ONLY a valid JSON object with this exact structure, no markdown, no explanation:
{
  dishName: string,
  cuisine: string,
  prepTime: string,
  cookTime: string,
  servings: number,
  difficulty: 'Easy' | 'Medium' | 'Hard',
  ingredients: [{ name: string, quantity: string, unit: string }],
  steps: [{ stepNumber: number, instruction: string }],
  nutritionEstimate: { calories: number, protein: string, carbs: string, fat: string },
  tags: string[]
}`;

const extractJson = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Gemini did not return a JSON object");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
};

const normalizeRecipe = (recipe) => ({
  dishName: recipe.dishName || "Unknown dish",
  cuisine: recipe.cuisine || "Unknown",
  prepTime: recipe.prepTime || "Unknown",
  cookTime: recipe.cookTime || "Unknown",
  servings: Number(recipe.servings) > 0 ? Number(recipe.servings) : 1,
  difficulty: ["Easy", "Medium", "Hard"].includes(recipe.difficulty) ? recipe.difficulty : "Medium",
  ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
  steps: Array.isArray(recipe.steps) ? recipe.steps : [],
  nutritionEstimate: {
    calories: Number(recipe.nutritionEstimate?.calories) || 0,
    protein: recipe.nutritionEstimate?.protein || "Unknown",
    carbs: recipe.nutritionEstimate?.carbs || "Unknown",
    fat: recipe.nutritionEstimate?.fat || "Unknown"
  },
  tags: Array.isArray(recipe.tags) ? recipe.tags : []
});

const imageUrlToInlineData = async (imageUrl) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Unable to download uploaded image for Gemini analysis");
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    }
  };
};

const generateRecipeFromImage = async (imageUrl) => {
  const model = getGeminiModel();
  const imagePart = await imageUrlToInlineData(imageUrl);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text();
      return normalizeRecipe(extractJson(text));
    } catch (error) {
      if (attempt === 1) {
        console.error("Gemini recipe generation failed", error);
        return null;
      }
    }
  }

  return null;
};

module.exports = { generateRecipeFromImage };
