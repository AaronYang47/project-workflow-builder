import { conditionDurationDays, DAYS_PER_WEEK } from "@/lib/condition-duration";
import { isSalesDepartmentName } from "@/lib/department-label";
import type { TaskTimelineSegment } from "@/lib/schedule-calendar";
import type { Condition } from "@/types/workflow";

/** Keep schedule values internally in days while showing the planning unit in weeks. */
export function ganttDurationText(
  condition: Condition,
  compact = false,
  daysPerWeek = DAYS_PER_WEEK,
) {
  const days = conditionDurationDays(condition, daysPerWeek);
  if (days === undefined) return "";
  const weeks = Number((days / daysPerWeek).toFixed(days < DAYS_PER_WEEK ? 2 : 1));
  return compact ? `${weeks}w` : `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}

/** Compact, consistent labels for both interactive and exported Gantt bars. */
export function ganttBarLabel(
  department: string,
  condition: Condition,
  daysPerWeek = DAYS_PER_WEEK,
) {
  const name = department.replace(/^department\s+/i, "").toUpperCase();
  const aliases: [RegExp, string][] = [
    [/^SALE/, "SALE"],
    [/^TECH/, "TECH"],
    [/^(PURC|PROCUREMENT)/, "PURC"],
    [/^PROD/, "PROD"],
    [/^(SITE|AFTER\s*SERVICE)/, "SITE"],
  ];
  const code =
    aliases.find(([pattern]) => pattern.test(name))?.[1] ||
    name.replace(/[^A-Z]/g, "").slice(0, 4) ||
    "DEPT";
  return isSalesDepartmentName(department)
    ? code
    : `${code} ${ganttDurationText(condition, true, daysPerWeek)}`;
}

/** Show working duration plus the actual merged non-working time, without
 * rounding ten closed days to an approximate number of weeks. */
export function ganttBarLabelWithShutdown(
  department: string,
  condition: Condition,
  shutdownDays: number,
  shutdownKinds: readonly string[] = [],
  daysPerWeek = DAYS_PER_WEEK,
) {
  const label = ganttBarLabel(department, condition, daysPerWeek).toUpperCase();
  if (!Number.isFinite(shutdownDays) || shutdownDays <= 0) return label;
  const days = Math.round(shutdownDays);
  const weeks = Math.floor(days / DAYS_PER_WEEK),
    remaining = days % DAYS_PER_WEEK;
  const duration = [weeks ? `${weeks}W` : "", remaining ? `${remaining}D` : ""]
    .filter(Boolean)
    .join(" ");
  const seasons = ["winter", "summer"].filter((kind) => shutdownKinds.includes(kind));
  const shutdownLabel = seasons.length
    ? `${seasons.join("/").toUpperCase()} SHUTDOWN`
    : shutdownKinds.includes("statutory")
      ? "STATUTORY HOLIDAYS"
      : shutdownKinds.includes("weekend")
        ? "WEEKEND"
        : "SHUTDOWN";
  return duration ? `${label} + ${shutdownLabel} ${duration}` : label;
}

/** Give even the shortest scheduled task enough space for its entire label. */
export function ganttAxisMinimumWidth(
  tasks: readonly { department: string; condition: Condition; days?: number; start?: number }[],
  total: number,
) {
  return Math.min(
    6000,
    Math.max(
      660,
      ...tasks
        .filter((task) => task.start !== undefined && task.days && task.days > 0)
        .map(
          (task) =>
            ((ganttBarLabel(task.department, task.condition).length * 6 + 8) * total) / task.days!,
        ),
    ),
  );
}

export const dayOffNames = {
  winter: "WINTER SHUTDOWN",
  summer: "SUMMER SHUTDOWN",
  statutory: "STATUTORY HOLIDAYS",
  weekend: "WEEKEND",
};
export type PauseSegment = Extract<TaskTimelineSegment, { kind: "pause" }>;

/** Every closed date belongs to exactly one category: shutdown, then statutory,
 * then weekend. Overlaps cannot be subtracted twice. Values are calendar days. */
export function calendarWorkSummary(totalDays: number, pauses: readonly PauseSegment[]) {
  const totals = { winter: 0, summer: 0, statutory: 0, weekend: 0 };
  const kinds = ["winter", "summer", "statutory", "weekend"] as const;
  for (const pause of pauses) {
    const edges = [
      ...new Set([
        pause.start,
        pause.end,
        ...pause.periods.flatMap((period) => [
          Math.max(pause.start, period.start),
          Math.min(pause.end, period.end),
        ]),
      ]),
    ].sort((a, b) => a - b);
    for (let index = 0; index < edges.length - 1; index += 1) {
      const from = edges[index],
        to = edges[index + 1];
      const kind = kinds.find((kind) =>
        pause.periods.some(
          (period) => period.kind === kind && period.start < to && period.end > from,
        ),
      );
      if (kind) totals[kind] += to - from;
    }
  }
  const offDays = Object.values(totals).reduce((sum, days) => sum + days, 0);
  const workDays = Math.max(0, totalDays - offDays);
  const deductions = kinds
    .filter((kind) => totals[kind] > 0)
    .map((kind) => `${dayOffNames[kind]} ${totals[kind]}D`);
  return {
    totalDays,
    offDays,
    workDays,
    totals,
    formula: `${totalDays}D${deductions.map((text) => ` - ${text}`).join("")} = ${workDays}D ACTUAL WORK`,
  };
}

export function ganttCalendarBarLabel(
  department: string,
  condition: Condition,
  pauses: readonly PauseSegment[],
  daysPerWeek = DAYS_PER_WEEK,
) {
  const summary = calendarWorkSummary(conditionDurationDays(condition, daysPerWeek) ?? 0, pauses);
  return `${ganttBarLabel(department, condition, daysPerWeek).toUpperCase()}${summary.offDays ? ` - ${summary.offDays}D OFF` : ""} = ${summary.workDays}D ACTUAL WORK`;
}

export function calendarPauseDetails(pause: PauseSegment, dateAt: (day: number) => string) {
  const summary = calendarWorkSummary(pause.end - pause.start, [pause]);
  const items = pause.periods.map((period) => {
    const from = Math.max(pause.start, period.start),
      to = Math.min(pause.end, period.end);
    return `${period.label}: ${dateAt(from)} – ${dateAt(to - 1)} (${to - from}D)`;
  });
  return `${dateAt(pause.start)} – ${dateAt(pause.end - 1)} · ${summary.offDays}D OFF\n${items.join("\n")}\nCounted once: ${Object.entries(
    summary.totals,
  )
    .filter(([, days]) => days > 0)
    .map(([kind, days]) => `${dayOffNames[kind as keyof typeof dayOffNames]} ${days}D`)
    .join(" / ")}`;
}
