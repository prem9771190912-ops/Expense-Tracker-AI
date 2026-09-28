const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");
const authToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");

if (!loggedInUser) {
  window.location.href = "login.html";
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("expenseTrackerToken");
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("expenseTrackerUser");
    window.location.href = "login.html";
  });
}

function formatCurrency(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

const CATEGORY_COLORS = {
  Food: "#f59e0b",
  Travel: "#38bdf8",
  Shopping: "#c084fc",
  Bills: "#2dd4bf",
  Entertainment: "#f472b6",
  Health: "#34d399",
  Education: "#818cf8",
  Salary: "#4ade80",
  Other: "#94a3b8"
};

async function loadReport() {
  const loadingIndicator = document.getElementById("loadingIndicator");
  const reportContent = document.getElementById("reportContent");

  try {
    const res = await fetch("/api/expenses", {
      headers: { "Authorization": `Bearer ${authToken}` }
    });

    if (res.status === 401) {
      window.location.href = "login.html";
      return;
    }

    const expenses = await res.json();
    const items = Array.isArray(expenses) ? expenses : [];

    if (loadingIndicator) loadingIndicator.style.display = "none";
    if (reportContent) reportContent.style.display = "block";

    renderMetrics(items);
    renderCategoryBreakdown(items);
  } catch (error) {
    if (loadingIndicator) {
      loadingIndicator.innerHTML = `<div class="empty-state">Unable to load report: ${error.message}</div>`;
    }
  }
}

function renderMetrics(expenses) {
  const totalSpend = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalCount = expenses.length;
  const avgExpense = totalCount > 0 ? totalSpend / totalCount : 0;

  // Find top category
  const categoryTotals = {};
  expenses.forEach(item => {
    const cat = item.category || "Other";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(item.amount) || 0);
  });

  let topCategory = "None";
  let maxSpend = 0;
  for (const [cat, amt] of Object.entries(categoryTotals)) {
    if (amt > maxSpend) {
      maxSpend = amt;
      topCategory = cat;
    }
  }

  const elTotal = document.getElementById("repTotal");
  const elCount = document.getElementById("repCount");
  const elAvg = document.getElementById("repAvg");
  const elTop = document.getElementById("repTop");

  if (elTotal) elTotal.textContent = formatCurrency(totalSpend);
  if (elCount) elCount.textContent = totalCount.toString();
  if (elAvg) elAvg.textContent = formatCurrency(avgExpense);
  if (elTop) elTop.textContent = topCategory + (maxSpend > 0 ? ` (${formatCurrency(maxSpend)})` : "");
}

function renderCategoryBreakdown(expenses) {
  const container = document.getElementById("categoryList");
  if (!container) return;

  if (expenses.length === 0) {
    container.innerHTML = `<div class="empty-state">☕ No expenses recorded yet. Once you log transactions, breakdown charts will show up here!</div>`;
    return;
  }

  const categoryTotals = {};
  let totalSpend = 0;

  expenses.forEach(item => {
    const cat = item.category || "Other";
    const amt = Number(item.amount) || 0;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    totalSpend += amt;
  });

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  container.innerHTML = sortedCategories.map(([category, amount]) => {
    const pct = totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0;
    const color = CATEGORY_COLORS[category] || "#10b981";

    return `
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 18px 22px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
            <strong style="font-size: 1rem; color: var(--text-primary);">${category}</strong>
          </div>
          <div>
            <strong style="font-size: 1.05rem; color: var(--emerald-text); font-variant-numeric: tabular-nums;">${formatCurrency(amount)}</strong>
            <span style="font-size: 0.82rem; color: var(--text-secondary); margin-left: 8px;">(${pct}%)</span>
          </div>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.06); border-radius: 999px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 999px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);"></div>
        </div>
      </div>
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", loadReport);
