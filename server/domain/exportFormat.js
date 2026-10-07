// How exported data is written. Pure, so every rule can be tested without a database.

// A spreadsheet runs a cell that starts with = + - @ (or a tab or carriage return) as a formula. Page titles and URLs
// come from whatever sites were visited, so a hostile page could plant one; a leading apostrophe makes it plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell. Numbers pass through; text is made safe for spreadsheets and quoted when it needs to be. */
export function csvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A CSV line, ended with CRLF as the format asks. */
export const csvRow = (cells) => cells.map(csvCell).join(",") + "\r\n";

export const CSV_COLUMNS = ["started_at", "ended_at", "duration_seconds", "domain", "title", "url"];

/** The visit as it appears in both formats: ISO times, seconds rounded to a millisecond. */
export function exportVisit(row) {
  return {
    startedAt: row.started_at.toISOString(),
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
    durationSeconds: row.duration === null ? null : Math.round(row.duration * 1000) / 1000,
    domain: row.domain,
    title: row.title ?? "",
    url: row.url,
  };
}

export const visitCsvRow = (visit) =>
  csvRow([visit.startedAt, visit.endedAt, visit.durationSeconds, visit.domain, visit.title, visit.url]);
