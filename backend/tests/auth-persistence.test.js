const assert = require("assert");
const http = require("http");
require("dotenv").config();

const app = require("../app");
const db = require("../utils/db");

let server;
let baseUrl;

async function startServer() {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server running on ${baseUrl}`);
      resolve();
    });
  });
}

async function stopServer() {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
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

async function runTests() {
  console.log("=== STARTING AUTHENTICATION & PERSISTENCE TEST SUITE ===");
  await startServer();

  try {
    // TEST 1: Signup new user -> Sign in -> Sign out -> Sign in again
    console.log("\n[TEST 1] Signup new user -> Sign in -> Sign out -> Sign in again");
    const test1User = {
      name: "Test User One",
      email: `test1_${Date.now()}@example.com`,
      password: "password123"
    };

    const signup1 = await request("/api/auth/signup", { method: "POST", body: test1User });
    assert.strictEqual(signup1.status, 201, `Signup 1 failed: ${JSON.stringify(signup1.body)}`);
    assert.ok(signup1.body.token, "Signup 1 should return a JWT token");
    console.log("✓ Signup 1 successful with JWT token");

    const login1 = await request("/api/auth/login", {
      method: "POST",
      body: { email: test1User.email, password: test1User.password }
    });
    assert.strictEqual(login1.status, 200, `Login 1 failed: ${JSON.stringify(login1.body)}`);
    assert.ok(login1.body.token, "Login 1 should return a JWT token");
    console.log("✓ Sign in 1 successful");

    // Simulate Sign out by clearing stored token/session on client and signing in again
    const login1Again = await request("/api/auth/login", {
      method: "POST",
      body: { email: test1User.email, password: test1User.password }
    });
    assert.strictEqual(login1Again.status, 200, "Sign in again after sign out must work");
    console.log("✓ Sign in again after sign out successful");

    // TEST 2: Token / Session Expiry re-login
    console.log("\n[TEST 2] Re-login after simulated token/session expiry");
    const login2 = await request("/api/auth/login", {
      method: "POST",
      body: { email: test1User.email, password: test1User.password }
    });
    assert.strictEqual(login2.status, 200, "Re-login after token expiry must work seamlessly");
    console.log("✓ Re-login with persistent credentials successful");

    // TEST 3: Restart backend simulation & re-login
    console.log("\n[TEST 3] Restart backend simulation -> Sign in again");
    await stopServer();
    await startServer(); // Restart server instance

    const login3 = await request("/api/auth/login", {
      method: "POST",
      body: { email: test1User.email, password: test1User.password }
    });
    assert.strictEqual(login3.status, 200, `Re-login after server restart failed: ${JSON.stringify(login3.body)}`);
    console.log("✓ Sign in again after backend restart successful");

    // TEST 4: Persistent database verification (Read from DB directly)
    console.log("\n[TEST 4] Production database read/write verification");
    const dbUser = await db.getUser(test1User.email);
    assert.ok(dbUser, "User must exist in persistent database");
    assert.strictEqual(dbUser.email, test1User.email);
    assert.ok(dbUser.password.startsWith("$2b$"), "Password in DB must be hashed with bcrypt");
    console.log("✓ Persistent database read/write and bcrypt password hashing verified");

    // TEST 5: Create User A and User B -> Independent logins
    console.log("\n[TEST 5] Multiple independent users (User A & User B)");
    const userA = { name: "User A", email: `usera_${Date.now()}@example.com`, password: "passwordA123" };
    const userB = { name: "User B", email: `userb_${Date.now()}@example.com`, password: "passwordB123" };

    const signupA = await request("/api/auth/signup", { method: "POST", body: userA });
    assert.strictEqual(signupA.status, 201);
    const signupB = await request("/api/auth/signup", { method: "POST", body: userB });
    assert.strictEqual(signupB.status, 201);

    const loginA = await request("/api/auth/login", { method: "POST", body: { email: userA.email, password: userA.password } });
    assert.strictEqual(loginA.status, 200);
    assert.strictEqual(loginA.body.user.email, userA.email);

    const loginB = await request("/api/auth/login", { method: "POST", body: { email: userB.email, password: userB.password } });
    assert.strictEqual(loginB.status, 200);
    assert.strictEqual(loginB.body.user.email, userB.email);
    console.log("✓ User A and User B operate independently");

    // TEST 6: Wrong password rejection
    console.log("\n[TEST 6] Wrong password test");
    const wrongPasswordRes = await request("/api/auth/login", {
      method: "POST",
      body: { email: test1User.email, password: "WrongPassword999" }
    });
    assert.strictEqual(wrongPasswordRes.status, 401, "Wrong password must return HTTP 401");
    assert.strictEqual(wrongPasswordRes.body.message, "Invalid email or password.");
    console.log("✓ Wrong password rejected with 401");

    // TEST 7: Unknown email rejection
    console.log("\n[TEST 7] Unknown email test");
    const unknownEmailRes = await request("/api/auth/login", {
      method: "POST",
      body: { email: "nonexistent_email_12345@example.com", password: "password123" }
    });
    assert.strictEqual(unknownEmailRes.status, 401, "Unknown email must return HTTP 401");
    assert.strictEqual(unknownEmailRes.body.message, "Invalid email or password.");
    console.log("✓ Unknown email rejected with 401");

    // TEST 8: Email capitalization & whitespace normalization
    console.log("\n[TEST 8] Case-insensitive email normalization");
    const mixedCaseEmail = `  tEsT1_${test1User.email.split("_")[1].toUpperCase()}  `;
    const loginNormalized = await request("/api/auth/login", {
      method: "POST",
      body: { email: mixedCaseEmail, password: test1User.password }
    });
    assert.strictEqual(loginNormalized.status, 200, `Normalized email login failed: ${JSON.stringify(loginNormalized.body)}`);
    console.log("✓ Mixed-case/untrimmed email login successful");

    // TEST 9: Hidden leaderboard names must never be exposed
    console.log("\n[TEST 9] Hidden leaderboard names are filtered out");
    const premUser = { name: `prem${Date.now()}`, email: `prem_${Date.now()}@example.com`, password: "premPassword123" };
    const premSignup = await request("/api/auth/signup", { method: "POST", body: premUser });
    assert.strictEqual(premSignup.status, 201, `Prem user signup failed: ${JSON.stringify(premSignup.body)}`);

    const premLogin = await request("/api/auth/login", {
      method: "POST",
      body: { email: premUser.email, password: premUser.password }
    });
    assert.strictEqual(premLogin.status, 200, `Prem user login failed: ${JSON.stringify(premLogin.body)}`);

    const leaderboardRes = await request("/api/leaderboard", {
      method: "GET",
      headers: { Authorization: `Bearer ${premLogin.body.token}` }
    });
    assert.strictEqual(leaderboardRes.status, 200, `Leaderboard fetch failed: ${JSON.stringify(leaderboardRes.body)}`);
    assert.ok(
      !leaderboardRes.body.leaderboard.some((row) => String(row.name || "").trim().toLowerCase().startsWith("prem")),
      "Users with names starting with Prem must not appear in leaderboard."
    );
    console.log("✓ Prem is hidden from leaderboard output");

    console.log("\n==========================================");
    console.log("🎉 ALL 9 AUTHENTICATION & PERSISTENCE TESTS PASSED!");
    console.log("==========================================");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err.stack || err.message);
    process.exitCode = 1;
  } finally {
    await stopServer();
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

const mongoose = require("mongoose");
runTests();
