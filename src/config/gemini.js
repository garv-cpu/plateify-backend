const { GoogleGenerativeAI } = require("@google/generative-ai");

const getGeminiModel = (generationConfig = {}) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    generationConfig
  });
};

module.exports = { getGeminiModel };
