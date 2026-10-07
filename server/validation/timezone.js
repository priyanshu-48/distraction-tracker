import db from "../db.js";
import logger from "../logger.js";

// Names browsers still report that newer tz databases (such as Debian's postgres image) no longer
// carry. Postgres is asked first, so a database that knows the old name uses it unchanged.
const LEGACY_ALIASES = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Dacca": "Asia/Dhaka",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Godthab": "America/Nuuk",
};

// The tz database does not change while the server runs, so each answer is looked up once.
const verdicts = new Map();

export function clearTimeZoneCache() {
  verdicts.clear();
}

async function postgresKnows(name) {
  if (!verdicts.has(name)) {
    const { rowCount } = await db.query("SELECT 1 FROM pg_timezone_names WHERE name = $1", [name]);
    verdicts.set(name, rowCount > 0);
  }
  return verdicts.get(name);
}

/**
 * IANA zone from ?tz= that Postgres can actually use, else UTC. A real but unknown zone is logged,
 * because it means that user's "today" quietly follows UTC instead of their own midnight.
 */
export async function getTimeZone(req) {
  return resolveTimeZone(req.query.tz);
}

/** The same rules for a zone name that did not come from ?tz= (for example one a user saved in Settings). */
export async function resolveTimeZone(tz) {
  if (typeof tz !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    return "UTC";
  }
  for (const candidate of [tz, LEGACY_ALIASES[tz]]) {
    if (candidate && (await postgresKnows(candidate))) return candidate;
  }
  logger.warn({ tz }, "time zone is not known to Postgres; falling back to UTC");
  return "UTC";
}
