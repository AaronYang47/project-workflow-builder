import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import { buildProcessSchedule } from "@/lib/process-schedule";
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

/** A Factory Production row that L5 added to L4. */
export const isFactoryProductionRow = (condition: Condition) =>
  /^factory-production(-\d+)?$/.test(condition.id ?? "");

/**
 * The Departments in the production Phase and their L4 release conditions
 * (L5's own Factory Production rows left out), each with the conditions the
 * Factory Production row may be timed after.
 */
export function productionReleaseConditions(file: WorkflowFile, productionPhaseId?: string) {
  const schedule = buildProcessSchedule(file);
  const index = schedule.phases.findIndex((phase) => phase.id === productionPhaseId);
  const departments: Array<{
    nodeId: string;
    department: string;
    conditions: Array<{ conditionId: string; title: string }>;
  }> = [];
  const after: Array<{ nodeId: string; conditionId: string; label: string }> = [];
  if (index < 0) return { departments, after };
  for (const task of schedule.tasks) {
    if (task.phaseIndex !== index || isFactoryProductionRow(task.condition)) continue;
    let department = departments.find((item) => item.nodeId === task.nodeId);
    if (!department) {
      department = {
        nodeId: task.nodeId,
        department: task.department || task.chapter,
        conditions: [],
      };
      departments.push(department);
    }
    department.conditions.push({ conditionId: task.conditionId, title: task.title });
    after.push({
      nodeId: task.nodeId,
      conditionId: task.conditionId,
      label: `${task.department || task.chapter} · ${task.title}`,
    });
  }
  return { departments, after };
}

/** Days a project is on the line in L5: first module on through the last module off. */
export function simulatedLineDays(result: { firstLoad?: string; productionEnd?: string }) {
  const start = dayOf(result.firstLoad ?? "");
  const end = dayOf(result.productionEnd ?? "");
  return start == null || end == null || end < start ? undefined : end - start + 1;
}

/** By default the Factory Production row starts when the chosen condition finishes. */
export function defaultFactoryStart(target: { nodeId: string; conditionId: string }): L4Start {
  return { nodeId: target.nodeId, conditionId: target.conditionId, relation: "finish", lagDays: 0 };
}

const conditionIdAt = (conditions: Condition[], index: number) =>
  conditions[index]?.id || `index-${index}`;

/**
 * L5 never changes L4's own release conditions; it only adds one row. This
 * keeps that "Factory Production" row right below the chosen release
 * condition, with L5's line days and start timing, and removes it everywhere
 * else (no row at all when no release condition is chosen). Returns the same
 * file when it already matches.
 */
export function syncFactoryProductionRow(
  file: WorkflowFile,
  target: { nodeId: string; conditionId: string; start?: L4Start } | undefined,
  days: number | undefined,
  scenario: string,
): WorkflowFile {
  const node = target && file.graph.nodes.find((item) => item.id === target.nodeId);
  const own = node?.conditions.filter(isFactoryProductionRow) ?? [];
  const existing = own[0];
  // The chosen condition, among L4's own rows.
  const base = node
    ? node.conditions.filter((condition) => !isFactoryProductionRow(condition))
    : [];
  const anchorIndex = node
    ? node.conditions.findIndex(
        (condition, index) =>
          !isFactoryProductionRow(condition) &&
          conditionIdAt(node.conditions, index) === target!.conditionId,
      )
    : -1;
  const keepRow = node && anchorIndex >= 0 && (days !== undefined || existing);
  let row: Condition | undefined;
  if (keepRow && node) {
    const start = target!.start ?? defaultFactoryStart(target!);
    const lineDays = days ?? existing?.simulated?.days ?? existing?.duration ?? 1;
    row = {
      ...(existing ?? {}),
      id: existing?.id ?? "factory-production",
      label: "Factory Production",
      duration: lineDays,
      durationUnit: "days",
      ...(start.nodeId && start.conditionId
        ? {
            predecessor: {
              nodeId: start.nodeId,
              conditionId: start.conditionId,
              relation: start.relation,
              lagDays: Math.max(0, Math.round(start.lagDays)),
            },
            startOffsetDays: undefined,
          }
        : { predecessor: undefined, startOffsetDays: Math.max(0, Math.round(start.lagDays)) }),
      simulated: {
        days: lineDays,
        scenario,
        updatedAt: existing?.simulated?.updatedAt ?? new Date().toISOString(),
        managed: true,
      },
    };
  }
  const sameRow = (left?: Condition, right?: Condition) => {
    if (!left || !right) return left === right;
    const strip = (condition: Condition) => ({
      ...condition,
      simulated: condition.simulated && { ...condition.simulated, updatedAt: "", scenario: "" },
    });
    return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
  };
  let changed = false;
  const nodes = file.graph.nodes.map((item) => {
    const mine = item.conditions.filter(isFactoryProductionRow);
    if (item !== node || !row) {
      if (!mine.length) return item;
      changed = true;
      return { ...item, conditions: item.conditions.filter((c) => !isFactoryProductionRow(c)) };
    }
    // Right below the chosen condition.
    const anchor = item.conditions[anchorIndex];
    const at = base.indexOf(anchor) + 1;
    const conditions = [...base.slice(0, at), row, ...base.slice(at)];
    const same =
      conditions.length === item.conditions.length &&
      conditions.every((condition, index) =>
        condition === row
          ? sameRow(condition, item.conditions[index])
          : condition === item.conditions[index],
      );
    if (same) return item;
    changed = true;
    return {
      ...item,
      conditions: conditions.map((condition) =>
        condition === row
          ? { ...row, simulated: { ...row.simulated!, updatedAt: new Date().toISOString() } }
          : condition,
      ),
    };
  });
  return changed ? { ...file, graph: { ...file.graph, nodes } } : file;
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
