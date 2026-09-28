const router = require("express").Router();
const controller = require("../controllers/expenseController");
const authMiddleware = require("../middleware/auth");

router.get("/leaderboard", authMiddleware, controller.getLeaderboard);
router.get("/", authMiddleware, controller.getExpenses);
router.post("/", authMiddleware, controller.createExpense);
router.delete("/:id", authMiddleware, controller.deleteExpense);

module.exports = router;
