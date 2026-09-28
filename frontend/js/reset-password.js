const form = document.getElementById("resetPasswordForm");
const message = document.getElementById("message");

const urlParams = new URLSearchParams(window.location.search);
let rawToken = urlParams.get("token") || urlParams.get("id");
if (!rawToken) {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (lastPart && lastPart !== "reset-password.html" && lastPart !== "resetpassword") {
    rawToken = lastPart;
  }
}
const token = rawToken ? rawToken.trim() : "";

if (!token) {
  message.style.color = "#fbbf24";
  message.textContent = "Missing reset token. Please request a new password reset link from the login page.";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = document.getElementById("password").value.trim();
  const submitBtn = form.querySelector("button[type='submit']");

  if (!token) {
    message.style.color = "#f43f5e";
    message.textContent = "Missing reset token. Please request a new password reset link.";
    return;
  }

  if (password.length < 6) {
    message.style.color = "#fbbf24";
    message.textContent = "Password must be at least 6 characters long.";
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating password...";
  }
  message.style.color = "var(--text-secondary)";
  message.textContent = "Updating password...";

  try {
    const response = await fetch("/password/resetpassword", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not reset password.");
    }

    message.style.color = "#34d399";
    message.innerHTML = `✅ ${result.message || "Password reset successfully!"} Redirecting to login in 2 seconds...<br><a href="login.html" style="color: #6ee7b7; font-weight: bold; text-decoration: underline;">👉 Click here to Login now</a>`;
    form.reset();
    setTimeout(() => {
      window.location.href = "login.html";
    }, 2000);
  } catch (error) {
    message.style.color = "#f43f5e";
    message.textContent = `❌ ${error.message}`;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Update Password";
    }
  }
});
