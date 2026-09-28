const path = require("path");
const dns = require("dns");
const dotenv = require("dotenv");

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config();

const app = require("./app");
const { connectDB } = require("./config/database");

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

(async () => {
	try {
		await connectDB();
	} catch (error) {
		console.error(`Database startup warning: ${error.message}`);
	}

	app.listen(PORT, HOST, () => console.log(`Backend listening on ${HOST}:${PORT}`));
})();
