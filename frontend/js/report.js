const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");
const authToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");

if (!loggedInUser || !authToken) {
  window.location.href = "login.html";
}

const esc = x => { const d = document.createElement("div"); d.textContent = x; return d.innerHTML; };

function parseJwt(token) {
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function getIsPremium() {
  return localStorage.getItem("ispremiumuser") === "true";
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("expenseTrackerToken");
    localStorage.removeItem("loggedInUser");
    localStorage.removeItem("expenseTrackerUser");
    localStorage.removeItem("ispremiumuser");
    window.location.href = "login.html";
  });
}

function formatCurrency(amount) {
  return "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Global Report State
let allExpenses = [];
let currentFilter = "daily"; // 'daily', 'weekly', 'monthly'
let selectedDateStr = new Date().toISOString().slice(0, 10);
let displayedTransactions = [];
let currentYearlySummary = [];

const premiumHeadline = document.getElementById("premiumHeadline");
const downloadReportBtn = document.getElementById("downloadReportBtn");
const btnDaily = document.getElementById("btnDaily");
const btnWeekly = document.getElementById("btnWeekly");
const btnMonthly = document.getElementById("btnMonthly");
const reportDateInput = document.getElementById("reportDate");
const loadingIndicator = document.getElementById("loadingIndicator");
const reportContent = document.getElementById("reportContent");

// Summary Cards Elements
const summaryIncome = document.getElementById("summaryIncome");
const summaryExpense = document.getElementById("summaryExpense");
const summarySavings = document.getElementById("summarySavings");

// Table Elements
const tableFilterEyebrow = document.getElementById("tableFilterEyebrow");
const tableRecordCount = document.getElementById("tableRecordCount");
const expenseIncomeTableBody = document.getElementById("expenseIncomeTableBody");
const footTotalIncome = document.getElementById("footTotalIncome");
const footTotalExpense = document.getElementById("footTotalExpense");

// Yearly Table Elements
const yearlyHeading = document.getElementById("yearlyHeading");
const yearlyTableBody = document.getElementById("yearlyTableBody");
const yearlyGrandIncome = document.getElementById("yearlyGrandIncome");
const yearlyGrandExpense = document.getElementById("yearlyGrandExpense");
const yearlyGrandSavings = document.getElementById("yearlyGrandSavings");

// Notes Elements
const notesInput = document.getElementById("notesInput");
const saveNotesBtn = document.getElementById("saveNotesBtn");
const notesStatus = document.getElementById("notesStatus");

function updatePremiumUI() {
  const isPremium = getIsPremium();
  if (isPremium) {
    if (premiumHeadline) {
      premiumHeadline.style.display = "flex";
      premiumHeadline.style.background = "linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.28) 50%, rgba(16, 185, 129, 0.2) 100%)";
      premiumHeadline.style.borderColor = "rgba(245, 158, 11, 0.5)";
      premiumHeadline.style.color = "#fef08a";
      premiumHeadline.textContent = "🎉 You are a Premium User Now (Rank 1 Leader)";
    }
    if (downloadReportBtn) {
      downloadReportBtn.disabled = false;
      downloadReportBtn.style.cursor = "pointer";
      downloadReportBtn.style.opacity = "1";
      downloadReportBtn.style.background = "linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.35) 100%)";
      downloadReportBtn.style.borderColor = "rgba(16, 185, 129, 0.4)";
      downloadReportBtn.style.color = "var(--emerald-text)";
      downloadReportBtn.innerHTML = "📥 Download Report (JSON)";
      downloadReportBtn.title = "Download active report as JSON";
    }
  } else {
    if (premiumHeadline) {
      premiumHeadline.style.display = "none";
    }
    if (downloadReportBtn) {
      downloadReportBtn.disabled = false; // kept clickable to show prompt alert
      downloadReportBtn.style.cursor = "not-allowed";
      downloadReportBtn.style.opacity = "0.65";
      downloadReportBtn.style.background = "rgba(239, 68, 68, 0.12)";
      downloadReportBtn.style.borderColor = "rgba(239, 68, 68, 0.35)";
      downloadReportBtn.style.color = "#fca5a5";
      downloadReportBtn.innerHTML = "🔒 Download Report (Premium Only)";
      downloadReportBtn.title = "Non-premium users cannot download reports. Increase expenses to become Rank 1!";
    }
  }
}

// Check if expense date matches filter
function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function isSameWeek(date, targetDate) {
  const d = new Date(date);
  const target = new Date(targetDate);
  
  // Calculate start of week (Sunday or Monday)
  const day = target.getDay();
  const diffToStart = target.getDate() - day;
  const startOfWeek = new Date(target);
  startOfWeek.setDate(diffToStart);
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return d >= startOfWeek && d <= endOfWeek;
}

function isSameMonth(date, targetDate) {
  return date.getFullYear() === targetDate.getFullYear() &&
         date.getMonth() === targetDate.getMonth();
}

function isIncome(expense) {
  const cat = String(expense.category || "").trim().toLowerCase();
  return cat === "salary" || cat === "income";
}

function calculateReport() {
  const targetDate = new Date(selectedDateStr + "T00:00:00");
  const targetYear = targetDate.getFullYear();

  // 1. Filter Transactions based on current tab
  displayedTransactions = allExpenses.filter(item => {
    const itemDate = new Date(item.createdAt || item.date || Date.now());
    if (currentFilter === "daily") {
      return isSameDay(itemDate, targetDate);
    } else if (currentFilter === "weekly") {
      return isSameWeek(itemDate, targetDate);
    } else if (currentFilter === "monthly") {
      return isSameMonth(itemDate, targetDate);
    }
    return true;
  });

  // 2. Calculate Period Metrics
  let periodIncome = 0;
  let periodExpense = 0;

  displayedTransactions.forEach(item => {
    const amt = Number(item.amount) || 0;
    if (isIncome(item)) {
      periodIncome += amt;
    } else {
      periodExpense += amt;
    }
  });

  const periodSavings = periodIncome - periodExpense;

  if (summaryIncome) summaryIncome.textContent = formatCurrency(periodIncome);
  if (summaryExpense) summaryExpense.textContent = formatCurrency(periodExpense);
  if (summarySavings) {
    summarySavings.textContent = formatCurrency(periodSavings);
    summarySavings.style.color = periodSavings >= 0 ? "var(--sky)" : "var(--rose-text)";
  }

  // 3. Render Expense & Income Table
  if (tableFilterEyebrow) {
    tableFilterEyebrow.textContent = currentFilter === "daily" 
      ? `Daily Activity (${targetDate.toLocaleDateString()})` 
      : (currentFilter === "weekly" ? `Weekly Activity (${targetDate.toLocaleDateString()})` : `Monthly Activity (${targetDate.toLocaleString('default', { month: 'long', year: 'numeric' })})`);
  }
  if (tableRecordCount) tableRecordCount.textContent = `${displayedTransactions.length} Transactions`;

  if (expenseIncomeTableBody) {
    if (displayedTransactions.length === 0) {
      expenseIncomeTableBody.innerHTML = '<tr><td colspan="5"><div class="empty-state">No transactions recorded for this period.</div></td></tr>';
    } else {
      expenseIncomeTableBody.innerHTML = displayedTransactions.map(item => {
        const itemDate = new Date(item.createdAt || item.date || Date.now()).toLocaleDateString();
        const amt = Number(item.amount) || 0;
        const incomeCell = isIncome(item) ? `<span style="color: var(--emerald-text); font-weight: 700;">${formatCurrency(amt)}</span>` : "—";
        const expenseCell = !isIncome(item) ? `<span style="color: var(--rose-text); font-weight: 700;">${formatCurrency(amt)}</span>` : "—";

        return `
          <tr>
            <td style="color: var(--text-secondary); font-size: 0.88rem;">${itemDate}</td>
            <td style="font-weight: 600;">${esc(item.description)}</td>
            <td><span class="cat">${esc(item.category || "General")}</span></td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${incomeCell}</td>
            <td style="text-align: right; font-variant-numeric: tabular-nums;">${expenseCell}</td>
          </tr>
        `;
      }).join("");
    }
  }

  if (footTotalIncome) footTotalIncome.textContent = formatCurrency(periodIncome);
  if (footTotalExpense) footTotalExpense.textContent = formatCurrency(periodExpense);

  // 4. Calculate & Render Yearly Summary (12 Months)
  renderYearlySummary(targetYear);
}

function renderYearlySummary(year) {
  if (yearlyHeading) yearlyHeading.textContent = `Yearly Summary (${year})`;

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const monthsData = monthNames.map((name, index) => ({
    monthIndex: index,
    monthName: name,
    income: 0,
    expense: 0,
    savings: 0
  }));

  allExpenses.forEach(item => {
    const d = new Date(item.createdAt || item.date || Date.now());
    if (d.getFullYear() === year) {
      const m = d.getMonth();
      const amt = Number(item.amount) || 0;
      if (isIncome(item)) {
        monthsData[m].income += amt;
      } else {
        monthsData[m].expense += amt;
      }
    }
  });

  let grandIncome = 0;
  let grandExpense = 0;

  monthsData.forEach(m => {
    m.savings = m.income - m.expense;
    grandIncome += m.income;
    grandExpense += m.expense;
  });

  const grandSavings = grandIncome - grandExpense;
  currentYearlySummary = monthsData;

  if (yearlyTableBody) {
    yearlyTableBody.innerHTML = monthsData.map(m => `
      <tr>
        <td style="font-weight: 600;">${m.monthName}</td>
        <td style="text-align: right; color: var(--emerald-text); font-weight: 600; font-variant-numeric: tabular-nums;">
          ${m.income > 0 ? formatCurrency(m.income) : "₹0.00"}
        </td>
        <td style="text-align: right; color: var(--rose-text); font-weight: 600; font-variant-numeric: tabular-nums;">
          ${m.expense > 0 ? formatCurrency(m.expense) : "₹0.00"}
        </td>
        <td style="text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; color: ${m.savings >= 0 ? 'var(--sky)' : 'var(--rose-text)'};">
          ${formatCurrency(m.savings)}
        </td>
      </tr>
    `).join("");
  }

  if (yearlyGrandIncome) yearlyGrandIncome.textContent = formatCurrency(grandIncome);
  if (yearlyGrandExpense) yearlyGrandExpense.textContent = formatCurrency(grandExpense);
  if (yearlyGrandSavings) {
    yearlyGrandSavings.textContent = formatCurrency(grandSavings);
    yearlyGrandSavings.style.color = grandSavings >= 0 ? "var(--sky)" : "var(--rose-text)";
  }
}

// Tab Button Listeners
if (btnDaily) {
  btnDaily.addEventListener("click", () => {
    currentFilter = "daily";
    btnDaily.classList.add("active");
    if (btnWeekly) btnWeekly.classList.remove("active");
    if (btnMonthly) btnMonthly.classList.remove("active");
    calculateReport();
  });
}

if (btnWeekly) {
  btnWeekly.addEventListener("click", () => {
    currentFilter = "weekly";
    btnWeekly.classList.add("active");
    if (btnDaily) btnDaily.classList.remove("active");
    if (btnMonthly) btnMonthly.classList.remove("active");
    calculateReport();
  });
}

if (btnMonthly) {
  btnMonthly.addEventListener("click", () => {
    currentFilter = "monthly";
    btnMonthly.classList.add("active");
    if (btnDaily) btnDaily.classList.remove("active");
    if (btnWeekly) btnWeekly.classList.remove("active");
    calculateReport();
  });
}

if (reportDateInput) {
  reportDateInput.value = selectedDateStr;
  reportDateInput.addEventListener("change", (e) => {
    if (e.target.value) {
      selectedDateStr = e.target.value;
      calculateReport();
    }
  });
}

let cachedTopSpender = null;

// Professional Toast Notification
function showToast(title, message, isError = false) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "custom-toast";
  if (isError) {
    toast.style.borderColor = "rgba(239, 68, 68, 0.4)";
    toast.style.borderLeftColor = "#ef4444";
  }
  toast.innerHTML = `
    <span style="font-size: 1.3rem;">${isError ? '⚠️' : '✅'}</span>
    <div>
      <b style="display: block; font-size: 0.92rem; color: #ffffff;">${esc(title)}</b>
      <span style="font-size: 0.82rem; color: #94a3b8;">${esc(message)}</span>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

// Modal Elements
const premiumLockModal = document.getElementById("premiumLockModal");
const closePremiumModalBtn = document.getElementById("closePremiumModalBtn");
const modalUserRank = document.getElementById("modalUserRank");
const modalUserExpense = document.getElementById("modalUserExpense");
const modalTargetSpender = document.getElementById("modalTargetSpender");
const modalTargetExpense = document.getElementById("modalTargetExpense");

function openPremiumLockModal(targetSpenderName, targetAmount, userAmount) {
  if (modalTargetSpender && targetSpenderName) {
    modalTargetSpender.textContent = targetSpenderName;
  }
  if (modalTargetExpense && targetAmount !== undefined) {
    modalTargetExpense.textContent = "Expense: ₹" + Number(targetAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (modalUserExpense) {
    const amount = userAmount !== undefined ? userAmount : (loggedInUser?.totalExpense || 0);
    modalUserExpense.textContent = "Expense: ₹" + Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (premiumLockModal) {
    premiumLockModal.style.display = "flex";
  }
}

function closePremiumLockModal() {
  if (premiumLockModal) {
    premiumLockModal.style.display = "none";
  }
}

if (closePremiumModalBtn) {
  closePremiumModalBtn.addEventListener("click", closePremiumLockModal);
}

if (premiumLockModal) {
  premiumLockModal.addEventListener("click", (e) => {
    if (e.target === premiumLockModal) {
      closePremiumLockModal();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && premiumLockModal && premiumLockModal.style.display === "flex") {
    closePremiumLockModal();
  }
});

// FEATURE 4: Download Report Button (JSON download for Premium users)
if (downloadReportBtn) {
  downloadReportBtn.addEventListener("click", () => {
    const isPremium = getIsPremium();
    if (!isPremium) {
      const topName = cachedTopSpender?.name || "prem9771190912";
      const topAmt = cachedTopSpender?.totalExpense || 30300;
      const userAmt = loggedInUser?.totalExpense || 0;
      openPremiumLockModal(topName, topAmt, userAmt);
      return;
    }

    const reportExport = {
      title: "SpendWise AI Financial Report",
      user: {
        name: loggedInUser?.name || "User",
        email: loggedInUser?.email || ""
      },
      generatedAt: new Date().toISOString(),
      reportType: currentFilter,
      selectedDate: selectedDateStr,
      metrics: {
        totalIncome: summaryIncome?.textContent || "₹0.00",
        totalExpense: summaryExpense?.textContent || "₹0.00",
        savings: summarySavings?.textContent || "₹0.00"
      },
      displayedTransactionsCount: displayedTransactions.length,
      transactions: displayedTransactions.map(item => ({
        id: item.id,
        date: new Date(item.createdAt || item.date || Date.now()).toISOString().slice(0, 10),
        description: item.description,
        category: item.category || "General",
        type: isIncome(item) ? "Income" : "Expense",
        amount: Number(item.amount) || 0
      })),
      yearlySummary: currentYearlySummary
    };

    const jsonString = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportExport, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonString);
    downloadAnchor.setAttribute("download", `expense_report_${currentFilter}_${selectedDateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    showToast("Report Downloaded", "Your financial JSON export is ready.");
  });
}

// Notes Section Storage
const notesStorageKey = `expense_tracker_notes_${loggedInUser?.email || "default"}`;
if (notesInput) {
  notesInput.value = localStorage.getItem(notesStorageKey) || "";
}

if (saveNotesBtn && notesInput) {
  saveNotesBtn.addEventListener("click", () => {
    localStorage.setItem(notesStorageKey, notesInput.value);
    if (notesStatus) {
      notesStatus.textContent = "✅ Notes saved successfully!";
      setTimeout(() => { notesStatus.textContent = ""; }, 3000);
    }
  });
}

async function loadData() {
  updatePremiumUI();

  // Check if current user is top spender on leaderboard
  try {
    const leaderRes = await fetch("/api/leaderboard?public=true", {
      headers: { "Authorization": `Bearer ${authToken}` }
    });
    if (leaderRes.ok) {
      const leaderData = await leaderRes.json();
      const list = Array.isArray(leaderData) ? leaderData : (leaderData.leaderboard || []);
      if (list.length > 0 && Number(list[0].totalExpense || 0) > 0) {
        const topSpender = list[0];
        cachedTopSpender = topSpender;
        const currentName = loggedInUser?.name?.trim().toLowerCase();
        const currentEmail = loggedInUser?.email?.trim().toLowerCase();
        const currentId = String(loggedInUser?.id || loggedInUser?._id || "");
        const isCurrentTopSpender = (
          (currentEmail && String(topSpender.email || "").trim().toLowerCase() === currentEmail) ||
          (currentId && String(topSpender.id) === currentId) ||
          (currentName && String(topSpender.name || "").trim().toLowerCase() === currentName)
        );

        if (isCurrentTopSpender) {
          localStorage.setItem("ispremiumuser", "true");
        } else {
          localStorage.setItem("ispremiumuser", "false");
        }
        updatePremiumUI();
      } else {
        localStorage.setItem("ispremiumuser", "false");
        updatePremiumUI();
      }
    }
  } catch (_) {}

  try {
    const res = await fetch("/api/expenses", {
      headers: { "Authorization": `Bearer ${authToken}` }
    });

    if (res.status === 401) {
      localStorage.removeItem("authToken");
      window.location.href = "login.html";
      return;
    }

    const data = await res.json();
    allExpenses = Array.isArray(data) ? data : (data.expenses || []);

    if (loadingIndicator) loadingIndicator.style.display = "none";
    if (reportContent) reportContent.style.display = "block";

    calculateReport();
  } catch (error) {
    if (loadingIndicator) {
      loadingIndicator.innerHTML = `<div class="empty-state" style="color: var(--rose-text);">Unable to load report data: ${esc(error.message)}</div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", loadData);
