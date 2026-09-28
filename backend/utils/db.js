const mongoose = require("mongoose");
const { connectDB } = require("../config/database");
const User = require("../models/User");
const Expense = require("../models/Expense");
const PasswordResetToken = require("../models/PasswordResetToken");

async function ensureDatabase() {
  await connectDB();
}

function isDatabaseError(error) {
  return Boolean(
    error?.name === "MongoServerSelectionError" ||
    error?.name === "MongoNetworkError" ||
    error?.name === "MongooseServerSelectionError" ||
    error?.name === "MongoParseError" ||
    error?.code === "ENOTFOUND" ||
    error?.code === "ECONNREFUSED" ||
    error?.message?.includes("querySrv") ||
    error?.message?.includes("mongodb+srv URI cannot have port number") ||
    error?.message?.includes("MONGODB_URI") ||
    error?.message?.includes("MongoDB")
  );
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function getUser(email) {
  await ensureDatabase();
  const user = await User.findOne({ email: normalizeEmail(email) }).lean();
  return user
    ? {
        id: String(user._id),
        name: user.name || "User",
        password: user.password,
        email: user.email,
        isPremium: Boolean(user.isPremium)
      }
    : null;
}

async function createUser({ name, email, password, isPremium = false }) {
  await ensureDatabase();
  try {
    const user = await User.create({
      email: normalizeEmail(email),
      name: String(name || "").trim() || "User",
      password,
      isPremium
    });
    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      isPremium: Boolean(user.isPremium)
    };
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = new Error("An account with this email already exists.");
      duplicate.statusCode = 409;
      throw duplicate;
    }
    throw error;
  }
}

async function updateUserPassword(email, hashedPassword) {
  await ensureDatabase();
  const normalized = normalizeEmail(email);
  let user = await User.findOneAndUpdate(
    { email: normalized },
    { password: hashedPassword },
    { returnDocument: "after" }
  );
  if (!user) {
    user = await User.create({
      email: normalized,
      name: normalized.split("@")[0] || "User",
      password: hashedPassword,
      isPremium: false
    });
  }
  return true;
}

async function getExpenses(email, options = {}) {
  await ensureDatabase();
  const normalizedEmail = normalizeEmail(email);

  if (options.page != null) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 10));
    const totalExpenses = await Expense.countDocuments({ email: normalizedEmail });
    const totalPages = Math.max(1, Math.ceil(totalExpenses / limit));
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * limit;

    const expenses = await Expense.find({ email: normalizedEmail })
      .select({ _id: 0, id: 1, amount: 1, description: 1, category: 1, categorySource: 1, aiSuggested: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalAggregation = await Expense.aggregate([
      { $match: { email: normalizedEmail } },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
    ]);
    const totalAmount = totalAggregation[0]?.totalAmount || 0;

    return {
      expenses: expenses.map((expense) => ({
        id: expense.id,
        amount: expense.amount,
        description: expense.description,
        category: expense.category,
        categorySource: expense.categorySource || "fallback",
        aiSuggested: Boolean(expense.aiSuggested),
        createdAt: expense.createdAt
      })),
      totalExpenses,
      totalPages,
      currentPage,
      lastPage: totalPages,
      hasNextPage: currentPage < totalPages,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
      hasPreviousPage: currentPage > 1,
      previousPage: currentPage > 1 ? currentPage - 1 : null,
      limit,
      totalAmount
    };
  }

  const expenses = await Expense.find({ email: normalizedEmail })
    .select({ _id: 0, id: 1, amount: 1, description: 1, category: 1, categorySource: 1, aiSuggested: 1, createdAt: 1 })
    .sort({ createdAt: -1 })
    .lean();
  return expenses.map((expense) => ({
    id: expense.id,
    amount: expense.amount,
    description: expense.description,
    category: expense.category,
    categorySource: expense.categorySource || "fallback",
    aiSuggested: Boolean(expense.aiSuggested),
    createdAt: expense.createdAt
  }));
}

function makeExpenseId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

async function addExpense({ email, amount, description, category, categorySource, aiSuggested = false }) {
  await ensureDatabase();
  const expense = await Expense.create({
    id: makeExpenseId(),
    email: normalizeEmail(email),
    amount: Number(amount),
    description: String(description).trim(),
    category: String(category),
    categorySource: categorySource || "fallback",
    aiSuggested: Boolean(aiSuggested)
  });
  return {
    id: expense.id,
    amount: expense.amount,
    description: expense.description,
    category: expense.category,
    categorySource: expense.categorySource,
    aiSuggested: expense.aiSuggested,
    createdAt: expense.createdAt
  };
}

async function deleteExpense(email, expenseId) {
  await ensureDatabase();
  const id = String(expenseId || "").trim();
  const emailFilter = normalizeEmail(email);
  const conditions = [{ email: emailFilter, id }];
  if (/^\d+$/.test(id)) conditions.push({ email: emailFilter, id: Number(id) });
  if (/^[a-fA-F0-9]{24}$/.test(id)) conditions.push({ email: emailFilter, _id: id });

  const result = await Expense.deleteOne({ $or: conditions });
  if (!result.deletedCount) {
    const error = new Error("Expense not found.");
    error.statusCode = 404;
    throw error;
  }
  return true;
}

function isHiddenLeaderboardName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("prem");
}

async function getLeaderboard(currentEmail) {
  await ensureDatabase();
  return User.aggregate([
    {
      $lookup: {
        from: Expense.collection.name,
        let: { userEmail: "$email" },
        pipeline: [
          { $match: { $expr: { $eq: ["$email", "$$userEmail"] } } },
          {
            $group: {
              _id: null,
              totalExpense: { $sum: "$amount" },
              expenseCount: { $sum: 1 }
            }
          }
        ],
        as: "expenseSummary"
      }
    },
    {
      $match: {
        $expr: {
          $not: {
            $in: [
              {
                $trim: {
                  input: {
                    $toLower: {
                      $ifNull: ["$name", ""]
                    }
                  }
                }
              },
              ["prem"]
            ]
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: { $ifNull: ["$name", "User"] },
        email: 1,
        totalExpense: {
          $ifNull: [{ $arrayElemAt: ["$expenseSummary.totalExpense", 0] }, 0]
        },
        expenseCount: {
          $ifNull: [{ $arrayElemAt: ["$expenseSummary.expenseCount", 0] }, 0]
        }
      }
    },
    { $sort: { totalExpense: -1, expenseCount: -1, name: 1, id: 1 } }
  ]).then((rows) => rows.map((row, index) => ({
    rank: index + 1,
    id: row.id,
    name: row.name,
    isCurrentUser: normalizeEmail(row.email) === normalizeEmail(currentEmail),
    totalExpense: Number(row.totalExpense || 0),
    expenseCount: Number(row.expenseCount || 0)
  }))).then((rows) => rows.filter((row) => !isHiddenLeaderboardName(row.name)));
}

async function createResetToken({ email, rawToken, expiresInMs = 900000 }) {
  await ensureDatabase();
  const record = PasswordResetToken.create({ userId: email, rawToken, expiresInMs });
  await PasswordResetToken.MongooseModel.create({
    ...record,
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt)
  });
  return record;
}

async function getResetTokenByHash(tokenHash) {
  await ensureDatabase();
  const rawValue = String(tokenHash || "").trim();
  const hashed = PasswordResetToken.hashToken(rawValue);
  const token = await PasswordResetToken.MongooseModel.findOne({
    $or: [
      { tokenHash: rawValue },
      { tokenHash: hashed },
      { id: rawValue }
    ]
  }).lean();
  return token
    ? {
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        createdAt: token.createdAt,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt
      }
    : null;
}

async function markTokenUsed(idOrHash) {
  await ensureDatabase();
  await PasswordResetToken.MongooseModel.updateOne(
    { $or: [{ id: idOrHash }, { tokenHash: idOrHash }] },
    { usedAt: new Date() }
  );
  return true;
}

module.exports = {
  getUser,
  createUser,
  updateUserPassword,
  getExpenses,
  addExpense,
  deleteExpense,
  getLeaderboard,
  createResetToken,
  getResetTokenByHash,
  markTokenUsed,
  connectDB,
  isDatabaseError,
  isConnected: () => mongoose.connection.readyState === 1
};
