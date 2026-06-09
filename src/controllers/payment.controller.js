const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { createOrder: createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature } = require("../services/razorpay.service");
const { addDays, snapPacks } = require("../utils/credits.utils");
const { sendSuccess, sendError } = require("../utils/response.utils");

const proSubscription = { amount: 9900 };

const resolveOrderDetails = (body) => {
  if (body.type === "snap_pack") {
    const packSize = Number(body.packSize || 1);
    const pack = snapPacks[packSize];
    if (!pack) {
      const error = new Error("packSize must be one of 1, 10, or 30");
      error.statusCode = 400;
      error.code = "INVALID_PACK_SIZE";
      throw error;
    }
    return { type: "snap_pack", packSize, amount: pack.amount, credits: pack.credits };
  }

  if (body.type === "pro_subscription") {
    return { type: "pro_subscription", amount: proSubscription.amount, credits: 0 };
  }

  const error = new Error("type must be snap_pack or pro_subscription");
  error.statusCode = 400;
  error.code = "INVALID_PAYMENT_TYPE";
  throw error;
};

const applyPaidTransaction = async (transaction, paymentId) => {
  if (transaction.status === "paid") {
    return { creditsAdded: transaction.snapCreditsAdded };
  }

  const user = await User.findById(transaction.userId);
  if (!user) {
    const error = new Error("Transaction user was not found");
    error.statusCode = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  let creditsAdded = 0;
  if (transaction.type === "snap_pack") {
    const pack = snapPacks[transaction.packSize || 1];
    creditsAdded = pack.credits;
    user.snapCredits += creditsAdded;
    if (user.plan !== "pro") {
      user.plan = "pay_per_snap";
    }
  }

  if (transaction.type === "pro_subscription") {
    user.plan = "pro";
    user.subscriptionExpiresAt = addDays(new Date(), 30);
  }

  transaction.status = "paid";
  transaction.razorpayPaymentId = paymentId || transaction.razorpayPaymentId;
  transaction.snapCreditsAdded = creditsAdded;

  await Promise.all([user.save(), transaction.save()]);
  return { user, creditsAdded };
};

const createOrder = async (req, res, next) => {
  try {
    const details = resolveOrderDetails(req.body);
    const transaction = await Transaction.create({
      userId: req.user._id,
      type: details.type,
      packSize: details.packSize,
      amount: details.amount,
      currency: "INR",
      status: "created"
    });

    const order = await createRazorpayOrder({
      amount: details.amount,
      currency: "INR",
      receipt: transaction._id.toString(),
      notes: {
        userId: req.user._id.toString(),
        transactionId: transaction._id.toString(),
        type: details.type,
        packSize: details.packSize || ""
      }
    });

    transaction.razorpayOrderId = order.id;
    await transaction.save();

    return sendSuccess(
      res,
      { orderId: order.id, amount: details.amount, currency: "INR", key: process.env.RAZORPAY_KEY_ID },
      "Order created",
      201
    );
  } catch (error) {
    return next(error);
  }
};

const verifyPayment = async (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return sendError(res, "VALIDATION_ERROR", "Order ID, payment ID, and signature are required", 400);
    }

    const isValid = verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!isValid) {
      return sendError(res, "INVALID_SIGNATURE", "Payment signature verification failed", 400);
    }

    const transaction = await Transaction.findOne({ razorpayOrderId, userId: req.user._id });
    if (!transaction) {
      return sendError(res, "TRANSACTION_NOT_FOUND", "Transaction was not found", 404);
    }

    const result = await applyPaidTransaction(transaction, razorpayPaymentId);
    return sendSuccess(
      res,
      {
        success: true,
        creditsAdded: result.creditsAdded,
        plan: result.user?.plan || req.user.plan
      },
      "Payment verified"
    );
  } catch (error) {
    return next(error);
  }
};

const webhook = async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

    if (!verifyWebhookSignature(rawBody, signature)) {
      return sendError(res, "INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed", 400);
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    const payment = event.payload?.payment?.entity;

    if (["payment.captured", "subscription.charged"].includes(event.event) && payment) {
      const orderId = payment.order_id;
      const transaction = await Transaction.findOne({ razorpayOrderId: orderId });
      if (transaction && transaction.status !== "paid") {
        await applyPaidTransaction(transaction, payment.id);
      }
    }

    return sendSuccess(res, {}, "Webhook processed");
  } catch (error) {
    return next(error);
  }
};

const history = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments({ userId: req.user._id })
    ]);

    return sendSuccess(res, { transactions, pagination: { page, limit, total } }, "Transaction history retrieved");
  } catch (error) {
    return next(error);
  }
};

module.exports = { createOrder, verifyPayment, webhook, history };
