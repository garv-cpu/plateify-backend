const multer = require("multer");
const { sendError } = require("../utils/response.utils");

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Only jpg, png, and webp images are allowed"));
    }
    return cb(null, true);
  }
});

const singleImageUpload = (req, res, next) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return sendError(res, "INVALID_UPLOAD", error.message, 400);
    }

    if (!req.file) {
      return sendError(res, "IMAGE_REQUIRED", "Image file is required", 400);
    }

    return next();
  });
};

module.exports = { singleImageUpload };
