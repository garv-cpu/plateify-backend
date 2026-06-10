const Snap = require("../models/Snap");
const Recipe = require("../models/Recipe");
const { uploadImage } = require("../services/cloudinary.service");
const { analyzeMealImage, mapMealAnalysisToRecipe } = require("../services/gemini.service");
const { canCreateSnap, hasActiveProPlan } = require("../utils/credits.utils");
const { sendSuccess, sendError } = require("../utils/response.utils");

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const daysBetween = (earlier, later) => Math.round((startOfDay(later) - startOfDay(earlier)) / 86400000);

const updateSnapStreak = (user) => {
  const now = new Date();
  let currentStreak = user.currentStreak || 0;

  if (!user.lastSnapDate) {
    currentStreak = 1;
  } else {
    const diff = daysBetween(user.lastSnapDate, now);
    if (diff === 1) currentStreak += 1;
    if (diff > 1) currentStreak = 1;
  }

  user.currentStreak = currentStreak;
  user.longestStreak = Math.max(user.longestStreak || 0, currentStreak);
  user.lastSnapDate = now;

  const achievements = new Set(user.achievements || []);
  if (user.totalSnapsUsed + 1 >= 1) achievements.add("first_snap");
  if (user.totalSnapsUsed + 1 >= 10) achievements.add("ten_snaps");
  if (user.totalSnapsUsed + 1 >= 25) achievements.add("twenty_five_snaps");
  if (currentStreak >= 7) achievements.add("seven_day_streak");
  user.achievements = Array.from(achievements);

  let milestone = null;
  if (currentStreak === 3) milestone = "three_day_streak";
  if (currentStreak === 7) {
    milestone = "seven_day_streak";
    user.snapCredits += 2;
  }
  if (currentStreak === 30) {
    milestone = "thirty_day_streak";
    user.plan = "pro";
    achievements.add("plateify_legend");
    user.achievements = Array.from(achievements);
  }

  return { currentStreak: user.currentStreak, longestStreak: user.longestStreak, milestone };
};

const createSnap = async (req, res, next) => {
  try {
    const user = req.user;
    if (!canCreateSnap(user)) {
      return sendError(res, "NO_CREDITS", "Buy snaps or subscribe", 402);
    }

    console.log("[Snap] Create snap requested", { userId: user._id.toString(), fileSize: req.file.size, mimeType: req.file.mimetype });

    const isPublic = req.body.isPublic === undefined ? true : String(req.body.isPublic) === "true";
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
      isPublic,
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

    const streak = updateSnapStreak(user);
    user.totalSnapsUsed += 1;
    await user.save();

    console.log("[Snap] Recipe generated successfully", {
      snapId: snap._id.toString(),
      recipeId: recipe._id.toString(),
      mealName: mealAnalysis.mealName,
      confidence: mealAnalysis.confidence
    });

    return sendSuccess(res, { snap, recipe, mealAnalysis, user, streak }, "Recipe generated successfully", 201);
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

const updatePrivacy = async (req, res, next) => {
  try {
    const { isPublic } = req.body;
    if (typeof isPublic !== "boolean") {
      return sendError(res, "VALIDATION_ERROR", "isPublic boolean is required", 400);
    }

    const snap = await Snap.findOneAndUpdate(
      { _id: req.params.snapId, userId: req.user._id },
      { isPublic },
      { new: true }
    ).populate("recipeId");

    if (!snap) return sendError(res, "SNAP_NOT_FOUND", "Snap was not found", 404);
    return sendSuccess(res, { snap }, "Snap privacy updated");
  } catch (error) {
    return next(error);
  }
};

module.exports = { createSnap, getSnap, updatePrivacy };
