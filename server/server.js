import "dotenv/config";
import logger from "./logger.js";

if (!process.env.JWT_SECRET) {
  logger.fatal("JWT_SECRET is not set; refusing to start.");
  process.exit(1);
}

const { default: app } = await import("./app.js");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
