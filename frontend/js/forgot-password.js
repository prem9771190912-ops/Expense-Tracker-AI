const form = document.getElementById("forgotPasswordForm");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending reset mail...";
  }

  message.style.color = "var(--text-secondary)";
  message.textContent = "Sending password reset email via Sendinblue...";

  try {
    // Call backend API route /password/forgotpassword via axios as requested
    const response = await axios.post("/password/forgotpassword", {
      email,
      mail: email
    });

    const result = response.data;
    message.style.color = "#34d399";
    const link = result.resetLink || result.resetUrl;
    const directLink = link
      ? `<br><br><div style="margin-top: 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 12px; text-align: center;"><a href="${link}" style="display: inline-block; background: #10b981; color: #ffffff; font-weight: bold; text-decoration: none; padding: 10px 18px; border-radius: 6px;">👉 Click Here to Reset Password Now</a></div>`
      : "";
    message.innerHTML = `✅ ${result.message || "Password reset mail sent successfully."}${directLink}`;

    form.reset();
  } catch (error) {
    message.style.color = "#f43f5e";
    const errorMsg = error.response?.data?.message || error.message || "Could not send reset mail.";
    message.textContent = `❌ ${errorMsg}`;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Reset Link";
    }
  }
});

