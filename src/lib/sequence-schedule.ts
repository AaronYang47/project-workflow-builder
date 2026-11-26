import { buildProcessSchedule } from "@/lib/process-schedule";
import type { Condition, WorkflowFile } from "@/types/workflow";

/**
 * One-click sequence for the L4 Gantt: within each Phase, every step starts
 * when the step listed above it finishes, in the order the Gantt lists them
 * (department, then Department card, then step). The first step of a Phase
 * starts when the previous Phase ends. Steps without a duration get 1 week.
 * Steps whose department is not linked to an L1 Phase are left as they are.
 */
export function sequenceSchedule(file: WorkflowFile): WorkflowFile {
  const schedule = buildProcessSchedule(file);
  const ordered = schedule.departments.flatMap((department) =>
    department.chapters.flatMap((chapter) => chapter.tasks),
  );
  const patches = new Map<string, Pick<Condition, "predecessor">>();
  const key = (nodeId: string, conditionId: string) => `${nodeId}\u0000${conditionId}`;
  for (let phase = 0; phase < schedule.phases.length; phase++) {
    let previous: (typeof ordered)[number] | undefined;
    for (const task of ordered.filter((item) => item.phaseIndex === phase)) {
      patches.set(key(task.nodeId, task.conditionId), {
        predecessor: previous
          ? {
              nodeId: previous.nodeId,
              conditionId: previous.conditionId,
              relation: "finish",
              lagDays: 0,
            }
          : undefined,
      });
      previous = task;
    }
  }
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) => {
        if (!node.conditions.length) return node;
        let changed = false;
        const conditions = node.conditions.map((condition, index) => {
          const patch = patches.get(key(node.id, condition.id || `index-${index}`));
          const needsDuration = !(Number(condition.duration) > 0);
          if (!patch && !needsDuration) return condition;
          changed = true;
          const next: Condition = { ...condition };
          if (needsDuration) {
            next.duration = 1;
            next.durationUnit = "weeks";
          }
          if (patch) {
            if (patch.predecessor) next.predecessor = patch.predecessor;
            else delete next.predecessor;
            delete next.startOffsetDays;
          }
          return next;
        });
        return changed ? { ...node, conditions } : node;
      }),
    },
  };
}
