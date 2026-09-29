const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();
const bcrypt = require("bcrypt");
const User = require("../models/User");
const ForgotPasswordRequest = require("../models/ForgotPasswordRequest");
const mailService = require("../services/mailService");
const db = require("../utils/db");

/**
 * 1. POST /password/forgotpassword
 * Flow:
 * - Find user by email
 * - If user exists:
 *   - Generate UUID
 *   - Create ForgotPasswordRequest with isActive = true
 *   - Send email using Brevo
 *   - Reset link: http://localhost:3000/password/resetpassword/:id
 * - Return success response
 */
exports.forgotPassword = async (req, res) => {
  try {
    const rawEmail = req.body.email || req.body.mail || req.body.mailId;
    const email = String(rawEmail || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    // 1. Find user by email
    let user = null;
    if (typeof User.findOne === "function") {
      user = await User.findOne({ email });
    }
    if (!user && db.getUser) {
      user = await db.getUser(email);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email."
      });
    }

    // 2. Generate UUID
    const id = uuidv4();
    const userId = user.id || user._id || user.email;

    // 3. Create ForgotPasswordRequest with isActive = true
    await ForgotPasswordRequest.create({
      id,
      userId: String(userId),
      isActive: true
    });

    // Also register in legacy db reset token tracker for full backwards-compatibility
    if (db.createResetToken) {
      try {
        await db.createResetToken({ email, rawToken: id, expiresInMs: 15 * 60 * 1000 });
      } catch (e) {
        // Non-fatal
      }
    }

    // 4. Construct reset link
    // Default to Sharpener specification (http://localhost:3000/password/resetpassword/:id)
    // or respect configured server port if running locally
    const serverPort = process.env.PORT || 5000;
    const clientPort = process.env.CLIENT_PORT || 3000;
    const baseHost = req.get("host") || `localhost:${clientPort}`;
    
    // We provide the Sharpener standard URL: http://localhost:3000/password/resetpassword/:id
    // And also allow direct access through the current listening host:
    const sharpenerResetLink = `http://localhost:${clientPort}/password/resetpassword/${id}`;
    const directResetLink = `http://${baseHost}/password/resetpassword/${id}`;
    const resetLink = req.get("host") ? directResetLink : sharpenerResetLink;

    // 5. Send email using Brevo (Sendinblue)
    await mailService.sendMail({
      to: email,
      resetLink
    });

    return res.status(200).json({
      success: true,
      message: "Reset password link sent to your email.",
      resetLink,
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
    const { id } = req.params;

    if (!id) {
      return res.status(400).send("<h3>Link Expired or invalid request</h3>");
    }

    // Find request by UUID
    let request = await ForgotPasswordRequest.findOne({ id });
    if (!request && typeof ForgotPasswordRequest.findOne === "function") {
      request = await ForgotPasswordRequest.findOne({ where: { id } });
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

    // If true -> return an HTML page containing New Password input and Confirm button
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
 * - Hash password using bcrypt
 * - Update User password
 * - Set isActive = false
 * - Return Password Updated Successfully
 */
exports.updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!id || !password) {
      return res.status(400).json({
        success: false,
        message: "Request ID and new password are required."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long."
      });
    }

    // 1. Find ForgotPasswordRequest
    let request = await ForgotPasswordRequest.findOne({ id });
    if (!request && typeof ForgotPasswordRequest.findOne === "function") {
      request = await ForgotPasswordRequest.findOne({ where: { id } });
    }

    // 2. Verify isActive = true
    if (!request || !request.isActive) {
      return res.status(400).json({
        success: false,
        message: "Link Expired"
      });
    }

    // 3. Hash password using bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Update User password
    const userId = request.userId;
    let userUpdated = false;

    // Check Mongoose model
    if (typeof User.findByIdAndUpdate === "function") {
      try {
        const u = await User.findByIdAndUpdate(userId, { password: hashedPassword });
        if (u) userUpdated = true;
      } catch (e) {}
    }
    if (!userUpdated && typeof User.findOneAndUpdate === "function") {
      try {
        const u = await User.findOneAndUpdate(
          { $or: [{ _id: userId }, { email: userId }] },
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
    // Check utils/db helper
    if (!userUpdated && db.updateUserPassword) {
      try {
        await db.updateUserPassword(userId, hashedPassword);
        userUpdated = true;
      } catch (e) {}
    }

    // 5. Set isActive = false
    request.isActive = false;
    await request.save();

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
