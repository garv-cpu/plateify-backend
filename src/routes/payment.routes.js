const express = require("express");
const { createOrder, verifyPayment, webhook, history } = require("../controllers/payment.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { paymentRateLimit } = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.post("/webhook", webhook);
router.post("/create-order", authenticate, paymentRateLimit, createOrder);
router.post("/verify", authenticate, paymentRateLimit, verifyPayment);
router.get("/history", authenticate, paymentRateLimit, history);

module.exports = router;
