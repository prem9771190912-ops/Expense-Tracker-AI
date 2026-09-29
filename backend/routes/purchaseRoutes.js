const express = require("express");
const router = express.Router();
const purchaseController = require("../controllers/purchaseController");
const authMiddleware = require("../middleware/auth");

// ============================================================================
// CASHFREE PAYMENT GATEWAY ROUTES
// ============================================================================

// 1. POST /purchase/premium - Verify JWT user, create Cashfree order, return payment_session_id & order_id
router.post("/premium", authMiddleware, purchaseController.createPremiumOrder);

// 2. POST /purchase/update-status - Verify payment via cashfree.PGOrderFetchPayments(orderId) & update isPremium
router.post("/update-status", authMiddleware, purchaseController.updatePaymentStatus);

// ============================================================================
// BACKWARDS-COMPATIBILITY ROUTES
// ============================================================================
router.get("/premiummembership", authMiddleware, purchaseController.purchasePremium);
router.post("/premiummembership", authMiddleware, purchaseController.createPremiumOrder);
router.post("/updatetransactionstatus", authMiddleware, purchaseController.updateTransactionStatus);

module.exports = router;
