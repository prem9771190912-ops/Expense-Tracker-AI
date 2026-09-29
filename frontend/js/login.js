const form = document.getElementById("loginForm");

// If already logged in, redirect straight to the dashboard
const existingToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");
const existingUser = localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser");
if (existingToken && existingUser) {
  window.location.href = "index.html";
}

window.addEventListener("DOMContentLoaded", () => {
  if (form) form.reset();
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  if (emailInput) emailInput.value = "";
  if (passwordInput) passwordInput.value = "";

  const urlParams = new URLSearchParams(window.location.search);
  const message = document.getElementById("message");
  if (urlParams.get("registered") === "true" && message) {
    message.style.color = "#34d399";
    message.textContent = "Account created successfully. Please login.";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";
  }

  const user = {
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value
  };

  const message = document.getElementById("message");

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Login failed.");
    }

    if (result.token) {
      localStorage.setItem("authToken", result.token);
      localStorage.setItem("expenseTrackerToken", result.token);
      try {
        const base64Url = result.token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        const decoded = JSON.parse(jsonPayload);
        const isPremium = Boolean(decoded.ispremiumuser);
        localStorage.setItem("ispremiumuser", isPremium ? "true" : "false");
      } catch (e) {
        localStorage.setItem("ispremiumuser", Boolean(result.user?.ispremiumuser) ? "true" : "false");
      }
    }
    const userObj = result.user || { email: user.email, name: user.email.split("@")[0] };
    if (localStorage.getItem("ispremiumuser") === "true") {
      userObj.ispremiumuser = true;
      userObj.isPremium = true;
    }
    localStorage.setItem("loggedInUser", JSON.stringify(userObj));
    localStorage.setItem("expenseTrackerUser", JSON.stringify(userObj));
    
    // Redirect to separate dashboard page
    window.location.href = "index.html";
  } catch (error) {
    message.textContent = error.message;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Login";
    }
  }
});

// --- Forgot Password Toggle & Form Submission via Axios ---
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const forgotPasswordSection = document.getElementById("forgotPasswordSection");
const forgotPasswordForm = document.getElementById("forgotPasswordForm");
const cancelForgotBtn = document.getElementById("cancelForgotBtn");
const forgotEmailInput = document.getElementById("forgotEmail");
const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");

if (forgotPasswordBtn && forgotPasswordSection) {
  forgotPasswordBtn.addEventListener("click", () => {
    form.style.display = "none";
    forgotPasswordBtn.style.display = "none";
    forgotPasswordSection.style.display = "block";
    const message = document.getElementById("message");
    if (message) message.textContent = "";
    if (forgotEmailInput) {
      forgotEmailInput.value = document.getElementById("email")?.value || "";
      forgotEmailInput.focus();
    }
  });
}

if (cancelForgotBtn && forgotPasswordSection) {
  cancelForgotBtn.addEventListener("click", () => {
    forgotPasswordSection.style.display = "none";
    form.style.display = "flex";
    forgotPasswordBtn.style.display = "block";
    const message = document.getElementById("message");
    if (message) message.textContent = "";
  });
}

if (forgotPasswordForm) {
  forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("message");
    const mailId = forgotEmailInput.value.trim();

    if (!mailId) {
      if (message) {
        message.style.color = "#fbbf24";
        message.textContent = "Please enter your email address.";
      }
      return;
    }

    if (forgotSubmitBtn) {
      forgotSubmitBtn.disabled = true;
      forgotSubmitBtn.textContent = "Sending reset mail...";
    }
    if (message) {
      message.style.color = "var(--text-secondary)";
      message.textContent = "Sending reset email via Sendinblue...";
    }

    try {
      // Call backend api route /password/forgotpassword via axios as requested
      const response = await axios.post("/password/forgotpassword", {
        email: mailId,
        mail: mailId
      });

      if (message) {
        message.style.color = "#34d399";
        const link = response.data?.resetLink || response.data?.resetUrl
          ? `<br><br><a href="${response.data.resetLink || response.data.resetUrl}" style="color: #6ee7b7; font-weight: bold; text-decoration: underline;">👉 Click here to Reset Password Now</a>`
          : "";
        message.innerHTML = `✅ ${response.data.message || "Reset password link sent to your email."}${link}`;
      }
      forgotPasswordForm.reset();
    } catch (error) {
      if (message) {
        message.style.color = "#f43f5e";
        const errorMsg = error.response?.data?.message || error.message || "Could not send reset mail.";
        message.textContent = `❌ ${errorMsg}`;
      }
    } finally {
      if (forgotSubmitBtn) {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.textContent = "Send Reset Mail";
      }
    }
  });
}

