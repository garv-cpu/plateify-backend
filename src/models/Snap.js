const mongoose = require("mongoose");

const snapSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  imageUrl: { type: String, required: true },
  imagePublicId: { type: String },
  status: { type: String, enum: ["processing", "done", "failed"], default: "processing", index: true },
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
  creditsUsed: { type: Number, default: 1, min: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model("Snap", snapSchema);
