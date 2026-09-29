import React, { useState } from "react";
import axios from "axios";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post("/password/forgotpassword", {
        email: email.trim()
      });

      if (response.status === 200 || response.data?.success) {
        setMessage("Reset password link sent to your email.");
        setEmail("");
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.message ||
        err.message ||
        "Could not send reset password email.";
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.icon}>🔑</span>
          <h2 style={styles.title}>Forgot Password</h2>
          <p style={styles.subtitle}>
            Enter your registered email address and we'll send you a password reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label htmlFor="email" style={styles.label}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              style={styles.input}
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <button
            type="submit"
            style={{
              ...styles.button,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer"
            }}
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {message && <div style={styles.successAlert}>✅ {message}</div>}
        {error && <div style={styles.errorAlert}>❌ {error}</div>}

        <div style={styles.footer}>
          <a href="/login.html" style={styles.link}>
            ← Back to Login
          </a>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    padding: "20px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "14px",
    padding: "36px",
    boxShadow: "0 20px 45px rgba(0, 0, 0, 0.4)"
  },
  header: {
    textAlign: "center",
    marginBottom: "24px"
  },
  icon: {
    fontSize: "36px",
    display: "inline-block",
    marginBottom: "8px"
  },
  title: {
    color: "#f8fafc",
    fontSize: "24px",
    fontWeight: "700",
    margin: "0 0 8px 0"
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: "14px",
    lineHeight: "1.5",
    margin: 0
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  },
  label: {
    color: "#cbd5e1",
    fontSize: "13px",
    fontWeight: "600"
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "#0f172a",
    border: "1px solid #475569",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box"
  },
  button: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#10b981",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: "700",
    border: "none",
    borderRadius: "8px",
    transition: "background-color 0.2s"
  },
  successAlert: {
    marginTop: "16px",
    padding: "12px",
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    border: "1px solid rgba(16, 185, 129, 0.3)",
    borderRadius: "8px",
    color: "#34d399",
    fontSize: "14px",
    textAlign: "center"
  },
  errorAlert: {
    marginTop: "16px",
    padding: "12px",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "8px",
    color: "#f87171",
    fontSize: "14px",
    textAlign: "center"
  },
  footer: {
    marginTop: "24px",
    textAlign: "center",
    borderTop: "1px solid #334155",
    paddingTop: "16px"
  },
  link: {
    color: "#38bdf8",
    fontSize: "14px",
    textDecoration: "none",
    fontWeight: "600"
  }
};

export default ForgotPassword;
