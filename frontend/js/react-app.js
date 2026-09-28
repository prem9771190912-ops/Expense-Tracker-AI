/**
 * SpendWise AI - Pure React JS Implementation (No build tools or JSX transpilation needed)
 * Runs directly in modern browsers with React 18 & ReactDOM 18 UMD builds.
 */

(function () {
  const e = React.createElement;
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

    // Form states
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

    useEffect(() => {
      if (!currentUser || !authToken) {
        window.location.href = "login.html";
      }
    }, [currentUser, authToken]);

    const authHeaders = useMemo(() => {
      const headers = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = "Bearer " + authToken;
      return headers;
    }, [authToken]);

    const handleLogout = useCallback(() => {
      localStorage.removeItem("authToken");
      localStorage.removeItem("expenseTrackerToken");
      localStorage.removeItem("loggedInUser");
      localStorage.removeItem("expenseTrackerUser");
      window.location.href = "login.html";
    }, []);

    const fetchExpenses = useCallback(async (targetPage = currentPage) => {
      if (!currentUser?.email) return;
      setIsLoading(true);
      try {
        const response = await fetch("/api/expenses?page=" + encodeURIComponent(targetPage) + "&limit=" + ITEMS_PER_PAGE, {
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
        setNotification("Error loading expenses: " + err.message);
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
        } finally {
          setAiThinking(false);
        }
      }, 400);

      return () => clearTimeout(timer);
    }, [description, authHeaders]);

    const handleAddExpense = async (event) => {
      event.preventDefault();
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
        setNotification('Expense "' + textDesc + '" added successfully (' + body.category + ')!');

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

    const handleDeleteExpense = async (id) => {
      if (!window.confirm("Are you sure you want to delete this expense?")) return;

      try {
        const res = await fetch("/api/expenses/" + encodeURIComponent(id), {
          method: "DELETE",
          headers: authHeaders
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to delete expense.");

        setNotification("Expense deleted successfully.");

        if (expenses.length === 1 && currentPage > 1) {
          setCurrentPage((prev) => prev - 1);
        } else {
          await fetchExpenses(currentPage);
        }
      } catch (err) {
        setNotification("Delete failed: " + err.message);
      }
    };

    const handleGenerateInsight = async () => {
      setInsightLoading(true);
      setAiInsight("");
      try {
        const queryEmail = currentUser?.email ? "?email=" + encodeURIComponent(currentUser.email) : "";
        const res = await fetch("/api/ai/insight" + queryEmail, { headers: authHeaders });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Could not analyze spending.");
        setAiInsight(data.insight || data.message || "Spending looks healthy.");
      } catch (err) {
        setAiInsight("Insight error: " + err.message);
      } finally {
        setInsightLoading(false);
      }
    };

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

    return e("div", null, [
      // Top Navigation
      e("nav", { key: "nav", className: "app-nav" },
        e("div", { className: "nav-container" }, [
          e("a", { key: "brand", href: "index.html", className: "nav-brand" }, [
            e("span", { key: "icon", className: "brand-icon" }, "⚛️"),
            e("span", { key: "text" }, "SpendWise AI React")
          ]),
          e("div", { key: "menu", className: "nav-menu" }, [
            e("a", { key: "hub", href: "index.html", className: "nav-item" }, "⚡ Smart Hub"),
            e("a", { key: "react", href: "react.html", className: "nav-item active" }, "⚛️ React App"),
            e("a", { key: "activity", href: "expenses.html", className: "nav-item" }, "📋 Activity Log"),
            e("a", { key: "rep", href: "report.html", className: "nav-item" }, "📊 Reports")
          ]),
          e("div", { key: "actions", className: "nav-actions" }, [
            currentUser && e("span", {
              key: "user-name",
              style: { fontSize: "0.85rem", color: "var(--text-secondary)", marginRight: "8px" }
            }, "👋 " + (currentUser.name || currentUser.email)),
            e("button", {
              key: "logout-btn",
              onClick: handleLogout,
              className: "logout-btn",
              type: "button"
            }, "Logout")
          ])
        ])
      ),

      // Main Content
      e("main", { key: "main", className: "dashboard" }, [
        // Header
        e("header", { key: "header", className: "page-header" }, [
          e("div", { key: "titles" }, [
            e("span", { key: "eyebrow", className: "eyebrow" }, "React JS Edition"),
            e("h1", { key: "h1" }, "Real-Time Expense Tracker"),
            e("p", { key: "sub", className: "subtitle" },
              "Built natively in React JS with live server pagination (showing 10 expenses per page)."
            )
          ]),
          e("div", { key: "header-actions", className: "header-actions" }, [
            e("button", {
              key: "insight-btn",
              id: "insightBtn",
              onClick: handleGenerateInsight,
              disabled: insightLoading,
              type: "button"
            }, insightLoading ? "Analyzing..." : "✨ AI Spending Insight")
          ])
        ]),

        // AI Insight Alert
        aiInsight && e("div", { key: "ai-box", className: "insight" }, [
          e("b", { key: "ai-label" }, "AI Financial Advisor: "),
          aiInsight
        ]),

        // Notification message
        notification && e("div", { key: "notif", id: "msg", style: { marginBottom: "16px" } }, notification),

        // Key Stats Cards Row
        e("div", { key: "stats", className: "stats-row" }, [
          e("div", { key: "stat-total", className: "stat-card" }, [
            e("span", { key: "l1", className: "stat-label" }, "Total Tracked Outflow"),
            e("span", { key: "v1", className: "stat-value", style: { color: "var(--emerald-text)" } }, formatCurrency(totalAmount))
          ]),
          e("div", { key: "stat-count", className: "stat-card" }, [
            e("span", { key: "l2", className: "stat-label" }, "Total Expenses Recorded"),
            e("span", { key: "v2", className: "stat-value", style: { color: "var(--sky)" } }, String(totalExpenses))
          ]),
          e("div", { key: "stat-page", className: "stat-card" }, [
            e("span", { key: "l3", className: "stat-label" }, "Current Page"),
            e("span", { key: "v3", className: "stat-value", style: { color: "var(--amber-text)" } }, "Page " + currentPage + " of " + totalPages)
          ]),
          e("div", { key: "stat-last", className: "stat-card" }, [
            e("span", { key: "l4", className: "stat-label" }, "Total Pages (Last Page)"),
            e("span", { key: "v4", className: "stat-value", style: { color: "var(--rose-text)" } }, "Page " + totalPages)
          ])
        ]),

        // Grid: Add Expense + Info Card
        e("section", { key: "grid", className: "dashboard-grid" }, [
          // Form Card
          e("div", { key: "panel-form", className: "panel" }, [
            e("div", { key: "form-heading", className: "panel-heading" }, [
              e("div", null, [
                e("span", { className: "eyebrow" }, "New Transaction"),
                e("h2", null, "Record an Expense")
              ]),
              e("span", { className: "ai-mark" }, "React Controlled")
            ]),
            e("form", { key: "form-el", onSubmit: handleAddExpense }, [
              e("div", { key: "fg-amount", className: "form-group" }, [
                e("label", { htmlFor: "reactAmount" }, "Amount (₹)"),
                e("input", {
                  id: "reactAmount",
                  type: "number",
                  min: "0.01",
                  step: "0.01",
                  placeholder: "e.g. 450.00",
                  value: amount,
                  onChange: (ev) => setAmount(ev.target.value),
                  required: true
                })
              ]),
              e("div", { key: "fg-desc", className: "form-group" }, [
                e("label", { htmlFor: "reactDescription" }, "Description / Merchant"),
                e("input", {
                  id: "reactDescription",
                  type: "text",
                  placeholder: "e.g. Organic Groceries, Metro pass, Netflix",
                  value: description,
                  onChange: (ev) => setDescription(ev.target.value),
                  required: true
                })
              ]),
              e("div", { key: "fg-cat", className: "form-group" }, [
                e("label", { htmlFor: "reactCategory" }, "Category (Optional - AI auto-classifies)"),
                e("select", {
                  id: "reactCategory",
                  value: category,
                  onChange: (ev) => setCategory(ev.target.value)
                }, [
                  e("option", { key: "default", value: "" },
                    aiThinking ? "AI is analyzing description..." : (predictedCategory ? "AI suggests: " + predictedCategory : "Auto Detect / Choose Category")
                  ),
                  ...CATEGORIES.map((cat) => e("option", { key: cat, value: cat }, cat))
                ])
              ]),
              predictedCategory && !category && e("div", { key: "ai-sug", className: "ai-suggestion" },
                "✨ AI detected category: " + predictedCategory + " (will be applied automatically)"
              ),
              e("button", { key: "sub-btn", type: "submit", disabled: isSubmitting },
                isSubmitting ? "+ Adding..." : "+ Add Expense"
              )
            ])
          ]),

          // Info Panel
          e("div", { key: "panel-summary", className: "panel", style: { display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "20px" } }, [
            e("div", { key: "sum-top" }, [
              e("span", { className: "eyebrow" }, "Ledger Status"),
              e("h2", null, "Pagination Architecture"),
              e("p", { className: "subtitle", style: { marginBottom: 0 } },
                "Transactions are divided strictly into sets of 10. Navigating pages updates records in real time."
              )
            ]),
            e("div", { key: "sum-card", className: "total-expense-card", style: { textAlign: "left", padding: "24px" } }, [
              e("span", { className: "eyebrow", style: { color: "var(--emerald-text)", marginBottom: "6px" } }, "Cumulative Expense Total"),
              e("span", { className: "total-amount", style: { fontSize: "2.4rem" } }, formatCurrency(totalAmount))
            ]),
            e("div", { key: "sum-tip", style: { background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "14px 18px", display: "flex", alignItems: "center", gap: "12px" } }, [
              e("span", { style: { fontSize: "1.3rem" } }, "💡"),
              e("p", { style: { fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 } },
                "Only 10 expenses are rendered per page. You can jump directly to the last page using the ⏭ Last button below."
              )
            ])
          ])
        ]),

        // Expenses Table Section
        e("section", { key: "table-sec", className: "panel expense-panel" }, [
          e("div", { key: "tbl-head", className: "panel-heading" }, [
            e("div", null, [
              e("span", { className: "eyebrow" }, "Activity Records"),
              e("h2", null, "Recent Expenses (10 per page)")
            ]),
            totalExpenses > 0 && e("span", { key: "badge", className: "pagination-badge" },
              "Showing " + startIndex + "–" + endIndex + " of " + totalExpenses
            )
          ]),

          e("div", { key: "tbl-wrap", className: "table-wrap" },
            e("table", null, [
              e("thead", { key: "th" },
                e("tr", null, [
                  e("th", { key: "c1" }, "Amount"),
                  e("th", { key: "c2" }, "Description"),
                  e("th", { key: "c3" }, "Category"),
                  e("th", { key: "c4" }, "Classification Source"),
                  e("th", { key: "c5", style: { textAlign: "right" } }, "Actions")
                ])
              ),
              e("tbody", { key: "tb" },
                isLoading
                  ? e("tr", null, e("td", { colSpan: 5 }, e("div", { className: "empty-state" }, "⏳ Loading page " + currentPage + "...")))
                  : expenses.length === 0
                    ? e("tr", null, e("td", { colSpan: 5 }, e("div", { className: "empty-state" }, "☕ No expenses recorded yet. Start by logging an expense above!")))
                    : expenses.map((expense) => {
                        const isAi = expense.categorySource && expense.categorySource !== "saved" && expense.categorySource !== "fallback";
                        return e("tr", { key: expense.id }, [
                          e("td", { key: "a", style: { fontWeight: 700, color: "var(--emerald-text)", fontVariantNumeric: "tabular-nums" } }, formatCurrency(expense.amount)),
                          e("td", { key: "d", style: { fontWeight: 500 } }, expense.description),
                          e("td", { key: "c" }, e("span", { className: "cat" }, expense.category || "General")),
                          e("td", { key: "s" }, isAi ? e("span", { className: "ai" }, "🤖 " + expense.categorySource) : e("span", { style: { color: "var(--text-muted)", fontSize: "0.8rem" } }, "Manual / Saved")),
                          e("td", { key: "act", style: { textAlign: "right" } },
                            e("button", {
                              className: "delete-button",
                              type: "button",
                              onClick: () => handleDeleteExpense(expense.id)
                            }, "Delete")
                          )
                        ]);
                      })
              )
            ])
          ),

          // Pagination Controls
          totalExpenses > 0 && e("div", { key: "pag-wrap", className: "pagination-wrap" }, [
            e("div", { key: "pag-info", className: "pagination-info" }, [
              "Showing ",
              e("b", { key: "s" }, String(startIndex)),
              "–",
              e("b", { key: "e" }, String(endIndex)),
              " of ",
              e("b", { key: "t" }, String(totalExpenses)),
              " expenses ",
              e("span", { key: "b", className: "pagination-badge" }, "Page " + currentPage + " of " + totalPages),
              e("span", { key: "lp", style: { color: "var(--amber-text)", fontSize: "0.82rem" } }, "(Last Page: " + totalPages + ")")
            ]),

            e("div", { key: "pag-ctrls", className: "pagination-controls" }, [
              // First Page Button
              e("button", {
                key: "first",
                type: "button",
                className: "pagination-btn",
                disabled: currentPage <= 1,
                onClick: () => setCurrentPage(1),
                title: "Jump to First Page (Page 1)"
              }, "⏮ First"),

              // Previous Page Button
              e("button", {
                key: "prev",
                type: "button",
                className: "pagination-btn",
                disabled: currentPage <= 1,
                onClick: () => setCurrentPage((p) => Math.max(1, p - 1)),
                title: "Previous 10 Expenses"
              }, "◀ Prev"),

              // Page Numbers
              e("div", { key: "nums", className: "pagination-numbers" },
                paginationRange.map((pageItem, idx) => {
                  if (pageItem === "...") {
                    return e("span", { key: "ell-" + idx, className: "pagination-ellipsis" }, "…");
                  }
                  return e("button", {
                    key: "p-" + pageItem,
                    type: "button",
                    className: "pagination-btn " + (pageItem === currentPage ? "active" : ""),
                    onClick: () => setCurrentPage(pageItem),
                    title: "Go to Page " + pageItem
                  }, String(pageItem));
                })
              ),

              // Next Page Button
              e("button", {
                key: "next",
                type: "button",
                className: "pagination-btn",
                disabled: currentPage >= totalPages,
                onClick: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
                title: "Next 10 Expenses"
              }, "Next ▶"),

              // Last Page Button
              e("button", {
                key: "last",
                type: "button",
                className: "pagination-btn last-page-highlight",
                disabled: currentPage >= totalPages,
                onClick: () => setCurrentPage(totalPages),
                title: "Jump to Last Page (Page " + totalPages + ")"
              }, "⏭ Last (Page " + totalPages + ")")
            ])
          ])
        ])
      ])
    ]);
  }

  // Mount React App
  const container = document.getElementById("root");
  if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(App));
  }
})();
