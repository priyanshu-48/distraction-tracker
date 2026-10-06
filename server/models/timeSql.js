// SQL fragments for "a local day". `date` is a plain calendar date; the day runs from local midnight to the next
// local midnight in `tz`. Both arguments are SQL expressions (usually parameters such as "$2"), never user text.
export const dayStart = (date, tz) => `(${date}::date::timestamp AT TIME ZONE ${tz}::text)`;
export const dayEnd = (date, tz) => `((${date}::date + 1)::timestamp AT TIME ZONE ${tz}::text)`;
