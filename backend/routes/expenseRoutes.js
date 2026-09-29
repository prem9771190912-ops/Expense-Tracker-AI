const router = require("express").Router();
const controller = require("../controllers/expenseController");
const authMiddleware = require("../middleware/auth");

router.get("/leaderboard", authMiddleware.optional || authMiddleware, controller.getLeaderboard);
router.get("/showleaderboard", authMiddleware.optional || authMiddleware, controller.getLeaderboard);
router.get("/download-report", authMiddleware, controller.downloadReport);
router.get("/download", authMiddleware, controller.downloadReport);
router.get("/expense", authMiddleware, controller.getExpenses);
router.get("/", authMiddleware, controller.getExpenses);
router.post("/", authMiddleware, controller.createExpense);
router.delete("/:id", authMiddleware, controller.deleteExpense);

module.exports = router;
