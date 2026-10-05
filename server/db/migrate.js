import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import db from "../db.js";

// Applies db/migrations/*.sql in filename order, once each, each in a transaction.
const dir = fileURLToPath(new URL("./migrations/", import.meta.url));
const client = await db.connect();

try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  );
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    try {
      await client.query("BEGIN");
      await client.query(readFileSync(dir + file, "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
  console.log("migrations up to date");
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await db.end();
}
