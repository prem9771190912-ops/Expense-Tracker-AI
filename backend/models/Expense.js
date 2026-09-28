const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true
  },
  categorySource: {
    type: String,
    default: "fallback"
  },
  aiSuggested: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Covers the most common expense-list query: one user, newest first.
expenseSchema.index({ email: 1, createdAt: -1 });
expenseSchema.index({ id: 1 });

module.exports = mongoose.models.Expense || mongoose.model("Expense", expenseSchema);
