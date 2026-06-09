const sendSuccess = (res, data = {}, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data, message });
};

const sendError = (res, error = "ERROR", message = "Something went wrong", statusCode = 500) => {
  return res.status(statusCode).json({ success: false, error, message });
};

module.exports = { sendSuccess, sendError };
