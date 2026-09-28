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
    const email = req.user.email;
    const list = email ? await db.getExpenses(email) : [];
    const result = list.length ? await spendingInsight(list) : { text: "Add expenses to get an AI spending insight.", source: "local" };
    return res.json({ insight: result.text, message: result.text, source: result.source });
  } catch (e) {
    console.error("ai insight error:", e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
};
