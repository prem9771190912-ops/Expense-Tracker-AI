const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const aiRoutes = require("./routes/aiRoutes");
const expenseController = require("./controllers/expenseController");
const authMiddleware = require("./middleware/auth");
const database = require("./config/database");

const app = express();

const ALLOWED_ORIGINS = [
  "https://expense-tracker-app-mu-neon.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173"
];

if (process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS.split(",").forEach(o => {
    const trimmed = o.trim();
    if (trimmed && !ALLOWED_ORIGINS.includes(trimmed)) {
      ALLOWED_ORIGINS.push(trimmed);
    }
  });
}

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) return callback(null, true);
    if (/\.vercel\.app$/.test(origin)) return callback(null, true);
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));

// --- Health Check ---
app.get("/api/health", async (req, res) => {
  try {
    await database.connectDB();
    return res.status(200).json({
      success: true,
      database: "connected",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    });
  } catch (error) {
    console.error("health check database error:", error.message);
    return res.status(503).json({
      success: false,
      database: "unavailable",
      message: "Database temporarily unavailable."
    });
  }
});



const purchaseRoutes = require("./routes/purchaseRoutes");

// --- API Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/expense", expenseRoutes);
app.use("/expenses", expenseRoutes);
app.use("/purchase", purchaseRoutes);
app.use("/api/purchase", purchaseRoutes);
app.use("/premium", expenseRoutes);
app.get("/api/leaderboard", authMiddleware.optional || authMiddleware, expenseController.getLeaderboard);
app.get("/leaderboard", authMiddleware.optional || authMiddleware, expenseController.getLeaderboard);
app.get("/api/download-report", authMiddleware, expenseController.downloadReport);
app.get("/download-report", authMiddleware, expenseController.downloadReport);
app.use("/api/ai", aiRoutes);

// Password Reset Routes (Sharpener module: Forgot, Reset & Update Password)
const passwordRoutes = require("./routes/passwordRoutes");
app.use("/password", passwordRoutes);
app.use("/api/password", passwordRoutes);
app.get("/password/resetpassword", (req, res) => {
  res.redirect("/reset-password.html");
});

// Keep the legacy categorization URL working for older frontend bundles.
app.post("/api/categorize-expense", require("./controllers/aiController").categorize);

// Serve static frontend for root
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../frontend/login.html")));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.message);
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error."
  });
});

const PORT = process.env.PORT || 3001;
module.exports = app;
