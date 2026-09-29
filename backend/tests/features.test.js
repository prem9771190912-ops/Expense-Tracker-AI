const assert = require("assert");
const http = require("http");
require("dotenv").config();

const app = require("../app");
const db = require("../utils/db");
const mongoose = require("mongoose");

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
}

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = options.headers || {};
  let body = options.body;
  if (body && typeof body === "object") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: json };
}

async function runFeatureTests() {
  console.log("=== RUNNING NEW FEATURES TEST SUITE ===");
  await startServer();

  try {
    const userEmail = `feat_${Date.now()}@example.com`;
    const signup = await request("/api/auth/signup", {
      method: "POST",
      body: { name: "Feature User", email: userEmail, password: "password123" }
    });
    assert.strictEqual(signup.status, 201);
    let token = signup.body.token;

    // Check JWT payload for ispremiumuser
    const payload1 = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    assert.strictEqual(payload1.ispremiumuser, false, "New user should not be premium");
    console.log("✓ New user starts with ispremiumuser: false");

    // Non-premium user cannot view leaderboard
    const nonPremLeaderboard = await request("/api/leaderboard", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(nonPremLeaderboard.status, 403, "Non-premium user should be blocked from leaderboard");
    console.log("✓ Non-premium user blocked from leaderboard (HTTP 403)");

    // Test Razorpay purchase membership endpoint
    const purchaseInit = await request("/purchase/premiummembership", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(purchaseInit.status, 201);
    assert.ok(purchaseInit.body.order?.id, "Should return order id");
    console.log("✓ /purchase/premiummembership returns order id and key");

    // Test update transaction status
    const updateTrans = await request("/purchase/updatetransactionstatus", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: {
        order_id: purchaseInit.body.order.id,
        payment_id: "pay_test_12345",
        status: "SUCCESSFUL"
      }
    });
    assert.strictEqual(updateTrans.status, 202);
    assert.ok(updateTrans.body.token, "Should return updated JWT token");
    token = updateTrans.body.token;

    // Verify token contains ispremiumuser: true
    const payload2 = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    assert.strictEqual(payload2.ispremiumuser, true, "Updated token must contain ispremiumuser: true");
    console.log("✓ Razorpay completion updates user to premium and returns new token with ispremiumuser: true");

    // Verify user in DB survives logout / login
    const reLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: userEmail, password: "password123" }
    });
    assert.strictEqual(reLogin.status, 200);
    const loginPayload = JSON.parse(Buffer.from(reLogin.body.token.split(".")[1], "base64").toString());
    assert.strictEqual(loginPayload.ispremiumuser, true, "Re-login must produce token with ispremiumuser: true");
    console.log("✓ Premium status persists across logout and login");

    // Add expenses to test totalExpense tracking and pagination
    await request("/api/expenses", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: { amount: 150, description: "Coffee & Snacks", category: "Food" }
    });
    await request("/api/expenses", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: { amount: 350, description: "Taxi ride", category: "Travel" }
    });
    console.log("✓ Added 2 expenses");

    // Test GET /expense?page=1&limit=1
    const pagedRes = await request("/expense?page=1&limit=1", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(pagedRes.status, 200);
    assert.strictEqual(pagedRes.body.currentPage, 1);
    assert.strictEqual(pagedRes.body.hasNextPage, true);
    assert.strictEqual(pagedRes.body.nextPage, 2);
    assert.strictEqual(pagedRes.body.hasPreviousPage, false);
    assert.strictEqual(pagedRes.body.previousPage, 0);
    assert.strictEqual(pagedRes.body.lastPage, 2);
    assert.strictEqual(pagedRes.body.totalItems, 2);
    assert.strictEqual(pagedRes.body.expenses.length, 1);
    console.log("✓ Pagination format matches specification: currentPage, hasNextPage, nextPage, hasPreviousPage, previousPage, lastPage, totalItems");

    // Premium user can now view leaderboard
    const premLeaderboard = await request("/api/leaderboard", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(premLeaderboard.status, 200);
    assert.ok(Array.isArray(premLeaderboard.body.leaderboard));
    const currentUserInLeaderboard = premLeaderboard.body.leaderboard.find(u => u.name === "Feature User");
    assert.ok(currentUserInLeaderboard, "Current user should be in leaderboard");
    assert.strictEqual(currentUserInLeaderboard.totalExpense, 500, "totalExpense must be 150 + 350 = 500");
    // Ensure keys in leaderboard are only id, name, totalExpense
    const keys = Object.keys(currentUserInLeaderboard).sort();
    assert.deepStrictEqual(keys, ["id", "name", "totalExpense"].sort());
    console.log("✓ Leaderboard returns only id, name, totalExpense and uses User.totalExpense without looping expenses");

    console.log("\n==========================================");
    console.log("🎉 ALL NEW BACKEND FEATURES VERIFIED!");
    console.log("==========================================");
  } catch (err) {
    console.error("Test failed:", err.message);
    process.exitCode = 1;
  } finally {
    await stopServer();
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

runFeatureTests();
