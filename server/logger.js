import pino from "pino";

// Structured JSON logs. LOG_LEVEL=silent turns them off (used by the tests).
export default pino({
  level: process.env.LOG_LEVEL || "info",
  redact: ["req.headers.authorization", "req.headers.cookie"],
});
