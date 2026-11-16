import type { ScheduleCalendar, ScheduleShutdown, WorkflowFile } from "@/types/workflow";
import type { buildProcessSchedule } from "@/lib/process-schedule";
import { salesHandoffTime } from "@/lib/process-schedule";
import { calendarShutdowns, validShutdownOverrideKey } from "@/lib/annual-shutdowns";
import { ontarioStatutoryHolidays } from "@/lib/ontario-holidays";

const DAY_MS = 86_400_000;
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export type CalendarPause = {
  id: string; kind: "summer" | "winter" | "statutory" | "weekend"; label: string;
  startDate: string; endDate: string; start: number; end: number;
};
export type TaskTimelineSegment = { kind: "work"; start: number; end: number } | {
  kind: "pause"; start: number; end: number; label: string; description: string; periods: CalendarPause[];
};

/** Split actual calendar time into working pieces and merged shutdown gaps. */
export function splitCalendarTask(start: number, end: number, periods: CalendarPause[]): TaskTimelineSegment[] {
  if (end <= start) return [];
  const gaps: { start: number; end: number; periods: CalendarPause[] }[] = [];
  for (const period of [...periods].sort((a, b) => a.start - b.start)) {
    const from = Math.max(start, period.start), to = Math.min(end, period.end);
    if (to <= from) continue;
    const last = gaps.at(-1);
    if (last && from <= last.end) { last.end = Math.max(last.end, to); last.periods.push(period); }
    else gaps.push({ start: from, end: to, periods: [period] });
  }
  const segments: TaskTimelineSegment[] = [];
  let cursor = start;
  for (const gap of gaps) {
    if (cursor < gap.start) segments.push({ kind: "work", start: cursor, end: gap.start });
    const shutdowns = gap.periods.filter((period) => period.kind === "summer" || period.kind === "winter");
    segments.push({ kind: "pause", ...gap,
      label: [...new Set((shutdowns.length ? shutdowns : gap.periods.some((period) => period.kind === "statutory") ? gap.periods.filter((period) => period.kind === "statutory") : gap.periods).map((period) => period.label))].join(" / "),
      description: gap.periods.map((period) => `${period.label}: ${period.startDate} - ${period.endDate}`).join("\n"),
    });
    cursor = gap.end;
  }
  if (cursor < end) segments.push({ kind: "work", start: cursor, end });
  return segments;
}

/** Day-off fills match the calendar tags (STATS OFF / SHUTDOWN / WEEKEND). */
export const DAY_OFF_COLORS = { shutdown: "#93c5fd", statutory: "#c4b5fd", weekend: "#94a3b8" } as const;
/** Text drawn on top of a DAY_OFF_COLORS fill (tags, calendar days). */
export const DAY_OFF_INK = { shutdown: "#1e3a8a", statutory: "#4c1d95", weekend: "#0f172a" } as const;
export type DayOffKind = keyof typeof DAY_OFF_COLORS;

/** Split a merged pause into pieces by kind. Each day counts once, with the
 * same precedence as the work summary: shutdown, then statutory, then weekend. */
export function pauseKindParts(pause: Extract<TaskTimelineSegment, { kind: "pause" }>) {
  const edges = [...new Set([pause.start, pause.end, ...pause.periods.flatMap((period) => [Math.max(pause.start, period.start), Math.min(pause.end, period.end)])])]
    .filter((edge) => edge >= pause.start && edge <= pause.end).sort((a, b) => a - b);
  const parts: { kind: DayOffKind; start: number; end: number }[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const from = edges[index], to = edges[index + 1];
    const covering = pause.periods.filter((period) => period.start < to && period.end > from);
    const kind: DayOffKind | undefined = covering.some((period) => period.kind === "summer" || period.kind === "winter") ? "shutdown"
      : covering.some((period) => period.kind === "statutory") ? "statutory" : covering.length ? "weekend" : undefined;
    if (!kind) continue;
    const last = parts.at(-1);
    if (last && last.kind === kind && last.end === from) last.end = to;
    else parts.push({ kind, start: from, end: to });
  }
  return parts;
}

/** Fill for one pause piece, coloured per day-off kind like its tag. */
export function pauseSegmentBackground(pause: Extract<TaskTimelineSegment, { kind: "pause" }>) {
  const span = pause.end - pause.start;
  const parts = pauseKindParts(pause);
  if (span <= 0 || !parts.length) return DAY_OFF_COLORS.weekend;
  if (parts.length === 1) return DAY_OFF_COLORS[parts[0].kind];
  return `linear-gradient(to right, ${parts.map((part) => `${DAY_OFF_COLORS[part.kind]} ${(part.start - pause.start) / span * 100}% ${(part.end - pause.start) / span * 100}%`).join(", ")})`;
}

/** Used by both the resting task bar and its live drag/resize preview. */
export function taskSegmentBackground(segments: TaskTimelineSegment[], color: string) {
  const from = segments[0]?.start ?? 0, span = (segments.at(-1)?.end ?? from) - from;
  if (span <= 0 || segments.every((segment) => segment.kind === "work")) return color;
  const stops = segments.flatMap((segment) => segment.kind === "work"
    ? [{ color, start: segment.start, end: segment.end }]
    : pauseKindParts(segment).map((part) => ({ color: DAY_OFF_COLORS[part.kind], start: part.start, end: part.end })));
  return `linear-gradient(to right, ${stops.map((stop) => `${stop.color} ${(stop.start - from) / span * 100}% ${(stop.end - from) / span * 100}%`).join(", ")})`;
}

/** Date-only arithmetic stays independent of local time zones and DST. */
export function calendarDateDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() / DAY_MS : null;
}

export function shutdownLabel(kind: ScheduleShutdown["kind"]) {
  return kind === "summer" ? "Summer shutdown" : "Winter shutdown";
}

export function normalizeScheduleCalendar(value: unknown): ScheduleCalendar | undefined {
  if (!value || typeof value !== "object") return undefined;
  const calendar = value as Partial<ScheduleCalendar>;
  if (calendarDateDay(calendar.startDate) === null) return undefined;
  const shutdowns = (Array.isArray(calendar.shutdowns) ? calendar.shutdowns : []).filter((item) => {
    if (!item || (item.kind !== "summer" && item.kind !== "winter")) return false;
    const start = calendarDateDay(item.startDate), end = calendarDateDay(item.endDate);
    return start !== null && end !== null && end >= start;
  }).map((item, index) => ({ id: typeof item.id === "string" && item.id ? item.id : `shutdown-${index}`, kind: item.kind, startDate: item.startDate, endDate: item.endDate }));
  const holidayOverrides = Object.fromEntries(Object.entries(calendar.holidayOverrides ?? {}).filter(([, date]) => date === null || calendarDateDay(date) !== null));
  const shutdownOverrides = Object.fromEntries(Object.entries(calendar.shutdownOverrides ?? {}).filter(([key, value]) => {
    if (!validShutdownOverrideKey(key)) return false;
    if (value === null || value === "automatic") return true;
    if (!value || typeof value !== "object") return false;
    const start = calendarDateDay(value.startDate), end = calendarDateDay(value.endDate);
    return start !== null && end !== null && end >= start && value.startDate.slice(0, 4) === key.slice(-4);
  }));
  return { startDate: calendar.startDate!, shutdowns,
    ...(calendar.automaticShutdowns === true ? { automaticShutdowns: true } : {}),
    ...(Object.keys(shutdownOverrides).length ? { shutdownOverrides } : {}),
    ...(calendar.workWeek === "mon-thu" ? { workWeek: "mon-thu" as const } : {}),
    ...(calendar.holidayRegion === "CA-ON" ? { holidayRegion: "CA-ON" as const } : {}),
    ...(Object.keys(holidayOverrides).length ? { holidayOverrides } : {}) };
}

/** Project elapsed offsets onto dates. Entered durations include all days off;
 * closures split the bar and reduce net work without stretching the interval. */
export function buildProcessTimeline(file: WorkflowFile, schedule: ReturnType<typeof buildProcessSchedule>) {
  const calendar = normalizeScheduleCalendar(file.calendar);
  const origin = salesHandoffTime(schedule).originDay;
  const anchor = calendar ? calendarDateDay(calendar.startDate)! : null;
  const enabled = anchor !== null && origin !== null;
  const firstYear = enabled ? new Date((anchor! - origin! * 2) * DAY_MS).getUTCFullYear() - 1 : 0;
  const customPeriods = calendar ? [...calendar.shutdowns, ...Object.values(calendar.shutdownOverrides ?? {}).flatMap((value) => value && value !== "automatic" ? [value] : [])] : [];
  const maximumSpan = schedule.totalDays + customPeriods.reduce((sum, period) => sum + calendarDateDay(period.endDate)! - calendarDateDay(period.startDate)! + 1, 0);
  const annualWorkingDays = calendar?.workWeek === "mon-thu" ? calendar.automaticShutdowns ? 140 : 170 : calendar?.automaticShutdowns ? 250 : 300;
  const lastYear = enabled ? Math.min(9998, Math.max(new Date(anchor! * DAY_MS).getUTCFullYear() + Math.ceil(maximumSpan / annualWorkingDays) + 2,
    ...(calendar!.automaticShutdowns ? [] : calendar!.shutdowns.map((period) => Number(period.endDate.slice(0, 4)))))) : 0;
  const periods = enabled ? calendarShutdowns(calendar!, firstYear, lastYear).map((item) => ({ ...item, label: shutdownLabel(item.kind), start: calendarDateDay(item.startDate)!, end: calendarDateDay(item.endDate)! + 1 })) : [];
  const holidayPeriods = enabled && calendar!.holidayRegion === "CA-ON" ? Array.from({ length: Math.max(0, lastYear - firstYear + 1) }, (_, index) => firstYear + index)
    .flatMap(ontarioStatutoryHolidays).flatMap((holiday) => {
      const override = calendar!.holidayOverrides?.[holiday.id];
      if (override === null) return [];
      const date = override ?? holiday.date;
      const day = calendarDateDay(date)!;
      return [{ id: holiday.id, kind: "statutory" as const, label: `Stat holiday · ${holiday.name}`, startDate: date, endDate: date, start: day, end: day + 1 }];
    }) : [];
  const weekendPeriods: CalendarPause[] = [];
  if (enabled && calendar!.workWeek === "mon-thu") {
    const first = Date.UTC(firstYear, 0, 1) / DAY_MS, last = Date.UTC(lastYear + 1, 0, 1) / DAY_MS;
    for (let day = first; day < last; day += 1) {
      if (new Date(day * DAY_MS).getUTCDay() !== 5) continue;
      const date = (value: number) => new Date(value * DAY_MS).toISOString().slice(0, 10);
      weekendPeriods.push({ id: `weekend-${date(day)}`, kind: "weekend", label: "Weekend", startDate: date(day), endDate: date(day + 2), start: day, end: day + 3 });
    }
  }
  // Total durations already include weekends/holidays/shutdowns. Calendar
  // projection changes neither the entered duration nor any dependency offset.
  const axisShift = 0;
  const toDisplayDay = (day: number, boundary: "start" | "end" = "start") => { void boundary; return day; };
  const toScheduleDay = (day: number) => day;
  const dateAt = (displayDay: number) => enabled ? new Date((anchor! + displayDay - origin!) * DAY_MS).toISOString().slice(0, 10) : "";
  const dateLabel = (displayDay: number) => enabled ? dateFormatter.format(new Date((anchor! + displayDay - origin!) * DAY_MS)) : "";
  const shutdowns = periods.map((period) => ({ ...period, start: period.start - anchor! + origin! + axisShift, end: period.end - anchor! + origin! + axisShift }));
  const totalDays = schedule.totalDays;
  const holidays = holidayPeriods.map((period) => ({ ...period, start: period.start - anchor! + origin! + axisShift, end: period.end - anchor! + origin! + axisShift }))
    .filter((period) => period.end > 0 && period.start < totalDays);
  const weekends = weekendPeriods.map((period) => ({ ...period, start: period.start - anchor! + origin! + axisShift, end: period.end - anchor! + origin! + axisShift }))
    .filter((period) => period.end > 0 && period.start < totalDays);
  const nonWorkingPeriods = [...shutdowns.filter((period) => period.end > 0 && period.start < totalDays), ...holidays, ...weekends].sort((a, b) => a.start - b.start);
  const taskStartDay = (day: number) => Math.max(0, day);
  const taskSegments = (start: number, end: number) => splitCalendarTask(taskStartDay(start), toDisplayDay(end, "end"), nonWorkingPeriods);
  const calendarPauses = splitCalendarTask(0, totalDays, nonWorkingPeriods).filter((segment) => segment.kind === "pause");
  const labelFor = (pauses: typeof calendarPauses) => {
    const periods = pauses.flatMap((pause) => pause.periods);
    const names = [...new Set(periods.filter((period) => period.kind === "summer" || period.kind === "winter").map((period) => period.label))];
    return names.length ? `${names.join(" / ")}${periods.some((period) => period.kind === "statutory") ? " / holidays" : ""}` : "Statutory holidays";
  };
  // Department spans include idle gaps between their tasks, so moving one
  // Technical bar does not remove winter from the Technical calendar lane.
  const windows = schedule.departments.flatMap((department) => {
    const tasks = department.tasks.filter((task) => task.start !== undefined && task.end !== undefined);
    return tasks.length ? [{ name: department.name, start: Math.min(...tasks.map((task) => taskStartDay(task.start!))), end: Math.max(...tasks.map((task) => toDisplayDay(task.end!, "end"))) }] : [];
  });
  const byDepartment = new Map<string, typeof calendarPauses>();
  for (const pause of calendarPauses) {
    let owners = windows.filter((window) => window.start < pause.end && window.end > pause.start);
    if (!owners.length) {
      // A shutdown in an idle gap belongs to the next department; one after
      // project completion remains beside the final scheduled department.
      const next = windows.filter((window) => window.start >= pause.end).sort((a, b) => a.start - b.start)[0];
      const previous = [...windows].sort((a, b) => b.end - a.end)[0];
      owners = next ? [next] : previous ? [previous] : [];
    }
    for (const owner of owners) byDepartment.set(owner.name, [...(byDepartment.get(owner.name) ?? []), pause]);
  }
  const departmentPauses = (name: string) => byDepartment.get(name) ?? [];
  const departmentCalendarLabel = (name: string) => labelFor(departmentPauses(name));
  return { enabled, calendar, originDay: origin === null ? null : origin + axisShift, shutdowns, holidays, weekends, nonWorkingPeriods, calendarPauses, calendarLabel: labelFor(calendarPauses), departmentPauses, departmentCalendarLabel, totalDays, toDisplayDay, toScheduleDay, dateAt, dateLabel, taskStartDay, taskSegments };
}

/** Date labels need wider spacing than M1/W1. Tick positions are calendar days. */
export function calendarTickDays(days: number, maximumTicks = 12) {
  return 7 * Math.max(1, Math.ceil(days / 7 / maximumTicks));
}
