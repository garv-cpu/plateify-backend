const { getRedis } = require("../config/redis");
const { sendError } = require("../utils/response.utils");

const redisRateLimit = ({ prefix, limit, windowSeconds, identifier }) => {
  return async (req, res, next) => {
    try {
      const redis = getRedis();
      const identity = identifier(req);
      const key = `rate:${prefix}:${identity}`;
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (current > limit) {
        return sendError(res, "RATE_LIMITED", "Too many requests. Please try again later.", 429);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

const loginRateLimit = redisRateLimit({
  prefix: "auth:login",
  limit: 5,
  windowSeconds: 15 * 60,
  identifier: (req) => req.ip
});

const snapCreateRateLimit = redisRateLimit({
  prefix: "snap:create",
  limit: 10,
  windowSeconds: 60 * 60,
  identifier: (req) => req.user._id.toString()
});

const paymentRateLimit = redisRateLimit({
  prefix: "payment",
  limit: 20,
  windowSeconds: 60 * 60,
  identifier: (req) => req.user._id.toString()
});

module.exports = { loginRateLimit, snapCreateRateLimit, paymentRateLimit };
