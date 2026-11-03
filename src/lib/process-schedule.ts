import { normalizePreviousPhaseDependencies } from "@/lib/process-dependencies";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { departmentDisplayName, isSalesDepartmentName } from "@/lib/department-label";
import { isReleaseConditionChapter } from "@/lib/release-condition-inbox";
import { getL1FallbackColor } from "@/lib/node-layout";
import { orderReleaseConditionChapters } from "@/lib/release-condition-order";
import type { Condition, WorkflowFile } from "@/types/workflow";
import { conditionDurationDays, wholeDayCondition } from "@/lib/condition-duration";

export { DAYS_PER_WEEK } from "@/lib/condition-duration";

/** Normalize arithmetic at each scheduling step to avoid floating-point tails. */
export const roundWorkingDays = (value: number) => Number(value.toFixed(6));

export type ScheduleTask = {
  key: string; nodeId: string; conditionId: string; conditionIndex: number;
  title: string; chapter: string; department: string; phaseIndex: number;
  color: string; condition: Condition; days?: number; start?: number; end?: number; issue?: string;
};

/** Only same-phase predecessors that cannot create a cycle are selectable. */
export function schedulePredecessorCandidates(tasks: ScheduleTask[], task: ScheduleTask) {
  const byKey = new Map(tasks.map((item) => [item.key, item]));
  return tasks.filter((candidate) => {
    if (task.phaseIndex < 0 || candidate.phaseIndex !== task.phaseIndex || candidate.key === task.key) return false;
    const visited = new Set<string>();
    let current: ScheduleTask | undefined = candidate;
    while (current) {
      if (current.key === task.key || visited.has(current.key)) return false;
      visited.add(current.key);
      const ref: Condition["predecessor"] = current.condition.predecessor;
      current = ref ? byKey.get(JSON.stringify([ref.nodeId, ref.conditionId])) : undefined;
    }
    return true;
  });
}

export function buildProcessSchedule(file: WorkflowFile) {
  file = normalizePreviousPhaseDependencies(file);
  const phases = orderHighLevelNodes(file.highLevel?.graph.nodes ?? [], file.highLevel?.graph.edges ?? [])
    .map((phase, index) => ({ ...phase, color: /^#[\da-f]{6}$/i.test(phase.backgroundColor ?? "")
      ? phase.backgroundColor! : getL1FallbackColor(`${phase.title} ${phase.description}`, index) }));
  const nodes = file.graph.nodes.filter(isReleaseConditionChapter);
  const owners = new Map<string, number>();
  phases.forEach((phase, index) => (phase.linkedLayer2NodeIds ?? phase.linkedDetailedNodeIds ?? []).forEach((id) => {
    if (!owners.has(id)) owners.set(id, index);
  }));
  const tasks: ScheduleTask[] = nodes.flatMap((node) => node.conditions.map((storedCondition, index) => {
    const previous = node.conditions[index - 1];
    const condition = node.config.ganttAutoSequence === true && index > 0 && !storedCondition.predecessor && (storedCondition.startOffsetDays === undefined || storedCondition.startOffsetDays === 0) && previous
      ? { ...storedCondition, predecessor: { nodeId: node.id, conditionId: previous.id || `index-${index - 1}`, relation: "finish" as const, lagDays: 0 } }
      : storedCondition;
    return ({
    key: JSON.stringify([node.id, condition.id || `index-${index}`]), nodeId: node.id,
    conditionId: condition.id || `index-${index}`, conditionIndex: index,
    title: condition.label || condition.description || `Release condition ${index + 1}`,
    chapter: node.title, department: departmentDisplayName(node), phaseIndex: owners.get(node.id) ?? -1,
    color: phases[owners.get(node.id) ?? -1]?.color ?? "#64748b", condition: wholeDayCondition(condition),
    days: conditionDurationDays(condition),
  });
  }));
  const byKey = new Map(tasks.map((task) => [task.key, task]));
  const active = new Set<string>();
  const done = new Set<string>();
  const phaseStarts = new Map<number, number>();
  const blockedPhases = new Set<number>();
  const phaseStart = (index: number): number => {
    if (index <= 0) return 0;
    if (phaseStarts.has(index)) return phaseStarts.get(index)!;
    const previous = tasks.filter((task) => task.phaseIndex === index - 1);
    previous.forEach(schedule);
    const value = Math.max(phaseStart(index - 1), ...previous.map((task) => task.end ?? 0));
    if (blockedPhases.has(index - 1) || previous.some((task) => task.end === undefined)) blockedPhases.add(index);
    phaseStarts.set(index, value);
    return value;
  };
  function schedule(task: ScheduleTask) {
    if (done.has(task.key)) return;
    if (active.has(task.key)) { task.issue = "Circular dependency"; return; }
    active.add(task.key);
    if (task.phaseIndex < 0) task.issue = "Link department to an L1 phase";
    else if (task.days === undefined) task.issue = "Duration needed";
    else {
      const ref = task.condition.predecessor;
      const offset = ref ? 0 : task.condition.startOffsetDays ?? 0;
      if (!Number.isInteger(offset) || offset < 0) task.issue = "Start offset must be a non-negative whole number of days";
      let start = phaseStart(task.phaseIndex) + offset;
      if (blockedPhases.has(task.phaseIndex)) task.issue = "Waiting for preceding phase schedule";
      if (ref) {
        const predecessor = byKey.get(JSON.stringify([ref.nodeId, ref.conditionId]));
        const lagDays = ref.lagDays ?? 0;
        if (!Number.isInteger(lagDays) || lagDays < 0) task.issue = "Delay must be a non-negative whole number of days";
        else if (ref.relation !== undefined && ref.relation !== "start" && ref.relation !== "finish") task.issue = "Unknown predecessor timing";
        else if (!predecessor) task.issue = "Predecessor no longer exists";
        else if (predecessor.phaseIndex < 0) task.issue = "Predecessor has no linked phase";
        else if (predecessor.phaseIndex > task.phaseIndex) task.issue = "Predecessor is in a later phase";
        else {
          schedule(predecessor);
          if (predecessor.end === undefined || predecessor.issue) task.issue ||= "Waiting for predecessor schedule";
          else start = Math.max(start, (ref.relation === "start" ? predecessor.start! : predecessor.end) + lagDays);
        }
      }
      if (!task.issue) { task.start = start; task.end = roundWorkingDays(start + task.days!); }
    }
    active.delete(task.key);
    done.add(task.key);
  }
  tasks.forEach(schedule);
  const orderedTasks = phases.flatMap((phase, index) => (phase.linkedLayer2NodeIds ?? phase.linkedDetailedNodeIds ?? [])
    .flatMap((id) => tasks.filter((task) => task.nodeId === id && task.phaseIndex === index)));
  orderedTasks.push(...tasks.filter((task) => task.phaseIndex < 0));
  const orderedNodes = orderReleaseConditionChapters(nodes, file);
  const departments = [...new Set(orderedNodes.map(departmentDisplayName))].map((name) => ({
    name, tasks: orderedTasks.filter((task) => task.department === name),
    chapters: orderedNodes.filter((node) => departmentDisplayName(node) === name).map((node) => ({
      nodeId: node.id, title: node.title, phaseIndex: owners.get(node.id) ?? -1,
      tasks: orderedTasks.filter((task) => task.nodeId === node.id),
    })),
  }));
  return { phases, departments, tasks, totalDays: Math.max(0, ...tasks.map((task) => task.end ?? 0)),
    unscheduled: tasks.filter((task) => task.end === undefined).length,
    phaseRanges: phases.map((_, index) => ({ start: phaseStart(index), end: Math.max(phaseStart(index), ...tasks.filter((task) => task.phaseIndex === index).map((task) => task.end ?? 0)) })) };
}

/** Day 1 is the handoff after the last scheduled Sales release condition.
 * The underlying schedule keeps its original positions and dependencies. */
export function salesHandoffTime(schedule: ReturnType<typeof buildProcessSchedule>) {
  const salesTasks = schedule.tasks.filter((task) => isSalesDepartmentName(task.department));
  if (!salesTasks.length) return { originDay: 0, elapsedDays: schedule.totalDays, hasSalesDepartment: false };
  if (salesTasks.some((task) => task.end === undefined)) {
    return { originDay: null, elapsedDays: null, hasSalesDepartment: true };
  }
  const originDay = Math.max(...salesTasks.map((task) => task.end!));
  const laterTasks = schedule.tasks.filter((task) => !salesTasks.includes(task) && task.phaseIndex >= 0);
  const hasScheduledLaterTask = laterTasks.some((task) => task.end !== undefined && task.end > originDay);
  return {
    originDay,
    elapsedDays: laterTasks.length && !hasScheduledLaterTask
      ? null : roundWorkingDays(Math.max(0, schedule.totalDays - originDay)),
    hasSalesDepartment: true,
  };
}
