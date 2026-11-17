import { DAYS_PER_WEEK, type buildProcessSchedule, type ScheduleTask } from "@/lib/process-schedule";
import { calendarTickDays, type buildProcessTimeline } from "@/lib/schedule-calendar";
import { ganttAxisMinimumWidth } from "@/lib/gantt-bar-label";

type Schedule = ReturnType<typeof buildProcessSchedule>;
type Timeline = ReturnType<typeof buildProcessTimeline>;

/** Day 0 of the axis is the Sales handoff when Sales durations are known. */
export type GanttHandoff = { originDay: number | null; elapsedDays: number | null; hasSalesDepartment: boolean };

const weekNumber = (days: number) => Number((days / DAYS_PER_WEEK + 1).toFixed(1));

/**
 * Time axis of the on-screen Gantt chart: tick spacing, total width in days,
 * minimum pixel width and every label shown on or beside the bars.
 */
export function buildGanttAxis(schedule: Schedule, timeline: Timeline, handoff: GanttHandoff) {
  const axisUnit = schedule.totalDays >= 12 * DAYS_PER_WEEK ? "months" : "weeks";
  const step = axisUnit === "months" ? 4 * DAYS_PER_WEEK : DAYS_PER_WEEK;
  // Keep long schedules readable, with at most 40 labeled divisions.
  const tickSize = timeline.enabled
    ? calendarTickDays(timeline.totalDays)
    : step * Math.max(1, Math.ceil(schedule.totalDays / step / 40));
  const total = Math.max(
    tickSize * 4,
    Math.ceil((timeline.totalDays + tickSize * 3) / tickSize) * tickSize,
    (handoff.originDay ?? 0) + tickSize,
  );
  const minimumTimelineWidth = schedule.totalDays > 56
    ? Math.min(ganttAxisMinimumWidth(schedule.tasks, total), Math.max(1200, Math.min(3200, total * 18)))
    : ganttAxisMinimumWidth(schedule.tasks, total);
  const origin = handoff.originDay;
  const ticks = origin === null ? [] : [
    ...(origin > 0 ? [0] : []),
    ...Array.from({ length: Math.ceil((total - origin) / tickSize) }, (_, index) => origin + index * tickSize),
  ];

  const timeLabel = (value: number) => {
    if (origin === null || value < origin) return "";
    if (timeline.enabled) return timeline.dateLabel(value);
    const elapsed = value - origin;
    if (elapsed === 0) return `${axisUnit === "months" ? "M1" : "W1"} · handoff`;
    return axisUnit === "months"
      ? `M${Number((elapsed / (4 * DAYS_PER_WEEK) + 1).toFixed(1))}`
      : `W${weekNumber(elapsed)}`;
  };

  const dragDayLabel = (day: number) => {
    if (timeline.enabled) return timeline.dateLabel(timeline.toDisplayDay(day));
    if (origin === null) return `Project week ${weekNumber(day)}`;
    return day < origin ? `Sales lead week ${weekNumber(day)}` : `Week ${weekNumber(day - origin)} after handoff`;
  };

  const taskTimeLabel = (task: ScheduleTask) => {
    if (task.start === undefined || task.end === undefined || origin === null) return "Sales handoff pending";
    if (timeline.enabled) {
      return `${timeline.dateLabel(timeline.toDisplayDay(task.start))} – ${timeline.dateLabel(timeline.toDisplayDay(task.end, "end") - 1)}`;
    }
    const start = task.start < origin ? "Before handoff" : `Week ${weekNumber(task.start - origin)}`;
    const end = task.end <= origin ? "Before handoff" : `Week ${Number(((task.end - origin) / DAYS_PER_WEEK).toFixed(1))}`;
    return `${start} to ${end}`;
  };

  const gridBackground = {
    backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
    backgroundSize: `${tickSize / total * 100}% 100%`,
  };

  return { tickSize, total, minimumTimelineWidth, ticks, gridBackground, timeLabel, dragDayLabel, taskTimeLabel };
}

export type GanttAxis = ReturnType<typeof buildGanttAxis>;
