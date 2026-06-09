const { v2: cloudinary } = require("cloudinary");
const { randomUUID } = require("crypto");

const configureCloudinary = () => {
  const required = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`${name} is required`);
    }
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
};

const extensionFromMime = (mimeType) => {
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  return map[mimeType] || "jpg";
};

const uploadImage = async ({ file, userId }) => {
  configureCloudinary();

  const ext = extensionFromMime(file.mimetype);
  const publicId = `snapplate/${userId}/${randomUUID()}`;
  const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,
    resource_type: "image",
    format: ext,
    overwrite: false,
    folder: undefined
  });

  return {
    url: result.secure_url,
    publicId: result.public_id
  };
};

module.exports = { uploadImage };
