import { afterAll, beforeEach } from "vitest";
import db from "../db.js";

// Last line of defence: every test file talks to the scratch database or to nothing.
if (!process.env.DB_NAME?.startsWith("dt_test")) {
  throw new Error(`Tests must run against a dt_test* database, got "${process.env.DB_NAME}".`);
}

beforeEach(async () => {
  // pending_erasures deliberately has no foreign key to users (the user is usually already gone), so CASCADE does not reach it.
  await db.query("TRUNCATE users, pending_erasures RESTART IDENTITY CASCADE");
});

afterAll(async () => {
  await db.end();
});
