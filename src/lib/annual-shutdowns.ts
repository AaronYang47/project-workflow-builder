import type { ScheduleCalendar, ScheduleShutdown, ShutdownOverride } from "@/types/workflow";
import { ontarioStatutoryHolidays } from "@/lib/ontario-holidays";

const DAY_MS = 86_400_000;
const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
export const CCQ_SHUTDOWN_SOURCE = "https://www.ccq.org/en/congesvacances";
// Published 2025–2029 collective agreement, summer dates through 2028:
// https://www.ccq.org/loi-r20/conventions-collectives/conventions-collectives/residentiel/section-24
const publishedSummer: Record<number, [string, string]> = {
  2025: ["2025-07-20", "2025-08-02"],
  2026: ["2026-07-19", "2026-08-01"],
  2027: ["2027-07-25", "2027-08-07"],
  2028: ["2028-07-23", "2028-08-05"],
};
export const shutdownYearKey = (kind: ScheduleShutdown["kind"], year: number) => `${kind}-${year}`;
export const isPublishedSummer = (year: number) => Boolean(publishedSummer[year]);

/** Future summers project the Sunday on/before July 25 for 14 inclusive days.
 * These are planning projections, not CCQ-confirmed dates beyond the published years.
 * Winter follows the company's final two December Mondays through January 1. */
export function defaultAnnualShutdown(kind: ScheduleShutdown["kind"], year: number): ScheduleShutdown {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new RangeError("Choose a year from 1900 to 9998.");
  let startDate: string, endDate: string;
  if (kind === "summer") {
    const july25 = Date.UTC(year, 6, 25) / DAY_MS;
    const start = july25 - new Date(july25 * DAY_MS).getUTCDay();
    [startDate, endDate] = publishedSummer[year] ?? [iso(start), iso(start + 13)];
  } else {
    const dec31 = Date.UTC(year, 11, 31) / DAY_MS;
    const lastMonday = dec31 - (new Date(dec31 * DAY_MS).getUTCDay() + 6) % 7;
    startDate = iso(lastMonday - 7);
    endDate = `${year + 1}-01-01`;
  }
  return { id: `annual-${shutdownYearKey(kind, year)}`, kind, startDate, endDate };
}

export function annualShutdownForYear(calendar: ScheduleCalendar, kind: ScheduleShutdown["kind"], year: number): ScheduleShutdown[] {
  const key = shutdownYearKey(kind, year), override = calendar.shutdownOverrides?.[key];
  if (override === null) return [];
  if (override && override !== "automatic") return [{ id: `annual-${key}`, kind, ...override }];
  if (override !== "automatic") {
    const saved = calendar.shutdowns.filter((period) => period.kind === kind && Number(period.startDate.slice(0, 4)) === year);
    if (saved.length) return saved;
  }
  return [defaultAnnualShutdown(kind, year)];
}

export function calendarShutdowns(calendar: ScheduleCalendar, firstYear: number, lastYear: number): ScheduleShutdown[] {
  if (!calendar.automaticShutdowns) return calendar.shutdowns;
  const result: ScheduleShutdown[] = [];
  for (let year = Math.max(1900, firstYear); year <= Math.min(9998, lastYear); year += 1) {
    result.push(...annualShutdownForYear(calendar, "summer", year), ...annualShutdownForYear(calendar, "winter", year));
  }
  return result;
}

/** Closed dates are inclusive; resume on the next company working day after
 * weekends, holidays, and any overlapping shutdown have all finished. */
export function shutdownResumeDate(calendar: ScheduleCalendar, period: ScheduleShutdown) {
  let day = dayOf(period.endDate) + 1;
  const closures = calendarShutdowns(calendar, Number(period.endDate.slice(0, 4)) - 1, Number(period.endDate.slice(0, 4)) + 2);
  const holidays = new Set(calendar.holidayRegion === "CA-ON" ? [0, 1, 2].flatMap((offset) => ontarioStatutoryHolidays(Number(period.endDate.slice(0, 4)) + offset))
    .flatMap((holiday) => { const date = calendar.holidayOverrides?.[holiday.id]; return date === null ? [] : [date ?? holiday.date]; }) : []);
  for (let count = 0; count < 366 * 10; count += 1, day += 1) {
    if (calendar.workWeek === "mon-thu" && [0, 5, 6].includes(new Date(day * DAY_MS).getUTCDay())) continue;
    if (holidays.has(iso(day)) || closures.some((closed) => day >= dayOf(closed.startDate) && day <= dayOf(closed.endDate))) continue;
    return iso(day);
  }
  return "";
}

export function validShutdownOverrideKey(key: string) {
  const match = /^(summer|winter)-(\d{4})$/.exec(key);
  return Boolean(match && Number(match[2]) >= 1900 && Number(match[2]) <= 9998);
}
export type { ShutdownOverride };

export function shutdownCompanyBreak(calendar: ScheduleCalendar, period: ScheduleShutdown) {
  let lastWork = dayOf(period.startDate) - 1;
  const year = Number(period.startDate.slice(0, 4));
  const closures = calendarShutdowns(calendar, year - 2, year + 1);
  const holidays = new Set(calendar.holidayRegion === "CA-ON" ? [-2, -1, 0, 1].flatMap((offset) => ontarioStatutoryHolidays(year + offset))
    .flatMap((holiday) => { const date = calendar.holidayOverrides?.[holiday.id]; return date === null ? [] : [date ?? holiday.date]; }) : []);
  for (let count = 0; count < 3660; count += 1, lastWork -= 1) {
    const weekend = calendar.workWeek === "mon-thu" && [0, 5, 6].includes(new Date(lastWork * DAY_MS).getUTCDay());
    if (weekend || holidays.has(iso(lastWork)) || closures.some((closed) => lastWork >= dayOf(closed.startDate) && lastWork <= dayOf(closed.endDate))) continue;
    const resumes = shutdownResumeDate(calendar, period);
    return { startDate: iso(lastWork + 1), endDate: resumes ? iso(dayOf(resumes) - 1) : "", resumes };
  }
  return { startDate: period.startDate, endDate: period.endDate, resumes: shutdownResumeDate(calendar, period) };
}
