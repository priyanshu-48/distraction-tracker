import "dotenv/config";
import logger from "./logger.js";

if (!process.env.JWT_SECRET) {
  logger.fatal("JWT_SECRET is not set; refusing to start.");
  process.exit(1);
}

const { default: app } = await import("./app.js");
const { startErasureRetries } = await import("./notifications/erasure.js");
const { startScheduler } = await import("./notifications/scheduler.js");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  // Erasure requests for the notification service that could not be completed earlier (it was asleep, the server restarted).
  startErasureRetries();
  // The Monday weekly summary and streak milestones, which no upload triggers.
  startScheduler();
});
