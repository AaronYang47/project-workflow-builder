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

/**
 * Finds a loading priority that keeps projects on time first and then
 * finishes everything earliest. Starts from the earliest due date first and
 * keeps swapping two projects while that improves the result.
 */
export function optimizeScenario(scenario: SimScenario): SimResult {
  let order = [...scenario.projects]
    .sort(
      (left, right) =>
        (dayOf(left.dueDate) ?? Infinity) - (dayOf(right.dueDate) ?? Infinity) ||
        (dayOf(left.earliestStart) ?? 0) - (dayOf(right.earliestStart) ?? 0),
    )
    .map((project) => project.id);
  let best = simulateScenario(scenario, order);
  let bestScore = scheduleScore(best);
  for (let round = 0; round < 20; round += 1) {
    let improved = false;
    for (let left = 0; left < order.length; left += 1) {
      for (let right = left + 1; right < order.length; right += 1) {
        const candidate = [...order];
        [candidate[left], candidate[right]] = [candidate[right], candidate[left]];
        const result = simulateScenario(scenario, candidate);
        const score = scheduleScore(result);
        if (better(score, bestScore)) {
          order = candidate;
          best = result;
          bestScore = score;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}
