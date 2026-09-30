const API = "/api";
const form = document.getElementById("form");
const msg = document.getElementById("msg");
const logoutBtn = document.getElementById("logoutBtn");
const list = document.getElementById("list");
const total = document.getElementById("total");
const insight = document.getElementById("insight");
const insightBtn = document.getElementById("insightBtn");
const amount = document.getElementById("amount");
const description = document.getElementById("description");
const category = document.getElementById("category");
const aiSuggestion = document.getElementById("aiSuggestion");
const expenseDate = document.getElementById("expenseDate");
const aiInsightSection = document.getElementById("aiInsightSection");
const aiInsightCardBody = document.getElementById("aiInsightCardBody");
const closeInsightBtn = document.getElementById("closeInsightBtn");

if (expenseDate && !expenseDate.value) {
  expenseDate.value = new Date().toISOString().slice(0, 10);
}

if (closeInsightBtn && aiInsightSection) {
  closeInsightBtn.addEventListener("click", () => {
    aiInsightSection.style.display = "none";
  });
}

// Premium & Leaderboard DOM Elements
const premiumHeadline = document.getElementById("premiumHeadline");
const buyPremiumBtn = document.getElementById("buyPremiumBtn");
const premiumUserBadge = document.getElementById("premiumUserBadge");
const leaderboardBtn = document.getElementById("leaderboardBtn");
const leaderboardSection = document.getElementById("leaderboardSection");
const leaderboardTableBody = document.getElementById("leaderboardTableBody");
const topSpenderNameEl = document.getElementById("topSpenderName");
const topSpenderAmountEl = document.getElementById("topSpenderAmount");
const limitSelect = document.getElementById("limitSelect");
const pageSubtitle = document.getElementById("pageSubtitle");

let authToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");
let currentUser = JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");

// Check authentication - redirect to login.html if not logged in
if (!authToken || !currentUser) {
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

function syncPremiumStatus() {
  const token = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");
  const decoded = parseJwt(token);
  // Source of truth: whether user actually purchased premium membership
  const isPremium = Boolean(
    (currentUser && (currentUser.isPremium || currentUser.ispremiumuser)) ||
    (decoded && (decoded.ispremiumuser || decoded.isPremium))
  );
  localStorage.setItem("ispremiumuser", isPremium ? "true" : "false");
  if (currentUser) {
    currentUser.ispremiumuser = isPremium;
    currentUser.isPremium = isPremium;
  }
  return isPremium;
}

function updatePremiumUI() {
  const isPremium = syncPremiumStatus();
  if (isPremium) {
    if (premiumHeadline) premiumHeadline.style.display = "flex";
    // Hide Buy Premium button and display Premium User badge
    if (buyPremiumBtn) buyPremiumBtn.style.display = "none";
    if (premiumUserBadge) premiumUserBadge.style.display = "inline-flex";
  } else {
    if (premiumHeadline) premiumHeadline.style.display = "none";
    // Show Buy Premium button and hide Premium User badge
    if (buyPremiumBtn) buyPremiumBtn.style.display = "inline-flex";
    if (premiumUserBadge) premiumUserBadge.style.display = "none";
  }
  if (leaderboardBtn) leaderboardBtn.style.display = "inline-flex";
}

function authHeaders() {
  const headers = {};
  const token = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken") || authToken;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("authToken");
  localStorage.removeItem("expenseTrackerToken");
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("expenseTrackerUser");
  localStorage.removeItem("ispremiumuser");
}

async function request(path, options = {}) {
  const url = path.startsWith("http") ? path : (path.startsWith("/api") || path.startsWith("/purchase") || path.startsWith("/expense") ? path : `${API}${path}`);
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new Error("Unable to reach backend. Check network connectivity.");
  }
  
  if (response.status === 401) {
    clearAuth();
    window.location.href = "login.html";
    throw new Error("Session expired. Please login again.");
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Invalid response from server (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearAuth();
    window.location.href = "login.html";
  });
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

  const currentUserName = currentUser?.name?.trim().toLowerCase();
  const currentUserId = String(currentUser?.id || currentUser?._id || "");
  const currentUserEmail = currentUser?.email?.trim().toLowerCase();

  // Top Spender Highlight Banner
  if (topSpenderNameEl && topUser) {
    topSpenderNameEl.textContent = topUser.name || "User";
  }
  if (topSpenderAmountEl && topUser) {
    topSpenderAmountEl.textContent = "₹" + maxExpense.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Check if current user is the top contributor
  const isCurrentTopSpender = Boolean(
    topUser && (
      (currentUserEmail && String(topUser.email || "").trim().toLowerCase() === currentUserEmail) ||
      (currentUserId && String(topUser.id || topUser._id || "") === currentUserId) ||
      (currentUserName && String(topUser.name || "").trim().toLowerCase() === currentUserName)
    ) && maxExpense > 0
  );

  // Premium is active ONLY if user has actually purchased premium membership
  const isPremiumUser = Boolean(
    currentUser?.isPremium ||
    currentUser?.ispremiumuser ||
    parseJwt(authToken)?.ispremiumuser
  );

  if (isPremiumUser) {
    localStorage.setItem("ispremiumuser", "true");
    if (currentUser) {
      currentUser.ispremiumuser = true;
      currentUser.isPremium = true;
    }
    if (premiumHeadline) {
      premiumHeadline.style.display = "flex";
      premiumHeadline.textContent = "🎉 You are a Premium User Now";
    }
    if (buyPremiumBtn) buyPremiumBtn.style.display = "none";
    if (premiumUserBadge) premiumUserBadge.style.display = "inline-flex";
  } else {
    localStorage.setItem("ispremiumuser", "false");
    if (currentUser) {
      currentUser.ispremiumuser = false;
      currentUser.isPremium = false;
    }
    if (premiumHeadline) {
      premiumHeadline.style.display = "none";
    }
    if (buyPremiumBtn) buyPremiumBtn.style.display = "inline-flex";
    if (premiumUserBadge) premiumUserBadge.style.display = "none";
  }

  leaderboardTableBody.innerHTML = users.map((u, index) => {
    const rank = u.rank || (index + 1);
    let rankBadge = `<span style="font-weight: 700; color: var(--text-muted);">#${rank}</span>`;
    if (rank === 1) rankBadge = `<span style="font-size: 1.15rem; filter: drop-shadow(0 0 6px rgba(234, 179, 8, 0.6)); font-weight: 800;">🥇 1</span>`;
    else if (rank === 2) rankBadge = `<span style="font-size: 1.15rem; font-weight: 800;">🥈 2</span>`;
    else if (rank === 3) rankBadge = `<span style="font-size: 1.15rem; font-weight: 800;">🥉 3</span>`;

    const isHighestExpense = rank === 1 && maxExpense > 0;
    const isThisCurrentUser = (currentUserEmail && String(u.email || "").trim().toLowerCase() === currentUserEmail) ||
                              (currentUserId && String(u.id || u._id || "") === currentUserId) ||
                              (currentUserName && String(u.name || "").trim().toLowerCase() === currentUserName);

    const isUserPaidPremium = Boolean(
      u.isPremium ||
      u.ispremiumuser ||
      (isThisCurrentUser && isPremiumUser)
    );

    let statusBadge = "";
    if (isUserPaidPremium && isHighestExpense) {
      statusBadge = `<span style="background: linear-gradient(135deg, rgba(234, 179, 8, 0.25) 0%, rgba(202, 138, 4, 0.45) 100%); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.6); padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 800; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 0 10px rgba(234, 179, 8, 0.25);">👑 Premium Member (#1)</span>`;
    } else if (isUserPaidPremium) {
      statusBadge = `<span style="background: linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(202, 138, 4, 0.35) 100%); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 0 8px rgba(234, 179, 8, 0.2);">⭐ Premium Member</span>`;
    } else if (isHighestExpense) {
      statusBadge = `<span style="background: rgba(234, 179, 8, 0.15); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.4); padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;">👑 Rank Leader</span>`;
    } else {
      statusBadge = `<span style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid rgba(255, 255, 255, 0.1); padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;">Standard Member</span>`;
    }

    const userLabel = isThisCurrentUser
      ? `<strong style="color: var(--emerald-text); font-size: 0.95rem;">${esc(u.name || "User")}</strong> <span style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 700;">YOU</span>`
      : `<span style="color: var(--text-primary); font-size: 0.95rem; font-weight: 600;">${esc(u.name || "User")}</span>`;

    const rowBackground = isHighestExpense
      ? 'background: rgba(234, 179, 8, 0.08); border-left: 3px solid #fde047;'
      : (isThisCurrentUser
        ? 'background: rgba(16, 185, 129, 0.06); border-left: 3px solid #10b981;'
        : (isUserPaidPremium ? 'background: rgba(234, 179, 8, 0.03);' : ''));

    return `
      <tr style="${rowBackground}">
        <td style="font-size: 1.05rem;">${rankBadge}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${userLabel}
          </div>
        </td>
        <td style="text-align: center;">
          ${statusBadge}
        </td>
        <td style="text-align: right; font-weight: 700; color: ${isHighestExpense ? '#fde047' : (isUserPaidPremium ? '#fde047' : 'var(--emerald-text)')}; font-variant-numeric: tabular-nums; font-size: 1.05rem;">
          ₹${Number(u.totalExpense || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
      </tr>
    `;
  }).join("");
}

async function loadLeaderboard() {
  if (!leaderboardTableBody) return;
  try {
    const data = await request("/api/leaderboard?public=true", { headers: authHeaders() });
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

function renderExpenseItem(x) {
  const d = document.createElement("div");
  d.className = "expense";
  d.dataset.expenseId = String(x.id);
  d.dataset.amount = String(Number(x.amount) || 0);
  const cat = esc(x.category || "General");
  const dateStr = new Date(x.date || x.createdAt || Date.now()).toLocaleDateString();
  const isAi = x.aiSuggested || (x.categorySource && x.categorySource !== "saved" && x.categorySource !== "fallback");

  d.innerHTML = `
    <div>
      <b>${esc(x.description)}</b>
      <div class="meta">
        <span class="cat">${cat}</span>
        ${isAi ? '<span class="ai">• AI</span>' : ""}
        <span>• ${dateStr}</span>
      </div>
    </div>
    <div>
      <b style="font-variant-numeric: tabular-nums; color: var(--emerald-text);">₹${(+x.amount).toFixed(2)}</b>
      <button class="del" type="button" onclick="del('${x.id}')">Delete</button>
    </div>
  `;
  return d;
}

// ==========================================================================
// FEATURE 7: Dynamic Expenses Per Page & LocalStorage Persistence
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
    load(1);
  });
}

let currentPage = 1;
let totalPages = 1;
let totalExpensesCount = 0;
let allExpensesCache = [];

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
          if (p !== currentPage) load(p);
        });
        numbersContainer.appendChild(btn);
      }
    });
  }
}

// Attach Pagination Button Handlers
const prevPageBtn = document.getElementById("prevPageBtn");
if (prevPageBtn) {
  prevPageBtn.addEventListener("click", () => {
    if (currentPage > 1) load(currentPage - 1);
  });
}

const nextPageBtn = document.getElementById("nextPageBtn");
if (nextPageBtn) {
  nextPageBtn.addEventListener("click", () => {
    if (currentPage < totalPages) load(currentPage + 1);
  });
}

function setTotalDisplay(sum) {
  if (!total) return;
  const num = Number(sum) || 0;
  total.textContent = `Total: ₹${num.toFixed(2)}`;
}

async function load(targetPage = currentPage) {
  if (!currentUser || !list) return;
  try {
    const result = await request(`/expense?page=${encodeURIComponent(targetPage)}&limit=${itemsPerPage}`, {
      headers: authHeaders()
    });

    let currentExpenses = [];
    if (result && Array.isArray(result.expenses)) {
      totalExpensesCount = result.totalItems != null ? result.totalItems : (result.totalExpenses != null ? result.totalExpenses : result.expenses.length);
      totalPages = result.lastPage || Math.max(1, Math.ceil(totalExpensesCount / itemsPerPage));

      // Requirement: If current page becomes invalid, move to the last valid page
      if (targetPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        return load(totalPages);
      }

      currentExpenses = result.expenses;
      currentPage = result.currentPage || targetPage;

      if (result.totalAmount != null) {
        setTotalDisplay(result.totalAmount);
      }
    } else if (Array.isArray(result)) {
      allExpensesCache = result;
      totalExpensesCount = allExpensesCache.length;
      totalPages = Math.max(1, Math.ceil(totalExpensesCount / itemsPerPage));
      if (targetPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
        return load(totalPages);
      }
      currentPage = Math.min(Math.max(1, targetPage), totalPages);
      const start = (currentPage - 1) * itemsPerPage;
      currentExpenses = allExpensesCache.slice(start, start + itemsPerPage);
      const sum = allExpensesCache.reduce((a, b) => a + (Number(b.amount) || 0), 0);
      setTotalDisplay(sum);
    }

    list.innerHTML = "";
    if (currentExpenses.length === 0) {
      list.innerHTML = '<div class="empty-state">☕ No expenses recorded yet. Start by adding one above!</div>';
    } else {
      currentExpenses.forEach(x => list.appendChild(renderExpenseItem(x)));
    }

    renderPagination();
  } catch (error) {
    list.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    if (total) total.textContent = "Total: ₹0.00";
  }
}

let aiSuggestionTimer;
let currentAiCategory = "";
let userManuallyChangedCategory = false;

if (category) {
  category.addEventListener("change", () => {
    // If the user manually picks a category, mark as manual choice
    if (category.value && category.value !== currentAiCategory) {
      userManuallyChangedCategory = true;
    } else if (!category.value) {
      // Switched back to "AI Auto-Detect"
      userManuallyChangedCategory = false;
      if (currentAiCategory) {
        category.value = currentAiCategory;
      }
    }
  });
}

if (description && aiSuggestion) {
  description.addEventListener("input", () => {
    clearTimeout(aiSuggestionTimer);
    const val = description.value.trim();
    if (!val) {
      aiSuggestion.style.display = "none";
      aiSuggestion.innerHTML = "";
      currentAiCategory = "";
      if (!userManuallyChangedCategory && category) {
        category.value = "";
      }
      return;
    }

    aiSuggestion.style.display = "block";
    aiSuggestion.innerHTML = '<span style="opacity: 0.85;">✦ AI is analyzing...</span>';

    aiSuggestionTimer = setTimeout(async () => {
      try {
        const res = await request("/api/categorize-expense", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ description: val })
        });
        if (res && res.category) {
          currentAiCategory = res.category;
          aiSuggestion.innerHTML = `✨ AI Suggestion: <strong>${esc(res.category)}</strong> <span style="font-size: 0.8rem; opacity: 0.7;">(${esc(res.source || "ai")})</span> <span style="font-size: 0.78rem; opacity: 0.9; margin-left: 8px;">✓ Auto-Selected</span>`;
          
          // Auto-update category dropdown if user hasn't deliberately chosen another category
          if (category && (!userManuallyChangedCategory || !category.value || category.value === "Other")) {
            category.value = res.category;
            userManuallyChangedCategory = false; // Reset to reflect active AI match
          }
        }
      } catch (err) {
        aiSuggestion.innerHTML = '<span style="color: var(--text-secondary);">✦ AI ready (auto-classifies on add)</span>';
      }
    }, 250);
  });
}

if (form) {
  form.onsubmit = async e => {
    e.preventDefault();
    const numericAmount = Number(amount.value);
    const textDescription = description.value.trim();
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !textDescription) {
      msg.textContent = "Enter a valid amount and description.";
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    msg.textContent = "Adding expense...";

    // Determine target category:
    // If user explicitly picked a non-empty category different from AI, respect it
    let targetCat = "";
    let targetSource = "ai";

    if (userManuallyChangedCategory && category && category.value && category.value !== currentAiCategory) {
      targetCat = category.value;
      targetSource = "user";
    } else {
      // Prioritize AI suggestion
      targetCat = currentAiCategory || (category ? category.value : "") || "Other";
      targetSource = (currentAiCategory && targetCat === currentAiCategory) ? "ai" : (targetCat === "Other" ? "fallback" : "user");
    }

    const body = {
      amount: numericAmount,
      description: textDescription,
      category: targetCat,
      categorySource: targetSource,
      aiSuggested: targetSource === "ai",
      date: (expenseDate && expenseDate.value) ? expenseDate.value : undefined
    };

    try {
      const x = await request("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body)
      });

      msg.textContent = x.category ? `Categorized as: ${x.category}` : "Expense added.";
      form.reset();
      userManuallyChangedCategory = false;
      currentAiCategory = "";
      if (category) category.value = "";
      if (expenseDate) {
        expenseDate.value = new Date().toISOString().slice(0, 10);
      }
      if (aiSuggestion) {
        aiSuggestion.style.display = "none";
        aiSuggestion.innerHTML = "";
      }
      await load(1);
    } catch (error) {
      msg.textContent = error.message;
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  };
}

async function del(id) {
  if (!confirm("Delete this expense?")) return;

  const row = list?.querySelector(`.expense[data-expense-id="${CSS.escape(String(id))}"]`);
  if (row) row.style.opacity = "0.5";

  try {
    await request("/api/expenses/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: authHeaders()
    });

    const itemsOnPage = list?.querySelectorAll(".expense").length || 0;
    if (itemsOnPage <= 1 && currentPage > 1) {
      currentPage -= 1;
    }
    await load(currentPage);
    if (msg) msg.textContent = "Expense deleted.";
  } catch (error) {
    if (row) row.style.opacity = "1";
    if (msg) msg.textContent = error.message;
  }
}
window.del = del;

if (insightBtn) {
  insightBtn.onclick = async () => {
    const originalBtnHtml = insightBtn.innerHTML;
    insightBtn.disabled = true;
    insightBtn.innerHTML = '<span>⏳ Analyzing spending...</span>';

    if (aiInsightSection && aiInsightCardBody) {
      aiInsightSection.style.display = "block";
      aiInsightCardBody.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; color: #fde68a;">
          <span style="font-size: 1.25rem;">✦</span>
          <span>Analyzing your spending habits across all categories...</span>
        </div>
      `;
      aiInsightSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (insight) {
      insight.innerHTML = '<div class="insight">✨ Analyzing spending patterns...</div>';
    }

    try {
      const queryEmail = currentUser?.email ? `?email=${encodeURIComponent(currentUser.email)}` : "";
      const x = await request("/api/ai/insight" + queryEmail, { headers: authHeaders() });
      const insightText = x.insight || x.message || "Keep tracking your expenses to unlock more insights!";

      if (aiInsightCardBody) {
        aiInsightCardBody.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <span style="font-size: 1.6rem; line-height: 1;">💡</span>
            <div>
              <div style="font-weight: 700; color: #ffffff; margin-bottom: 4px; font-size: 1.02rem;">Smart Financial Takeaway:</div>
              <div style="color: #fde68a; font-size: 0.98rem; line-height: 1.6;">${esc(insightText)}</div>
            </div>
          </div>
        `;
      }
      if (insight) {
        insight.innerHTML = `<div class="insight">✨ ${esc(insightText)}</div>`;
      }
    } catch (error) {
      const errorMsg = error.message || "Could not generate insight. Please try again.";
      if (aiInsightCardBody) {
        aiInsightCardBody.innerHTML = `<div class="empty-state" style="color: var(--rose-text); margin: 0;">${esc(errorMsg)}</div>`;
      }
      if (insight) {
        insight.innerHTML = `<div class="empty-state">${esc(errorMsg)}</div>`;
      }
    } finally {
      insightBtn.disabled = false;
      insightBtn.innerHTML = originalBtnHtml;
    }
  };
}

async function refreshSession() {
  if (!authToken) return;
  try {
    const data = await request("/api/auth/me", { headers: authHeaders() });
    if (data.token) {
      authToken = data.token;
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("expenseTrackerToken", data.token);
    }
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem("loggedInUser", JSON.stringify(currentUser));
      localStorage.setItem("expenseTrackerUser", JSON.stringify(currentUser));
      const isPrem = Boolean(currentUser.isPremium || currentUser.ispremiumuser);
      localStorage.setItem("ispremiumuser", isPrem ? "true" : "false");
    }
  } catch (error) {
    clearAuth();
    window.location.href = "login.html";
  }
}

if (currentUser && authToken) {
  updatePremiumUI();
  refreshSession().finally(() => {
    updatePremiumUI();
    load();
    loadLeaderboard();
  });
}

// ============================================================================
// CASHFREE PAYMENT GATEWAY INTEGRATION
// ============================================================================

/**
 * Open the interactive Cashfree Sandbox Checkout Modal on page
 */
function openCashfreeModal(orderId, paymentSessionId, amount) {
  const modal = document.getElementById("cashfreeModal");
  const modalOrderId = document.getElementById("cfModalOrderId");
  const closeBtn = document.getElementById("closeCfModalBtn");
  const paySuccessBtn = document.getElementById("cfPaySuccessBtn");
  const payFailBtn = document.getElementById("cfPayFailBtn");

  if (!modal) {
    console.error("Cashfree modal element not found in DOM.");
    return;
  }

  if (modalOrderId) {
    modalOrderId.textContent = `Order ID: ${orderId}`;
  }

  // --- Payment Method Tabs (UPI, Card, Net Banking) ---
  const tabs = modal.querySelectorAll(".cf-tab");
  const panes = {
    upi: document.getElementById("cfTabUpi"),
    card: document.getElementById("cfTabCard"),
    netbanking: document.getElementById("cfTabNetbanking")
  };

  const switchTab = (targetTab) => {
    tabs.forEach((t) => {
      const isCurrent = t.getAttribute("data-tab") === targetTab;
      t.classList.toggle("active", isCurrent);
    });

    Object.keys(panes).forEach((key) => {
      if (panes[key]) {
        panes[key].style.display = key === targetTab ? "block" : "none";
      }
    });

    if (paySuccessBtn) {
      if (targetTab === "card") {
        paySuccessBtn.innerHTML = "🔒 Pay ₹199.00 via Card (Simulate Success)";
      } else if (targetTab === "netbanking") {
        paySuccessBtn.innerHTML = "🔒 Pay ₹199.00 via NetBanking (Simulate Success)";
      } else {
        paySuccessBtn.innerHTML = "🔒 Pay ₹199.00 (Simulate Success)";
      }
    }
  };

  tabs.forEach((tab) => {
    tab.onclick = (e) => {
      e.preventDefault();
      const target = tab.getAttribute("data-tab");
      switchTab(target);
    };
  });

  // Setup interactive card input formatters
  const cardNumInput = document.getElementById("cfCardNumber");
  const cardNameInput = document.getElementById("cfCardName");
  const cardExpInput = document.getElementById("cfCardExpiry");
  const cardCvvInput = document.getElementById("cfCardCvv");

  if (cardNameInput && currentUser && currentUser.name) {
    cardNameInput.value = currentUser.name;
  }

  if (cardNumInput) {
    cardNumInput.oninput = (e) => {
      let val = e.target.value.replace(/\D/g, "").substring(0, 16);
      val = val.match(/.{1,4}/g)?.join(" ") || val;
      e.target.value = val;
    };
  }

  if (cardExpInput) {
    cardExpInput.oninput = (e) => {
      let val = e.target.value.replace(/\D/g, "").substring(0, 4);
      if (val.length >= 2) {
        val = val.substring(0, 2) + "/" + val.substring(2);
      }
      e.target.value = val;
    };
  }

  if (cardCvvInput) {
    cardCvvInput.oninput = (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").substring(0, 4);
    };
  }

  // Default to UPI tab on each open
  switchTab("upi");

  modal.style.display = "flex";

  const cleanup = () => {
    modal.style.display = "none";
    if (closeBtn) closeBtn.onclick = null;
    if (paySuccessBtn) paySuccessBtn.onclick = null;
    if (payFailBtn) payFailBtn.onclick = null;
  };

  if (closeBtn) {
    closeBtn.onclick = () => {
      cleanup();
      handlePaymentStatusUpdate(orderId, false);
    };
  }

  if (payFailBtn) {
    payFailBtn.onclick = () => {
      cleanup();
      handlePaymentStatusUpdate(orderId, false);
    };
  }

  if (paySuccessBtn) {
    paySuccessBtn.onclick = () => {
      cleanup();
      handlePaymentStatusUpdate(orderId, true);
    };
  }
}

/**
 * Call POST /purchase/update-status to verify order payment with Cashfree
 * and update local user premium state and badge UI.
 */
async function handlePaymentStatusUpdate(orderId, simulateSuccess = null) {
  if (!orderId) return;

  try {
    const payload = { orderId: orderId };
    if (simulateSuccess !== null) {
      payload.testSuccess = Boolean(simulateSuccess);
      payload.status = simulateSuccess ? "SUCCESSFUL" : "FAILED";
    }

    const updateRes = await request("/purchase/update-status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify(payload)
    });

    if (updateRes && (updateRes.success || updateRes.status === "SUCCESSFUL")) {
      // 1. Update JWT authentication token if a new token was returned
      if (updateRes.token) {
        localStorage.setItem("authToken", updateRes.token);
        localStorage.setItem("expenseTrackerToken", updateRes.token);
        authToken = updateRes.token;
      }

      // 2. Mark user as premium in local storage & memory
      localStorage.setItem("ispremiumuser", "true");
      if (currentUser) {
        currentUser.ispremiumuser = true;
        currentUser.isPremium = true;
        localStorage.setItem("loggedInUser", JSON.stringify(currentUser));
        localStorage.setItem("expenseTrackerUser", JSON.stringify(currentUser));
      }

      // 3. Update dashboard UI (hide Buy Premium button, show Premium User badge)
      updatePremiumUI();
      if (typeof loadLeaderboard === "function") {
        loadLeaderboard();
      }

      // 4. Alert user of successful transaction
      alert("Transaction Successful");
    } else {
      // 4. Alert user of failed transaction
      alert("TRANSACTION FAILED");
    }
  } catch (err) {
    console.error("Payment status verification failed:", err);
    alert("TRANSACTION FAILED");
  }
}

/**
 * Handle Buy Premium Membership button click:
 * 1. Call POST /purchase/premium to create Cashfree order and obtain payment_session_id
 * 2. Open Cashfree Checkout Modal using Cashfree JS SDK or Sandbox Interactive Modal
 * 3. On payment completion, call POST /purchase/update-status
 */
async function handleBuyPremium() {
  if (!buyPremiumBtn) return;
  const originalText = buyPremiumBtn.innerHTML;

  try {
    buyPremiumBtn.disabled = true;
    buyPremiumBtn.innerHTML = "⏳ Processing...";

    // 1. Request Cashfree order creation from backend
    const data = await request("/purchase/premium", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify({ amount: 199.00 })
    });

    const paymentSessionId = data.payment_session_id || data.paymentSessionId;
    const orderId = data.order_id || data.orderId;

    if (!paymentSessionId || !orderId) {
      throw new Error(data.message || "Failed to initialize payment session.");
    }

    // 2. Open Cashfree Checkout Modal
    const isRealSession = paymentSessionId && !paymentSessionId.startsWith("sandbox_session_");
    let openedOfficial = false;

    if (isRealSession && typeof window.Cashfree !== "undefined") {
      try {
        const cashfree = window.Cashfree({ mode: "sandbox" });
        const checkoutOptions = {
          paymentSessionId: paymentSessionId,
          redirectTarget: "_modal"
        };

        cashfree.checkout(checkoutOptions).then(async (result) => {
          if (result && result.error) {
            console.warn("Cashfree checkout error:", result.error);
          }
          await handlePaymentStatusUpdate(orderId);
        }).catch((err) => {
          console.warn("Official checkout failed, falling back to sandbox modal:", err);
          openCashfreeModal(orderId, paymentSessionId, 199.00);
        });
        openedOfficial = true;
      } catch (e) {
        console.warn("Cashfree checkout launch error:", e);
      }
    }

    if (!openedOfficial) {
      // Open Cashfree Sandbox Interactive Modal
      openCashfreeModal(orderId, paymentSessionId, 199.00);
    }
  } catch (error) {
    console.error("handleBuyPremium error:", error);
    alert("TRANSACTION FAILED");
  } finally {
    if (buyPremiumBtn) {
      buyPremiumBtn.disabled = false;
      buyPremiumBtn.innerHTML = originalText;
    }
  }
}

// Bind Buy Premium Membership button click listener
if (buyPremiumBtn) {
  buyPremiumBtn.addEventListener("click", handleBuyPremium);
}

// Handle payment return if redirected via URL query param (?order_id=...)
const urlParams = new URLSearchParams(window.location.search);
const redirectOrderId = urlParams.get("order_id");
if (redirectOrderId) {
  window.history.replaceState({}, document.title, window.location.pathname);
  handlePaymentStatusUpdate(redirectOrderId);
}

