const express = require("express");
const { getRecipe, recentRecipes, exploreRecipes } = require("../controllers/recipe.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/recent", authenticate, recentRecipes);
router.get("/explore", exploreRecipes);
router.get("/:recipeId", authenticate, getRecipe);

module.exports = router;
