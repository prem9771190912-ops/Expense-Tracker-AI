const router = require("express").Router();
const controller = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

router.post("/signup", controller.register);
router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.get("/me", authMiddleware, controller.me);

module.exports = router;
