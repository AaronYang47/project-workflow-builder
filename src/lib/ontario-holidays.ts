export type StatutoryHoliday = { id: string; name: string; date: string };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const nthMonday = (year: number, month: number, nth: number) => {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return iso(
    new Date(Date.UTC(year, month - 1, 1 + ((8 - first.getUTCDay()) % 7) + (nth - 1) * 7)),
  );
};

/** Ontario ESA's nine holidays, using statutory dates, not assumed company
 * substitute days. Canada Day moves to July 2 when July 1 is a Sunday.
 * Sources: ontario.ca/document/your-guide-employment-standards-act-0/public-holidays
 * and Ontario Newsroom's Canada Day guidance (federal Holidays Act).
 * Company substitute days are editable through calendar.holidayOverrides. */
export function ontarioStatutoryHolidays(year: number): StatutoryHoliday[] {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) return [];
  // Gregorian computus gives Easter Sunday; Good Friday is two days earlier.
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const victoria = new Date(Date.UTC(year, 4, 24));
  victoria.setUTCDate(24 - ((victoria.getUTCDay() + 6) % 7));
  const canada = new Date(Date.UTC(year, 6, 1));
  if (canada.getUTCDay() === 0) canada.setUTCDate(2);
  const entries = [
    ["new-year", "New Year's Day", `${year}-01-01`],
    ["family", "Family Day", nthMonday(year, 2, 3)],
    ["good-friday", "Good Friday", iso(new Date(Date.UTC(year, easterMonth - 1, easterDay - 2)))],
    ["victoria", "Victoria Day", iso(victoria)],
    ["canada", "Canada Day", iso(canada)],
    ["labour", "Labour Day", nthMonday(year, 9, 1)],
    ["thanksgiving", "Thanksgiving Day", nthMonday(year, 10, 2)],
    ["christmas", "Christmas Day", `${year}-12-25`],
    ["boxing", "Boxing Day", `${year}-12-26`],
  ];
  return entries.map(([id, name, date]) => ({ id: `on-${year}-${id}`, name, date }));
}
