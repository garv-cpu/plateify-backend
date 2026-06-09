const mongoose = require("mongoose");

const ingredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: String, required: true, trim: true },
    unit: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const stepSchema = new mongoose.Schema(
  {
    stepNumber: { type: Number, required: true, min: 1 },
    instruction: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const recipeSchema = new mongoose.Schema({
  snapId: { type: mongoose.Schema.Types.ObjectId, ref: "Snap", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  dishName: { type: String, required: true, trim: true },
  cuisine: { type: String, trim: true, default: "Unknown" },
  prepTime: { type: String, trim: true, default: "Unknown" },
  cookTime: { type: String, trim: true, default: "Unknown" },
  servings: { type: Number, default: 1, min: 1 },
  difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
  ingredients: { type: [ingredientSchema], default: [] },
  steps: { type: [stepSchema], default: [] },
  nutritionEstimate: {
    calories: { type: Number, default: 0 },
    protein: { type: String, default: "Unknown" },
    carbs: { type: String, default: "Unknown" },
    fat: { type: String, default: "Unknown" }
  },
  tags: { type: [String], default: [] },
  isSaved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model("Recipe", recipeSchema);
