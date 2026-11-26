import { wholeDayCondition } from "@/lib/condition-duration";
import { planGanttPlacement } from "@/lib/gantt-placement";
import { buildProcessSchedule, type ScheduleTask } from "@/lib/process-schedule";
import type { Condition, WorkflowFile } from "@/types/workflow";

/**
 * The two Gantt bar edits, as pure changes to a project: L4 and L6 both use
 * them, so a bar dragged in L6 saves exactly what the same drag in L4 would.
 */
export type GanttEdit = { kind: "move"; startDay: number } | { kind: "resize"; days: number };

function patchTask(
  file: WorkflowFile,
  task: ScheduleTask,
  patch: Partial<Condition>,
  daysPerWeek: number,
) {
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) =>
        node.id === task.nodeId
          ? {
              ...node,
              conditions: node.conditions.map((condition, index) =>
                index === task.conditionIndex
                  ? wholeDayCondition({ ...condition, ...patch }, daysPerWeek)
                  : condition,
              ),
            }
          : node,
      ),
    },
  };
}

/** The Gantt edit's condition fields, or null when nothing changes. */
export function ganttEditPatch(
  schedule: ReturnType<typeof buildProcessSchedule>,
  task: ScheduleTask,
  edit: GanttEdit,
): Partial<Condition> | null {
  if (edit.kind === "move") {
    const placement = planGanttPlacement(schedule, task, edit.startDay, 0);
    return placement && placement.startDay !== task.start ? placement.patch : null;
  }
  const days = Math.max(1, Math.round(edit.days));
  if (days === task.days) return null;
  const perWeek = schedule.workingDaysPerWeek;
  const preserveWeeks = task.condition.durationUnit === "weeks" && days % perWeek === 0;
  return {
    duration: preserveWeeks ? days / perWeek : days,
    durationUnit: preserveWeeks ? "weeks" : "days",
  };
}

/** Applies a Gantt edit to the step with this schedule key. */
export function applyGanttEdit(file: WorkflowFile, taskKey: string, edit: GanttEdit): WorkflowFile {
  const schedule = buildProcessSchedule(file);
  const task = schedule.tasks.find((item) => item.key === taskKey);
  if (!task) return file;
  const patch = ganttEditPatch(schedule, task, edit);
  return patch ? patchTask(file, task, patch, schedule.workingDaysPerWeek) : file;
}
