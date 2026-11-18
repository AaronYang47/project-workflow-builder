import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { buildProcessSchedule, schedulePredecessorCandidates } from "@/lib/process-schedule";
import { buildProcessTimeline } from "@/lib/schedule-calendar";
import type { Condition, WorkflowFile } from "@/types/workflow";
import { dayOf, isoFromDay } from "./work-calendar";
import type { L4Start, SimProject } from "./types";

/** L1 Phases a project can choose as its factory production Phase, in order. */
export function productionPhaseOptions(file: WorkflowFile) {
  // Every L1 Phase, including any FOB yard skips, in flow order.
  const graph = file.highLevel?.graph ?? { nodes: [], edges: [] };
  return orderHighLevelNodes(graph.nodes, graph.edges)
    .filter((phase) => phase.type === "phase" || phase.type === "start")
    .map((phase) => ({ id: phase.id, title: phase.title, description: phase.description }));
}

/**
 * The CONSTRUCTION Phase (not PRE- or POST-CONSTRUCTION), else a Production
 * Phase, else the last Phase before Final Close.
 */
export function defaultProductionPhaseId(file: WorkflowFile) {
  const options = productionPhaseOptions(file);
  const label = (phase: (typeof options)[number]) => `${phase.title} ${phase.description ?? ""}`;
  return (
    options.find((phase) => /(?<![a-z-])construction\b/i.test(label(phase))) ??
    options.find((phase) => /production/i.test(label(phase))) ??
    options.at(-1)
  )?.id;
}

/**
 * FOB earliest pickup, when the last module leaves the line. The line is a
 * pipeline of `lineSlots` places: a module takes `weeksPerModule` to cross it
 * and the next one follows one place (weeksPerModule ÷ lineSlots) behind. So
 * the last of N modules is off after (N + lineSlots − 1) places, for example
 * 18 modules on an 18-place line at 4 weeks: 35 × 4 ÷ 18 ≈ 7.8 weeks.
 */
export function fobPickupDate(
  project: Pick<SimProject, "earliestStart" | "modules" | "weeksPerModule">,
  lineSlots = 18,
  batchSize?: number,
) {
  const start = dayOf(project.earliestStart);
  if (start == null) return project.earliestStart;
  // Collecting in batches starts once the first module is off the line.
  if (batchSize && batchSize > 0) return isoFromDay(start + Math.round(project.weeksPerModule * 7));
  const slots = Math.max(1, Math.round(lineSlots));
  const modules = Math.max(1, Math.round(project.modules));
  const weeks = ((modules + slots - 1) * project.weeksPerModule) / slots;
  return isoFromDay(start + Math.round(weeks * 7));
}

/**
 * Earliest line date: the L4 date the production Phase starts, which is when
 * every Phase before it is complete. Due date: the L4 finish of the whole
 * schedule. Either is undefined when the project has no Calendar handoff date.
 */
export function projectScheduleDates(file: WorkflowFile, productionPhaseId?: string) {
  const schedule = buildProcessSchedule(file);
  const timeline = buildProcessTimeline(file, schedule);
  if (!timeline.enabled) return {};
  const index = schedule.phases.findIndex((phase) => phase.id === productionPhaseId);
  const earliestStart = index >= 0 ? timeline.dateAt(schedule.phaseRanges[index].start) : undefined;
  const dueDate = schedule.totalDays > 0 ? timeline.dateAt(schedule.totalDays - 1) : undefined;
  return { earliestStart, dueDate };
}

/** The Departments in the production Phase and their L4 release conditions. */
export function productionReleaseConditions(file: WorkflowFile, productionPhaseId?: string) {
  const schedule = buildProcessSchedule(file);
  const index = schedule.phases.findIndex((phase) => phase.id === productionPhaseId);
  const departments: Array<{
    nodeId: string;
    department: string;
    conditions: Array<{
      conditionId: string;
      title: string;
      days?: number;
      simulated?: number;
      /** When it starts in L4 now. */
      start: L4Start;
      /** Release conditions it can follow (same Phase, no loops). */
      after: Array<{ nodeId: string; conditionId: string; label: string }>;
    }>;
  }> = [];
  if (index < 0) return departments;
  for (const task of schedule.tasks) {
    if (task.phaseIndex !== index) continue;
    let department = departments.find((item) => item.nodeId === task.nodeId);
    if (!department) {
      department = {
        nodeId: task.nodeId,
        department: task.department || task.chapter,
        conditions: [],
      };
      departments.push(department);
    }
    department.conditions.push({
      conditionId: task.conditionId,
      title: task.title,
      days: task.days,
      simulated: task.condition.simulated?.days,
      start: task.condition.predecessor
        ? {
            nodeId: task.condition.predecessor.nodeId,
            conditionId: task.condition.predecessor.conditionId,
            relation: task.condition.predecessor.relation ?? "finish",
            lagDays: task.condition.predecessor.lagDays ?? 0,
          }
        : { relation: "start", lagDays: task.condition.startOffsetDays ?? 0 },
      after: schedulePredecessorCandidates(schedule.tasks, task).map((candidate) => ({
        nodeId: candidate.nodeId,
        conditionId: candidate.conditionId,
        label: `${candidate.department || candidate.chapter} · ${candidate.title}`,
      })),
    });
  }
  // Each Department can take L5's line time as its own "Factory Production" row.
  const phaseTasks = schedule.tasks.filter((task) => task.phaseIndex === index);
  for (const department of departments) {
    if (department.conditions.some((item) => FACTORY_PRODUCTION_TITLE.test(item.title))) continue;
    department.conditions.push({
      conditionId: NEW_FACTORY_PRODUCTION_ROW,
      title: "+ Factory Production (new row)",
      start: { relation: "start", lagDays: 0 },
      after: phaseTasks.map((task) => ({
        nodeId: task.nodeId,
        conditionId: task.conditionId,
        label: `${task.department || task.chapter} · ${task.title}`,
      })),
    });
  }
  return departments;
}

/** Release condition id meaning "add a new Factory Production row". */
export const NEW_FACTORY_PRODUCTION_ROW = "new:factory-production";
const FACTORY_PRODUCTION_TITLE = /^factory production$/i;

/** A Factory Production row that L5 added to L4. */
export const isFactoryProductionRow = (condition: Condition) =>
  /^factory-production(-\d+)?$/.test(condition.id ?? "");

/**
 * Keeps L4's Factory Production row in step with L5: the chosen Department has
 * one, with L5's line days and start timing; any other is removed (none when
 * no Department is chosen, or when another release condition is chosen).
 * Returns the same file when it already matches.
 */
export function syncFactoryProductionRow(
  file: WorkflowFile,
  target: { nodeId: string; conditionId: string; start?: L4Start } | undefined,
  days: number | undefined,
  scenario: string,
): WorkflowFile {
  const wanted =
    target &&
    (target.conditionId === NEW_FACTORY_PRODUCTION_ROW ||
      /^factory-production(-\d+)?$/.test(target.conditionId))
      ? target
      : undefined;
  const node = wanted && file.graph.nodes.find((item) => item.id === wanted.nodeId);
  const keep = node?.conditions.find(
    (condition) =>
      isFactoryProductionRow(condition) &&
      (wanted!.conditionId === NEW_FACTORY_PRODUCTION_ROW || condition.id === wanted!.conditionId),
  );
  // Drop every other Factory Production row.
  let next = file;
  if (
    file.graph.nodes.some((item) =>
      item.conditions.some((condition) => isFactoryProductionRow(condition) && condition !== keep),
    )
  )
    next = {
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) =>
          item.conditions.some(
            (condition) => isFactoryProductionRow(condition) && condition !== keep,
          )
            ? {
                ...item,
                conditions: item.conditions.filter(
                  (condition) => !isFactoryProductionRow(condition) || condition === keep,
                ),
              }
            : item,
        ),
      },
    };
  if (!wanted || !node || days === undefined) return next;
  if (keep) {
    const start = wanted.start;
    const matches =
      keep.duration === days &&
      keep.durationUnit === "days" &&
      keep.simulated?.days === days &&
      keep.simulated.managed === true &&
      (!start ||
        (start.nodeId
          ? keep.predecessor?.nodeId === start.nodeId &&
            keep.predecessor.conditionId === start.conditionId &&
            (keep.predecessor.relation ?? "finish") === start.relation &&
            (keep.predecessor.lagDays ?? 0) === start.lagDays
          : !keep.predecessor && (keep.startOffsetDays ?? 0) === start.lagDays));
    if (matches) return next;
    return applySimulatedDays(next, { ...wanted, conditionId: keep.id! }, days, scenario);
  }
  return applySimulatedDays(
    next,
    { ...wanted, conditionId: NEW_FACTORY_PRODUCTION_ROW },
    days,
    scenario,
  );
}

/** Days a project is on the line in L5: first module on through the last module off. */
export function simulatedLineDays(result: { firstLoad?: string; productionEnd?: string }) {
  const start = dayOf(result.firstLoad ?? "");
  const end = dayOf(result.productionEnd ?? "");
  return start == null || end == null || end < start ? undefined : end - start + 1;
}

/**
 * Writes the simulated line days into an L4 release condition's duration
 * (L4 durations are elapsed days, days off included) and notes where they came from.
 */
export function applySimulatedDays(
  file: WorkflowFile,
  target: { nodeId: string; conditionId: string; start?: L4Start },
  days: number,
  scenario: string,
): WorkflowFile {
  const start = target.start;
  if (target.conditionId === NEW_FACTORY_PRODUCTION_ROW) {
    // A new "Factory Production" row at the end of the Department.
    const node = file.graph.nodes.find((item) => item.id === target.nodeId);
    if (!node) return file;
    const ids = new Set(node.conditions.map((condition) => condition.id));
    let id = "factory-production";
    for (let n = 2; ids.has(id); n += 1) id = `factory-production-${n}`;
    const added: WorkflowFile = {
      ...file,
      graph: {
        ...file.graph,
        nodes: file.graph.nodes.map((item) =>
          item.id === node.id
            ? { ...item, conditions: [...item.conditions, { id, label: "Factory Production" }] }
            : item,
        ),
      },
    };
    return applySimulatedDays(added, { ...target, conditionId: id }, days, scenario);
  }
  const schedule = buildProcessSchedule(file);
  const task = schedule.tasks.find(
    (item) => item.nodeId === target.nodeId && item.conditionId === target.conditionId,
  );
  if (!task) return file;
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) =>
        node.id !== task.nodeId
          ? node
          : {
              ...node,
              conditions: node.conditions.map((condition, index) =>
                index !== task.conditionIndex
                  ? condition
                  : {
                      ...condition,
                      duration: days,
                      durationUnit: "days" as const,
                      simulated: {
                        days,
                        scenario,
                        updatedAt: new Date().toISOString(),
                        ...(isFactoryProductionRow(condition) ? { managed: true } : {}),
                      },
                      ...(!start
                        ? {}
                        : start.nodeId && start.conditionId
                          ? {
                              predecessor: {
                                nodeId: start.nodeId,
                                conditionId: start.conditionId,
                                relation: start.relation,
                                lagDays: Math.max(0, Math.round(start.lagDays)),
                              },
                              startOffsetDays: undefined,
                            }
                          : {
                              predecessor: undefined,
                              startOffsetDays: Math.max(0, Math.round(start.lagDays)),
                            }),
                    },
              ),
            },
      ),
    },
  };
}

const PROJECT_COLORS = ["#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2"];

/**
 * A simulation project from a saved project: FOB yard comes from Final Close,
 * dates from its L4 schedule, modules and weeks per module from its
 * L4 Factory line inputs; without them they start at a typical line load.
 */
export function simProjectFromWorkflow(
  file: WorkflowFile,
  cloudId: string,
  index: number,
  today: string,
): SimProject {
  const productionPhaseId = defaultProductionPhaseId(file);
  const dates = projectScheduleDates(file, productionPhaseId);
  const fobYard = (file.highLevel?.graph.nodes ?? []).some(
    (node) => node.type === "end" && node.fobYard === true,
  );
  const earliestStart = dates.earliestStart ?? today;
  const dueDate = dates.dueDate ?? isoFromDay((dayOf(earliestStart) ?? dayOf(today) ?? 0) + 7 * 16);
  const modules = file.factoryProduction?.modules || 18;
  const weeksPerModule = file.factoryProduction?.weeksPerModule || 4;
  return {
    id: `cloud-${cloudId}`,
    name: file.graph.metadata.name?.trim() || "Project",
    color: PROJECT_COLORS[index % PROJECT_COLORS.length],
    source: { kind: "cloud", projectId: cloudId },
    modules,
    weeksPerModule,
    splittable: false,
    productionPhaseId,
    earliestStart,
    dueDate,
    delivery: fobYard
      ? { kind: "fob", pickupDate: fobPickupDate({ earliestStart, modules, weeksPerModule }) }
      : {
          kind: "site",
          transport: "as-built",
          transportDays: 1,
          modulesPerDay: 4,
          install: { mode: "rate", modulesPerDay: 4, finishDays: 5 },
        },
    siteCalendar: file.calendar,
  };
}

export function virtualSimProject(index: number, today: string): SimProject {
  const start = dayOf(today) ?? 0;
  return {
    id: `virtual-${Date.now().toString(36)}-${index}`,
    name: `Virtual project ${index + 1}`,
    color: PROJECT_COLORS[index % PROJECT_COLORS.length],
    source: { kind: "virtual" },
    modules: 12,
    weeksPerModule: 4,
    splittable: true,
    earliestStart: today,
    dueDate: isoFromDay(start + 7 * 12),
    delivery: {
      kind: "fob",
      pickupDate: fobPickupDate({ earliestStart: today, modules: 12, weeksPerModule: 4 }),
    },
  };
}
