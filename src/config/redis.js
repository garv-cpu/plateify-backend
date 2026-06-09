const Redis = require("ioredis");

let redis;

const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required");
  }

  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true
  });

  redis.on("error", (error) => {
    console.error("Redis error", error);
  });

  await redis.ping();
  console.log("Redis connected");
  return redis;
};

const getRedis = () => {
  if (!redis) {
    throw new Error("Redis client is not connected");
  }
  return redis;
};

const disconnectRedis = async () => {
  if (redis) {
    await redis.quit();
    redis = null;
  }
};

module.exports = { connectRedis, getRedis, disconnectRedis };
