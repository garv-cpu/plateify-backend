const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");

const accessTtl = "15m";
const refreshTtl = "7d";

const requireSecret = (name) => {
  if (!process.env[name]) {
    throw new Error(`${name} is required`);
  }
  return process.env[name];
};

const signAccessToken = (user) => {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, requireSecret("JWT_ACCESS_SECRET"), {
    expiresIn: accessTtl
  });
};

const signRefreshToken = (user) => {
  return jwt.sign({ sub: user._id.toString(), tokenId: randomUUID() }, requireSecret("JWT_REFRESH_SECRET"), {
    expiresIn: refreshTtl
  });
};

const verifyAccessToken = (token) => jwt.verify(token, requireSecret("JWT_ACCESS_SECRET"));
const verifyRefreshToken = (token) => jwt.verify(token, requireSecret("JWT_REFRESH_SECRET"));

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
