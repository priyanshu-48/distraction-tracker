import { describe, it, expect } from "vitest";
import {
  BINGE_MIN_AVG_SECONDS,
  CHECKING_MAX_AVG_SECONDS,
  CHECKING_MIN_VISITS,
  normalizeDomain,
  siteType,
} from "../domain/sites.js";

describe("normalizeDomain", () => {
  it.each([
    ["youtube.com", "youtube.com"],
    ["WWW.YouTube.com", "youtube.com"],
    ["  reddit.com ", "reddit.com"],
    ["m.youtube.com", "m.youtube.com"],
    ["news.www.example.com", "news.www.example.com"],
    ["wwwexample.com", "wwwexample.com"],
    ["localhost", "localhost"],
  ])("%j -> %j", (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });
});

describe("siteType", () => {
  it("has no label for a site with no visits", () => {
    expect(siteType(0, 0)).toBeNull();
  });

  it("labels many short visits as a checking habit", () => {
    expect(siteType(CHECKING_MIN_VISITS, CHECKING_MIN_VISITS * 30)).toBe("checking");
  });

  it("needs enough visits to be a habit", () => {
    expect(siteType(CHECKING_MIN_VISITS - 1, (CHECKING_MIN_VISITS - 1) * 30)).toBeNull();
  });

  it("treats an average of exactly the checking limit as not short enough", () => {
    expect(siteType(10, 10 * CHECKING_MAX_AVG_SECONDS)).toBeNull();
    expect(siteType(10, 10 * (CHECKING_MAX_AVG_SECONDS - 1))).toBe("checking");
  });

  it("labels long visits as a binge, even with few visits", () => {
    expect(siteType(2, 2 * (BINGE_MIN_AVG_SECONDS + 1))).toBe("binge");
    expect(siteType(1, BINGE_MIN_AVG_SECONDS + 1)).toBe("binge");
  });

  it("treats an average of exactly the binge limit as not a binge", () => {
    expect(siteType(3, 3 * BINGE_MIN_AVG_SECONDS)).toBeNull();
  });

  it("leaves ordinary visits unlabelled", () => {
    expect(siteType(5, 5 * 300)).toBeNull();
  });
});
