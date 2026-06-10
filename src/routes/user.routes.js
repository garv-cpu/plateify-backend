const express = require("express");
const {
  getMe,
  updateMe,
  getMySnaps,
  getSavedRecipes,
  toggleSaveRecipe,
  getAchievements
} = require("../controllers/user.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);
router.get("/me", getMe);
router.patch("/me", updateMe);
router.get("/me/snaps", getMySnaps);
router.get("/me/saved-recipes", getSavedRecipes);
router.get("/me/achievements", getAchievements);
router.patch("/recipe/:recipeId/save", toggleSaveRecipe);

module.exports = router;
