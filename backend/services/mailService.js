const SibApiV3Sdk = require("sib-api-v3-sdk");
let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  // Optional fallback
}

/**
 * Send password reset email using Sendinblue (Brevo) or Nodemailer (Gmail / SMTP)
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.resetLink - Password reset URL
 * @returns {Promise<Object>}
 */
async function sendMail({ to, resetLink, networkResetLink, publicResetLink }) {
  const apiKey = process.env.SENDINBLUE_API_KEY || process.env.BREVO_API_KEY || process.env.SIB_API_KEY;
  const senderEmail = process.env.SENDINBLUE_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || process.env.GMAIL_USER || "support@expensetracker.com";
  const senderName = process.env.SENDINBLUE_SENDER_NAME || "Expense Tracker";

  const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  const primaryLink = publicResetLink || resetLink;

  const emailSubject = "Reset Your Password - SpendWise AI Expense Tracker";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0c1117; color: #f8fafc; padding: 20px; margin: 0; }
        .card { max-width: 520px; margin: 0 auto; background: #161f2e; border-radius: 16px; padding: 32px 28px; border: 1px solid #334155; }
        .brand { font-size: 13px; font-weight: 700; color: #10b981; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
        h2 { font-size: 22px; margin-top: 0; color: #f8fafc; font-weight: 700; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 8px 0; }
        .btn-wrap { text-align: center; margin: 24px 0; }
        .btn { display: inline-block; background: #10b981; color: #ffffff !important; font-weight: 700; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }
        .section-title { font-size: 13px; font-weight: 600; color: #cbd5e1; margin-top: 20px; margin-bottom: 6px; }
        .link-box { background: #090d13; padding: 12px 14px; border-radius: 8px; font-family: monospace; font-size: 12px; border: 1px solid #233147; word-break: break-all; }
        .footer { font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #233147; padding-top: 16px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">✦ SpendWise AI — Expense Tracker</div>
        <h2>Password Reset Request</h2>
        <p>You requested a password reset for your SpendWise AI account. Click the button below to choose a new password:</p>
        
        <div class="btn-wrap">
          <a href="${primaryLink}" class="btn" target="_blank">Reset Password Now</a>
        </div>

        <div class="section-title">📱 Opening on a Mobile Phone or Remote Device:</div>
        <div class="link-box"><a href="${publicResetLink || primaryLink}" style="color: #38bdf8; text-decoration: none;">${publicResetLink || primaryLink}</a></div>

        ${resetLink ? `
        <div class="section-title">💻 Opening on the Local Host Computer:</div>
        <div class="link-box"><a href="${resetLink}" style="color: #6ee7b7; text-decoration: none;">${resetLink}</a></div>
        ` : ""}

        ${networkResetLink ? `
        <div class="section-title">📶 Opening on the Same Wi-Fi Network:</div>
        <div class="link-box"><a href="${networkResetLink}" style="color: #93c5fd; text-decoration: none;">${networkResetLink}</a></div>
        ` : ""}

        <p style="font-size: 12px; color: #94a3b8; margin-top: 18px;">⏳ This reset link will expire in <strong>15 minutes</strong>.</p>
        <div class="footer">If you did not request this password reset, please ignore this email. Your password will remain unchanged.</div>
      </div>
    </body>
    </html>
  `;

  // 1. Try Nodemailer SMTP / Gmail if credentials configured
  if (nodemailer && emailUser && emailPass && !emailPass.includes("placeholder")) {
    try {
      const cleanPass = String(emailPass).replace(/\s+/g, "");
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: emailUser,
          pass: cleanPass
        }
      });

      const info = await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        subject: emailSubject,
        html: htmlContent
      });

      console.log(`[Nodemailer] Email sent successfully to ${to}. MessageId:`, info.messageId);
      return { success: true, messageId: info.messageId, provider: "nodemailer" };
    } catch (smtpErr) {
      console.warn(`[Nodemailer] SMTP send error: ${smtpErr.message}. Trying next provider.`);
    }
  }

  // 2. Try Sendinblue / Brevo API if configured
  if (apiKey && apiKey !== "your_sendinblue_api_key_here" && apiKey !== "demo_sendinblue_api_key" && !apiKey.includes("placeholder")) {
    try {
      const defaultClient = SibApiV3Sdk.ApiClient.instance;
      const apiKeyAuth = defaultClient.authentications["api-key"];
      apiKeyAuth.apiKey = apiKey;

      const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

      sendSmtpEmail.subject = emailSubject;
      sendSmtpEmail.htmlContent = htmlContent;
      sendSmtpEmail.sender = { name: senderName, email: senderEmail };
      sendSmtpEmail.to = [{ email: to }];

      const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`[Sendinblue] Email sent to ${to}. MessageId:`, response.messageId);
      return { success: true, messageId: response.messageId, provider: "sendinblue" };
    } catch (error) {
      console.warn(`[Sendinblue] Warning: Sendinblue API error: ${error.message}. Running fallback simulation.`);
    }
  }

  // 3. Fallback / Development Simulation Log
  console.log("\n=================================================================");
  console.log("📨 [PASSWORD RESET EMAIL DISPATCH]");
  console.log(`   To:         ${to}`);
  console.log(`   From:       ${senderName} <${senderEmail}>`);
  console.log(`   Subject:    ${emailSubject}`);
  console.log(`   Reset Link: ${resetLink}`);
  console.log("=================================================================\n");

  return { success: true, simulated: true, resetLink };
}

module.exports = {
  sendMail,
  sendPasswordResetEmail: sendMail
};
