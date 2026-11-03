import { schedulePredecessorCandidates, type ScheduleTask } from "@/lib/process-schedule";
import type { Condition } from "@/types/workflow";

type Schedule = {
  tasks: ScheduleTask[];
  phaseRanges: { start: number; end: number }[];
};

export type GanttPlacement = {
  startDay: number;
  patch: Pick<Condition, "predecessor" | "startOffsetDays">;
  label: string;
  snappedToTask?: string;
};

/** Convert a visual bar position into the same dependency fields used by the form. */
export function planGanttPlacement(schedule: Schedule, task: ScheduleTask, rawStartDay: number, snapToleranceDays: number): GanttPlacement | null {
  if (task.phaseIndex < 0 || task.start === undefined || !Number.isFinite(rawStartDay)) return null;
  const phaseStart = schedule.phaseRanges[task.phaseIndex]?.start ?? 0;
  const candidates = schedulePredecessorCandidates(schedule.tasks, task)
    .filter((candidate) => candidate.start !== undefined && candidate.end !== undefined);
  const existing = candidates.find((candidate) =>
    candidate.nodeId === task.condition.predecessor?.nodeId && candidate.conditionId === task.condition.predecessor?.conditionId);
  const raw = Math.max(phaseStart, rawStartDay);
  const anchors = [
    { day: phaseStart, kind: "phase" as const, task: undefined },
    ...candidates.flatMap((candidate) => [
      { day: candidate.start!, kind: "start" as const, task: candidate },
      { day: candidate.end!, kind: "finish" as const, task: candidate },
    ]),
  ].filter((anchor) => anchor.day >= phaseStart);
  const nearest = anchors.sort((left, right) => {
    const distance = Math.abs(left.day - raw) - Math.abs(right.day - raw);
    if (Math.abs(distance) > 0.000001) return distance;
    return Number(right.task?.key === existing?.key) - Number(left.task?.key === existing?.key);
  })[0];
  const snapped = nearest && Math.abs(nearest.day - raw) <= snapToleranceDays ? nearest : undefined;
  const startDay = Math.max(phaseStart, Math.round(snapped?.day ?? raw));
  if (startDay === phaseStart) return { startDay, patch: { predecessor: undefined, startOffsetDays: 0 }, label: "At this phase start" };
  const anchor = snapped?.task && snapped.day === startDay ? snapped
    : anchors.find((candidate) => candidate.task && candidate.day === startDay && candidate.task.key === existing?.key)
      ?? anchors.find((candidate) => candidate.task && candidate.day === startDay);
  const overlapping = candidates.filter((candidate) => candidate.start! < startDay && startDay < candidate.end!)
    .sort((left, right) => Number(right.key === existing?.key) - Number(left.key === existing?.key) || right.start! - left.start!);
  const predecessor = anchor?.task ?? overlapping[0] ??
    (existing && startDay >= existing.start! ? existing : undefined);
  if (predecessor) {
    const relation = anchor?.task === predecessor ? anchor.kind === "start" ? "start" : "finish"
      : startDay < predecessor.end! ? "start" : "finish";
    const lagDays = startDay - (relation === "start" ? predecessor.start! : predecessor.end!);
    if (lagDays >= 0) return { startDay, patch: {
      predecessor: { nodeId: predecessor.nodeId, conditionId: predecessor.conditionId, relation, lagDays },
      startOffsetDays: undefined,
    }, label: `${predecessor.title}: ${lagDays ? `${lagDays} days after ` : "At "}${relation}`, snappedToTask: predecessor.key };
  }
  return { startDay, patch: { predecessor: undefined, startOffsetDays: startDay - phaseStart },
    label: startDay === phaseStart ? "At this phase start" : `${startDay - phaseStart} days after this phase starts` };
}
