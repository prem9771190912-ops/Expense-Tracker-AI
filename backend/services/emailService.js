const SibApiV3Sdk = require("sib-api-v3-sdk");
let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (e) {}

/**
 * Send password reset email using Sendinblue (Brevo) API or Nodemailer (Gmail / SMTP).
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.resetUrl - Password reset link URL
 * @param {string} options.token - Raw reset token
 * @returns {Promise<Object>}
 */
async function sendPasswordResetEmail({ to, resetUrl, token }) {
  const apiKey = process.env.SENDINBLUE_API_KEY || process.env.BREVO_API_KEY || process.env.SIB_API_KEY;
  const senderEmail = process.env.SENDINBLUE_SENDER_EMAIL || process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER || process.env.GMAIL_USER || "support@expensetracker.com";
  const senderName = process.env.SENDINBLUE_SENDER_NAME || "Expense Tracker";

  const emailUser = process.env.EMAIL_USER || process.env.GMAIL_USER || process.env.SMTP_USER;
  const emailPass = process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;

  const emailSubject = "Reset Your Password — Expense Tracker";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c1117; color: #f8fafc; padding: 24px; margin: 0; }
        .card { max-width: 520px; margin: 0 auto; background: #121820; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; }
        .brand { font-size: 20px; font-weight: 700; color: #34d399; margin-bottom: 20px; }
        h2 { color: #f8fafc; font-size: 22px; margin-top: 0; }
        p { color: #94a3b8; font-size: 15px; line-height: 1.6; }
        .btn { display: inline-block; background: #10b981; color: #ffffff !important; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 20px 0; }
        .token { background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; font-family: monospace; color: #fbbf24; word-break: break-all; }
        .footer { font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand">✦ SpendWise AI / Expense Tracker</div>
        <h2>Password Reset Request</h2>
        <p>You recently requested to reset your password for your Expense Tracker account. Click the button below to set a new password:</p>
        <p><a href="${resetUrl}" class="btn" target="_blank">Reset Password</a></p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p class="token">${resetUrl}</p>
        <p>This password reset link is valid for 15 minutes.</p>
        <div class="footer">If you did not request this password reset, please ignore this email.</div>
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

  // 2. If Sendinblue / Brevo API Key is configured, send through Sendinblue API
  if (apiKey && apiKey !== "demo_sendinblue_api_key" && apiKey !== "your_sendinblue_api_key_here" && !apiKey.includes("placeholder")) {
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
      console.log(`[Sendinblue] Email sent successfully to ${to}. MessageId:`, response.messageId);
      return { success: true, messageId: response.messageId, provider: "sendinblue" };
    } catch (error) {
      console.warn(`[Sendinblue] Warning: Sendinblue API call failed: ${error.message}. Falling back to simulation.`);
    }
  }

  // 3. Fallback / local simulation when API key is not yet set
  console.log("\n=================================================================");
  console.log("📨 [PASSWORD RESET EMAIL DISPATCH]");
  console.log(`   To:         ${to}`);
  console.log(`   From:       ${senderName} <${senderEmail}>`);
  console.log(`   Subject:    ${emailSubject}`);
  console.log(`   Reset URL:  ${resetUrl}`);
  console.log("=================================================================\n");

  return { success: true, simulated: true, resetUrl };
}

module.exports = {
  sendPasswordResetEmail
};
