const form = document.getElementById("expenseForm");
const tableBody = document.getElementById("expenseTableBody");
const descriptionInput = document.getElementById("description");
const aiSuggestion = document.getElementById("aiSuggestion");

const loggedInUser = JSON.parse(localStorage.getItem("loggedInUser") || localStorage.getItem("expenseTrackerUser") || "null");
const authToken = localStorage.getItem("authToken") || localStorage.getItem("expenseTrackerToken");

function clearStoredAuth() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("expenseTrackerToken");
  localStorage.removeItem("loggedInUser");
  localStorage.removeItem("expenseTrackerUser");
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

const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let totalPages = 1;
let totalExpensesCount = 0;
let currentExpenses = [];
let allExpensesCache = [];
let predictedCategory = null;
let predictedDescription = "";
let predictedSource = "fallback";

if (!loggedInUser) {
  window.location.href = "login.html";
}

function authHeaders() {
  const headers = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  return headers;
}

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
      <td style="font-weight: 500;">${expense.description}</td>
      <td><span class="cat">${expense.category || "General"}</span></td>
      <td>${isAi ? `<span class="ai">🤖 ${expense.categorySource}</span>` : '<span style="color: var(--text-muted); font-size: 0.8rem;">Manual / Saved</span>'}</td>
      <td style="text-align: right;"><button class="delete-button" data-expense-id="${expense.id}" type="button">Delete</button></td>
    </tr>
  `;
  }).join("");
}

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

  // Generate page numbers
  const numbersContainer = document.getElementById("paginationNumbers");
  if (numbersContainer) {
    numbersContainer.innerHTML = "";
    
    // Determine visible page numbers (sliding window around currentPage, with 1 and lastPage always)
    const pages = [];
    const maxVisibleButtons = 5;
    
    if (totalPages <= maxVisibleButtons + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let left = Math.max(2, currentPage - 1);
      let right = Math.min(totalPages - 1, currentPage + 1);
      
      if (currentPage <= 3) {
        right = 4;
      }
      if (currentPage >= totalPages - 2) {
        left = totalPages - 3;
      }

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

async function loadExpenses(targetPage = currentPage) {
  if (!loggedInUser?.email) return;

  try {
    const result = await apiJson(`/api/expenses?page=${encodeURIComponent(targetPage)}&limit=${ITEMS_PER_PAGE}`, {
      headers: authHeaders()
    });

    if (result && Array.isArray(result.expenses)) {
      currentExpenses = result.expenses;
      currentPage = result.currentPage || targetPage;
      totalPages = result.totalPages || 1;
      totalExpensesCount = result.totalExpenses != null ? result.totalExpenses : result.expenses.length;
      if (result.totalAmount != null) {
        renderTotalAmount(result.totalAmount);
      }
    } else if (Array.isArray(result)) {
      // Fallback client-side pagination if backend returned array directly
      allExpensesCache = result;
      totalExpensesCount = allExpensesCache.length;
      totalPages = Math.max(1, Math.ceil(totalExpensesCount / ITEMS_PER_PAGE));
      currentPage = Math.min(Math.max(1, targetPage), totalPages);
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      currentExpenses = allExpensesCache.slice(start, start + ITEMS_PER_PAGE);
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
    tableBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">${error.message}</div></td></tr>`;
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

// Attach Pagination Button Handlers
const firstPageBtn = document.getElementById("firstPageBtn");
if (firstPageBtn) {
  firstPageBtn.addEventListener("click", () => {
    if (currentPage > 1) loadExpenses(1);
  });
}

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

const lastPageBtn = document.getElementById("lastPageBtn");
if (lastPageBtn) {
  lastPageBtn.addEventListener("click", () => {
    if (currentPage < totalPages) loadExpenses(totalPages);
  });
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
  if (!deleteButton) {
    return;
  }

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

loadExpenses().catch((error) => window.alert(error.message));

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    clearStoredAuth();
    window.location.href = "login.html";
  });
}
