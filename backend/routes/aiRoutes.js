const router = require("express").Router();
const controller = require("../controllers/aiController");
const authMiddleware = require("../middleware/auth");

router.post("/categorize", controller.categorize);
router.get("/insight", authMiddleware.optional, controller.insight);

module.exports = router;
