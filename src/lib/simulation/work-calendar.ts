import { calendarShutdowns } from "@/lib/annual-shutdowns";
import { DAY_MS, isoFromDay } from "@/lib/calendar-date";
import { ontarioStatutoryHolidays } from "@/lib/ontario-holidays";
import { calendarDateDay, normalizeScheduleCalendar } from "@/lib/schedule-calendar";
import type { ScheduleCalendar } from "@/types/workflow";

export { isoFromDay };
export const dayOf = (date: string) => calendarDateDay(date);

/**
 * Working-day test for a calendar set up like the L4 Calendar: the Friday to
 * Sunday weekend of a Monday–Thursday week, Ontario stats (with overrides)
 * and summer/winter shutdowns. Without a calendar every day is a working day.
 */
export function workingDayTest(calendar?: ScheduleCalendar) {
  const normalized = calendar
    ? normalizeScheduleCalendar({ ...calendar, startDate: calendar.startDate || "2000-01-01" })
    : undefined;
  const offByYear = new Map<number, Set<number>>();
  const offDays = (year: number) => {
    const cached = offByYear.get(year);
    if (cached) return cached;
    const off = new Set<number>();
    if (normalized) {
      for (const period of calendarShutdowns(normalized, year, year)) {
        const start = calendarDateDay(period.startDate),
          end = calendarDateDay(period.endDate);
        if (start === null || end === null) continue;
        for (let day = start; day <= end; day += 1) off.add(day);
      }
      if (normalized.holidayRegion === "CA-ON") {
        for (const holiday of ontarioStatutoryHolidays(year)) {
          const override = normalized.holidayOverrides?.[holiday.id];
          if (override === null) continue;
          const day = calendarDateDay(override ?? holiday.date);
          if (day !== null) off.add(day);
        }
      }
    }
    offByYear.set(year, off);
    return off;
  };
  const shortWeek = normalized?.workWeek === "mon-thu";
  const isWorking = (day: number) => {
    const date = new Date(day * DAY_MS);
    if (shortWeek && [5, 6, 0].includes(date.getUTCDay())) return false;
    const year = date.getUTCFullYear();
    // A winter shutdown starts in one year and ends in the next.
    return !offDays(year).has(day) && !offDays(year - 1).has(day);
  };
  return { isWorking, workingDaysPerWeek: shortWeek ? 4 : 7 };
}
