const Recipe = require("../models/Recipe");
const { sendSuccess, sendError } = require("../utils/response.utils");

const getRecipe = async (req, res, next) => {
  try {
    const query = { _id: req.params.recipeId };
    if (req.user) {
      query.userId = req.user._id;
    }

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
    const recipes = await Recipe.find({}).sort({ createdAt: -1 }).limit(50).select("-userId");
    return sendSuccess(res, { recipes }, "Explore recipes retrieved");
  } catch (error) {
    return next(error);
  }
};

module.exports = { getRecipe, recentRecipes, exploreRecipes };
