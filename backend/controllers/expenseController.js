const db = require("../utils/db");
const { categorizeExpense } = require("../services/aiService");

const CATEGORIES = new Set([
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Education",
  "Salary",
  "Other"
]);

exports.getExpenses = async (req, res) => {
  try {
    const email = req.user.email;
    if (!email) {
      return res.json([]);
    }
    const page = req.query.page;
    const limit = req.query.limit;

    if (page != null) {
      const result = await db.getExpenses(email, { page, limit });
      return res.json({
        success: true,
        ...result
      });
    }

    const list = await db.getExpenses(email);
    return res.json(Array.isArray(list) ? list : []);
  } catch (error) {
    console.error("getExpenses error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({ success: false, message: "Could not load expenses." });
  }
};
exports.createExpense = async (req, res) => {
  try {
    const { amount, description, category, categorySource } = req.body;
    const email = req.user.email;
    const numericAmount = Number(amount);

    const trimmedDescription = String(description || "").trim();
    const requestedCategory = category ? String(category).trim() : "Other";

    if (
      !email ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      numericAmount > 1000000000 ||
      !trimmedDescription ||
      trimmedDescription.length > 500 ||
      !CATEGORIES.has(requestedCategory)
    ) {
      return res.status(400).json({ success: false, message: "Valid amount and description are required." });
    }

    let finalCategory = requestedCategory;
    let finalSource = categorySource || (category ? "user" : "fallback");
    let aiSuggested = false;

    if (!category) {
      const suggestion = await categorizeExpense(trimmedDescription);
      finalCategory = suggestion.category;
      finalSource = suggestion.source;
      aiSuggested = suggestion.source === "ai";
    }

    const created = await db.addExpense({
      email,
      amount: numericAmount,
      description: trimmedDescription,
      category: String(finalCategory),
      categorySource: finalSource,
      aiSuggested,
      userId: req.user?.id || null
    });

    return res.status(201).json(created);
  } catch (error) {
    console.error("createExpense error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    if (error.name === "ValidationError") {
      return res.status(400).json({ success: false, message: "Invalid expense data." });
    }
    return res.status(500).json({ success: false, message: error.message || "Could not add expense." });
  }
};
exports.deleteExpense = async (req, res) => {
  try {
    const email = req.user.email;
    const rawId = String(req.params.id || "").trim();

    if (!email || !rawId) {
      return res.status(400).json({ success: false, message: "Email and expense ID are required." });
    }

    await db.deleteExpense(email, rawId);
    return res.json({ success: true, message: "Expense deleted successfully." });
  } catch (error) {
    console.error("deleteExpense error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: error.message || "Expense not found." });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await db.getLeaderboard(req.user.email);
    return res.json({ success: true, leaderboard });
  } catch (error) {
    console.error("getLeaderboard error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({ success: false, message: "Unable to load leaderboard." });
  }
};

