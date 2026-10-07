import { describe, it, expect } from "vitest";
import { CSV_COLUMNS, csvCell, csvRow, exportVisit, visitCsvRow } from "../domain/exportFormat.js";

describe("csvCell", () => {
  it("leaves plain text and numbers as they are", () => {
    expect(csvCell("youtube.com")).toBe("youtube.com");
    expect(csvCell(90.5)).toBe("90.5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell("Top 10 - best of 2026")).toBe("Top 10 - best of 2026");
  });

  it("writes nothing for a missing value", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes text with a comma, a quote or a line break, doubling quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("one\ntwo")).toBe('"one\ntwo"');
    expect(csvCell("one\r\ntwo")).toBe('"one\r\ntwo"');
  });

  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\t=x", "\r=x"])("makes %j plain text so a spreadsheet will not run it", (value) => {
    expect(csvCell(value).replace(/^"/, "")).toMatch(/^'/);
  });

  it("does not touch a formula character that is not at the start", () => {
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("x - y")).toBe("x - y");
  });

  it("neutralises and quotes a hostile title in one go", () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
  });

  it("does not change a number that happens to be negative (only text is a formula risk)", () => {
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("csvRow and the visit line", () => {
  it("joins cells with commas and ends with CRLF", () => {
    expect(csvRow(["a", 1, null, "b,c"])).toBe('a,1,,"b,c"\r\n');
  });

  it("has the columns the header names, in order", () => {
    const visit = exportVisit({
      started_at: new Date("2026-03-09T10:00:00Z"),
      ended_at: new Date("2026-03-09T10:01:30.5Z"),
      duration: 90.5,
      domain: "a.com",
      title: "T",
      url: "https://a.com/",
    });
    expect(csvRow(CSV_COLUMNS)).toBe("started_at,ended_at,duration_seconds,domain,title,url\r\n");
    expect(visitCsvRow(visit)).toBe("2026-03-09T10:00:00.000Z,2026-03-09T10:01:30.500Z,90.5,a.com,T,https://a.com/\r\n");
  });
});

describe("exportVisit", () => {
  const base = { started_at: new Date("2026-03-09T10:00:00Z"), domain: "a.com", url: "https://a.com/" };

  it("handles a visit that never ended, with no title", () => {
    expect(exportVisit({ ...base, ended_at: null, duration: null, title: null })).toEqual({
      startedAt: "2026-03-09T10:00:00.000Z",
      endedAt: null,
      durationSeconds: null,
      domain: "a.com",
      title: "",
      url: "https://a.com/",
    });
  });

  it("rounds the duration to a millisecond", () => {
    expect(exportVisit({ ...base, ended_at: new Date(), duration: 12.34567, title: "" }).durationSeconds).toBe(12.346);
  });
});
