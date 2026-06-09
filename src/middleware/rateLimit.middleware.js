const rateLimit = require("express-rate-limit");

const rateLimitHandler = (req, res) => {
  return res.status(429).json({
    success: false,
    error: "RATE_LIMITED",
    message: "Too many requests. Please try again later."
  });
};

const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
});

const snapCreateRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: rateLimitHandler
});

const paymentRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user._id.toString(),
  handler: rateLimitHandler
});

module.exports = { generalRateLimit, loginRateLimit, snapCreateRateLimit, paymentRateLimit };
