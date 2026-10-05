import "dotenv/config"; // local runs take DB_USER/HOST/PASSWORD/PORT from server/.env; CI sets them directly
import pg from "pg";
import { execFileSync } from "node:child_process";

const name = process.env.TEST_DB_NAME || "dt_test";

// Creates a fresh scratch database and applies the migrations. Never touches any other database.
export default async function setup() {
  if (!name.startsWith("dt_test")) throw new Error(`Refusing to use "${name}" as a test database; the name must start with dt_test.`);

  const admin = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    database: "postgres",
  });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  execFileSync("node", ["db/migrate.js"], { env: { ...process.env, DB_NAME: name }, stdio: "pipe" });

  return async () => {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  };
}
