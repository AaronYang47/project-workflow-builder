import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { buildProcessSchedule } from "@/lib/process-schedule";
import { buildProcessTimeline } from "@/lib/schedule-calendar";
import type { WorkflowFile } from "@/types/workflow";
import { dayOf, isoFromDay } from "./work-calendar";
import type { SimProject } from "./types";

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
) {
  const start = dayOf(project.earliestStart);
  if (start == null) return project.earliestStart;
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
    conditions: Array<{ conditionId: string; title: string; days?: number; simulated?: number }>;
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
    });
  }
  return departments;
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
  target: { nodeId: string; conditionId: string },
  days: number,
  scenario: string,
): WorkflowFile {
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
                      simulated: { days, scenario, updatedAt: new Date().toISOString() },
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
