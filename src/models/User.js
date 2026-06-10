const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true },
    plan: { type: String, enum: ["free", "pay_per_snap", "pro"], default: "free" },
    snapCredits: { type: Number, default: 3, min: 0 },
    totalSnapsUsed: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastSnapDate: { type: Date, default: null },
    achievements: { type: [String], default: [] },
    subscriptionExpiresAt: { type: Date, default: null },
    razorpayCustomerId: { type: String },
    refreshToken: { type: String }
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function toJSON() {
  const user = this.toObject();
  delete user.passwordHash;
  delete user.refreshToken;
  return user;
};

module.exports = mongoose.model("User", userSchema);
