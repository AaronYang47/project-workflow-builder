"use client";

import type { buildProcessSchedule, ScheduleTask } from "@/lib/process-schedule";
import type { buildProcessTimeline } from "@/lib/schedule-calendar";
import { calendarPauseDetails, ganttCalendarBarLabel, ganttDurationText } from "@/lib/gantt-bar-label";

type Schedule = ReturnType<typeof buildProcessSchedule>;
type Timeline = ReturnType<typeof buildProcessTimeline>;

/** Phone "Schedule" view: one card per release condition with week nudges. */
export function MobileScheduleList({ schedule, timeline, visible, canEdit, workingDaysPerWeek, taskTimeLabel, onMove, onEdit }: {
  schedule: Schedule;
  timeline: Timeline;
  visible: boolean;
  canEdit: boolean;
  workingDaysPerWeek: number;
  taskTimeLabel: (task: ScheduleTask) => string;
  onMove: (taskKey: string, startDay: number) => void;
  onEdit: (task: ScheduleTask) => void;
}) {
  const tasks = schedule.departments.flatMap((department) => department.chapters.flatMap((chapter) => chapter.tasks));
  return (
    <div data-mobile-schedule className={`${visible ? "block" : "hidden"} space-y-3 p-3 sm:hidden`} aria-label="Mobile schedule">
      {tasks.map((task) => {
        const scheduled = task.start !== undefined && task.end !== undefined;
        const pauses = scheduled ? timeline.taskSegments(task.start!, task.end!).filter((segment) => segment.kind === "pause") : [];
        const closures = pauses.filter((segment) => segment.periods.some((period) => period.kind !== "weekend"));
        const nudge = "min-h-10 flex-1 rounded-lg border px-2 text-xs font-semibold disabled:opacity-40";
        return (
          <article key={task.key} className="rounded-xl border bg-background p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{task.department} · {task.chapter}</p>
            <h3 className="mt-1 text-sm font-semibold leading-5">{task.title}</h3>
            {closures.map((pause) => (
              <p
                key={pause.start}
                data-mobile-shutdown={pause.periods.find((period) => period.kind !== "statutory")?.kind ?? "statutory"}
                title={calendarPauseDetails(pause, timeline.dateAt)}
                className="mt-2 rounded-md bg-gray-200 p-2 text-xs text-gray-800"
              >
                {pause.label} · {timeline.dateLabel(pause.start)} – {timeline.dateLabel(pause.end - 1)}
              </p>
            ))}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{ganttDurationText(task.condition, false, workingDaysPerWeek) || "Duration not set"}</span>
              <span>{taskTimeLabel(task)}</span>
              {timeline.enabled && scheduled && <span>{ganttCalendarBarLabel(task.department, task.condition, pauses)}</span>}
            </div>
            {canEdit && (
              <div className="mt-3 flex gap-2">
                <button type="button" aria-label={`Move ${task.title} earlier one week`} disabled={task.start === undefined} onClick={() => onMove(task.key, task.start! - workingDaysPerWeek)} className={nudge}>← 1 week</button>
                <button type="button" aria-label={`Move ${task.title} later one week`} disabled={task.start === undefined} onClick={() => onMove(task.key, task.start! + workingDaysPerWeek)} className={nudge}>1 week →</button>
                <button type="button" aria-label={`Edit timing for ${task.title}`} onClick={() => onEdit(task)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground">Edit</button>
              </div>
            )}
          </article>
        );
      })}
      {!schedule.tasks.length && <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Add release conditions to build a schedule.</p>}
    </div>
  );
}
