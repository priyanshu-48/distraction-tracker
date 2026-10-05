// IANA zone from ?tz=, falling back to UTC when missing or not a real zone name.
export function getTimeZone(req) {
  const tz = req.query.tz;
  if (typeof tz !== "string") return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
