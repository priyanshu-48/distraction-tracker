import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db from "../db.js";
import { clearTimeZoneCache, resolveTimeZone } from "../validation/timezone.js";

// Postgres is faked here so each rule can be tested on its own, whatever tz database the test machine has.
const knows = (...names) =>
  vi.spyOn(db, "query").mockImplementation(async (_sql, [name]) => ({ rowCount: names.includes(name) ? 1 : 0 }));

beforeEach(() => clearTimeZoneCache());
afterEach(() => vi.restoreAllMocks());

describe("resolveTimeZone", () => {
  it("uses a zone Postgres knows, unchanged", async () => {
    knows("Asia/Kolkata");
    expect(await resolveTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("falls back to UTC for nothing, for a non-string and for a name that is not a time zone at all", async () => {
    const query = knows("UTC");
    for (const bad of [undefined, 5, null, "Not/AZone", ""]) expect(await resolveTimeZone(bad)).toBe("UTC");
    expect(query).not.toHaveBeenCalled(); // rejected before Postgres is asked
  });

  it("maps a legacy name browsers still send to the current one when Postgres lacks the old name", async () => {
    knows("Asia/Kolkata");
    expect(await resolveTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
  });

  it("prefers the name as sent when Postgres knows it", async () => {
    knows("Asia/Calcutta", "Asia/Kolkata");
    expect(await resolveTimeZone("Asia/Calcutta")).toBe("Asia/Calcutta");
  });

  it("falls back to UTC for a real zone Postgres does not carry", async () => {
    knows();
    expect(await resolveTimeZone("Europe/Paris")).toBe("UTC");
  });

  it("asks Postgres once per name, until the cache is cleared", async () => {
    const query = knows("Europe/Paris");
    await resolveTimeZone("Europe/Paris");
    await resolveTimeZone("Europe/Paris");
    expect(query).toHaveBeenCalledTimes(1);
    clearTimeZoneCache();
    await resolveTimeZone("Europe/Paris");
    expect(query).toHaveBeenCalledTimes(2);
  });
});
