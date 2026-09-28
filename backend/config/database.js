const mongoose = require("mongoose");
const dns = require("dns");

try {
  // Resolve MongoDB Atlas SRV records reliably across all ISPs/networks
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore fallback error
}

let cachedPromise = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return true;

  if (cachedPromise) {
    try {
      return await cachedPromise;
    } catch {
      cachedPromise = null;
    }
  }

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/expense-tracker';
  if (!uri) {
    throw new Error("MONGODB_URI is required.");
  }

  // if (!uri.startsWith("mongodb+srv://")) {
  //   throw new Error("MONGODB_URI must be a MongoDB Atlas SRV connection string.");
  // }

  cachedPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 4000,
    maxPoolSize: 10,
    // Do not aggressively close idle sockets. Vercel serverless instances
    // are reused and reconnecting after every short idle period makes the app slow.
    minPoolSize: 0
  }).then(() => {
    console.log("Connected to MongoDB Atlas successfully.");
    return true;
  }).catch(err => {
    cachedPromise = null;
    console.error("MongoDB Atlas connection failed:", err.message);
    throw err;
  });

  return await cachedPromise;
}

module.exports = {
  connectDB,
  get isConnected() {
    return mongoose.connection.readyState === 1;
  }
};
