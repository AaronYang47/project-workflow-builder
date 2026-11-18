import { dayOf } from "./work-calendar";
import { simulateScenario } from "./simulate";
import type { SimBlock, SimResult, SimScenario } from "./types";

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
  return splitSearch(scenario, best);
}

/** Joins neighbouring blocks of the same project and drops empty ones. */
function normalize(blocks: SimBlock[]) {
  const out: SimBlock[] = [];
  for (const block of blocks) {
    if (block.modules <= 0) continue;
    const last = out.at(-1);
    if (last && last.projectId === block.projectId) last.modules += block.modules;
    else out.push({ ...block });
  }
  return out;
}

const MAX_SPLIT_RUNS = 3000;

/**
 * Splitting: projects marked "Can be split" may load in several runs, with
 * other projects' modules in between. Starting from the best project order,
 * this tries moving runs and cutting a splittable project's run so part of it
 * goes earlier or later, keeping any change that makes fewer projects late
 * (then less lateness, then an earlier finish, then fewer splits).
 */
function splitSearch(scenario: SimScenario, start: SimResult): SimResult {
  const splittable = new Set(
    scenario.projects.filter((project) => project.splittable).map((project) => project.id),
  );
  if (!splittable.size || scenario.projects.length < 2) return start;
  const score = (result: SimResult, blocks: SimBlock[]) => [
    ...scheduleScore(result),
    blocks.length,
  ];
  let blocks = normalize(start.sequence);
  let best = start;
  let bestScore = score(start, blocks);
  const seen = new Set<string>([JSON.stringify(blocks)]);
  let runs = 0;
  const consider = (candidate: SimBlock[]) => {
    const plan = normalize(candidate);
    const key = JSON.stringify(plan);
    if (seen.has(key) || runs >= MAX_SPLIT_RUNS) return false;
    seen.add(key);
    runs += 1;
    const result = simulateScenario(scenario, start.priority, plan);
    const candidateScore = score(result, plan);
    if (!better(candidateScore, bestScore)) return false;
    blocks = plan;
    best = result;
    bestScore = candidateScore;
    return true;
  };
  const move = (list: SimBlock[], from: number, to: number) => {
    const next = list.map((block) => ({ ...block }));
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved);
    return next;
  };
  for (let round = 0; round < 12 && runs < MAX_SPLIT_RUNS; round += 1) {
    let improved = false;
    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      // Move a whole run.
      for (let to = 0; to <= blocks.length; to += 1) {
        if (to !== index && to !== index + 1)
          improved = consider(move(blocks, index, to)) || improved;
      }
      if (!splittable.has(block.projectId) || block.modules < 2) continue;
      // Cut the run and send its first part earlier or its last part later.
      const n = block.modules;
      const cuts = [
        ...new Set([1, Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n - 1]),
      ].filter((cut) => cut >= 1 && cut < n);
      for (const cut of cuts) {
        const parts = blocks.flatMap((item, at) =>
          at === index
            ? [
                { projectId: item.projectId, modules: cut },
                { projectId: item.projectId, modules: n - cut },
              ]
            : [{ ...item }],
        );
        for (let to = 0; to < index; to += 1)
          improved = consider(move(parts, index, to)) || improved;
        for (let to = index + 3; to <= parts.length; to += 1)
          improved = consider(move(parts, index + 1, to)) || improved;
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * Plain-language notes on an Auto schedule result: how projects were split on
 * the line, and why a late project is late — the line can't build it in time
 * even on its own, or it is waiting behind projects that can't be split.
 */
export function scheduleNotes(scenario: SimScenario, result: SimResult): string[] {
  const name = new Map(scenario.projects.map((project) => [project.id, project.name]));
  const notes: string[] = [];
  const runs = result.loadRuns;
  const split = new Set(
    runs.map((run) => run.projectId).filter((id, index, ids) => ids.indexOf(id) !== index),
  );
  if (split.size)
    notes.push(
      `Split on the line: ${runs.map((run) => `${name.get(run.projectId) ?? run.projectId} ×${run.modules}`).join(" → ")}.`,
    );
  for (const row of result.projects) {
    if (row.finished && !row.lateDays) continue;
    const project = scenario.projects.find((item) => item.id === row.projectId);
    if (!project) continue;
    const alone = simulateScenario({ ...scenario, projects: [project], sequence: undefined })
      .projects[0];
    if (!alone?.finished || alone.lateDays > 0) {
      notes.push(
        `${project.name} can't be on time even with the line to itself${alone?.completion ? ` (earliest finish ${alone.completion}, ${alone.lateDays} days late)` : ""}. Splitting won't help: try "Allow a tight line", fewer weeks per module, an earlier line start or a later due date.`,
      );
    } else {
      const locked = scenario.projects.filter((item) => item.id !== project.id && !item.splittable);
      notes.push(
        locked.length
          ? `${project.name} could be on time alone (${alone.completion}); it waits behind ${locked.map((item) => item.name).join(", ")}. Tick "Can be split" there so Auto schedule can fit it in between.`
          : `${project.name} could be on time alone (${alone.completion}), but the line can't fit everyone's due dates.`,
      );
    }
  }
  return notes;
}
