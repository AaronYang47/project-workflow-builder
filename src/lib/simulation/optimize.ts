import { dayOf } from "./work-calendar";
import { simulateScenario } from "./simulate";
import type { SimResult, SimScenario } from "./types";

/** Lower is better: unfinished projects, then total and worst lateness, then the last finish. */
export function scheduleScore(result: SimResult) {
  const unfinished = result.projects.filter((project) => !project.finished).length;
  const totalLate = result.projects.reduce((sum, project) => sum + project.lateDays, 0);
  const worstLate = Math.max(0, ...result.projects.map((project) => project.lateDays));
  const end = dayOf(result.makespanEnd ?? "") ?? Number.MAX_SAFE_INTEGER;
  return [unfinished, totalLate, worstLate, end] as const;
}

const better = (left: readonly number[], right: readonly number[]) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
};

/** Due dates first: start from the earliest due date, then swap and move projects to cut lateness. */
export function optimizeScenario(scenario: SimScenario): SimResult {
  let order = [...scenario.projects]
    .sort(
      (left, right) =>
        (dayOf(left.dueDate) ?? Number.MAX_SAFE_INTEGER) -
          (dayOf(right.dueDate) ?? Number.MAX_SAFE_INTEGER) ||
        (dayOf(left.earliestStart) ?? 0) - (dayOf(right.earliestStart) ?? 0),
    )
    .map((project) => project.id);
  let best = simulateScenario(scenario, order);
  let bestScore = scheduleScore(best);
  const consider = (candidate: string[]) => {
    const result = simulateScenario(scenario, candidate);
    const score = scheduleScore(result);
    if (!better(score, bestScore)) return false;
    order = candidate;
    best = result;
    bestScore = score;
    return true;
  };
  for (let round = 0; round < 20; round += 1) {
    let improved = false;
    // Swap two projects.
    for (let left = 0; left < order.length; left += 1)
      for (let right = left + 1; right < order.length; right += 1) {
        const candidate = [...order];
        [candidate[left], candidate[right]] = [candidate[right], candidate[left]];
        improved = consider(candidate) || improved;
      }
    // Move one project to another place in the queue.
    for (let from = 0; from < order.length; from += 1)
      for (let to = 0; to < order.length; to += 1) {
        if (to === from || to === from - 1) continue;
        const candidate = [...order];
        const [moved] = candidate.splice(from, 1);
        candidate.splice(to > from ? to - 1 : to, 0, moved);
        improved = consider(candidate) || improved;
      }
    if (!improved) break;
  }
  return best;
}
