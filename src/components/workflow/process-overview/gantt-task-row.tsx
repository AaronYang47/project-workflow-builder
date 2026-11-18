"use client";

import { AlertTriangle } from "lucide-react";
import type { buildProcessSchedule, ScheduleTask } from "@/lib/process-schedule";
import {
  pauseSegmentBackground,
  taskSegmentBackground,
  type buildProcessTimeline,
} from "@/lib/schedule-calendar";
import {
  calendarWorkSummary,
  ganttBarLabel,
  ganttCalendarBarLabel,
  ganttDurationText,
} from "@/lib/gantt-bar-label";
import { dayOffWarning, taskCalendarBadges } from "@/lib/calendar-badges";
import { isSalesDepartmentName } from "@/lib/department-label";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import { beginGanttBarDrag } from "@/lib/gantt-bar-drag";
import { beginGanttBarResize } from "@/lib/gantt-bar-resize";
import type { GanttAxis } from "@/lib/gantt-axis";
import { CalendarTags } from "../calendar-tags";

type Schedule = ReturnType<typeof buildProcessSchedule>;
type Timeline = ReturnType<typeof buildProcessTimeline>;

export type GanttRowActions = {
  moveCondition: (fromNodeId: string, fromIndex: number, toNodeId: string, toIndex: number) => void;
  editTiming: (task: ScheduleTask) => void;
  /** Removes the L5 line-time link (the duration stays). */
  removeSimulated: (task: ScheduleTask) => void;
  openCalendar: (task: ScheduleTask, trigger: HTMLElement) => void;
  closeCalendar: () => void;
  placeTask: (taskKey: string, startDay: number) => void;
  resizeTask: (taskKey: string, days: number) => void;
  previewBar: (bar: HTMLElement, start: number, days: number) => void;
};

const ROW_GRID = "grid grid-cols-[168px_minmax(660px,1fr)] sm:grid-cols-[280px_minmax(660px,1fr)]";

/**
 * One release condition in the Gantt chart: the sticky label cell (drag to
 * another chapter, Edit timing) and its bar (drag to move, right edge to
 * resize, arrow keys, click for the task calendar).
 */
export function GanttTaskRow({
  task,
  schedule,
  timeline,
  axis,
  canEdit,
  workingDaysPerWeek,
  actions,
}: {
  task: ScheduleTask;
  schedule: Schedule;
  timeline: Timeline;
  axis: GanttAxis;
  canEdit: boolean;
  workingDaysPerWeek: number;
  actions: GanttRowActions;
}) {
  const { total, gridBackground } = axis;
  const startDay = task.start ?? schedule.phaseRanges[task.phaseIndex]?.start;
  const days = task.days ?? 1;
  const canPlace = startDay !== undefined && task.phaseIndex >= 0;
  const displayStart = startDay === undefined ? 0 : timeline.taskStartDay(startDay);
  const displayEnd = startDay === undefined ? 0 : timeline.toDisplayDay(startDay + days, "end");
  const segments = startDay === undefined ? [] : timeline.taskSegments(startDay, startDay + days);
  const pauses = segments.filter((segment) => segment.kind === "pause");
  const summary = calendarWorkSummary(days, pauses);
  const offWarning = timeline.enabled && task.days !== undefined ? dayOffWarning(summary) : null;
  const barLabel =
    task.days === undefined
      ? "+"
      : timeline.enabled
        ? ganttCalendarBarLabel(task.department, task.condition, pauses)
        : ganttBarLabel(task.department, task.condition).toUpperCase();
  const phaseTitle = schedule.phases[task.phaseIndex]?.title || "Unlinked";
  const scheduled = task.start !== undefined;

  return (
    <div
      data-gantt-task={task.title}
      data-release-condition-index={task.conditionIndex}
      data-release-condition-node-id={task.nodeId}
      className={`${ROW_GRID} border-b last:border-b-0`}
    >
      <div
        data-gantt-label
        onPointerDown={(event) => {
          if (
            !canEdit ||
            event.pointerType === "touch" ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          beginReleaseConditionDrag(
            event.nativeEvent,
            event.currentTarget,
            { nodeId: task.nodeId, index: task.conditionIndex, label: task.title },
            (target) =>
              actions.moveCondition(task.nodeId, task.conditionIndex, target.nodeId, target.index),
          );
        }}
        className={`sticky left-0 z-10 flex min-h-12 min-w-0 select-none items-center gap-1.5 border-r bg-panel px-2 py-1 sm:min-h-0 sm:gap-2 sm:px-3 sm:py-0.5 ${canEdit ? "sm:cursor-grab sm:active:cursor-grabbing" : ""}`}
        title={`${task.title} · ${task.chapter} · ${phaseTitle}`}
      >
        <div className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-[11px] font-medium leading-[14px]">
            {task.title}
          </span>
          {task.condition.simulated ? (
            <span
              data-l5-simulated-days={task.condition.simulated.days}
              title={`Written from L5 scenario “${task.condition.simulated.scenario}”`}
              className={`mt-0.5 flex w-fit items-center gap-1 rounded px-1 text-[9px] font-bold leading-[13px] ${
                task.days === task.condition.simulated.days
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
              }`}
            >
              <span>
                L5 · {task.condition.simulated.days} days on the line
                {task.days === task.condition.simulated.days ? "" : " · duration changed since"}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove L5 data from ${task.title}`}
                  title="Remove the L5 data from this release condition (its duration stays; use Edit to change it)"
                  onClick={() => actions.removeSimulated(task)}
                  className="-mr-0.5 flex size-4 items-center justify-center rounded hover:bg-foreground/10"
                >
                  ×
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {!isSalesDepartmentName(task.department) ? (
          <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
            {task.days
              ? ganttDurationText(task.condition, false, workingDaysPerWeek)
              : "Set duration →"}
          </span>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            aria-label={`Edit timing for ${task.title}`}
            onClick={() => actions.editTiming(task)}
            className="flex min-h-9 min-w-10 shrink-0 items-center justify-center rounded border px-1.5 text-[11px] font-semibold text-primary sm:min-h-0 sm:min-w-0 sm:py-0.5 sm:text-[9px]"
          >
            Edit
          </button>
        ) : null}
      </div>
      <div
        data-gantt-track
        data-gantt-pan-surface
        data-gantt-total={total}
        className="relative flex min-h-12 cursor-grab touch-auto items-center sm:min-h-8"
        style={gridBackground}
      >
        {canPlace ? (
          <div
            role={scheduled ? "slider" : undefined}
            tabIndex={canEdit && scheduled ? 0 : -1}
            aria-label={scheduled ? `Start day for ${task.title}` : undefined}
            aria-valuemin={
              scheduled ? (schedule.phaseRanges[task.phaseIndex]?.start ?? 0) : undefined
            }
            aria-valuemax={scheduled ? timeline.toScheduleDay(total) - days : undefined}
            aria-valuenow={task.start}
            aria-valuetext={scheduled ? axis.taskTimeLabel(task) : undefined}
            data-gantt-task-key={task.key}
            data-gantt-start={task.start}
            data-gantt-end={task.end}
            data-gantt-color={task.color}
            data-actual-work-days={timeline.enabled ? summary.workDays : undefined}
            data-calendar-start={
              startDay === undefined
                ? undefined
                : timeline.dateAt(timeline.toDisplayDay(startDay)) || undefined
            }
            data-calendar-end={timeline.dateAt(displayEnd - 1) || undefined}
            onPointerDown={(event) => {
              actions.closeCalendar();
              const clickedBar = event.currentTarget;
              if (canEdit && event.pointerType !== "touch")
                beginGanttBarDrag(event.nativeEvent, event.currentTarget, {
                  task,
                  schedule,
                  totalDays: total,
                  formatStartDay: axis.dragDayLabel,
                  toDisplayDay: timeline.taskStartDay,
                  toScheduleDay: timeline.toScheduleDay,
                  onPreview: actions.previewBar,
                  onClick: () => actions.openCalendar(task, clickedBar),
                  onDrop: (placement) => actions.placeTask(task.key, placement.startDay),
                  onMoveChapter: (nodeId, index) =>
                    actions.moveCondition(task.nodeId, task.conditionIndex, nodeId, index),
                });
            }}
            onClick={(event) => {
              if (
                !canEdit ||
                (event.nativeEvent as PointerEvent).pointerType === "touch" ||
                event.detail === 0
              )
                actions.openCalendar(task, event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                actions.openCalendar(task, event.currentTarget);
                return;
              }
              if (
                !canEdit ||
                task.start === undefined ||
                !["ArrowLeft", "ArrowRight"].includes(event.key)
              )
                return;
              event.preventDefault();
              actions.closeCalendar();
              actions.placeTask(task.key, task.start + (event.key === "ArrowRight" ? 1 : -1));
            }}
            className={`group absolute flex select-none h-7 min-w-1 items-center justify-center rounded text-[10px] font-semibold text-white touch-auto data-[gantt-snap-target=true]:ring-2 data-[gantt-snap-target=true]:ring-cyan-500 sm:h-5 ${scheduled ? "" : "opacity-60"} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
            style={{
              left: `${(displayStart / total) * 100}%`,
              width: `${((displayEnd - displayStart) / total) * 100}%`,
              background: taskSegmentBackground(segments, task.color, timeline.palette),
            }}
          >
            {segments.map((segment, segmentIndex) => (
              <span
                key={`${segment.kind}-${segment.start}`}
                data-gantt-work-segment={segment.kind === "work" ? "" : undefined}
                data-gantt-pause-segment={segment.kind === "pause" ? "" : undefined}
                data-segment-start={segment.start}
                data-segment-end={segment.end}
                title=""
                data-pause-periods={
                  segment.kind === "pause"
                    ? segment.periods.map((period) => period.id).join(" ")
                    : undefined
                }
                className={`pointer-events-none absolute inset-y-0 flex items-center justify-center overflow-hidden px-1 whitespace-nowrap group-data-[gantt-dragging=true]:invisible group-data-[gantt-resizing=true]:invisible ${segmentIndex === 0 ? "rounded-l" : ""} ${segmentIndex === segments.length - 1 ? "rounded-r" : ""}`}
                style={{
                  left: `${((segment.start - displayStart) / (displayEnd - displayStart)) * 100}%`,
                  width: `${((segment.end - segment.start) / (displayEnd - displayStart)) * 100}%`,
                  ...(segment.kind === "pause"
                    ? { background: pauseSegmentBackground(segment, timeline.palette) }
                    : {}),
                }}
              />
            ))}
            <span
              data-gantt-bar-label
              title={timeline.enabled ? summary.formula : undefined}
              className="pointer-events-none absolute left-full ml-2 whitespace-nowrap text-[10px] font-bold text-foreground group-data-[gantt-dragging=true]:invisible group-data-[gantt-resizing=true]:invisible"
            >
              {timeline.enabled && task.days !== undefined ? (
                <span className="inline-flex items-center gap-2">
                  <CalendarTags
                    compact
                    badges={taskCalendarBadges(
                      task.department,
                      task.condition,
                      pauses,
                      task.color,
                      timeline.palette,
                    )}
                  />
                  {offWarning && (
                    <span
                      data-day-off-warning
                      role="img"
                      aria-label={offWarning.reason}
                      title={offWarning.reason}
                      className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-1 text-[10px] font-bold leading-3 text-red-700 dark:border-red-500/50 dark:bg-red-950/60 dark:text-red-300"
                    >
                      <AlertTriangle
                        className="size-3.5 shrink-0 fill-amber-300 text-red-600"
                        aria-hidden="true"
                      />
                      {offWarning.short}
                    </span>
                  )}
                </span>
              ) : (
                barLabel
              )}
            </span>
            {canEdit && (
              <span
                role="slider"
                tabIndex={0}
                aria-label={`Duration in days for ${task.title}`}
                aria-valuemin={1}
                aria-valuemax={timeline.toScheduleDay(total) - startDay}
                aria-valuenow={days}
                title=""
                onPointerDown={(event) => {
                  if (event.pointerType === "touch") return;
                  event.stopPropagation();
                  beginGanttBarResize(event.nativeEvent, event.currentTarget, {
                    startDay,
                    initialDays: days,
                    totalDays: total,
                    daysPerWeek: workingDaysPerWeek,
                    toDisplayDay: timeline.taskStartDay,
                    toScheduleDay: timeline.toScheduleDay,
                    onPreview: actions.previewBar,
                    onDrop: (value) => actions.resizeTask(task.key, value),
                  });
                }}
                onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                  event.preventDefault();
                  event.stopPropagation();
                  actions.closeCalendar();
                  actions.resizeTask(
                    task.key,
                    Math.max(1, days + (event.key === "ArrowRight" ? 1 : -1)),
                  );
                }}
                className="absolute inset-y-0 right-0 hidden w-3 cursor-ew-resize rounded-r border-l border-white/70 bg-white/25 hover:bg-white/50 sm:block"
              />
            )}
          </div>
        ) : (
          <p className="px-3 text-xs text-amber-700 dark:text-amber-300">{task.issue}</p>
        )}
      </div>
    </div>
  );
}
