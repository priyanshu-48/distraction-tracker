import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import db from "../db.js";
import { http, makeUser } from "./helpers.js";
import { clearTimeZoneCache, getTimeZone } from "../validation/timezone.js";

// Independent of the SQL: find the first instant of "today" in a zone by stepping back minute by minute.
const localDate = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(ms);
function todayStart(tz) {
  const day = localDate(Date.now(), tz);
  let t = Math.floor(Date.now() / 60000) * 60000;
  while (localDate(t - 60000, tz) === day) t -= 60000;
  return t;
}
const weekday = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(ms);

const insert = (userId, startMs, seconds, domain) =>
  db.query(
    `INSERT INTO tab_activity (user_id, client_event_id, url, domain, title, started_at, ended_at, duration)
     VALUES ($1, gen_random_uuid(), $2, $3, 't', $4, $5, $6)`,
    [userId, `https://${domain}/`, domain, new Date(startMs), new Date(startMs + seconds * 1000), seconds]
  );

const get = (user, path, tz) => http().get(`/api/analytics/${path}`).query(tz ? { tz } : {}).set(user.auth).expect(200);

describe("analytics auth", () => {
  it.each(["time-spent-today", "most-visited-today", "total-switches-today", "time-spent-daily", "tab-switches-daily", "today-count", "today-session"])(
    "%s requires authentication",
    async (path) => {
      await http().get(`/api/analytics/${path}`).expect(401);
    }
  );
});

// "Today" is the user's local day: rows a minute either side of local midnight land on different days.
describe.each(["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"])("analytics in %s", (tz) => {
  const t0 = todayStart(tz);
  const nearMidnight = Date.now() < t0 + 5 * 60000; // too close to the boundary to place rows reliably
  const run = (name, fn) => it.skipIf(nearMidnight)(name, fn);

  async function seed() {
    const user = await makeUser("me");
    const other = await makeUser("other");
    await insert(user.id, t0 + 60000, 100, "a.com"); // today
    await insert(user.id, t0 + 120000, 50, "a.com"); // today
    await insert(user.id, t0 - 60000, 200, "b.com"); // yesterday (local)
    await insert(other.id, t0 + 60000, 999, "z.com"); // someone else's
    return user;
  }

  run("counts only the user's rows from the local day", async () => {
    const user = await seed();
    const top = (await get(user, "time-spent-today", tz)).body;
    expect(top).toEqual([{ domain: "a.com", total_time: 150 }]);
    expect((await get(user, "total-switches-today", tz)).body).toEqual({ total_switches: 2 });
    expect((await get(user, "most-visited-today", tz)).body).toEqual([{ domain: "a.com", visit_count: "2" }]);
  });

  run("stat block totals come from a single pass", async () => {
    const user = await seed();
    const [row] = (await get(user, "today-count", tz)).body;
    expect(row).toMatchObject({ count: "2", distraction_time: 150, most_visited_domain: "a.com" });
  });

  run("weekly charts cover Monday to Sunday and bucket by local day", async () => {
    const user = await seed();
    const days = (await get(user, "tab-switches-daily", tz)).body;
    const minutes = (await get(user, "time-spent-daily", tz)).body;
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.weekday.trim())).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(minutes).toHaveLength(7);

    const today = days.find((d) => d.weekday.trim() === weekday(t0 + 1000, tz));
    expect(Number(today.tab_switches)).toBe(2);
    expect(minutes.find((d) => d.weekday.trim() === weekday(t0 + 1000, tz)).time_spent).toBeCloseTo(150 / 60);

    // On a Monday "yesterday" falls in last week, so only 2 rows are in range.
    const mondayToday = weekday(t0 + 1000, tz) === "Monday";
    expect(days.reduce((sum, d) => sum + Number(d.tab_switches), 0)).toBe(mondayToday ? 2 : 3);
  });
});

describe("today-session", () => {
  it("sums finished sessions today and ignores a running one", async () => {
    const user = await makeUser();
    const t0 = todayStart("UTC");
    if (Date.now() < t0 + 10 * 60000) return; // too close to midnight to place sessions
    await db.query(
      "INSERT INTO tracking_sessions (user_id, start_time, end_time) VALUES ($1, $2, $3), ($1, $4, NULL)",
      [user.id, new Date(t0 + 60000), new Date(t0 + 120000), new Date(t0 + 180000)]
    );
    const [row] = (await get(user, "today-session", "UTC")).body;
    expect(row.total_time).toMatchObject({ minutes: 1 });
  });

  it("is empty for a user with no sessions", async () => {
    const user = await makeUser();
    expect((await get(user, "today-session", "UTC")).body).toEqual([{ total_time: null }]);
  });
});

describe("empty and invalid input", () => {
  it("returns zeros for a user with no data", async () => {
    const user = await makeUser();
    expect((await get(user, "total-switches-today", "UTC")).body).toEqual({ total_switches: 0 });
    expect((await get(user, "time-spent-today", "UTC")).body).toEqual([]);
    const days = (await get(user, "tab-switches-daily", "UTC")).body;
    expect(days).toHaveLength(7);
    expect(days.every((d) => Number(d.tab_switches) === 0)).toBe(true);
  });

  it("falls back to UTC for a missing or invalid tz instead of erroring", async () => {
    const user = await makeUser();
    await get(user, "total-switches-today");
    await get(user, "total-switches-today", "Not/AZone");
  });
});

describe("getTimeZone", () => {
  beforeEach(() => clearTimeZoneCache());
  afterEach(() => vi.restoreAllMocks());

  it("accepts real zones and falls back to UTC otherwise", async () => {
    expect(await getTimeZone({ query: { tz: "Asia/Kolkata" } })).toBe("Asia/Kolkata");
    expect(await getTimeZone({ query: { tz: "Not/AZone" } })).toBe("UTC");
    expect(await getTimeZone({ query: {} })).toBe("UTC");
    expect(await getTimeZone({ query: { tz: ["a", "b"] } })).toBe("UTC");
  });

  // Browsers report "Asia/Calcutta"; Postgres images built on newer tzdata only know "Asia/Kolkata".
  const postgresKnowing = (...known) =>
    vi.spyOn(db, "query").mockImplementation(async (_sql, [name]) => ({ rowCount: known.includes(name) ? 1 : 0 }));

  it("uses the name as sent when Postgres knows it", async () => {
    postgresKnowing("Asia/Calcutta", "Asia/Kolkata");
    expect(await getTimeZone({ query: { tz: "Asia/Calcutta" } })).toBe("Asia/Calcutta");
  });

  it("maps a legacy name to its current name when Postgres has dropped the old one", async () => {
    postgresKnowing("Asia/Kolkata");
    expect(await getTimeZone({ query: { tz: "Asia/Calcutta" } })).toBe("Asia/Kolkata");
    expect(await getTimeZone({ query: { tz: "Europe/Kiev" } })).toBe("UTC"); // alias target missing too
  });

  it("asks Postgres once per name", async () => {
    const spy = postgresKnowing("Asia/Kolkata");
    await getTimeZone({ query: { tz: "Asia/Kolkata" } });
    await getTimeZone({ query: { tz: "Asia/Kolkata" } });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
