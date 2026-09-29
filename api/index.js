const app = require("../backend/app");
const { connectDB } = require("../backend/config/database");

module.exports = async (req, res) => {
  try {
    await connectDB();
  } catch (error) {
    console.warn("Vercel Function Database Warning:", error.message);
  }
  return app(req, res);
};