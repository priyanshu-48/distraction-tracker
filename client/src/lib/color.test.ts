import { describe, expect, it } from "vitest";
import { contrastRatio } from "./color";

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#ff7c50", "#101123")).toBeCloseTo(contrastRatio("#101123", "#ff7c50"), 10);
  });

  // The design decisions behind the palette (see index.css): these must keep holding.
  it("keeps body text readable on cards (>= 4.5)", () => {
    expect(contrastRatio("#fcffff", "#28293b")).toBeGreaterThan(4.5);
    expect(contrastRatio("#9b9cae", "#28293b")).toBeGreaterThan(4.5);
    expect(contrastRatio("#9b9cae", "#101123")).toBeGreaterThan(4.5);
  });

  it("needs dark text on the coral button, not white", () => {
    expect(contrastRatio("#101123", "#ff7c50")).toBeGreaterThan(4.5);
    expect(contrastRatio("#fcffff", "#ff7c50")).toBeLessThan(4.5);
  });

  it("keeps every accent readable as text on cards", () => {
    for (const accent of ["#ff7c50", "#47d1dc", "#be78ce", "#6ad591", "#e286c9"]) {
      expect(contrastRatio(accent, "#28293b")).toBeGreaterThan(4.5);
    }
  });
});
