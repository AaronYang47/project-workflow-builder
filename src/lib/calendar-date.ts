/** Date-only helpers. Days are whole UTC days since the Unix epoch, so the
 * arithmetic never depends on the viewer's time zone or daylight saving. */
export const DAY_MS = 86_400_000;

/** ISO date (YYYY-MM-DD) for a UTC day number. */
export const isoFromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** "January 2027" style month headings, always in UTC. */
export const monthYearFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
