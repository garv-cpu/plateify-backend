const { sendError } = require("../utils/response.utils");

const notFoundHandler = (req, res) => {
  return sendError(res, "NOT_FOUND", `Route ${req.originalUrl} was not found`, 404);
};

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || 500;
  const errorCode = error.code || "INTERNAL_SERVER_ERROR";
  const message = error.message || "Something went wrong";

  console.error(`[${new Date().toISOString()}]`, {
    path: req.originalUrl,
    method: req.method,
    error: message,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack
  });

  return sendError(res, errorCode, message, statusCode);
};

module.exports = { notFoundHandler, errorHandler };
