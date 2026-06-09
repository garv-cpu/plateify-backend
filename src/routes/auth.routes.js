const express = require("express");
const { register, login, refresh, logout } = require("../controllers/auth.controller");
const { loginRateLimit } = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", loginRateLimit, login);
router.post("/refresh", refresh);
router.post("/logout", logout);

module.exports = router;
