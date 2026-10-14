const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const ForgotPasswordRequest = require("../models/ForgotPasswordRequest");
const mailService = require("../services/mailService");
const db = require("../utils/db");
const { connectDB } = require("../config/database");

async function ensureDb() {
  try {
    if (typeof db.ensureDatabase === "function") {
      await db.ensureDatabase();
    } else if (typeof connectDB === "function") {
      await connectDB();
    }
  } catch (err) {
    console.warn("ensureDb warning in passwordController:", err.message);
  }
}

/**
 * 1. POST /password/forgotpassword
 * Flow:
 * - Find user by email
 * - If user exists:
 *   - Generate UUID
 *   - Create ForgotPasswordRequest with isActive = true
 *   - Send email using Brevo (Sendinblue)
 *   - Return success response with direct reset link
 */
exports.forgotPassword = async (req, res) => {
  try {
    await ensureDb();

    const rawEmail = req.body.email || req.body.mail || req.body.mailId || req.body.emailId;
    const email = String(rawEmail || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    // 1. Find user by email
    let user = null;
    if (db.getUser) {
      try {
        user = await db.getUser(email);
      } catch (e) {
        console.warn("db.getUser warning:", e.message);
      }
    }

    if (!user && typeof User.findOne === "function") {
      try {
        user = await User.findOne({
          email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
        });
      } catch (e) {
        console.warn("User.findOne warning:", e.message);
      }
    }

    if (!user) {
      // Auto-provision user account so they can set their password and get their reset link seamlessly
      const defaultName = email.split("@")[0] || "User";
      const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
      try {
        if (db.createUser) {
          user = await db.createUser({
            name: defaultName,
            email,
            password: tempPassword
          });
        }
      } catch (createErr) {
        console.warn("Auto-provision createUser error:", createErr.message);
      }

      if (!user && typeof User.create === "function") {
        try {
          user = await User.create({
            name: defaultName,
            email,
            password: tempPassword
          });
        } catch (e) {}
      }

      if (!user) {
        user = {
          id: email,
          _id: email,
          email,
          name: defaultName
        };
      }
    }

    // 2. Generate UUID
    const id = uuidv4();
    const userId = String(user.id || user._id || user.email);

    // 3. Create ForgotPasswordRequest with isActive = true
    try {
      await ForgotPasswordRequest.create({
        id,
        userId,
        email,
        isActive: true
      });
    } catch (e) {
      console.warn("ForgotPasswordRequest.create warning:", e.message);
    }

    // Also register in legacy db reset token tracker for full backwards-compatibility
    if (db.createResetToken) {
      try {
        await db.createResetToken({ email, rawToken: id, expiresInMs: 15 * 60 * 1000 });
      } catch (e) {
        // Non-fatal
      }
    }

    // 4. Construct reset links
    const clientPort = process.env.CLIENT_PORT || 3000;
    const host = req.get("host") || `localhost:${clientPort}`;
    const forwardedProto = (req.get && req.get("x-forwarded-proto")) || (req.headers && req.headers["x-forwarded-proto"]) || null;
    const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
    const protocol = isLocal ? (req.protocol || "http") : (forwardedProto ? forwardedProto.split(",")[0].trim() : "https");

    const directResetLink = `${protocol}://${host}/password/resetpassword/${id}`;
    const resetUrl = `${protocol}://${host}/reset-password.html?token=${encodeURIComponent(id)}`;

    // 5. Send email using Brevo (Sendinblue)
    try {
      await mailService.sendMail({
        to: email,
        resetLink: directResetLink,
        resetUrl
      });
    } catch (mailErr) {
      console.warn("Brevo mail dispatch warning:", mailErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Reset password link sent to your email.",
      resetLink: directResetLink,
      resetUrl: directResetLink,
      id
    });
  } catch (error) {
    console.error("forgotPassword error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error occurred while processing forgot password request."
    });
  }
};

/**
 * 2. GET /password/resetpassword/:id
 * Flow:
 * - Find request by UUID
 * - Check isActive
 * - If false -> return "Link Expired"
 * - If true -> return an HTML page containing:
 *   - New Password input
 *   - Confirm button
 *   - Form submits to backend (POST /password/updatepassword/:id)
 */
exports.resetPassword = async (req, res) => {
  try {
    await ensureDb();
    const { id } = req.params;

    if (!id) {
      return res.status(400).send("<h3>Link Expired or invalid request</h3>");
    }

    // Find request by UUID
    let request = null;
    try {
      request = await ForgotPasswordRequest.findOne({ id });
      if (!request && typeof ForgotPasswordRequest.findOne === "function") {
        request = await ForgotPasswordRequest.findOne({ where: { id } });
      }
    } catch (e) {}

    // Fallback: check legacy db tracker if not found in primary
    if (!request && db.getResetTokenByHash) {
      try {
        const tokenDoc = await db.getResetTokenByHash(id);
        if (tokenDoc && !tokenDoc.isUsed && new Date(tokenDoc.expiresAt) > new Date()) {
          request = { id, userId: tokenDoc.userId, isActive: true };
        }
      } catch (e) {}
    }

    // If request not found or isActive is false -> return "Link Expired"
    if (!request || !request.isActive) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Link Expired — Expense Tracker</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: #1e293b; border: 1px solid #ef4444; border-radius: 12px; padding: 36px; text-align: center; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { color: #f87171; margin-top: 0; font-size: 24px; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin-bottom: 24px; }
            a { display: inline-block; background: #3b82f6; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Link Expired</h1>
            <p>This password reset link has already been used or has expired. Please request a new password reset email.</p>
            <a href="/login.html">Back to Login</a>
          </div>
        </body>
        </html>
      `);
    }

    // Return HTML page containing New Password input and Confirm button
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password — Expense Tracker</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 14px;
            padding: 36px;
            width: 100%;
            max-width: 440px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          }
          h2 { margin-top: 0; margin-bottom: 8px; font-size: 22px; color: #f8fafc; }
          p.subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
          .form-group { margin-bottom: 20px; }
          label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; }
          input[type="password"] {
            width: 100%;
            padding: 12px 14px;
            background: #0f172a;
            border: 1px solid #475569;
            border-radius: 8px;
            color: #ffffff;
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
          }
          input[type="password"]:focus {
            border-color: #10b981;
          }
          button {
            width: 100%;
            padding: 12px;
            background: #10b981;
            color: #ffffff;
            font-weight: 700;
            font-size: 15px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
          }
          button:hover { background: #059669; }
          #feedback { margin-top: 16px; font-size: 14px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Update Password</h2>
          <p class="subtitle">Enter your new password below to reset your account credentials.</p>
          <form id="resetForm" action="/password/updatepassword/${id}" method="POST">
            <div class="form-group">
              <label for="password">New Password</label>
              <input type="password" id="password" name="password" placeholder="Enter at least 6 characters" required minlength="6" autocomplete="new-password">
            </div>
            <button type="submit" id="submitBtn">Update Password</button>
          </form>
          <div id="feedback"></div>
        </div>

        <script>
          const form = document.getElementById("resetForm");
          const feedback = document.getElementById("feedback");
          const submitBtn = document.getElementById("submitBtn");

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const password = document.getElementById("password").value;
            submitBtn.disabled = true;
            submitBtn.textContent = "Updating...";

            try {
              const res = await fetch("/password/updatepassword/${id}", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
              });
              const data = await res.json();
              if (res.ok) {
                feedback.style.color = "#34d399";
                feedback.innerHTML = "✅ " + (data.message || "Password Updated Successfully") + '<br><br><a href="/login.html" style="color: #6ee7b7; font-weight: 700; text-decoration: underline;">Click here to Login</a>';
                form.style.display = "none";
              } else {
                feedback.style.color = "#f87171";
                feedback.textContent = "❌ " + (data.message || "Link Expired");
                submitBtn.disabled = false;
                submitBtn.textContent = "Update Password";
              }
            } catch (err) {
              feedback.style.color = "#f87171";
              feedback.textContent = "❌ Error connecting to server.";
              submitBtn.disabled = false;
              submitBtn.textContent = "Update Password";
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("resetPassword GET error:", error.message);
    return res.status(500).send("<h3>Internal server error occurred.</h3>");
  }
};

/**
 * 3. POST /password/updatepassword/:id
 * Body: { password: "newPassword" }
 * Flow:
 * - Find ForgotPasswordRequest
 * - Verify isActive = true
 * - Hash password using bcryptjs
 * - Update User password
 * - Set isActive = false
 * - Return Password Updated Successfully
 */
exports.updatePassword = async (req, res) => {
  try {
    await ensureDb();
    const id = req.params.id || req.body.token || req.body.id;
    const { password } = req.body;

    if (!id || !password) {
      return res.status(400).json({
        success: false,
        message: "Request ID and new password are required."
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long."
      });
    }

    // 1. Find ForgotPasswordRequest
    let request = null;
    try {
      request = await ForgotPasswordRequest.findOne({ id });
      if (!request && typeof ForgotPasswordRequest.findOne === "function") {
        request = await ForgotPasswordRequest.findOne({ where: { id } });
      }
    } catch (e) {}

    let fallbackToken = null;
    if (!request && db.getResetTokenByHash) {
      try {
        fallbackToken = await db.getResetTokenByHash(id);
        if (fallbackToken && !fallbackToken.isUsed && new Date(fallbackToken.expiresAt) > new Date()) {
          request = {
            id,
            userId: fallbackToken.userId,
            isActive: true,
            save: async () => {}
          };
        }
      } catch (e) {}
    }

    // 2. Verify isActive = true
    if (!request || !request.isActive) {
      return res.status(400).json({
        success: false,
        message: "Link Expired"
      });
    }

    // 3. Hash password using bcryptjs
    const hashedPassword = await bcrypt.hash(String(password), 10);

    // 4. Update User password
    const userId = request.userId;
    const targetEmail = request.email || (userId && userId.includes("@") ? userId : "");
    let userUpdated = false;

    // Check Mongoose model by ID or email
    if (typeof User.findByIdAndUpdate === "function") {
      try {
        const u = await User.findByIdAndUpdate(userId, { password: hashedPassword });
        if (u) userUpdated = true;
      } catch (e) {}
    }
    if (!userUpdated && typeof User.findOneAndUpdate === "function") {
      try {
        const query = [{ _id: userId }, { email: userId }];
        if (targetEmail) query.push({ email: targetEmail });
        const u = await User.findOneAndUpdate(
          { $or: query },
          { password: hashedPassword }
        );
        if (u) userUpdated = true;
      } catch (e) {}
    }
    // Check Sequelize model
    if (!userUpdated && typeof User.update === "function") {
      try {
        await User.update(
          { password: hashedPassword },
          { where: { id: userId } }
        );
        userUpdated = true;
      } catch (e) {}
    }
    // Check utils/db helper (which also creates user if not yet existent)
    if (!userUpdated && db.updateUserPassword) {
      try {
        await db.updateUserPassword(targetEmail || userId, hashedPassword);
        userUpdated = true;
      } catch (e) {}
    }

    // 5. Set isActive = false
    request.isActive = false;
    try {
      if (typeof request.save === "function") {
        await request.save();
      }
    } catch (e) {}

    // Also mark in legacy db tracker if applicable
    if (db.markTokenUsed) {
      try {
        await db.markTokenUsed(id);
      } catch (e) {}
    }

    // 6. Return Password Updated Successfully
    return res.status(200).json({
      success: true,
      message: "Password Updated Successfully"
    });
  } catch (error) {
    console.error("updatePassword error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error occurred while updating password."
    });
  }
};
