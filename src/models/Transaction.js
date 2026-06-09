const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  razorpayOrderId: { type: String, index: true },
  razorpayPaymentId: { type: String, index: true },
  type: { type: String, enum: ["snap_pack", "pro_subscription"], required: true },
  packSize: { type: Number },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
  snapCreditsAdded: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model("Transaction", transactionSchema);
