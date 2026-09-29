const express = require("express");
const router = express.Router();
const passwordController = require("../controllers/passwordController");

// POST /password/forgotpassword - Send reset password email via Brevo
router.post("/forgotpassword", passwordController.forgotPassword);
router.post("/forgot-password", passwordController.forgotPassword);

// GET /password/resetpassword/:id - Render reset password HTML form if active
router.get("/resetpassword/:id", passwordController.resetPassword);

// POST /password/updatepassword/:id - Update password with bcrypt and deactivate request
router.post("/updatepassword/:id", passwordController.updatePassword);
router.post("/resetpassword/:id", passwordController.updatePassword);
router.post("/resetpassword", passwordController.updatePassword);

module.exports = router;
