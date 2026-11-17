import {
  ganttBarLabel,
  ganttDurationText,
  calendarWorkSummary,
  type PauseSegment,
} from "@/lib/gantt-bar-label";
import { isSalesDepartmentName } from "@/lib/department-label";
import { buildProcessSchedule } from "@/lib/process-schedule";
import {
  buildProcessTimeline,
  DEFAULT_DAY_OFF_PALETTE,
  type DayOffPalette,
} from "@/lib/schedule-calendar";
import type { Condition, WorkflowFile } from "@/types/workflow";
import { escapeHtml as escape } from "@/lib/html";

export type CalendarSummary = ReturnType<typeof calendarWorkSummary>;
export type CalendarBadge = { kind: string; text: string; background: string; color: string };
export function calendarSummaryBadges(
  summary: CalendarSummary,
  palette: DayOffPalette = DEFAULT_DAY_OFF_PALETTE,
): CalendarBadge[] {
  const badges: (CalendarBadge & { days: number })[] = [
    {
      kind: "statutory",
      days: summary.totals.statutory,
      text: `- STATS OFF ${summary.totals.statutory}D`,
      background: palette.fill.statutory,
      color: palette.ink.statutory,
    },
    {
      kind: "shutdown",
      days: summary.totals.winter + summary.totals.summer,
      text: `- SHUTDOWN ${summary.totals.winter + summary.totals.summer}D`,
      background: palette.fill.shutdown,
      color: palette.ink.shutdown,
    },
    {
      kind: "weekend",
      days: summary.totals.weekend,
      text: `- WEEKEND ${summary.totals.weekend}D`,
      background: palette.fill.weekend,
      color: palette.ink.weekend,
    },
    {
      kind: "work",
      days: summary.workDays,
      text: `= ACTUAL WORK ${summary.workDays}D`,
      background: "#dcfce7",
      color: "#166534",
    },
  ];
  return badges.filter((badge) => badge.days > 0);
}
export function taskCalendarBadges(
  department: string,
  condition: Condition,
  pauses: readonly PauseSegment[],
  phaseColor = "#2563eb",
  palette: DayOffPalette = DEFAULT_DAY_OFF_PALETTE,
): CalendarBadge[] {
  const label = `${ganttBarLabel(department, condition).toUpperCase()}${isSalesDepartmentName(department) ? ` ${ganttDurationText(condition, true).toUpperCase()}` : ""}`;
  const color = /^#[\da-f]{6}$/i.test(phaseColor) ? phaseColor : "#2563eb";
  const total =
    condition.durationUnit === "weeks" ? (condition.duration ?? 0) * 7 : (condition.duration ?? 0);
  const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
  const foreground =
    (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 150 ? "#15243b" : "#ffffff";
  return [
    { kind: "department", text: label, background: color, color: foreground },
    ...calendarSummaryBadges(calendarWorkSummary(total, pauses), palette),
  ];
}
export function calendarBadgesHtml(badges: CalendarBadge[], fontSize = 13) {
  return badges
    .map(
      (badge) =>
        `<span data-calendar-tag="${badge.kind}" style="display:inline-block;flex:0 0 auto;white-space:nowrap;border-radius:5px;padding:4px 6px;font:800 ${fontSize}px/1.2 Arial,sans-serif;background:${badge.background};color:${badge.color}">${escape(badge.text)}</span>`,
    )
    .join(" ");
}

/** Readable ink for plain-text labels on white PDF pages. */
const TEXT_INK: Record<string, string> = {
  statutory: "#6d28d9",
  shutdown: "#1d4ed8",
  weekend: "#475569",
  work: "#15803d",
};
/** PDF variant: the same pieces as coloured words instead of filled tags. */
export function calendarTextHtml(badges: CalendarBadge[], fontSize = 19) {
  return badges
    .map((badge) => {
      const ink =
        badge.kind === "department" ? badge.background : (TEXT_INK[badge.kind] ?? "#0f172a");
      return `<span data-calendar-tag="${badge.kind}" style="display:inline-block;flex:0 0 auto;white-space:nowrap;font:800 ${fontSize}px/1.2 Arial,sans-serif;color:${ink}">${escape(badge.text)}</span>`;
    })
    .join(" ");
}

export type DayOffWarning = { short: string; reason: string };
/** Flags a task whose days off leave too little real work for its window:
 * no actual work at all, or shutdowns + statutory holidays taking half or
 * more of the normal (non-weekend) working days. */
export function dayOffWarning(summary: CalendarSummary): DayOffWarning | null {
  if (summary.totalDays <= 0 || summary.offDays <= 0) return null;
  const normalWork = summary.totalDays - summary.totals.weekend;
  const lost = summary.totals.winter + summary.totals.summer + summary.totals.statutory;
  if (summary.workDays > 0 && lost * 2 < normalWork) return null;
  const parts = [
    summary.totals.winter + summary.totals.summer
      ? `shutdown ${summary.totals.winter + summary.totals.summer}D`
      : "",
    summary.totals.statutory ? `stat holidays ${summary.totals.statutory}D` : "",
    summary.totals.weekend ? `weekends ${summary.totals.weekend}D` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return {
    short: `TOO MANY DAYS OFF · ONLY ${summary.workDays}D WORK IN ${summary.totalDays}D`,
    reason: `${summary.offDays}D of the ${summary.totalDays}D window are days off (${parts}), leaving only ${summary.workDays}D of actual work. It is unlikely to finish in this time — extend the duration or move the task.`,
  };
}

/** Scheduled tasks whose window is mostly days off, for the export check.
 * The Gantt PDF draws Sales rows without bars or labels, so the export check
 * leaves them out to match what is printed. */
export function scheduleDayOffWarnings(
  file: WorkflowFile,
  options: { excludeSales?: boolean } = {},
) {
  const schedule = buildProcessSchedule(file);
  const timeline = buildProcessTimeline(file, schedule);
  if (!timeline.enabled) return [];
  return schedule.tasks.flatMap((task) => {
    if (task.start === undefined || task.end === undefined || task.days === undefined) return [];
    if (options.excludeSales && isSalesDepartmentName(task.department)) return [];
    const pauses = timeline
      .taskSegments(task.start, task.end)
      .filter((segment): segment is PauseSegment => segment.kind === "pause");
    const warning = dayOffWarning(calendarWorkSummary(task.days, pauses));
    return warning ? [{ title: task.title, department: task.department, ...warning }] : [];
  });
}

/** Asks before exporting a schedule that contains unrealistic tasks. */
export function confirmDayOffWarnings(file: WorkflowFile) {
  const warnings = scheduleDayOffWarnings(file, { excludeSales: true });
  if (!warnings.length || typeof window === "undefined") return true;
  const lines = warnings
    .slice(0, 8)
    .map((warning) => `⚠ ${warning.department} · ${warning.title}\n   ${warning.reason}`);
  if (warnings.length > 8) lines.push(`…and ${warnings.length - 8} more.`);
  return window.confirm(
    `${warnings.length} task${warnings.length === 1 ? " has" : "s have"} too many days off to finish in the scheduled time:\n\n${lines.join("\n\n")}\n\nExport the PDF anyway?`,
  );
}
