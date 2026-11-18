import { calendarShutdowns } from "@/lib/annual-shutdowns";
import { DAY_MS, isoFromDay } from "@/lib/calendar-date";
import { ontarioStatutoryHolidays } from "@/lib/ontario-holidays";
import {
  calendarDateDay,
  normalizeScheduleCalendar,
  type DayOffKind,
} from "@/lib/schedule-calendar";
import type { ScheduleCalendar } from "@/types/workflow";

export { isoFromDay };
export const dayOf = (date: string) => calendarDateDay(date);

/** A day the factory does not work, with its Calendar day-off type. */
export type DayClosure = { kind: DayOffKind; label: string };

const DAY_OFF_TYPE: Record<DayOffKind, string> = {
  weekend: "Weekend",
  statutory: "Stat holiday",
  shutdown: "Shutdown",
};
/** Tag text for a closed day, e.g. "Stat holiday · Thanksgiving". */
export function closureTag(closure: DayClosure | undefined) {
  if (!closure) return "Day off";
  const type = DAY_OFF_TYPE[closure.kind];
  return closure.label === type ? type : `${type} · ${closure.label}`;
}

/**
 * Working-day test for a calendar set up like the L4 Calendar: the Friday to
 * Sunday weekend of a Monday–Thursday week, Ontario stats (with overrides)
 * and summer/winter shutdowns. Without a calendar every day is a working day.
 */
export function workingDayTest(calendar?: ScheduleCalendar) {
  const normalized = calendar
    ? normalizeScheduleCalendar({ ...calendar, startDate: calendar.startDate || "2000-01-01" })
    : undefined;
  const offByYear = new Map<number, Map<number, DayClosure>>();
  const offDays = (year: number) => {
    const cached = offByYear.get(year);
    if (cached) return cached;
    const off = new Map<number, DayClosure>();
    if (normalized) {
      for (const period of calendarShutdowns(normalized, year, year)) {
        const start = calendarDateDay(period.startDate),
          end = calendarDateDay(period.endDate);
        if (start === null || end === null) continue;
        const label = period.kind === "winter" ? "Winter shutdown" : "Summer shutdown";
        for (let day = start; day <= end; day += 1) off.set(day, { kind: "shutdown", label });
      }
      if (normalized.holidayRegion === "CA-ON") {
        for (const holiday of ontarioStatutoryHolidays(year)) {
          const override = normalized.holidayOverrides?.[holiday.id];
          if (override === null) continue;
          const day = calendarDateDay(override ?? holiday.date);
          // A shutdown wins over a stat that falls inside it.
          if (day !== null && !off.has(day))
            off.set(day, { kind: "statutory", label: holiday.name });
        }
      }
    }
    offByYear.set(year, off);
    return off;
  };
  const shortWeek = normalized?.workWeek === "mon-thu";
  /** Why the factory is closed on `day` (shutdown, then stat, then weekend), or undefined. */
  const closure = (day: number): DayClosure | undefined => {
    const date = new Date(day * DAY_MS);
    const year = date.getUTCFullYear();
    // A winter shutdown starts in one year and ends in the next.
    const off = offDays(year).get(day) ?? offDays(year - 1).get(day);
    if (off) return off;
    if (shortWeek && [5, 6, 0].includes(date.getUTCDay()))
      return { kind: "weekend", label: "Weekend" };
    return undefined;
  };
  const isWorking = (day: number) => !closure(day);
  return { isWorking, closure, workingDaysPerWeek: shortWeek ? 4 : 7 };
}
