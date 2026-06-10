const Snap = require("../models/Snap");
const Recipe = require("../models/Recipe");
const { uploadImage } = require("../services/cloudinary.service");
const { analyzeMealImage, mapMealAnalysisToRecipe } = require("../services/gemini.service");
const { canCreateSnap, hasActiveProPlan } = require("../utils/credits.utils");
const { sendSuccess, sendError } = require("../utils/response.utils");

const createSnap = async (req, res, next) => {
  try {
    const user = req.user;
    if (!canCreateSnap(user)) {
      return sendError(res, "NO_CREDITS", "Buy snaps or subscribe", 402);
    }

    console.log("[Snap] Create snap requested", { userId: user._id.toString(), fileSize: req.file.size, mimeType: req.file.mimetype });

    const uploaded = await uploadImage({ file: req.file, userId: user._id.toString() });
    console.log("[Snap] Image uploaded to Cloudinary", { userId: user._id.toString(), publicId: uploaded.publicId });

    const creditsUsed = hasActiveProPlan(user) ? 0 : 1;

    if (creditsUsed === 1) {
      user.snapCredits -= 1;
      user.plan = user.snapCredits > 0 ? user.plan : "pay_per_snap";
      await user.save();
    }

    const snap = await Snap.create({
      userId: user._id,
      imageUrl: uploaded.url,
      imagePublicId: uploaded.publicId,
      status: "processing",
      creditsUsed
    });

    const mealAnalysis = await analyzeMealImage(uploaded.url);
    if (!mealAnalysis) {
      snap.status = "failed";
      await snap.save();
      if (creditsUsed === 1) {
        user.snapCredits += 1;
        await user.save();
      }
      console.error("[Snap] Gemini meal analysis failed", { snapId: snap._id.toString(), userId: user._id.toString() });
      return sendError(res, "RECIPE_GENERATION_FAILED", "Could not generate a recipe from this image", 422);
    }

    const generated = mapMealAnalysisToRecipe(mealAnalysis);
    const recipe = await Recipe.create({
      ...generated,
      snapId: snap._id,
      userId: user._id
    });

    snap.status = "done";
    snap.recipeId = recipe._id;
    await snap.save();

    user.totalSnapsUsed += 1;
    await user.save();

    console.log("[Snap] Recipe generated successfully", {
      snapId: snap._id.toString(),
      recipeId: recipe._id.toString(),
      mealName: mealAnalysis.mealName,
      confidence: mealAnalysis.confidence
    });

    return sendSuccess(res, { snap, recipe, mealAnalysis }, "Recipe generated successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getSnap = async (req, res, next) => {
  try {
    const snap = await Snap.findOne({ _id: req.params.snapId, userId: req.user._id }).populate("recipeId");
    if (!snap) {
      return sendError(res, "SNAP_NOT_FOUND", "Snap was not found", 404);
    }

    return sendSuccess(res, { snap, recipe: snap.recipeId || null }, "Snap retrieved");
  } catch (error) {
    return next(error);
  }
};

module.exports = { createSnap, getSnap };
