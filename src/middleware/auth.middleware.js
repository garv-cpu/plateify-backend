const User = require("../models/User");
const { verifyAccessToken } = require("../utils/jwt.utils");
const { sendError } = require("../utils/response.utils");

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return sendError(res, "UNAUTHORIZED", "Authorization token is required", 401);
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);

    if (!user) {
      return sendError(res, "UNAUTHORIZED", "User no longer exists", 401);
    }

    req.user = user;
    next();
  } catch (error) {
    return sendError(res, "UNAUTHORIZED", "Invalid or expired token", 401);
  }
};

module.exports = { authenticate };
