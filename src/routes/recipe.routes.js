const express = require("express");
const {
  getRecipe,
  recentRecipes,
  exploreRecipes,
  searchRecipes,
  swapIngredient,
  remix
} = require("../controllers/recipe.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/recent", authenticate, recentRecipes);
router.get("/explore", exploreRecipes);
router.get("/search", searchRecipes);
router.patch("/:recipeId/swap-ingredient", authenticate, swapIngredient);
router.post("/:recipeId/remix", authenticate, remix);
router.get("/:recipeId", authenticate, getRecipe);

module.exports = router;
