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
    const directLink = result.resetUrl
      ? `<br><br><a href="${result.resetUrl}" style="color: #6ee7b7; font-weight: bold; text-decoration: underline;">👉 Reset Password Now</a>`
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

