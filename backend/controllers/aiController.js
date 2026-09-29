const db = require("../utils/db");
const { categorizeExpense, spendingInsight } = require("../services/aiService");

exports.categorize = async (req, res) => {
  try {
    const description = String(req.body.description || "").trim();
    if (!description) {
      return res.status(400).json({ success: false, message: "Description is required" });
    }
    const result = await categorizeExpense(description);
    return res.json(result);
  } catch (e) {
    console.error("ai categorize error:", e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.insight = async (req, res) => {
  try {
    const email = req.user?.email || req.query.email || req.headers["x-user-email"] || "";
    let expensesList = [];
    if (email) {
      try {
        const list = await db.getExpenses(email);
        expensesList = Array.isArray(list) ? list : (list.expenses || []);
      } catch (dbErr) {
        console.warn("[AI Controller] db getExpenses fallback:", dbErr.message);
      }
    }
    const result = expensesList.length
      ? await spendingInsight(expensesList)
      : { text: "Add a few expenses to unlock personalized AI spending intelligence and category breakdowns!", source: "ai" };
    return res.json({ success: true, insight: result.text, message: result.text, source: result.source });
  } catch (e) {
    console.error("ai insight error:", e.message);
    return res.json({
      success: true,
      insight: "Keep recording your daily expenses consistently. Consistent tracking is the fastest way to save 15-20% on monthly overhead!",
      message: "Keep recording your daily expenses consistently. Consistent tracking is the fastest way to save 15-20% on monthly overhead!",
      source: "fallback"
    });
  }
};
