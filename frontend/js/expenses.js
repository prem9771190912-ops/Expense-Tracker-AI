const form = document.getElementById("expenseForm");
const tableBody = document.getElementById("expenseTableBody");
const descriptionInput = document.getElementById("description");
const aiSuggestion = document.getElementById("aiSuggestion");
const pageSubtitle = document.getElementById("pageSubtitle");

// Premium & Leaderboard Elements
const premiumHeadline = document.getElementById("premiumHeadline");
const leaderboardBtn = document.getElementById("leaderboardBtn");
const leaderboardSection = document.getElementById("leaderboardSection");
const leaderboardTableBody = document.getElementById("leaderboardTableBody");
const limitSelect = document.getElementById("limitSelect");

let loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");
let authToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");

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

// FEATURE 1: Premium User Persistence using JWT ispremiumuser field as source of truth
function syncPremiumStatus() {
  const token = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken") || authToken;
  if (!token) return false;
  const decoded = parseJwt(token);
  const isPremium = Boolean(decoded && decoded.ispremiumuser);
  localStorage.setItem("ispremiumuser", isPremium ? "true" : "false");
  if (loggedInUser) {
    loggedInUser.ispremiumuser = isPremium;
    loggedInUser.isPremium = isPremium;
    localStorage.setItem("loggedInUser", JSON.stringify(loggedInUser));
    localStorage.setItem("expenseTrackerUser", JSON.stringify(loggedInUser));
  }
  return isPremium;
}

function updatePremiumUI() {
  const isPremium = syncPremiumStatus();
  if (isPremium) {
    if (premiumHeadline) premiumHeadline.style.display = "flex";
  } else {
    if (premiumHeadline) premiumHeadline.style.display = "none";
  }
  if (leaderboardBtn) leaderboardBtn.style.display = "inline-flex";
}

function clearStoredAuth() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("expenseTrackerToken");
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("expenseTrackerUser");
  localStorage.removeItem("ispremiumuser");
}

function authHeaders() {
  const headers = {};
  const token = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken") || authToken;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, options);
  let result = {};
  try { result = await response.json(); } catch {}
  if (response.status === 401) {
    clearStoredAuth();
    window.location.href = "login.html";
    throw new Error("Your session expired. Please login again.");
  }
  if (!response.ok) throw new Error(result.message || "Request failed.");
  return result;
}


// ==========================================================================
// FEATURE 2: Premium Leaderboard
// ==========================================================================
function renderLeaderboard(users) {
  if (!leaderboardTableBody) return;
  if (!Array.isArray(users) || users.length === 0) {
    leaderboardTableBody.innerHTML = '<tr><td colspan="4"><div class="empty-state">No users on leaderboard yet.</div></td></tr>';
    return;
  }

  const topUser = users[0];
  const maxExpense = Number(topUser?.totalExpense || 0);

  const currentUserName = loggedInUser?.name?.trim().toLowerCase();
  const currentUserId = String(loggedInUser?.id || loggedInUser?._id || "");
  const currentUserEmail = loggedInUser?.email?.trim().toLowerCase();

  const topSpenderNameEl = document.getElementById("topSpenderName");
  const topSpenderAmountEl = document.getElementById("topSpenderAmount");
  if (topSpenderNameEl && topUser) {
    topSpenderNameEl.textContent = topUser.name || "User";
  }
  if (topSpenderAmountEl && topUser) {
    topSpenderAmountEl.textContent = "₹" + maxExpense.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Jiska expense sabse jyada show hoga (Rank 1) wahi premium user hoga
  const isCurrentTopSpender = topUser && (
    (currentUserEmail && String(topUser.email || "").trim().toLowerCase() === currentUserEmail) ||
    (currentUserId && String(topUser.id || topUser._id || "") === currentUserId) ||
    (currentUserName && String(topUser.name || "").trim().toLowerCase() === currentUserName)
  ) && maxExpense > 0;

  if (isCurrentTopSpender) {
    localStorage.setItem("ispremiumuser", "true");
    if (loggedInUser) {
      loggedInUser.ispremiumuser = true;
      loggedInUser.isPremium = true;
    }
    if (premiumHeadline) {
      premiumHeadline.style.display = "flex";
      premiumHeadline.textContent = "🎉 You are a Premium User Now";
    }
  } else {
    localStorage.setItem("ispremiumuser", "false");
    if (loggedInUser) {
      loggedInUser.ispremiumuser = false;
      loggedInUser.isPremium = false;
    }
    if (premiumHeadline) {
      premiumHeadline.style.display = "none";
    }
  }

  leaderboardTableBody.innerHTML = users.slice(0, 3).map((u, index) => {
    const rank = u.rank || (index + 1);
    let rankBadge = `<span style="font-weight: 700; color: var(--text-muted);">#${rank}</span>`;
    if (rank === 1) rankBadge = `<span style="font-size: 1.15rem; filter: drop-shadow(0 0 6px rgba(234, 179, 8, 0.6)); font-weight: 800;">🥇 1</span>`;
    else if (rank === 2) rankBadge = `<span style="font-size: 1.15rem; font-weight: 800;">🥈 2</span>`;
    else if (rank === 3) rankBadge = `<span style="font-size: 1.15rem; font-weight: 800;">🥉 3</span>`;

    const isHighestExpense = rank === 1 && maxExpense > 0;
    const isThisCurrentUser = (currentUserEmail && String(u.email || "").trim().toLowerCase() === currentUserEmail) ||
                              (currentUserId && String(u.id || u._id || "") === currentUserId) ||
                              (currentUserName && String(u.name || "").trim().toLowerCase() === currentUserName);

    let statusBadge = "";
    if (isHighestExpense) {
      statusBadge = `<span style="background: linear-gradient(135deg, rgba(234, 179, 8, 0.25) 0%, rgba(202, 138, 4, 0.45) 100%); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.6); padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 800; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 0 10px rgba(234, 179, 8, 0.25);">👑 Premium Member (Rank Leader)</span>`;
    } else {
      statusBadge = `<span style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.1); padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">Standard Member</span>`;
    }

    const userLabel = isThisCurrentUser
      ? `<strong style="color: var(--emerald-text); font-size: 0.95rem;">${esc(u.name || "User")}</strong> <span style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 700;">YOU</span>`
      : `<span style="color: var(--text-primary); font-size: 0.95rem; font-weight: 600;">${esc(u.name || "User")}</span>`;

    return `
      <tr style="${isHighestExpense ? 'background: rgba(234, 179, 8, 0.08); border-left: 3px solid #fde047;' : (isThisCurrentUser ? 'background: rgba(16, 185, 129, 0.06); border-left: 3px solid #10b981;' : '')}">
        <td style="font-size: 1.05rem;">${rankBadge}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${userLabel}
          </div>
        </td>
        <td style="text-align: center;">
          ${statusBadge}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${isHighestExpense ? '#fde047' : 'var(--emerald-text)'}; font-variant-numeric: tabular-nums; font-size: 1.05rem;">
          ₹${Number(u.totalExpense || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `;
  }).join("");
}

async function loadLeaderboard() {
  if (!leaderboardTableBody) return;
  try {
    const data = await apiJson("/api/leaderboard?public=true", { headers: authHeaders() });
    const users = Array.isArray(data) ? data : (data.leaderboard || []);
    renderLeaderboard(users);
  } catch (err) {
    if (leaderboardTableBody) {
      leaderboardTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="color: var(--rose-text);">${esc(err.message)}</div></td></tr>`;
    }
  }
}

const refreshLeaderboardBtn = document.getElementById("refreshLeaderboardBtn");
if (refreshLeaderboardBtn) {
  refreshLeaderboardBtn.addEventListener("click", () => {
    loadLeaderboard();
  });
}

if (leaderboardBtn && leaderboardSection) {
  leaderboardBtn.addEventListener("click", () => {
    leaderboardSection.scrollIntoView({ behavior: "smooth" });
    loadLeaderboard();
  });
}

// ==========================================================================
// FEATURE 7: Dynamic Expenses Per Page & LocalStorage Preference
// ==========================================================================
let itemsPerPage = parseInt(localStorage.getItem("expensesPerPage"), 10) || 10;
if (![5, 10, 20, 40].includes(itemsPerPage)) itemsPerPage = 10;

if (limitSelect) {
  limitSelect.value = String(itemsPerPage);
  limitSelect.addEventListener("change", (e) => {
    itemsPerPage = parseInt(e.target.value, 10) || 10;
    localStorage.setItem("expensesPerPage", String(itemsPerPage));
    if (pageSubtitle) pageSubtitle.textContent = `Showing ${itemsPerPage} expenses per page`;
    currentPage = 1;
    loadExpenses(1);
  });
}

let currentPage = 1;
let totalPages = 1;
let totalExpensesCount = 0;
let currentExpenses = [];
let allExpensesCache = [];
let predictedCategory = null;
let predictedDescription = "";
let predictedSource = "fallback";

function renderTotalAmount(sum) {
  const totalElement = document.getElementById("totalExpenseAmount");
  if (!totalElement) return;
  const num = Number(sum) || 0;
  const formatted = num % 1 === 0 
    ? num.toLocaleString("en-IN")
    : num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  totalElement.textContent = `₹${formatted}`;
}

function updateTotalExpense(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) {
    renderTotalAmount(0);
    return;
  }
  const sum = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  renderTotalAmount(sum);
}

function renderExpenses(expenses) {
  if (!Array.isArray(expenses) || expenses.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5"><div class="empty-state">☕ No expenses recorded yet. Start by logging an expense above!</div></td></tr>';
    return;
  }
  tableBody.innerHTML = expenses.map((expense) => {
    const isAi = expense.categorySource && expense.categorySource !== "saved" && expense.categorySource !== "fallback";
    return `
    <tr>
      <td style="font-weight: 700; color: var(--emerald-text); font-variant-numeric: tabular-nums;">₹${Number(expense.amount).toFixed(2)}</td>
      <td style="font-weight: 500;">${esc(expense.description)}</td>
      <td><span class="cat">${esc(expense.category || "General")}</span></td>
      <td>${isAi ? `<span class="ai">🤖 ${esc(expense.categorySource)}</span>` : '<span style="color: var(--text-muted); font-size: 0.8rem;">Manual / Saved</span>'}</td>
      <td style="text-align: right;"><button class="delete-button" data-expense-id="${expense.id}" type="button">Delete</button></td>
    </tr>
  `;
  }).join("");
}

// ==========================================================================
// FEATURE 6: Frontend Pagination (Previous  1  2  3  4  5  Next)
// ==========================================================================
function renderPagination() {
  const paginationContainer = document.getElementById("paginationContainer");
  if (!paginationContainer) return;

  if (totalExpensesCount === 0) {
    paginationContainer.style.display = "none";
    return;
  }

  paginationContainer.style.display = "flex";

  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalExpensesCount);

  const pageStartEl = document.getElementById("pageStart");
  const pageEndEl = document.getElementById("pageEnd");
  const totalItemsEl = document.getElementById("totalItems");
  const pageBadgeEl = document.getElementById("pageBadge");

  if (pageStartEl) pageStartEl.textContent = start;
  if (pageEndEl) pageEndEl.textContent = end;
  if (totalItemsEl) totalItemsEl.textContent = totalExpensesCount;
  if (pageBadgeEl) pageBadgeEl.textContent = `Page ${currentPage} of ${totalPages}`;

  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

  const numbersContainer = document.getElementById("paginationNumbers");
  if (numbersContainer) {
    numbersContainer.innerHTML = "";
    const pages = [];
    const maxVisibleButtons = 5;
    
    if (totalPages <= maxVisibleButtons + 2) {
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

    pages.forEach((p) => {
      if (p === "...") {
        const el = document.createElement("span");
        el.className = "pagination-ellipsis";
        el.textContent = "…";
        numbersContainer.appendChild(el);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `pagination-btn ${p === currentPage ? "active" : ""}`;
        btn.textContent = p;
        btn.title = `Go to Page ${p}`;
        btn.addEventListener("click", () => {
          if (p !== currentPage) loadExpenses(p);
        });
        numbersContainer.appendChild(btn);
      }
    });
  }
}

// Attach Pagination Handlers
const prevPageBtn = document.getElementById("prevPageBtn");
if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) loadExpenses(currentPage - 1);
  });
}

const nextPageBtn = document.getElementById("nextPageBtn");
if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    if (currentPage < totalPages) loadExpenses(currentPage + 1);
  });
}

async function loadExpenses(targetPage = currentPage) {
  if (!loggedInUser?.email) return;

  try {
    const result = await apiJson(`/expense?page=${encodeURIComponent(targetPage)}&limit=${itemsPerPage}`, {
      headers: authHeaders()
    });

    if (result && Array.isArray(result.expenses)) {
      totalExpensesCount = result.totalItems != null ? result.totalItems : (result.totalExpenses != null ? result.totalExpenses : result.expenses.length);
      totalPages = result.lastPage || Math.max(1, Math.ceil(totalExpensesCount / itemsPerPage));

      // Requirement: If current page becomes invalid, move to the last valid page
      if (targetPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        return loadExpenses(totalPages);
      }

      currentExpenses = result.expenses;
      currentPage = result.currentPage || targetPage;

      if (result.totalAmount != null) {
        renderTotalAmount(result.totalAmount);
      }
    } else if (Array.isArray(result)) {
      allExpensesCache = result;
      totalExpensesCount = allExpensesCache.length;
      totalPages = Math.max(1, Math.ceil(totalExpensesCount / itemsPerPage));
      if (targetPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        return loadExpenses(totalPages);
      }
      currentPage = Math.min(Math.max(1, targetPage), totalPages);
      const start = (currentPage - 1) * itemsPerPage;
      currentExpenses = allExpensesCache.slice(start, start + itemsPerPage);
      updateTotalExpense(allExpensesCache);
    } else {
      currentExpenses = [];
      totalExpensesCount = 0;
      totalPages = 1;
      currentPage = 1;
    }

    renderExpenses(currentExpenses);
    renderPagination();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">${esc(error.message)}</div></td></tr>`;
  }
}

async function deleteExpense(expenseId) {
  if (!window.confirm("Delete this expense?")) return;

  const button = tableBody.querySelector(`[data-expense-id="${CSS.escape(String(expenseId))}"]`);
  if (button) button.disabled = true;

  try {
    await apiJson(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      method: "DELETE",
      headers: authHeaders()
    });

    // Check if after deletion the current page would be empty and there's a previous page
    if (currentExpenses.length === 1 && currentPage > 1) {
      currentPage -= 1;
    }
    await loadExpenses(currentPage);
  } catch (error) {
    window.alert(error.message);
  }
}

async function suggestCategory() {
  const description = descriptionInput.value.trim();
  if (!description) {
    predictedCategory = null;
    predictedDescription = "";
    predictedSource = "fallback";
    aiSuggestion.textContent = "AI category will appear here.";
    return;
  }

  aiSuggestion.textContent = "AI is thinking...";
  const result = await apiJson("/api/categorize-expense", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ description })
  });

  predictedCategory = result.category;
  predictedDescription = description;
  predictedSource = result.source || "fallback";
  aiSuggestion.textContent = `Suggested category: ${result.category}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitBtn = form.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding...";
  }

  const expense = {
    email: loggedInUser.email,
    amount: document.getElementById("amount").value,
    description: descriptionInput.value,
    category: predictedDescription === descriptionInput.value.trim() ? predictedCategory : null,
    categorySource: predictedDescription === descriptionInput.value.trim() ? predictedSource : null
  };

  try {
    await apiJson("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(expense)
    });

    form.reset();
    predictedCategory = null;
    predictedDescription = "";
    predictedSource = "fallback";
    aiSuggestion.textContent = "AI category will appear here.";

    // Reload page 1 so the new expense appears immediately at the top
    await loadExpenses(1);
  } catch (error) {
    window.alert(error.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add expense";
    }
  }
});

tableBody.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-expense-id]");
  if (!deleteButton) return;
  deleteExpense(deleteButton.dataset.expenseId).catch((error) => window.alert(error.message));
});

let suggestionTimer;
descriptionInput.addEventListener("input", () => {
  clearTimeout(suggestionTimer);
  suggestionTimer = setTimeout(() => {
    suggestCategory().catch((error) => {
      aiSuggestion.textContent = error.message;
    });
  }, 400);
});

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearStoredAuth();
    window.location.href = "login.html";
  });
}

const insightBtn = document.getElementById("insightBtn");
const insightContainer = document.getElementById("insightContainer");
if (insightBtn && insightContainer) {
  insightBtn.addEventListener("click", async () => {
    insightContainer.style.display = "block";
    insightContainer.innerHTML = '<div class="insight" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 16px 20px; color: var(--text-primary); font-size: 0.95rem;">✦ AI is analyzing your spending patterns...</div>';
    try {
      const queryEmail = loggedInUser?.email ? `?email=${encodeURIComponent(loggedInUser.email)}` : "";
      const res = await apiJson("/api/ai/insight" + queryEmail, { headers: authHeaders() });
      const text = res.insight || res.message || "No insight available.";
      insightContainer.innerHTML = `<div class="insight" style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-md); padding: 16px 20px; color: var(--text-primary); font-size: 0.95rem; line-height: 1.5;">✨ <strong>AI Financial Insight:</strong> ${esc(text)}</div>`;
    } catch (err) {
      insightContainer.innerHTML = `<div class="empty-state" style="margin: 0;">${esc(err.message)}</div>`;
    }
  });
}

// Initialize on page load
updatePremiumUI();
loadExpenses().catch((error) => window.alert(error.message));
loadLeaderboard();
