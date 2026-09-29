/**
 * CSV Report Generation Service
 * Generates formatted CSV files for Daily, Weekly, Monthly, and Yearly expense reports.
 */

function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Generate formatted CSV string with UTF-8 BOM for universal spreadsheet compatibility.
 * @param {Object} reportData - Report metadata and transactions
 * @returns {string} Formatted CSV content
 */
function generateReportCSV(reportData) {
  const {
    userName = "User",
    userEmail = "",
    selectedPeriod = "Daily",
    dateRange = "",
    totalIncome = 0,
    totalExpense = 0,
    savings = 0,
    transactions = []
  } = reportData;

  const lines = [];

  // Summary Metadata Block
  lines.push(`${escapeCSV("User Name")},${escapeCSV(userName)}`);
  if (userEmail) {
    lines.push(`${escapeCSV("Email")},${escapeCSV(userEmail)}`);
  }
  lines.push(`${escapeCSV("Selected Period")},${escapeCSV(selectedPeriod)}`);
  lines.push(`${escapeCSV("Date Range")},${escapeCSV(dateRange)}`);
  lines.push(`${escapeCSV("Total Income")},${escapeCSV(Number(totalIncome || 0).toFixed(2))}`);
  lines.push(`${escapeCSV("Total Expense")},${escapeCSV(Number(totalExpense || 0).toFixed(2))}`);
  lines.push(`${escapeCSV("Savings")},${escapeCSV(Number(savings || 0).toFixed(2))}`);
  lines.push(""); // Empty separator row

  // Table Column Headers
  lines.push([
    escapeCSV("Date"),
    escapeCSV("Description"),
    escapeCSV("Category"),
    escapeCSV("Type"),
    escapeCSV("Amount (INR)")
  ].join(","));

  // Transaction Rows
  if (Array.isArray(transactions) && transactions.length > 0) {
    for (const tx of transactions) {
      lines.push([
        escapeCSV(tx.date || ""),
        escapeCSV(tx.description || ""),
        escapeCSV(tx.category || "General"),
        escapeCSV(tx.type || "Expense"),
        escapeCSV(Number(tx.amount || 0).toFixed(2))
      ].join(","));
    }
  } else {
    lines.push(`${escapeCSV("No transactions recorded for this period")},,,,`);
  }

  // Prepend UTF-8 BOM (\uFEFF) so Excel & Google Sheets correctly decode characters
  return "\uFEFF" + lines.join("\r\n");
}

module.exports = {
  generateReportCSV,
  escapeCSV
};
