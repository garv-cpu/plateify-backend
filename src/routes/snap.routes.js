const express = require("express");
const { createSnap, getSnap } = require("../controllers/snap.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { snapCreateRateLimit } = require("../middleware/rateLimit.middleware");
const { singleImageUpload } = require("../middleware/upload.middleware");

const router = express.Router();

router.post("/create", authenticate, snapCreateRateLimit, singleImageUpload, createSnap);
router.get("/:snapId", authenticate, getSnap);

module.exports = router;
