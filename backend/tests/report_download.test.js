const assert = require("assert");
const http = require("http");
const app = require("../app");
const db = require("../utils/db");
const User = require("../models/User");
const Expense = require("../models/Expense");

let server;
let baseUrl;

function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(resolve);
    else resolve();
  });
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = options.headers || {};
  let body = options.body;
  if (body && typeof body === "object") {
    body = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body
  });

  const contentType = res.headers.get("content-type") || "";
  let resBody;
  if (contentType.includes("application/pdf")) {
    const arrayBuf = await res.arrayBuffer();
    resBody = Buffer.from(arrayBuf);
  } else if (contentType.includes("application/json")) {
    resBody = await res.json().catch(() => ({}));
  } else {
    resBody = await res.text().catch(() => "");
  }

  return {
    status: res.status,
    headers: res.headers,
    body: resBody
  };
}

async function runReportTests() {
  console.log("=== STARTING SEPARATE REPORT DOWNLOAD TEST SUITE ===");
  await startServer();

  try {
    const timestamp = Date.now();
    const nonPremEmail = `nonprem_${timestamp}@example.com`;
    const premEmail = `premreport_${timestamp}@example.com`;

    // 1. Create Non-Premium User
    console.log("[1] Testing Non-Premium User Access (Must return 403)");
    const nonPremSignup = await request("/api/auth/signup", {
      method: "POST",
      body: { name: "Non-Prem User", email: nonPremEmail, password: "password123" }
    });
    assert.strictEqual(nonPremSignup.status, 201);
    const nonPremToken = nonPremSignup.body.token;

    const nonPremRes = await request("/api/download-report?period=daily", {
      headers: { Authorization: `Bearer ${nonPremToken}` }
    });
    assert.strictEqual(nonPremRes.status, 403, "Non-premium user must receive 403 Forbidden");
    assert.strictEqual(nonPremRes.body.success, false);
    console.log("   ✓ Non-premium user blocked with HTTP 403");

    // 2. Create Premium User
    console.log("[2] Registering Premium User and adding transactions");
    const premSignup = await request("/api/auth/signup", {
      method: "POST",
      body: { name: "Premium Report User", email: premEmail, password: "password123" }
    });
    assert.strictEqual(premSignup.status, 201);
    const premToken = premSignup.body.token;

    // Set user as premium in database
    await User.updateOne({ email: premEmail }, { $set: { isPremium: true, ispremiumuser: true } });

    // Re-login to get updated JWT token with ispremiumuser: true
    const premLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: premEmail, password: "password123" }
    });
    assert.strictEqual(premLogin.status, 200);
    const authHeader = { Authorization: `Bearer ${premLogin.body.token}` };

    // Add Expenses: 1 Income (Salary ₹60,000) and 2 Expenses (Food ₹1,500, Travel ₹3,500)
    await request("/api/expenses", {
      method: "POST",
      headers: authHeader,
      body: { amount: 60000, description: "Monthly Salary", category: "Salary" }
    });
    await request("/api/expenses", {
      method: "POST",
      headers: authHeader,
      body: { amount: 1500, description: "Supermarket Groceries", category: "Food" }
    });
    await request("/api/expenses", {
      method: "POST",
      headers: authHeader,
      body: { amount: 3500, description: "Flight booking", category: "Travel" }
    });

    console.log("   ✓ Transactions recorded for premium user");

    // 3. Test Daily Report JSON
    console.log("[3] Testing Daily Report Data & Metrics");
    const todayStr = new Date().toISOString().slice(0, 10);
    const dailyRes = await request(`/api/download-report?period=daily&date=${todayStr}`, {
      headers: authHeader
    });
    assert.strictEqual(dailyRes.status, 200);
    assert.strictEqual(dailyRes.body.success, true);
    assert.strictEqual(dailyRes.body.period, "Daily");
    assert.strictEqual(dailyRes.body.fileName, "Daily_Report.pdf");
    assert.strictEqual(dailyRes.body.metrics.totalIncome, 60000);
    assert.strictEqual(dailyRes.body.metrics.totalExpense, 5000);
    assert.strictEqual(dailyRes.body.metrics.savings, 55000);
    assert.strictEqual(dailyRes.body.transactions.length, 3);
    assert.strictEqual(dailyRes.body.user.name, "Premium Report User");
    console.log("   ✓ Daily Report JSON verified (Income: ₹60,000, Expense: ₹5,000, Savings: ₹55,000)");

    // 4. Test Weekly Report JSON
    console.log("[4] Testing Weekly Report Data");
    const weeklyRes = await request(`/api/download-report?period=weekly&date=${todayStr}`, {
      headers: authHeader
    });
    assert.strictEqual(weeklyRes.status, 200);
    assert.strictEqual(weeklyRes.body.period, "Weekly");
    assert.strictEqual(weeklyRes.body.fileName, "Weekly_Report.pdf");
    assert.strictEqual(weeklyRes.body.metrics.totalIncome, 60000);
    console.log("   ✓ Weekly Report verified (FileName: Weekly_Report.pdf)");

    // 5. Test Monthly Report JSON
    console.log("[5] Testing Monthly Report Data");
    const monthlyRes = await request(`/api/download-report?period=monthly&date=${todayStr}`, {
      headers: authHeader
    });
    assert.strictEqual(monthlyRes.status, 200);
    assert.strictEqual(monthlyRes.body.period, "Monthly");
    assert.strictEqual(monthlyRes.body.fileName, "Monthly_Report.pdf");
    console.log("   ✓ Monthly Report verified (FileName: Monthly_Report.pdf)");

    // 6. Test Yearly Report JSON
    console.log("[6] Testing Yearly Report Data");
    const yearlyRes = await request(`/api/download-report?period=yearly&date=${todayStr}`, {
      headers: authHeader
    });
    assert.strictEqual(yearlyRes.status, 200);
    assert.strictEqual(yearlyRes.body.period, "Yearly");
    assert.strictEqual(yearlyRes.body.fileName, "Yearly_Report.pdf");
    console.log("   ✓ Yearly Report verified (FileName: Yearly_Report.pdf)");

    // 7. Test PDF Downloads for All 4 Periods
    console.log("[7] Testing Separate PDF Downloads (format=pdf)");
    const periods = ["daily", "weekly", "monthly", "yearly"];
    const expectedFiles = {
      daily: "Daily_Report.pdf",
      weekly: "Weekly_Report.pdf",
      monthly: "Monthly_Report.pdf",
      yearly: "Yearly_Report.pdf"
    };

    for (const p of periods) {
      const pdfRes = await request(`/api/download-report?period=${p}&date=${todayStr}&format=pdf`, {
        headers: authHeader
      });
      assert.strictEqual(pdfRes.status, 200, `PDF request for ${p} should return 200`);
      assert.ok(
        (pdfRes.headers.get("content-type") || "").includes("application/pdf"),
        `Content-Type must be application/pdf for ${p}`
      );
      const disposition = pdfRes.headers.get("content-disposition") || "";
      assert.ok(
        disposition.includes(expectedFiles[p]),
        `Content-Disposition header must specify ${expectedFiles[p]}`
      );
      assert.ok(Buffer.isBuffer(pdfRes.body), "Response body must be binary Buffer");
      assert.ok(pdfRes.body.length > 1000, `PDF body must be valid document (>1KB). Actual: ${pdfRes.body.length}`);
      console.log(`   ✓ ${expectedFiles[p]} downloaded (${pdfRes.body.length} bytes, PDF valid)`);
    }

    // 7b. Test CSV Downloads for All 4 Periods
    console.log("[7b] Testing Separate CSV Downloads (format=csv)");
    const expectedCsvFiles = {
      daily: "Daily_Report.csv",
      weekly: "Weekly_Report.csv",
      monthly: "Monthly_Report.csv",
      yearly: "Yearly_Report.csv"
    };

    for (const p of periods) {
      const csvRes = await request(`/api/download-report?period=${p}&date=${todayStr}&format=csv`, {
        headers: authHeader
      });
      assert.strictEqual(csvRes.status, 200, `CSV request for ${p} should return 200`);
      assert.ok(
        (csvRes.headers.get("content-type") || "").includes("text/csv"),
        `Content-Type must be text/csv for ${p}`
      );
      const disposition = csvRes.headers.get("content-disposition") || "";
      assert.ok(
        disposition.includes(expectedCsvFiles[p]),
        `Content-Disposition header must specify ${expectedCsvFiles[p]}`
      );
      const csvText = typeof csvRes.body === "string" ? csvRes.body : csvRes.body.toString("utf8");
      assert.ok(csvText.includes("User Name"), "CSV must include User Name");
      assert.ok(csvText.includes("Total Income"), "CSV must include Total Income");
      assert.ok(csvText.includes("Total Expense"), "CSV must include Total Expense");
      assert.ok(csvText.includes("Savings"), "CSV must include Savings");
      assert.ok(csvText.includes('"Date"') && csvText.includes('"Description"') && csvText.includes('"Category"') && csvText.includes('"Amount'), "CSV must include transaction table headers");
      console.log(`   ✓ ${expectedCsvFiles[p]} downloaded (${csvText.length} chars, CSV valid)`);
    }

    // 8. Test User Expense Isolation (Only logged-in user's expenses, not other users)
    console.log("[8] Testing User Expense Isolation");
    const anotherEmail = `other_user_${timestamp}@example.com`;
    await request("/api/auth/signup", {
      method: "POST",
      body: { name: "Other User", email: anotherEmail, password: "password123" }
    });
    // Add other user expense
    await Expense.create({
      id: Date.now() + 100,
      email: anotherEmail,
      amount: 99999,
      description: "Secret other expense",
      category: "Shopping"
    });

    const isolatedRes = await request(`/api/download-report?period=daily&date=${todayStr}`, {
      headers: authHeader
    });
    const hasOtherExpense = isolatedRes.body.transactions.some(tx => tx.description.includes("Secret other expense"));
    assert.strictEqual(hasOtherExpense, false, "Report must NEVER leak other users' expenses");
    console.log("   ✓ User isolation verified: strictly contains only logged-in user transactions");

    console.log("\n========================================================");
    console.log("🎉 ALL SEPARATE REPORT DOWNLOAD REQUIREMENTS PASSED 100%!");
    console.log("========================================================\n");
  } catch (err) {
    console.error("\n❌ TEST FAILED:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await stopServer();
  }
}

runReportTests();
