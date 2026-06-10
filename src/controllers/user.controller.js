const Snap = require("../models/Snap");
const Recipe = require("../models/Recipe");
const { sendSuccess, sendError } = require("../utils/response.utils");

const getMe = async (req, res, next) => {
  try {
    return sendSuccess(res, { user: req.user }, "Profile retrieved");
  } catch (error) {
    return next(error);
  }
};

const updateMe = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    if (name !== undefined) req.user.name = name;
    if (phone !== undefined) req.user.phone = phone;
    await req.user.save();
    return sendSuccess(res, { user: req.user }, "Profile updated");
  } catch (error) {
    return next(error);
  }
};

const getMySnaps = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [snaps, total] = await Promise.all([
      Snap.find({ userId: req.user._id }).populate("recipeId").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Snap.countDocuments({ userId: req.user._id })
    ]);

    return sendSuccess(res, { snaps, pagination: { page, limit, total } }, "Snaps retrieved");
  } catch (error) {
    return next(error);
  }
};

const getSavedRecipes = async (req, res, next) => {
  try {
    const recipes = await Recipe.find({ userId: req.user._id, isSaved: true }).populate("snapId").sort({ createdAt: -1 });
    return sendSuccess(res, { recipes }, "Saved recipes retrieved");
  } catch (error) {
    return next(error);
  }
};

const toggleSaveRecipe = async (req, res, next) => {
  try {
    const recipe = await Recipe.findOne({ _id: req.params.recipeId, userId: req.user._id });
    if (!recipe) {
      return sendError(res, "RECIPE_NOT_FOUND", "Recipe was not found", 404);
    }

    recipe.isSaved = !recipe.isSaved;
    await recipe.save();
    await recipe.populate("snapId");

    return sendSuccess(res, { recipe }, recipe.isSaved ? "Recipe saved" : "Recipe unsaved");
  } catch (error) {
    return next(error);
  }
};

module.exports = { getMe, updateMe, getMySnaps, getSavedRecipes, toggleSaveRecipe };
