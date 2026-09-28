const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../utils/db");
const PasswordResetToken = require("../models/PasswordResetToken");
const { sendPasswordResetEmail } = require("../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || 'demo_jwt_secret_key_change_in_production';

function generateToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required.");
  return jwt.sign(
    { id: user.id || user._id || user.email, email: user.email, name: user.name || "User" },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email || ""));
}

async function verifyPassword(inputPassword, storedHash) {
  if (!storedHash) return false;
  const str = String(inputPassword || "");
  if (storedHash.startsWith("$2b$") || storedHash.startsWith("$2a$")) {
    return await bcrypt.compare(str, storedHash);
  }
  // Legacy fallback: crypto.scryptSync
  const legacyHash = crypto.scryptSync(str, "expense-tracker-salt", 64).toString("hex");
  return legacyHash === storedHash;
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const trimmedName = String(name || "").trim() || "User";

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const user = await db.createUser({ name: trimmedName, email: normalizedEmail, password: hashedPassword });
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: { id: user.id, name: user.name, email: user.email },
      token
    });
  } catch (error) {
    console.error("signup/register error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Could not create account."
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    const user = await db.getUser(normalizedEmail);
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const passwordMatch = await verifyPassword(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const token = generateToken(user);
    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: { id: user.id, name: user.name, email: user.email, isPremium: !!user.isPremium },
      token
    });
  } catch (error) {
    console.error("login error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again."
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.mail || req.body.mailId || req.body.emailId;
    const email = String(rawEmail || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "A valid email address is required." });
    }

    const rawToken = crypto.randomUUID();
    await db.createResetToken({ email, rawToken, expiresInMs: 15 * 60 * 1000 });

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol || "http";
    const resetUrl = `${protocol}://${host}/reset-password.html?token=${encodeURIComponent(rawToken)}`;

    // Send email using Sendinblue (Brevo) service
    await sendPasswordResetEmail({
      to: email,
      resetUrl,
      token: rawToken
    });

    return res.status(200).json({
      success: true,
      message: "Password reset link sent to your email successfully.",
      resetToken: rawToken,
      resetUrl
    });
  } catch (error) {
    console.error("forgotPassword error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({ success: false, message: "Could not process password reset request." });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const rawToken = String(req.body.token || req.params.id || req.params.token || req.query.token || "").trim();
    const password = String(req.body.password || req.body.newPassword || "").trim();
    if (!rawToken || !password) {
      return res.status(400).json({ success: false, message: "Reset token and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long." });
    }

    const tokenRecord = await db.getResetTokenByHash(rawToken);

    if (!tokenRecord || !PasswordResetToken.isValid(tokenRecord)) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset token. Please request a new password reset email." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.updateUserPassword(tokenRecord.userId, hashedPassword);
    await db.markTokenUsed(tokenRecord.id || tokenRecord.tokenHash);

    return res.status(200).json({ success: true, message: "Password reset successfully. You can now login with your new password." });
  } catch (error) {
    console.error("resetPassword error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({ success: false, message: error.message || "Internal server error." });
  }
};

exports.me = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    return res.json({ success: true, user: { id: req.user.id, name: req.user.name, email: req.user.email, isPremium: req.user.isPremium } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};
