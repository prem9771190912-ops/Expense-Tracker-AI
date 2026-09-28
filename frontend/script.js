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

let authToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");
let currentUser = JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");

// Check authentication - redirect to login.html if not logged in
if (!authToken || !currentUser) {
  window.location.href = "login.html";
}

const esc = x => { const d = document.createElement("div"); d.textContent = x; return d.innerHTML; };

function authHeaders() {
  const headers = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

function clearAuth() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem("authToken");
  localStorage.removeItem("expenseTrackerToken");
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("expenseTrackerUser");
}

async function request(path, options = {}) {
  const url = API + (path.startsWith("/api/") ? path.slice(4) : path);
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

function renderExpenseItem(x) {
  const d = document.createElement("div");
  d.className = "expense";
  d.dataset.expenseId = String(x.id);
  d.dataset.amount = String(Number(x.amount) || 0);
  const cat = esc(x.category || "General");
  const dateStr = new Date(x.createdAt || Date.now()).toLocaleDateString();
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

const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let totalPages = 1;
let totalExpensesCount = 0;
let allExpensesCache = [];

function renderPagination() {
  const paginationContainer = document.getElementById("paginationContainer");
  if (!paginationContainer) return;

  if (totalExpensesCount === 0) {
    paginationContainer.style.display = "none";
    return;
  }

  paginationContainer.style.display = "flex";

  const start = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const end = Math.min(currentPage * ITEMS_PER_PAGE, totalExpensesCount);

  const pageStartEl = document.getElementById("pageStart");
  const pageEndEl = document.getElementById("pageEnd");
  const totalItemsEl = document.getElementById("totalItems");
  const pageBadgeEl = document.getElementById("pageBadge");
  const lastPageNumEl = document.getElementById("lastPageNumberDisplay");

  if (pageStartEl) pageStartEl.textContent = start;
  if (pageEndEl) pageEndEl.textContent = end;
  if (totalItemsEl) totalItemsEl.textContent = totalExpensesCount;
  if (pageBadgeEl) pageBadgeEl.textContent = `Page ${currentPage} of ${totalPages}`;
  if (lastPageNumEl) lastPageNumEl.textContent = totalPages;

  const firstBtn = document.getElementById("firstPageBtn");
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");
  const lastBtn = document.getElementById("lastPageBtn");

  if (firstBtn) firstBtn.disabled = currentPage <= 1;
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  if (lastBtn) lastBtn.disabled = currentPage >= totalPages;

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
const firstPageBtn = document.getElementById("firstPageBtn");
if (firstPageBtn) {
  firstPageBtn.addEventListener("click", () => {
    if (currentPage > 1) load(1);
  });
}

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

const lastPageBtn = document.getElementById("lastPageBtn");
if (lastPageBtn) {
  lastPageBtn.addEventListener("click", () => {
    if (currentPage < totalPages) load(totalPages);
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
    const result = await request(`/api/expenses?page=${encodeURIComponent(targetPage)}&limit=${ITEMS_PER_PAGE}`, {
      headers: authHeaders()
    });

    let currentExpenses = [];
    if (result && Array.isArray(result.expenses)) {
      currentExpenses = result.expenses;
      currentPage = result.currentPage || targetPage;
      totalPages = result.totalPages || 1;
      totalExpensesCount = result.totalExpenses != null ? result.totalExpenses : result.expenses.length;
      if (result.totalAmount != null) {
        setTotalDisplay(result.totalAmount);
      }
    } else if (Array.isArray(result)) {
      allExpensesCache = result;
      totalExpensesCount = allExpensesCache.length;
      totalPages = Math.max(1, Math.ceil(totalExpensesCount / ITEMS_PER_PAGE));
      currentPage = Math.min(Math.max(1, targetPage), totalPages);
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      currentExpenses = allExpensesCache.slice(start, start + ITEMS_PER_PAGE);
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
let lastAutoCategory = "";

if (description && aiSuggestion) {
  description.addEventListener("input", () => {
    clearTimeout(aiSuggestionTimer);
    const val = description.value.trim();
    if (!val) {
      aiSuggestion.style.display = "none";
      aiSuggestion.innerHTML = "";
      if (category && category.value === lastAutoCategory) {
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
          lastAutoCategory = res.category;
          aiSuggestion.innerHTML = `✨ AI Suggestion: <strong>${esc(res.category)}</strong> <span style="font-size: 0.8rem; opacity: 0.7;">(${esc(res.source || "ai")})</span>`;
          if (category && (!category.value || category.value === lastAutoCategory)) {
            category.value = res.category;
          }
        }
      } catch (err) {
        aiSuggestion.innerHTML = '<span style="color: var(--text-secondary);">✦ AI ready (auto-classifies on add)</span>';
      }
    }, 350);
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

    const body = {
      amount: numericAmount,
      description: textDescription
    };
    if (category && category.value) body.category = category.value;

    try {
      const x = await request("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body)
      });

      msg.textContent = x.category ? `Categorized as: ${x.category}` : "Expense added.";
      form.reset();
      if (aiSuggestion) {
        aiSuggestion.style.display = "none";
        aiSuggestion.innerHTML = "";
      }
      lastAutoCategory = "";
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
    if (!insight) return;
    insight.innerHTML = '<div class="insight">Analyzing spending...</div>';
    try {
      const queryEmail = currentUser?.email ? `?email=${encodeURIComponent(currentUser.email)}` : "";
      const x = await request("/api/ai/insight" + queryEmail, { headers: authHeaders() });
      insight.innerHTML = `<div class="insight">✨ ${esc(x.insight || x.message)}</div>`;
    } catch (error) {
      insight.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    }
  };
}

async function refreshSession() {
  if (!authToken) return;
  try {
    const data = await request("/api/auth/me", { headers: authHeaders() });
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem("loggedInUser", JSON.stringify(currentUser));
      localStorage.setItem("expenseTrackerUser", JSON.stringify(currentUser));
    }
  } catch (error) {
    clearAuth();
    window.location.href = "login.html";
  }
}

if (currentUser && authToken) {
  refreshSession().finally(() => {
    load();
  });
}
