const assert = require("assert");
const http = require("http");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = require("../app");
const Order = require("../models/Order");
const User = require("../models/User");
const db = require("../utils/db");

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

function parseJwt(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
}

async function runCashfreeTests() {
  console.log("=== STARTING CASHFREE PREMIUM MEMBERSHIP INTEGRATION TESTS ===");
  await startServer();

  try {
    // ------------------------------------------------------------------------
    // Test 1: User Signup & Initial Status
    // ------------------------------------------------------------------------
    const userEmail = `cashfree_test_${Date.now()}@example.com`;
    console.log(`[1] Registering test user: ${userEmail}`);
    const signupRes = await request("/api/auth/signup", {
      method: "POST",
      body: { name: "Cashfree Tester", email: userEmail, password: "password123" }
    });
    assert.strictEqual(signupRes.status, 201, "Signup should return HTTP 201");
    let token = signupRes.body.token;
    assert.ok(token, "Signup must return JWT token");

    let decoded = parseJwt(token);
    assert.strictEqual(decoded.ispremiumuser, false, "Initial user should not be premium");
    console.log("   ✓ User registered with ispremiumuser: false");

    // ------------------------------------------------------------------------
    // Test 2: POST /purchase/premium - Create Cashfree Order
    // ------------------------------------------------------------------------
    console.log("[2] Testing POST /purchase/premium without authentication (Should fail 401)");
    const unauthOrder = await request("/purchase/premium", {
      method: "POST",
      body: { amount: 199 }
    });
    assert.strictEqual(unauthOrder.status, 401, "Unauthenticated order creation should return 401");
    console.log("   ✓ Unauthenticated access blocked (HTTP 401)");

    console.log("[3] Testing POST /purchase/premium with JWT auth");
    const createOrderRes = await request("/purchase/premium", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: { amount: 199 }
    });
    assert.strictEqual(createOrderRes.status, 201, "Order creation should return HTTP 201");
    assert.strictEqual(createOrderRes.body.success, true, "Response should have success: true");
    assert.ok(createOrderRes.body.payment_session_id, "Response must contain payment_session_id");
    assert.ok(createOrderRes.body.order_id, "Response must contain order_id");

    const orderId = createOrderRes.body.order_id;
    const paymentSessionId = createOrderRes.body.payment_session_id;
    console.log(`   ✓ Order created successfully: orderId=${orderId}`);

    // Verify Order in MongoDB
    console.log("[4] Verifying Order record saved in MongoDB with status PENDING");
    const savedOrder = await Order.findOne({ orderId }).lean();
    assert.ok(savedOrder, "Order document must exist in MongoDB");
    assert.strictEqual(savedOrder.status, "PENDING", "Initial order status must be PENDING");
    assert.strictEqual(savedOrder.amount, 199, "Order amount must match");
    assert.strictEqual(savedOrder.paymentSessionId, paymentSessionId, "PaymentSessionId must match");
    assert.ok(savedOrder.userId, "Order must reference userId");
    assert.ok(savedOrder.createdAt, "Order must have createdAt timestamp");
    assert.ok(savedOrder.updatedAt, "Order must have updatedAt timestamp");
    console.log("   ✓ MongoDB Order document verified (PENDING, amount, timestamps, userId)");

    // ------------------------------------------------------------------------
    // Test 3: POST /purchase/update-status - Failure case
    // ------------------------------------------------------------------------
    console.log("[5] Testing POST /purchase/update-status when payment fails or drops");
    const failedOrderId = `order_failed_${Date.now()}`;
    await Order.create({
      userId: decoded.id || decoded.userId,
      orderId: failedOrderId,
      amount: 199,
      status: "PENDING",
      paymentSessionId: "session_failed_test"
    });

    const failUpdateRes = await request("/purchase/update-status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: { orderId: failedOrderId, status: "FAILED" }
    });
    assert.strictEqual(failUpdateRes.status, 400, "Failed transaction should return HTTP 400");
    assert.strictEqual(failUpdateRes.body.status, "FAILED", "Status should be FAILED");
    assert.strictEqual(failUpdateRes.body.message, "TRANSACTION FAILED", "Alert message should be 'TRANSACTION FAILED'");

    const dbFailedOrder = await Order.findOne({ orderId: failedOrderId }).lean();
    assert.strictEqual(dbFailedOrder.status, "FAILED", "MongoDB Order status must be updated to FAILED");
    console.log("   ✓ Failed payment updates status to FAILED and returns 'TRANSACTION FAILED'");

    // ------------------------------------------------------------------------
    // Test 4: POST /purchase/update-status - Success case
    // ------------------------------------------------------------------------
    console.log("[6] Testing POST /purchase/update-status for successful payment");
    const successUpdateRes = await request("/purchase/update-status", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: { orderId: orderId, testSuccess: true, status: "SUCCESSFUL" }
    });
    assert.strictEqual(successUpdateRes.status, 200, "Successful status update should return HTTP 200");
    assert.strictEqual(successUpdateRes.body.success, true, "Response should have success: true");
    assert.strictEqual(successUpdateRes.body.status, "SUCCESSFUL", "Status should be SUCCESSFUL");
    assert.strictEqual(successUpdateRes.body.message, "Transaction Successful", "Alert message should be 'Transaction Successful'");
    assert.ok(successUpdateRes.body.token, "Response must return updated JWT token");

    // Verify order in MongoDB is SUCCESSFUL
    const dbSuccessOrder = await Order.findOne({ orderId }).lean();
    assert.strictEqual(dbSuccessOrder.status, "SUCCESSFUL", "MongoDB Order status must be SUCCESSFUL");
    console.log("   ✓ MongoDB Order status updated to SUCCESSFUL");

    // Verify User in MongoDB is isPremium = true
    const userInDb = await User.findOne({ email: userEmail }).lean();
    assert.strictEqual(userInDb.isPremium, true, "User.isPremium must be true in MongoDB");
    assert.strictEqual(userInDb.ispremiumuser, true, "User.ispremiumuser must be true in MongoDB");
    console.log("   ✓ User document updated with isPremium: true");

    // Verify updated JWT token
    const updatedDecoded = parseJwt(successUpdateRes.body.token);
    assert.strictEqual(updatedDecoded.ispremiumuser, true, "New JWT token must have ispremiumuser: true");
    console.log("   ✓ Updated JWT token verified with ispremiumuser: true");

    // ------------------------------------------------------------------------
    // Test 5: Re-login retains Premium status
    // ------------------------------------------------------------------------
    console.log("[7] Testing login persistence for premium status");
    const loginRes = await request("/api/auth/login", {
      method: "POST",
      body: { email: userEmail, password: "password123" }
    });
    assert.strictEqual(loginRes.status, 200, "Login should return HTTP 200");
    const reLoginDecoded = parseJwt(loginRes.body.token);
    assert.strictEqual(reLoginDecoded.ispremiumuser, true, "Re-login must produce token with ispremiumuser: true");
    console.log("   ✓ Premium membership persists across login/sessions");

    // ------------------------------------------------------------------------
    // Test 6: Premium Member unlocks Download Report feature
    // ------------------------------------------------------------------------
    console.log("[8] Testing Premium member access to Download Report");
    const reportRes = await request("/api/download-report", {
      method: "GET",
      headers: { Authorization: `Bearer ${successUpdateRes.body.token}` }
    });
    assert.strictEqual(reportRes.status, 200, "Premium user should be allowed to download reports");
    assert.strictEqual(reportRes.body.success, true);
    console.log("   ✓ Premium member successfully authorized to download reports");

    // ------------------------------------------------------------------------
    // Test 7: Backwards Compatibility
    // ------------------------------------------------------------------------
    console.log("[9] Testing backwards compatibility for legacy endpoints");
    const legacyInit = await request("/purchase/premiummembership", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(legacyInit.status, 201, "Legacy /purchase/premiummembership should work");
    console.log("   ✓ Legacy purchase endpoint working");

    console.log("\n========================================================");
    console.log("🎉 ALL CASHFREE PREMIUM MEMBERSHIP INTEGRATION TESTS PASSED!");
    console.log("========================================================\n");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await stopServer();
    process.exit(process.exitCode || 0);
  }
}

runCashfreeTests();
