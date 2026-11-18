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

/** FOB earliest pickup: line start + modules × weeks per module. */
export function fobPickupDate(
  project: Pick<SimProject, "earliestStart" | "modules" | "weeksPerModule">,
) {
  const start = dayOf(project.earliestStart);
  if (start == null) return project.earliestStart;
  return isoFromDay(start + Math.round(project.modules * project.weeksPerModule * 7));
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
