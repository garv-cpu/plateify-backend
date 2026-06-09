const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { getRedis } = require("../config/redis");
const { sendSuccess, sendError } = require("../utils/response.utils");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshTtlSeconds
} = require("../utils/jwt.utils");

const tokenPairFor = async (user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  user.refreshToken = refreshToken;
  await user.save();
  return { accessToken, refreshToken };
};

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return sendError(res, "VALIDATION_ERROR", "Name, email, and password are required", 400);
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return sendError(res, "EMAIL_EXISTS", "An account with this email already exists", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, phone, passwordHash, snapCredits: 3 });
    const tokens = await tokenPairFor(user);

    return sendSuccess(res, { user, ...tokens }, "Registration successful", 201);
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return sendError(res, "VALIDATION_ERROR", "Email and password are required", 400);
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return sendError(res, "INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const tokens = await tokenPairFor(user);
    return sendSuccess(res, { user, ...tokens }, "Login successful");
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return sendError(res, "TOKEN_REQUIRED", "Refresh token is required", 400);
    }

    const redis = getRedis();
    const blacklisted = await redis.get(`blacklist:refresh:${refreshToken}`);
    if (blacklisted) {
      return sendError(res, "TOKEN_REVOKED", "Refresh token has been revoked", 401);
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub);
    if (!user || user.refreshToken !== refreshToken) {
      return sendError(res, "INVALID_REFRESH_TOKEN", "Refresh token is invalid", 401);
    }

    await redis.set(`blacklist:refresh:${refreshToken}`, "1", "EX", refreshTtlSeconds);
    const tokens = await tokenPairFor(user);
    return sendSuccess(res, { user, ...tokens }, "Token refreshed");
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return sendError(res, "TOKEN_REQUIRED", "Refresh token is required", 400);
    }

    const redis = getRedis();
    await redis.set(`blacklist:refresh:${refreshToken}`, "1", "EX", refreshTtlSeconds);
    await User.findOneAndUpdate({ refreshToken }, { $unset: { refreshToken: "" } });

    return sendSuccess(res, {}, "Logged out successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = { register, login, refresh, logout };
