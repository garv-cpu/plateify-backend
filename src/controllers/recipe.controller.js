const Recipe = require("../models/Recipe");
const Snap = require("../models/Snap");
const User = require("../models/User");
const { generateIngredientSwap, mapMealAnalysisToRecipe, remixRecipe } = require("../services/openai.service");
const { sendSuccess, sendError } = require("../utils/response.utils");

const getRecipe = async (req, res, next) => {
  try {
    const query = { _id: req.params.recipeId };

    const recipe = await Recipe.findOne(query).populate("snapId");
    if (!recipe) {
      return sendError(res, "RECIPE_NOT_FOUND", "Recipe was not found", 404);
    }

    return sendSuccess(res, { recipe }, "Recipe retrieved");
  } catch (error) {
    return next(error);
  }
};

const recentRecipes = async (req, res, next) => {
  try {
    const recipes = await Recipe.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(10);
    return sendSuccess(res, { recipes }, "Recent recipes retrieved");
  } catch (error) {
    return next(error);
  }
};

const exploreRecipes = async (req, res, next) => {
  try {
    const publicSnaps = await Snap.find({ isPublic: true, status: "done" }).select("recipeId").sort({ createdAt: -1 }).limit(50);
    const recipeIds = publicSnaps.map((snap) => snap.recipeId).filter(Boolean);
    const recipes = await Recipe.find({ _id: { $in: recipeIds } }).populate("snapId").sort({ createdAt: -1 });
    return sendSuccess(res, { recipes }, "Explore recipes retrieved");
  } catch (error) {
    return next(error);
  }
};

const searchRecipes = async (req, res, next) => {
  try {
    const { q = "", cuisine, difficulty } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const publicSnaps = await Snap.find({ isPublic: true, status: "done" }).select("recipeId");
    const query = { _id: { $in: publicSnaps.map((snap) => snap.recipeId).filter(Boolean) } };

    if (q) {
      query.$or = [
        { dishName: { $regex: q, $options: "i" } },
        { cuisine: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } }
      ];
    }
    if (cuisine) query.cuisine = { $regex: cuisine, $options: "i" };
    if (difficulty) query.difficulty = difficulty;

    const [recipes, total] = await Promise.all([
      Recipe.find(query)
        .populate("snapId")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Recipe.countDocuments(query)
    ]);

    return sendSuccess(res, { recipes, pagination: { page, limit, total } }, "Search recipes retrieved");
  } catch (error) {
    return next(error);
  }
};

const swapIngredient = async (req, res, next) => {
  try {
    const { ingredientIndex, newIngredient, reason } = req.body;
    if (!Number.isInteger(Number(ingredientIndex)) || !newIngredient) {
      return sendError(res, "VALIDATION_ERROR", "ingredientIndex and newIngredient are required", 400);
    }

    const recipe = await Recipe.findOne({ _id: req.params.recipeId, userId: req.user._id });
    if (!recipe) return sendError(res, "RECIPE_NOT_FOUND", "Recipe was not found", 404);

    const index = Number(ingredientIndex);
    const originalIngredient = recipe.ingredients[index];
    if (!originalIngredient) return sendError(res, "INVALID_INGREDIENT", "Ingredient index is out of range", 400);

    const update = await generateIngredientSwap({ recipe, ingredientIndex: index, newIngredient, reason });
    if (!update) return sendError(res, "AI_SWAP_FAILED", "Could not update this ingredient", 422);

    recipe.ingredients[index] = update.updatedIngredient;
    const changedSteps = update.updatedSteps.map((step) => step.stepNumber);
    update.updatedSteps.forEach((updatedStep) => {
      const stepIndex = recipe.steps.findIndex((step) => step.stepNumber === updatedStep.stepNumber);
      if (stepIndex >= 0) recipe.steps[stepIndex] = updatedStep;
    });
    recipe.markModified("ingredients");
    recipe.markModified("steps");
    recipe.isRemixed = true;
    recipe.swapHistory.push({
      ingredientIndex: index,
      original: originalIngredient.name,
      replacement: update.updatedIngredient.name,
      reason,
      changedSteps
    });
    await recipe.save();

    return sendSuccess(res, { recipe, updatedIngredient: update.updatedIngredient, updatedSteps: update.updatedSteps }, "Ingredient swapped");
  } catch (error) {
    return next(error);
  }
};

const remix = async (req, res, next) => {
  try {
    const allowed = ["vegan", "keto", "jain", "spicier", "healthier"];
    const { remixType } = req.body;
    if (!allowed.includes(remixType)) {
      return sendError(res, "INVALID_REMIX_TYPE", "Invalid remix type", 400);
    }

    const original = await Recipe.findById(req.params.recipeId).populate("snapId");
    if (!original) return sendError(res, "RECIPE_NOT_FOUND", "Recipe was not found", 404);
    const ownsRecipe = original.userId && original.userId.toString() === req.user._id.toString();
    const isPublicRecipe = Boolean(original.snapId && original.snapId.isPublic);
    if (!ownsRecipe && !isPublicRecipe) return sendError(res, "FORBIDDEN", "You cannot remix this recipe", 403);
    const hasRemix = original.remixType === remixType || original.remixLinks.some((link) => link.remixType === remixType);
    if (hasRemix) return sendError(res, "REMIX_ALREADY_EXISTS", "This remix already exists", 409);

    const analysis = await remixRecipe({ recipe: original, remixType });
    if (!analysis) return sendError(res, "AI_REMIX_FAILED", "Could not remix this recipe", 422);

    const mapped = mapMealAnalysisToRecipe(analysis);
    const recipe = await Recipe.create({
      ...mapped,
      snapId: original.snapId?._id || original.snapId,
      userId: req.user._id,
      isRemixed: true,
      remixType,
      originalRecipeId: original._id
    });
    original.remixLinks.push({ remixType, recipeId: recipe._id });
    await original.save();
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { achievements: "first_remix" } });

    return sendSuccess(res, { recipe }, "Recipe remixed", 201);
  } catch (error) {
    return next(error);
  }
};

module.exports = { getRecipe, recentRecipes, exploreRecipes, searchRecipes, swapIngredient, remix };
