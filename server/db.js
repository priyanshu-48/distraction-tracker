import pg from "pg";
import dotenv from "dotenv";
import logger from "./logger.js";
dotenv.config();

const db = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
  max: parseInt(process.env.DB_POOL_MAX) || 10,
});

// An idle client can error (e.g. Postgres restarted); log it instead of crashing.
db.on("error", (err) => logger.error({ err }, "Unexpected Postgres pool error"));

export default db;
