const mongoose = require("mongoose");
const { connectDB } = require("../config/database");
const User = require("../models/User");
const Expense = require("../models/Expense");
const PasswordResetToken = require("../models/PasswordResetToken");

async function ensureDatabase() {
  await connectDB();
  if (!ensureDatabase.synced) {
    ensureDatabase.synced = true;
    try {
      const usersToSync = await User.find({
        $or: [{ totalExpense: { $exists: false } }, { totalExpense: null }]
      }).lean();
      for (const u of usersToSync) {
        const agg = await Expense.aggregate([
          { $match: { email: u.email } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const total = agg[0]?.total || 0;
        await User.updateOne({ _id: u._id }, { $set: { totalExpense: total } });
      }
    } catch (e) {
      // Non-fatal
    }
  }
}

async function getExpenses(email, options = {}) {
  await ensureDatabase();
  const normalizedEmail = normalizeEmail(email);

  if (options.page != null || options.limit != null) {
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const totalItems = await Expense.countDocuments({ email: normalizedEmail });
    const lastPage = Math.max(1, Math.ceil(totalItems / limit));
    const currentPage = Math.min(page, lastPage);
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

    const hasNextPage = currentPage < lastPage;
    const nextPage = hasNextPage ? currentPage + 1 : 0;
    const hasPreviousPage = currentPage > 1;
    const previousPage = hasPreviousPage ? currentPage - 1 : 0;

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
      currentPage,
      hasNextPage,
      nextPage,
      hasPreviousPage,
      previousPage,
      lastPage,
      totalItems,
      totalExpenses: totalItems,
      totalPages: lastPage,
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
  const numericAmount = Number(amount);
  const normalizedEmail = normalizeEmail(email);

  const expense = await Expense.create({
    id: makeExpenseId(),
    email: normalizedEmail,
    amount: numericAmount,
    description: String(description).trim(),
    category: String(category),
    categorySource: categorySource || "fallback",
    aiSuggested: Boolean(aiSuggested)
  });

  // Increment User.totalExpense
  await User.updateOne(
    { email: normalizedEmail },
    { $inc: { totalExpense: numericAmount } }
  );

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

  const expense = await Expense.findOne({ $or: conditions }).lean();
  if (!expense) {
    const error = new Error("Expense not found.");
    error.statusCode = 404;
    throw error;
  }

  const result = await Expense.deleteOne({ _id: expense._id });
  if (!result.deletedCount) {
    const error = new Error("Expense not found.");
    error.statusCode = 404;
    throw error;
  }

  // Decrement User.totalExpense
  if (expense.amount) {
    await User.updateOne(
      { email: emailFilter },
      { $inc: { totalExpense: -Math.abs(Number(expense.amount)) } }
    );
  }

  return true;
}

async function getLeaderboard(options = {}) {
  await ensureDatabase();
  const users = await User.find({})
    .select("_id name email totalExpense isPremium ispremiumuser createdAt")
    .sort({ totalExpense: -1, createdAt: 1 })
    .lean();

  // Exclude automated test accounts (@example.com) unless explicitly queried or matching current user
  let list = users.filter((u) => {
    const email = String(u.email || "").toLowerCase();
    if (options.currentUser && options.currentUser.email && email === String(options.currentUser.email).toLowerCase()) {
      return true;
    }
    return !email.endsWith("@example.com");
  });

  list.sort((a, b) => {
    const expDiff = Number(b.totalExpense || 0) - Number(a.totalExpense || 0);
    if (expDiff !== 0) return expDiff;
    const aPrem = Boolean(a.isPremium || a.ispremiumuser);
    const bPrem = Boolean(b.isPremium || b.ispremiumuser);
    if (aPrem !== bPrem) return bPrem ? 1 : -1;
    return 0;
  });

  return list.map((user) => ({
    id: String(user._id),
    name: user.name || "User",
    email: user.email || "",
    totalExpense: Number(user.totalExpense || 0),
    isPremium: Boolean(user.isPremium || user.ispremiumuser),
    ispremiumuser: Boolean(user.isPremium || user.ispremiumuser)
  }));
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
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized }).lean();
  if (!user) return null;

  // The user whose expense is highest (top spender) among Prem / real users is the Premium User!
  const realUsers = await User.find({ email: { $not: /@example\.com$/ } }).sort({ totalExpense: -1 }).lean();
  const topUser = realUsers[0];
  const isTopSpender = Boolean(
    topUser &&
    normalizeEmail(topUser.email) === normalized &&
    (topUser.totalExpense || 0) > 0
  );
  // Genuine Premium User: Only true when the user has purchased premium membership
  const isPremium = Boolean(user.isPremium || user.ispremiumuser);

  return {
    id: String(user._id),
    name: user.name || "User",
    password: user.password,
    email: user.email,
    isPremium: isPremium,
    ispremiumuser: isPremium,
    isTopSpender: isTopSpender,
    totalExpense: Number(user.totalExpense || 0)
  };
}

async function createUser({ name, email, password, isPremium = false, ispremiumuser = false, totalExpense = 0 }) {
  await ensureDatabase();
  try {
    const user = await User.create({
      email: normalizeEmail(email),
      name: String(name || "").trim() || "User",
      password,
      isPremium: Boolean(ispremiumuser || isPremium),
      ispremiumuser: Boolean(ispremiumuser || isPremium),
      totalExpense: Number(totalExpense || 0)
    });
    return {
      id: String(user._id),
      name: user.name,
      email: user.email,
      isPremium: Boolean(user.ispremiumuser || user.isPremium),
      ispremiumuser: Boolean(user.ispremiumuser || user.isPremium),
      totalExpense: Number(user.totalExpense || 0)
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
