import { dayOf } from "./work-calendar";
import { simulateScenario } from "./simulate";
import type { SimResult, SimScenario } from "./types";

/** Prefer finishing all projects, then the earliest overall finish and earlier individual finishes. */
export function scheduleScore(result: SimResult) {
  const unfinished = result.projects.filter((project) => !project.finished).length;
  const end = dayOf(result.makespanEnd ?? "") ?? Infinity;
  const completionDays = result.projects.reduce(
    (sum, project) => sum + (dayOf(project.completion ?? "") ?? 0),
    0,
  );
  return [unfinished, end, completionDays] as const;
}

const better = (left: readonly number[], right: readonly number[]) => {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index];
  }
  return false;
};

/** Search for an earlier finish by swapping and moving projects in loading order. */
export function optimizeScenario(scenario: SimScenario): SimResult {
  let best = simulateScenario(scenario);
  let order = best.priority;
  const byEarliestStart = [...scenario.projects]
    .sort((left, right) => (dayOf(left.earliestStart) ?? 0) - (dayOf(right.earliestStart) ?? 0))
    .map((project) => project.id);
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
  consider(byEarliestStart);
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
