const express = require("express");
const { createSnap, getSnap, updatePrivacy } = require("../controllers/snap.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { snapCreateRateLimit } = require("../middleware/rateLimit.middleware");
const { singleImageUpload } = require("../middleware/upload.middleware");

const router = express.Router();

router.post("/create", authenticate, snapCreateRateLimit, singleImageUpload, createSnap);
router.patch("/:snapId/privacy", authenticate, updatePrivacy);
router.get("/:snapId", authenticate, getSnap);

module.exports = router;
