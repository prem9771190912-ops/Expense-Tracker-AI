const jwt = require("jsonwebtoken");
const db = require("../utils/db");

const JWT_SECRET = process.env.JWT_SECRET || 'demo_jwt_secret_key_change_in_production';

module.exports = async function auth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ success: false, message: "Server configuration unavailable." });
  }
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const email = payload.email || payload.userId;
    const user = await db.getUser(email);
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    req.user = user;
    next();
  } catch (e) {
    if (db.isDatabaseError(e)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

module.exports.optional = async function optionalAuth(req, res, next) {
  if (!JWT_SECRET) return next();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const email = payload.email || payload.userId;
    req.user = await db.getUser(email);
  } catch (e) {
    if (db.isDatabaseError(e)) {
      return res.status(503).json({ success: false, message: "Database temporarily unavailable." });
    }
  }
  next();
};
