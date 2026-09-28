const app = require("../backend/app");
const { connectDB } = require("../backend/config/database");

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error("Vercel Function Error:", error.message);
    return res.status(503).json({ success: false, message: "Database unavailable. Please try again shortly." });
  }
};