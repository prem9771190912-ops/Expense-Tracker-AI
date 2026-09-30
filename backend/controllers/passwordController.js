const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const os = require("os");
const User = require("../models/User");
const ForgotPasswordRequest = require("../models/ForgotPasswordRequest");
const mailService = require("../services/mailService");
const db = require("../utils/db");

/**
 * Helper to obtain the active public tunnel URL (Cloudflare Tunnel)
 */
function getPublicUrl() {
  if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.startsWith("http")) {
    return process.env.PUBLIC_URL.replace(/\/+$/, "");
  }
  if (process.env.TUNNEL_URL && process.env.TUNNEL_URL.startsWith("http")) {
    return process.env.TUNNEL_URL.replace(/\/+$/, "");
  }

  const candidateLogs = [
    path.join(__dirname, "../../tunnel.log"),
    path.join(__dirname, "../tunnel.log")
  ];

  for (const logPath of candidateLogs) {
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf8");
        const match = content.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) return match[0];
      }
    } catch (e) {}
  }

  return "https://completed-know-donald-kings.trycloudflare.com";
}

/**
 * 1. POST /password/forgotpassword
 * Flow:
 * - Find user by email
 * - If user exists:
 *   - Generate UUID
 *   - Create ForgotPasswordRequest with isActive = true
 *   - Send email using Gmail SMTP / Brevo
 *   - Reset links: Cloudflare Public Tunnel (for Mobile / Any network), Wi-Fi LAN IP, and localhost
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

    // 4. Construct reset links
    const serverPort = process.env.PORT || 5000;
    const hostHeader = req.get("host") || `localhost:${serverPort}`;
    const proto = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";

    // Localhost link (accessible on the computer running the server)
    const localResetLink = `http://localhost:${serverPort}/password/resetpassword/${id}`;

    // Host link (if request came through a specific domain or host)
    const hostResetLink = `${proto}://${hostHeader}/password/resetpassword/${id}`;

    // Detect Local Network IP for devices on same Wi-Fi
    let localIp = "192.168.1.6";
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === "IPv4" && !iface.internal) {
            localIp = iface.address;
            break;
          }
        }
      }
    } catch (e) {}
    const networkResetLink = `http://${localIp}:${serverPort}/password/resetpassword/${id}`;

    // Public Universal Link (accessible on ANY mobile phone, 4G, 5G, or computer worldwide)
    let publicUrl = getPublicUrl();
    if (hostHeader.includes("trycloudflare.com") || hostHeader.includes("vercel.app") || (!hostHeader.includes("localhost") && !hostHeader.startsWith("127.0.0.1"))) {
      publicUrl = `${proto}://${hostHeader}`;
    }
    const publicResetLink = `${publicUrl}/password/resetpassword/${id}`;

    // 5. Send email using Gmail SMTP / Brevo
    await mailService.sendMail({
      to: email,
      resetLink: localResetLink,
      networkResetLink,
      publicResetLink
    });

    return res.status(200).json({
      success: true,
      message: "Reset password link sent to your email.",
      resetLink: publicResetLink,
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
 * - If false -> return "Link Expired" HTML page
 * - If true -> return modern, mobile-friendly HTML page containing:
 *   - New Password & Confirm Password inputs
 *   - Show / Hide toggle (eye icon)
 *   - Live matching & length validation
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Link Expired — Expense Tracker</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c1117; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
            .card { background: #161f2e; border: 1px solid #ef4444; border-radius: 16px; padding: 40px 32px; text-align: center; max-width: 440px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            .icon { font-size: 48px; margin-bottom: 16px; }
            h1 { color: #f87171; margin: 0 0 12px; font-size: 24px; font-weight: 700; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin: 0 0 28px; }
            a.btn { display: inline-block; background: #3b82f6; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; transition: background 0.2s; }
            a.btn:hover { background: #2563eb; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">⚠️</div>
            <h1>Link Expired</h1>
            <p>This password reset link has either already been used or has expired. Please request a new password reset link from the login page.</p>
            <a href="/login.html" class="btn">Back to Login</a>
          </div>
        </body>
        </html>
      `);
    }

    // If true -> return modern, mobile-friendly HTML page
    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Set New Password — SpendWise AI</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background: #0c1117;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .card {
            background: #161f2e;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 36px 30px;
            width: 100%;
            max-width: 440px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
          }
          .brand {
            font-size: 13px;
            font-weight: 700;
            color: #10b981;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
          }
          h2 { margin: 0 0 8px; font-size: 24px; color: #f8fafc; font-weight: 700; }
          p.subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
          .form-group { margin-bottom: 18px; }
          label { display: block; font-size: 13px; font-weight: 600; color: #cbd5e1; margin-bottom: 6px; }
          .input-wrap {
            position: relative;
            display: flex;
            align-items: center;
          }
          input[type="password"], input[type="text"] {
            width: 100%;
            padding: 12px 42px 12px 14px;
            background: #090d13;
            border: 1px solid #334155;
            border-radius: 8px;
            color: #ffffff;
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          input:focus {
            border-color: #10b981;
            box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
          }
          .toggle-btn {
            position: absolute;
            right: 10px;
            background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            font-size: 18px;
            padding: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .hint {
            font-size: 12px;
            margin-top: 6px;
            color: #94a3b8;
          }
          button[type="submit"] {
            width: 100%;
            padding: 13px;
            margin-top: 10px;
            background: #10b981;
            color: #ffffff;
            font-weight: 700;
            font-size: 15px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
          }
          button[type="submit"]:hover { background: #059669; }
          button[type="submit"]:disabled {
            background: #334155;
            color: #64748b;
            cursor: not-allowed;
          }
          #feedback {
            margin-top: 20px;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            display: none;
            text-align: center;
            line-height: 1.5;
          }
          .login-btn {
            display: inline-block;
            margin-top: 14px;
            background: #10b981;
            color: #ffffff !important;
            padding: 10px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 700;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="brand">✦ SpendWise AI</div>
          <h2>Set New Password</h2>
          <p class="subtitle">Enter your new password below. Make sure it is at least 6 characters long.</p>
          
          <form id="resetForm" action="/password/updatepassword/${id}" method="POST">
            <div class="form-group">
              <label for="password">New Password</label>
              <div class="input-wrap">
                <input type="password" id="password" name="password" placeholder="At least 6 characters" required minlength="6" autocomplete="new-password">
                <button type="button" class="toggle-btn" onclick="togglePass('password', this)" title="Show/Hide">👁️</button>
              </div>
            </div>

            <div class="form-group">
              <label for="confirmPassword">Confirm New Password</label>
              <div class="input-wrap">
                <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Re-enter password" required minlength="6" autocomplete="new-password">
                <button type="button" class="toggle-btn" onclick="togglePass('confirmPassword', this)" title="Show/Hide">👁️</button>
              </div>
              <div id="matchHint" class="hint"></div>
            </div>

            <button type="submit" id="submitBtn">Update Password</button>
          </form>

          <div id="feedback"></div>
        </div>

        <script>
          function togglePass(inputId, btn) {
            const input = document.getElementById(inputId);
            if (input.type === "password") {
              input.type = "text";
              btn.textContent = "🙈";
            } else {
              input.type = "password";
              btn.textContent = "👁️";
            }
          }

          const form = document.getElementById("resetForm");
          const feedback = document.getElementById("feedback");
          const submitBtn = document.getElementById("submitBtn");
          const pass = document.getElementById("password");
          const confirmPass = document.getElementById("confirmPassword");
          const matchHint = document.getElementById("matchHint");

          function checkMatch() {
            if (!confirmPass.value) {
              matchHint.textContent = "";
              return true;
            }
            if (pass.value !== confirmPass.value) {
              matchHint.style.color = "#f87171";
              matchHint.textContent = "⚠️ Passwords do not match";
              return false;
            } else {
              matchHint.style.color = "#34d399";
              matchHint.textContent = "✓ Passwords match";
              return true;
            }
          }

          pass.addEventListener("input", checkMatch);
          confirmPass.addEventListener("input", checkMatch);

          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const p = pass.value;
            const cp = confirmPass.value;

            if (p.length < 6) {
              feedback.style.display = "block";
              feedback.style.background = "rgba(239, 68, 68, 0.15)";
              feedback.style.border = "1px solid #ef4444";
              feedback.style.color = "#f87171";
              feedback.textContent = "❌ Password must be at least 6 characters long.";
              return;
            }

            if (p !== cp) {
              feedback.style.display = "block";
              feedback.style.background = "rgba(239, 68, 68, 0.15)";
              feedback.style.border = "1px solid #ef4444";
              feedback.style.color = "#f87171";
              feedback.textContent = "❌ Passwords do not match. Please re-enter.";
              return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = "Updating Password...";

            try {
              const res = await fetch("/password/updatepassword/${id}", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: p, confirmPassword: cp })
              });
              const data = await res.json();

              feedback.style.display = "block";
              if (res.ok) {
                feedback.style.background = "rgba(16, 185, 129, 0.15)";
                feedback.style.border = "1px solid #10b981";
                feedback.style.color = "#34d399";
                feedback.innerHTML = "✅ <strong>Password Updated Successfully!</strong><br><p style='margin: 8px 0 12px; font-size: 13px; color: #cbd5e1;'>Your account credentials have been updated.</p><a href='/login.html' class='login-btn'>Log In to Your Account</a>";
                form.style.display = "none";
              } else {
                feedback.style.background = "rgba(239, 68, 68, 0.15)";
                feedback.style.border = "1px solid #ef4444";
                feedback.style.color = "#f87171";
                feedback.textContent = "❌ " + (data.message || "Failed to update password. Link may be expired.");
                submitBtn.disabled = false;
                submitBtn.textContent = "Update Password";
              }
            } catch (err) {
              feedback.style.display = "block";
              feedback.style.background = "rgba(239, 68, 68, 0.15)";
              feedback.style.border = "1px solid #ef4444";
              feedback.style.color = "#f87171";
              feedback.textContent = "❌ Network error. Please try again.";
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
 * - Update User password in MongoDB
 * - Set isActive = false
 * - Return Password Updated Successfully (JSON or styled HTML)
 */
exports.updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password, confirmPassword } = req.body;

    const isHtmlReq = req.headers.accept && req.headers.accept.includes("text/html") && !req.xhr && !req.is("json");

    if (!id || !password) {
      if (isHtmlReq) {
        return res.status(400).send(`<h3>Error: Password is required. <a href="javascript:history.back()">Go back</a></h3>`);
      }
      return res.status(400).json({
        success: false,
        message: "Request ID and new password are required."
      });
    }

    if (password.length < 6) {
      if (isHtmlReq) {
        return res.status(400).send(`<h3>Error: Password must be at least 6 characters long. <a href="javascript:history.back()">Go back</a></h3>`);
      }
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long."
      });
    }

    if (confirmPassword && password !== confirmPassword) {
      if (isHtmlReq) {
        return res.status(400).send(`<h3>Error: Passwords do not match. <a href="javascript:history.back()">Go back</a></h3>`);
      }
      return res.status(400).json({
        success: false,
        message: "Passwords do not match."
      });
    }

    // 1. Find ForgotPasswordRequest
    let request = await ForgotPasswordRequest.findOne({ id });
    if (!request && typeof ForgotPasswordRequest.findOne === "function") {
      request = await ForgotPasswordRequest.findOne({ where: { id } });
    }

    // 2. Verify isActive = true
    if (!request || !request.isActive) {
      if (isHtmlReq) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <body style="background:#0c1117; color:#f8fafc; font-family:sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0;">
            <div style="background:#161f2e; border:1px solid #ef4444; border-radius:12px; padding:32px; text-align:center; max-width:400px;">
              <h2 style="color:#f87171;">Link Expired</h2>
              <p style="color:#94a3b8;">This password reset link has already been used or expired.</p>
              <a href="/login.html" style="background:#3b82f6; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none;">Go to Login</a>
            </div>
          </body>
          </html>
        `);
      }
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
    if (isHtmlReq) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Updated — SpendWise AI</title>
          <style>
            body { background: #0c1117; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; }
            .card { background: #161f2e; border: 1px solid #10b981; border-radius: 16px; padding: 40px 32px; text-align: center; max-width: 440px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { color: #34d399; margin-top: 0; }
            p { color: #94a3b8; line-height: 1.6; margin-bottom: 24px; }
            a.btn { background: #10b981; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✅ Password Updated Successfully</h2>
            <p>Your password has been changed. You can now log into your SpendWise AI account with your new credentials.</p>
            <a href="/login.html" class="btn">Log In Now</a>
          </div>
        </body>
        </html>
      `);
    }

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
