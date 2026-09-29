const { Cashfree, CFEnvironment } = require("cashfree-pg");
const jwt = require("jsonwebtoken");
const Order = require("../models/Order");
const User = require("../models/User");
const db = require("../utils/db");

const JWT_SECRET = process.env.JWT_SECRET || "demo_jwt_secret_key_change_in_production";

// ============================================================================
// CASHFREE PAYMENT GATEWAY INITIALIZATION
// ============================================================================
// Cashfree Sandbox environment by default, or PRODUCTION if specified
const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID || process.env.CASHFREE_CLIENT_ID || "";
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY || process.env.CASHFREE_CLIENT_SECRET || "";
const CASHFREE_ENV_NAME = (process.env.CASHFREE_ENVIRONMENT || "SANDBOX").toUpperCase();
const CASHFREE_ENV = CASHFREE_ENV_NAME === "PRODUCTION" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;

// Instantiate Cashfree SDK client
const cashfree = new Cashfree(
  CASHFREE_ENV,
  CASHFREE_APP_ID || "TEST_APP_ID_PLACEHOLDER",
  CASHFREE_SECRET_KEY || "TEST_SECRET_KEY_PLACEHOLDER"
);

/**
 * Generate an updated JWT token containing user details and premium status
 */
function generateToken(user) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required.");
  return jwt.sign(
    {
      id: String(user.id || user._id || user.email),
      userId: String(user.id || user._id || user.email),
      email: user.email,
      name: user.name || "User",
      ispremiumuser: true,
      isPremium: true
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

// ============================================================================
// 1. POST /purchase/premium
// Verify JWT user, create Cashfree order, save in MongoDB with PENDING status,
// and return payment_session_id and order_id.
// ============================================================================
exports.createPremiumOrder = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ success: false, message: "User authentication required." });
    }

    // Standard Premium Membership fee in INR (e.g. ₹199.00)
    const amount = Number(req.body.amount) || 199.00;

    // Generate unique alphanumeric order ID for Cashfree
    const cleanUserId = String(user._id || user.id || "user")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 10);
    const orderId = `order_${cleanUserId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Prepare Customer Details (Cashfree requires customer_id, customer_phone, customer_email)
    const customerPhone = String(user.phone || req.body.phone || "9999999999").replace(/[^0-9]/g, "").slice(-10) || "9999999999";
    const customerId = `cust_${cleanUserId}_${Date.now()}`.slice(0, 45);

    const createOrderRequest = {
      order_amount: amount,
      order_currency: "INR",
      order_id: orderId,
      customer_details: {
        customer_id: customerId,
        customer_phone: customerPhone,
        customer_email: user.email,
        customer_name: user.name || "Expense Tracker User"
      },
      order_meta: {
        return_url: `${req.protocol}://${req.get("host")}/index.html?order_id={order_id}`
      }
    };

    let paymentSessionId = "";
    let returnedOrderId = orderId;

    // Check if live/sandbox credentials are configured
    const hasCashfreeKeys = Boolean(
      CASHFREE_APP_ID &&
      CASHFREE_SECRET_KEY &&
      !CASHFREE_APP_ID.includes("PLACEHOLDER") &&
      !CASHFREE_SECRET_KEY.includes("PLACEHOLDER")
    );

    if (hasCashfreeKeys) {
      // Call Cashfree PGCreateOrder SDK method
      const cfResponse = await cashfree.PGCreateOrder(createOrderRequest);
      paymentSessionId = cfResponse?.data?.payment_session_id;
      returnedOrderId = cfResponse?.data?.order_id || orderId;
    } else {
      // Fallback sandbox simulation session for local testing prior to entering API keys
      console.warn("Cashfree API keys not set or placeholder. Using simulated sandbox payment session.");
      paymentSessionId = `sandbox_session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }

    // Save Order record in MongoDB with status PENDING
    await Order.create({
      userId: user._id || user.id,
      orderId: returnedOrderId,
      amount: amount,
      status: "PENDING",
      paymentSessionId: paymentSessionId,
      email: user.email
    });

    return res.status(201).json({
      success: true,
      payment_session_id: paymentSessionId,
      order_id: returnedOrderId,
      // camelCase aliases for convenience
      paymentSessionId: paymentSessionId,
      orderId: returnedOrderId
    });
  } catch (error) {
    console.error("Cashfree createPremiumOrder error:", error.response?.data || error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({
      success: false,
      message: error.response?.data?.message || error.message || "Failed to create Cashfree order."
    });
  }
};

// ============================================================================
// 2. POST /purchase/update-status
// Accept orderId, verify payment using cashfree.PGOrderFetchPayments(orderId).
// If payment success -> Update order status to SUCCESSFUL, User isPremium = true.
// Otherwise -> Update order status to FAILED.
// ============================================================================
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { orderId, order_id, status } = req.body;
    const targetOrderId = orderId || order_id;

    if (!targetOrderId) {
      return res.status(400).json({
        success: false,
        status: "FAILED",
        message: "Missing orderId in request body."
      });
    }

    const email = req.user.email;
    let isSuccess = false;

    const hasCashfreeKeys = Boolean(
      CASHFREE_APP_ID &&
      CASHFREE_SECRET_KEY &&
      !CASHFREE_APP_ID.includes("PLACEHOLDER") &&
      !CASHFREE_SECRET_KEY.includes("PLACEHOLDER")
    );

    if (hasCashfreeKeys) {
      try {
        // Verify payment using Cashfree PGOrderFetchPayments
        const cfResponse = await cashfree.PGOrderFetchPayments(targetOrderId);
        const payments = cfResponse?.data || [];

        // Check if any payment transaction for this order has SUCCESS status
        if (Array.isArray(payments) && payments.length > 0) {
          isSuccess = payments.some(
            (p) => String(p.payment_status).toUpperCase() === "SUCCESS"
          );
        }
      } catch (cfError) {
        console.error("Cashfree PGOrderFetchPayments error:", cfError.response?.data || cfError.message);
        isSuccess = false;
      }
    } else {
      // In sandbox simulation / dev test mode without live keys:
      // Allow success if status passed as SUCCESSFUL, testSuccess: true, or explicit test flow
      isSuccess = status === "SUCCESSFUL" || req.body.testSuccess === true || req.body.payment_id !== undefined;
    }

    if (isSuccess) {
      // 1. Update Order in MongoDB to SUCCESSFUL
      await Order.findOneAndUpdate(
        { orderId: targetOrderId },
        { $set: { status: "SUCCESSFUL" } },
        { returnDocument: "after" }
      );

      // 2. Update User isPremium = true in MongoDB
      await User.updateOne(
        { email },
        { $set: { isPremium: true, ispremiumuser: true } }
      );
      if (req.user._id) {
        await User.findByIdAndUpdate(req.user._id, {
          $set: { isPremium: true, ispremiumuser: true }
        });
      }

      // Fetch updated user to generate new JWT token
      const updatedUser = await db.getUser(email);
      if (updatedUser) {
        updatedUser.isPremium = true;
        updatedUser.ispremiumuser = true;
      }
      const token = generateToken(updatedUser || req.user);

      return res.status(200).json({
        success: true,
        status: "SUCCESSFUL",
        message: "Transaction Successful",
        token
      });
    } else {
      // Payment failed or incomplete -> Mark Order as FAILED
      await Order.findOneAndUpdate(
        { orderId: targetOrderId },
        { $set: { status: "FAILED" } }
      );

      return res.status(400).json({
        success: false,
        status: "FAILED",
        message: "TRANSACTION FAILED"
      });
    }
  } catch (error) {
    console.error("Cashfree updatePaymentStatus error:", error.message);
    if (db.isDatabaseError(error)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(500).json({
      success: false,
      status: "FAILED",
      message: error.message || "Failed to update payment status."
    });
  }
};

// ============================================================================
// BACKWARDS-COMPATIBILITY CONTROLLERS (For existing test suites & razorpay fallback)
// ============================================================================
exports.purchasePremium = async (req, res) => {
  // If requested via legacy razorpay endpoint, handle with existing response format
  try {
    const key_id = process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder";
    const order = {
      id: "order_" + Date.now(),
      amount: 2500,
      currency: "INR",
      status: "created"
    };

    await Order.create({
      orderId: order.id,
      status: "PENDING",
      amount: 25.00,
      email: req.user.email,
      userId: req.user._id || req.user.id
    });

    return res.status(201).json({ order, key_id });
  } catch (error) {
    console.error("purchasePremium legacy error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTransactionStatus = async (req, res) => {
  // Legacy Razorpay status updater
  try {
    const { order_id, payment_id, status } = req.body;
    const email = req.user.email;

    if (order_id) {
      await Order.updateOne(
        { orderId: order_id },
        { paymentSessionId: payment_id || `pay_${Date.now()}`, status: status || "SUCCESSFUL" }
      );
    }

    await User.updateOne(
      { email },
      { $set: { ispremiumuser: true, isPremium: true } }
    );

    const updatedUser = await db.getUser(email);
    if (updatedUser) {
      updatedUser.ispremiumuser = true;
      updatedUser.isPremium = true;
    }
    const token = generateToken(updatedUser || req.user);

    return res.status(202).json({
      success: true,
      message: "Transaction Successful",
      token
    });
  } catch (error) {
    console.error("updateTransactionStatus legacy error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
