const { useState, useEffect, useCallback, useMemo } = React;

const ITEMS_PER_PAGE = 10;
const CATEGORIES = [
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Education",
  "Salary",
  "Other"
];

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return "₹" + (num % 1 === 0 
    ? num.toLocaleString("en-IN") 
    : num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");
    } catch {
      return null;
    }
  });
  const [authToken, setAuthToken] = useState(() => {
    return localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");
  });

  const [expenses, setExpenses] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notification, setNotification] = useState("");

  // Form state
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [predictedCategory, setPredictedCategory] = useState(null);
  const [predictedSource, setPredictedSource] = useState("fallback");
  const [aiThinking, setAiThinking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Insight state
  const [aiInsight, setAiInsight] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);

  // Auth redirection
  useEffect(() => {
    if (!currentUser || !authToken) {
      window.location.href = "login.html";
    }
  }, [currentUser, authToken]);

  const authHeaders = useMemo(() => {
    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    return headers;
  }, [authToken]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("expenseTrackerToken");
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("expenseTrackerUser");
    window.location.href = "login.html";
  }, []);

  // Fetch paginated expenses
  const fetchExpenses = useCallback(async (targetPage = currentPage) => {
    if (!currentUser?.email) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/expenses?page=${targetPage}&limit=${ITEMS_PER_PAGE}`, {
        headers: authHeaders
      });

      if (response.status === 401) {
        handleLogout();
        return;
      }

      const data = await response.json();

      if (data && Array.isArray(data.expenses)) {
        setExpenses(data.expenses);
        setCurrentPage(data.currentPage || targetPage);
        setTotalPages(data.totalPages || 1);
        setTotalExpenses(data.totalExpenses != null ? data.totalExpenses : data.expenses.length);
        if (data.totalAmount != null) {
          setTotalAmount(data.totalAmount);
        }
      } else if (Array.isArray(data)) {
        // Fallback if backend returned plain array
        const all = data;
        const total = all.length;
        const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
        const safePage = Math.min(Math.max(1, targetPage), pages);
        const start = (safePage - 1) * ITEMS_PER_PAGE;
        setExpenses(all.slice(start, start + ITEMS_PER_PAGE));
        setCurrentPage(safePage);
        setTotalPages(pages);
        setTotalExpenses(total);
        const sum = all.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        setTotalAmount(sum);
      } else {
        setExpenses([]);
        setTotalExpenses(0);
        setTotalPages(1);
      }
    } catch (err) {
      setNotification(`Error loading expenses: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, authHeaders, currentPage, handleLogout]);

  useEffect(() => {
    fetchExpenses(currentPage);
  }, [currentPage]);

  // Debounced AI Category suggestion
  useEffect(() => {
    const trimmed = description.trim();
    if (!trimmed) {
      setPredictedCategory(null);
      setPredictedSource("fallback");
      return;
    }

    const timer = setTimeout(async () => {
      setAiThinking(true);
      try {
        const res = await fetch("/api/categorize-expense", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ description: trimmed })
        });
        const result = await res.json();
        if (result && result.category) {
          setPredictedCategory(result.category);
          setPredictedSource(result.source || "ai");
        }
      } catch {
        // Ignore AI suggestion errors silently
      } finally {
        setAiThinking(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [description, authHeaders]);

  // Add expense handler
  const handleAddExpense = async (e) => {
    e.preventDefault();
    const numAmount = Number(amount);
    const textDesc = description.trim();

    if (!Number.isFinite(numAmount) || numAmount <= 0 || !textDesc) {
      setNotification("Please enter a valid amount and description.");
      return;
    }

    setIsSubmitting(true);
    setNotification("");

    const body = {
      amount: numAmount,
      description: textDesc,
      category: category || predictedCategory || "Other",
      categorySource: category ? "user" : (predictedCategory ? predictedSource : "fallback")
    };

    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add expense.");

      setAmount("");
      setDescription("");
      setCategory("");
      setPredictedCategory(null);
      setNotification(`Expense "${textDesc}" added successfully (${body.category})!`);

      // Reload page 1 so the new expense appears at the top
      if (currentPage === 1) {
        await fetchExpenses(1);
      } else {
        setCurrentPage(1);
      }
    } catch (err) {
      setNotification(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete expense handler
  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;

    try {
      const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to delete expense.");

      setNotification("Expense deleted successfully.");

      // Check if page needs to decrement
      if (expenses.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else {
        await fetchExpenses(currentPage);
      }
    } catch (err) {
      setNotification(`Delete failed: ${err.message}`);
    }
  };

  // AI Insight handler
  const handleGenerateInsight = async () => {
    setInsightLoading(true);
    setAiInsight("");
    try {
      const queryEmail = currentUser?.email ? `?email=${encodeURIComponent(currentUser.email)}` : "";
      const res = await fetch("/api/ai/insight" + queryEmail, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not analyze spending.");
      setAiInsight(data.insight || data.message || "Spending looks balanced.");
    } catch (err) {
      setAiInsight(`Insight error: ${err.message}`);
    } finally {
      setInsightLoading(false);
    }
  };

  // Page range numbers for pagination bar
  const paginationRange = useMemo(() => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let left = Math.max(2, currentPage - 1);
      let right = Math.min(totalPages - 1, currentPage + 1);

      if (currentPage <= 3) right = 4;
      if (currentPage >= totalPages - 2) left = totalPages - 3;

      if (left > 2) pages.push("...");
      for (let i = left; i <= right; i++) pages.push(i);
      if (right < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  }, [totalPages, currentPage]);

  const startIndex = totalExpenses === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, totalExpenses);

  return (
    <div>
      {/* Top App Navigation */}
      <nav className="app-nav">
        <div className="nav-container">
          <a href="index.html" className="nav-brand">
            <span className="brand-icon">⚛️</span>
            <span>SpendWise AI <small style={{ fontSize: "0.75rem", opacity: 0.8, color: "var(--emerald-text)" }}>React</small></span>
          </a>

          <div className="nav-menu">
            <a href="index.html" className="nav-item">⚡ Smart Hub</a>
            <a href="react.html" className="nav-item active">⚛️ React App</a>
            <a href="expenses.html" className="nav-item">📋 Activity Log</a>
            <a href="report.html" className="nav-item">📊 Reports</a>
          </div>

          <div className="nav-actions">
            {currentUser && (
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginRight: "8px" }}>
                👋 {currentUser.name || currentUser.email}
              </span>
            )}
            <button onClick={handleLogout} className="logout-btn" type="button">Logout</button>
          </div>
        </div>
      </nav>

      <main className="dashboard">
        {/* Page Header */}
        <header className="page-header">
          <div>
            <span className="eyebrow">React JS Edition</span>
            <h1>Real-Time Expense Tracker</h1>
            <p className="subtitle">
              Built natively with React 18 hooks & live server pagination (displaying 10 expenses per page).
            </p>
          </div>
          <div className="header-actions">
            <button id="insightBtn" onClick={handleGenerateInsight} disabled={insightLoading} type="button">
              {insightLoading ? "Analyzing..." : "✨ AI Spending Insight"}
            </button>
          </div>
        </header>

        {/* AI Insight Box */}
        {aiInsight && (
          <div className="insight">
            <b>AI Financial Advisor:</b> {aiInsight}
          </div>
        )}

        {/* Toast / Notification */}
        {notification && (
          <div id="msg" style={{ marginBottom: "16px" }}>
            {notification}
          </div>
        )}

        {/* Summary Stats Row */}
        <div className="stats-row">
          <div className="stat-card">
            <span className="stat-label">Total Tracked Spending</span>
            <span className="stat-value" style={{ color: "var(--emerald-text)" }}>
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Total Expenses</span>
            <span className="stat-value" style={{ color: "var(--sky)" }}>
              {totalExpenses}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Current Page</span>
            <span className="stat-value" style={{ color: "var(--amber-text)" }}>
              Page {currentPage} <small style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>of {totalPages}</small>
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-label">Last Page</span>
            <span className="stat-value" style={{ color: "var(--rose-text)" }}>
              Page {totalPages}
            </span>
          </div>
        </div>

        {/* Main Grid: Form + Quick Tip */}
        <section className="dashboard-grid">
          {/* Add Expense Form Panel */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">New Transaction</span>
                <h2>Record an Expense</h2>
              </div>
              <span className="ai-mark">React State</span>
            </div>

            <form onSubmit={handleAddExpense}>
              <div className="form-group">
                <label htmlFor="reactAmount">Amount (₹)</label>
                <input
                  id="reactAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 350.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="reactDescription">Description / Merchant</label>
                <input
                  id="reactDescription"
                  type="text"
                  placeholder="e.g. Swiggy food delivery, Uber cab, Starbucks"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="reactCategory">Category (Optional - AI auto-detects)</label>
                <select
                  id="reactCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">
                    {aiThinking ? "AI is thinking..." : (predictedCategory ? `AI suggests: ${predictedCategory}` : "Auto Detect / Choose Category")}
                  </option>
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {predictedCategory && !category && (
                <div className="ai-suggestion">
                  ✨ AI suggestion: <strong>{predictedCategory}</strong> (will be applied automatically)
                </div>
              )}

              <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "+ Adding Transaction..." : "+ Add Expense"}
              </button>
            </form>
          </div>

          {/* Balance Summary Card */}
          <div className="panel" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "20px" }}>
            <div>
              <span className="eyebrow">Overview</span>
              <h2>Ledger Status</h2>
              <p className="subtitle" style={{ marginBottom: 0 }}>
                Transactions are divided into pages of 10 items. Use the pagination bar below to navigate.
              </p>
            </div>

            <div className="total-expense-card" style={{ textAlign: "left", padding: "24px" }}>
              <span className="eyebrow" style={{ color: "var(--emerald-text)", marginBottom: "6px" }}>
                Total Tracked Outflow
              </span>
              <span className="total-amount" style={{ fontSize: "2.4rem" }}>
                {formatCurrency(totalAmount)}
              </span>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "1.3rem" }}>💡</span>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
                Pagination shows only <strong>10 expenses per page</strong> to ensure snappy performance. The <strong>Last Page</strong> button reveals the end of your records.
              </p>
            </div>
          </div>
        </section>

        {/* Expenses Table Panel */}
        <section className="panel expense-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Activity Records</span>
              <h2>Recent Expenses (10 per page)</h2>
            </div>
            {totalExpenses > 0 && (
              <span className="pagination-badge">
                Showing {startIndex}–{endIndex} of {totalExpenses}
              </span>
            )}
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Classification Source</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="5">
                      <div className="empty-state">⏳ Loading page {currentPage}...</div>
                    </td>
                  </tr>
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="empty-state">☕ No expenses recorded yet. Start by adding one above!</div>
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => {
                    const isAi = expense.categorySource && expense.categorySource !== "saved" && expense.categorySource !== "fallback";
                    return (
                      <tr key={expense.id}>
                        <td style={{ fontWeight: 700, color: "var(--emerald-text)", fontVariantNumeric: "tabular-nums" }}>
                          {formatCurrency(expense.amount)}
                        </td>
                        <td style={{ fontWeight: 500 }}>{expense.description}</td>
                        <td>
                          <span className="cat">{expense.category || "General"}</span>
                        </td>
                        <td>
                          {isAi ? (
                            <span className="ai">🤖 {expense.categorySource}</span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Manual / Saved</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="delete-button"
                            type="button"
                            onClick={() => handleDeleteExpense(expense.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalExpenses > 0 && (
            <div className="pagination-wrap">
              <div className="pagination-info">
                Showing <b>{startIndex}</b>–<b>{endIndex}</b> of <b>{totalExpenses}</b> expenses
                <span className="pagination-badge">Page {currentPage} of {totalPages}</span>
                <span style={{ color: "var(--amber-text)", fontSize: "0.82rem" }}>
                  (Last Page: {totalPages})
                </span>
              </div>

              <div className="pagination-controls">
                {/* First Page Button */}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(1)}
                  title="Jump to First Page (Page 1)"
                >
                  ⏮ First
                </button>

                {/* Previous Page Button */}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  title="Previous 10 Expenses"
                >
                  ◀ Prev
                </button>

                {/* Page Number Pills */}
                <div className="pagination-numbers">
                  {paginationRange.map((pageItem, index) => {
                    if (pageItem === "...") {
                      return <span key={`ellipsis-${index}`} className="pagination-ellipsis">…</span>;
                    }
                    return (
                      <button
                        key={pageItem}
                        type="button"
                        className={`pagination-btn ${pageItem === currentPage ? "active" : ""}`}
                        onClick={() => setCurrentPage(pageItem)}
                        title={`Go to Page ${pageItem}`}
                      >
                        {pageItem}
                      </button>
                    );
                  })}
                </div>

                {/* Next Page Button */}
                <button
                  type="button"
                  className="pagination-btn"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  title="Next 10 Expenses"
                >
                  Next ▶
                </button>

                {/* Last Page Button */}
                <button
                  type="button"
                  className="pagination-btn last-page-highlight"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  title={`Jump to Last Page (Page ${totalPages})`}
                >
                  ⏭ Last (Page {totalPages})
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// Render React App to DOM
const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);
root.render(<App />);
