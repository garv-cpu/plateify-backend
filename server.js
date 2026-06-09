require("dotenv").config();

const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");

const connectDB = require("./src/config/db");
const authRoutes = require("./src/routes/auth.routes");
const userRoutes = require("./src/routes/user.routes");
const snapRoutes = require("./src/routes/snap.routes");
const recipeRoutes = require("./src/routes/recipe.routes");
const paymentRoutes = require("./src/routes/payment.routes");
const { errorHandler, notFoundHandler } = require("./src/middleware/error.middleware");
const { generalRateLimit } = require("./src/middleware/rateLimit.middleware");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : true,
    credentials: true
  })
);
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(generalRateLimit);

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" }, message: "SnapPlate API is healthy" });
});

app.use("/api/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/snap", snapRoutes);
app.use("/api/recipe", recipeRoutes);
app.use("/api/payment", paymentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const start = async () => {
  await connectDB();

  const port = process.env.PORT || 5000;
  const server = app.listen(port, () => {
    console.log(`SnapPlate API listening on port ${port}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received. Shutting down gracefully.`);
    server.close(async () => {
      await require("mongoose").connection.close();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

start().catch((error) => {
  console.error("Failed to start SnapPlate API", error);
  process.exit(1);
});
