import { dayOf, isoFromDay, workingDayTest } from "./work-calendar";
import type {
  SimDay,
  SimModuleOnLine,
  SimProject,
  SimProjectResult,
  SimResult,
  SimScenario,
} from "./types";

/** Stop a run that can never finish (for example a yard smaller than a project). */
const MAX_DAYS = 365 * 8;
const EPSILON = 1e-9;

type ProjectState = {
  project: SimProject;
  start: number;
  due: number;
  /** Working days a module needs to travel the line. */
  lineDays: number;
  loaded: number;
  produced: number;
  inYard: number;
  departed: number;
  arrived: number;
  installed: number;
  arrivals: { day: number; count: number }[];
  firstLoad?: number;
  lastLoad?: number;
  productionEnd?: number;
  pickup?: number;
  installStart?: number;
  installEnd?: number;
  /** Rate installs: site working days of finishing still to go after the last module. */
  finishLeft?: number;
  /** Total installs: site working days still to go. */
  installLeft?: number;
  completion?: number;
  isSiteWorking: (day: number) => boolean;
};

/**
 * Runs the factory one calendar day at a time.
 *
 * The line: modules sit on one moving line, about `targetOnLine` apart. On a
 * factory working day the whole line moves forward together, at the pace of
 * the slowest module on it (the one needing the most weeks). A module reaching
 * the end goes to the yard; if the yard has no room, the line stops that day.
 * New modules join at the start while there's room, in `priority` order: a
 * project that isn't splittable keeps the entrance until all its modules are
 * on. The scheduler never goes above `normalMax`.
 *
 * After the line: FOB yard projects are collected on their pickup date once
 * every module is built. Site projects ship from the yard (as built, once all
 * are built, or once the site is ready), arrive after the transport days, and
 * are installed by a free crew.
 */
export function simulateScenario(scenario: SimScenario, priority?: string[]): SimResult {
  const { factory } = scenario;
  const factoryCalendar = workingDayTest(factory.calendar);
  const order = priority ?? scenario.priority ?? scenario.projects.map((project) => project.id);
  const rank = new Map(order.map((id, index) => [id, index]));
  const projects = scenario.projects.filter((project) => project.modules > 0);
  const states: ProjectState[] = projects
    .map((project) => ({
      project,
      start: dayOf(project.earliestStart) ?? dayOf(factory.startDate) ?? 0,
      due: dayOf(project.dueDate) ?? Number.POSITIVE_INFINITY,
      lineDays: Math.max(
        1,
        Math.round(project.weeksPerModule * factoryCalendar.workingDaysPerWeek),
      ),
      loaded: 0,
      produced: 0,
      inYard: 0,
      departed: 0,
      arrived: 0,
      installed: 0,
      arrivals: [],
      isSiteWorking: project.siteCalendar
        ? workingDayTest(project.siteCalendar).isWorking
        : factoryCalendar.isWorking,
    }))
    .sort(
      (left, right) =>
        (rank.get(left.project.id) ?? Infinity) - (rank.get(right.project.id) ?? Infinity),
    );
  const byId = new Map(states.map((state) => [state.project.id, state]));
  const warnings: string[] = [];
  const spacing = 1 / Math.max(1, factory.targetOnLine);
  const lineLimit = Math.max(1, factory.normalMax);
  const crews = Math.max(0, factory.installCrews);

  for (const state of states) {
    if (state.project.modules > factory.yardCapacity && state.project.delivery.kind === "fob")
      warnings.push(
        `${state.project.name}: ${state.project.modules} modules wait for pickup but the yard holds ${factory.yardCapacity}; the line will stop.`,
      );
  }

  let line: (SimModuleOnLine & { lineDays: number })[] = [];
  let yardTotal = 0;
  let locked: ProjectState | undefined;
  let blockedDays = 0;
  let peakOnLine = 0;
  const installing = new Set<string>();
  const days: SimDay[] = [];
  const firstDay = Math.min(
    dayOf(factory.startDate) ?? Infinity,
    ...states.map((state) => state.start),
  );
  const done = () => states.every((state) => state.completion !== undefined);

  for (let day = firstDay; Number.isFinite(day) && !done(); day += 1) {
    if (day - firstDay > MAX_DAYS) {
      warnings.push("Stopped after 8 years: some projects can never finish with these settings.");
      break;
    }
    const events: string[] = [];
    const working = factoryCalendar.isWorking(day);
    let blocked = false;
    let paceDays = 0;

    if (working) {
      // 1. The line moves at the pace of its slowest module.
      if (line.length) {
        paceDays = Math.max(...line.map((item) => item.lineDays));
        const step = 1 / paceDays;
        const leaving = line.filter((item) => item.progress + step >= 1 - EPSILON);
        if (yardTotal + leaving.length > factory.yardCapacity) {
          blocked = true;
          blockedDays += 1;
          events.push("Line stopped: the yard is full.");
        } else {
          line = line
            .map((item) => ({ ...item, progress: item.progress + step }))
            .filter((item) => item.progress < 1 - EPSILON);
          for (const item of leaving) {
            const state = byId.get(item.projectId)!;
            state.produced += 1;
            state.inYard += 1;
            yardTotal += 1;
            if (state.produced === state.project.modules) {
              state.productionEnd = day;
              events.push(`${state.project.name}: last module off the line.`);
            }
          }
        }
      }

      // 2. New modules join at the start, spaced like a full line.
      if (!blocked) {
        for (;;) {
          if (line.length >= lineLimit) break;
          const newest = line.reduce<number>((low, item) => Math.min(low, item.progress), 1);
          if (line.length && newest < spacing - EPSILON) break;
          const available = (state: ProjectState) =>
            state.start <= day && state.loaded < state.project.modules;
          if (locked && !available(locked)) locked = undefined;
          const next = locked ?? states.find(available);
          if (!next) break;
          if (!next.project.splittable) locked = next;
          next.loaded += 1;
          next.firstLoad ??= day;
          next.lastLoad = day;
          if (next.loaded === next.project.modules && locked === next) locked = undefined;
          line.push({
            projectId: next.project.id,
            module: next.loaded,
            progress: line.length ? newest - spacing : 0,
            lineDays: next.lineDays,
          });
          if (next.loaded === 1) events.push(`${next.project.name}: first module on the line.`);
        }
      }
      peakOnLine = Math.max(peakOnLine, line.length);
    }

    // 3. Deliveries, in priority order.
    for (const state of states) {
      const delivery = state.project.delivery;
      const allBuilt = state.produced === state.project.modules;
      if (delivery.kind === "fob") {
        const pickupDay = dayOf(delivery.pickupDate) ?? Infinity;
        if (state.pickup === undefined && allBuilt && day >= pickupDay) {
          yardTotal -= state.inYard;
          state.inYard = 0;
          state.pickup = day;
          state.completion = day;
          events.push(`${state.project.name}: picked up from the FOB yard.`);
        }
        continue;
      }
      // Site delivery: ship on factory working days.
      const readyDay = dayOf(delivery.siteReadyDate ?? "") ?? -Infinity;
      const mayShip =
        delivery.transport === "as-built" ||
        (delivery.transport === "all-done" && allBuilt) ||
        (delivery.transport === "site-ready" && day >= readyDay);
      if (working && mayShip && state.inYard > 0) {
        const count = Math.min(state.inYard, Math.max(1, delivery.modulesPerDay));
        state.inYard -= count;
        yardTotal -= count;
        state.departed += count;
        state.arrivals.push({ day: day + Math.max(0, delivery.transportDays), count });
      }
      for (const arrival of state.arrivals) {
        if (arrival.day === day) state.arrived += arrival.count;
      }
    }

    // 4. Installation: a free crew starts the highest-priority site that can start.
    // A crew that finishes today moves to its next site tomorrow.
    const finishedToday: string[] = [];
    for (const state of states) {
      const delivery = state.project.delivery;
      if (delivery.kind !== "site" || state.completion !== undefined) continue;
      const install = delivery.install;
      if (state.installStart === undefined) {
        const canStart =
          install.mode === "total"
            ? state.arrived === state.project.modules
            : state.arrived > state.installed;
        if (!canStart || installing.size >= crews || !state.isSiteWorking(day)) continue;
        state.installStart = day;
        installing.add(state.project.id);
        if (install.mode === "total") state.installLeft = Math.max(1, install.days);
        events.push(`${state.project.name}: installation started.`);
      }
      if (!state.isSiteWorking(day)) continue;
      if (install.mode === "total") {
        state.installLeft = (state.installLeft ?? 1) - 1;
        if (state.installLeft <= 0) {
          state.installed = state.project.modules;
          state.installEnd = day;
        }
      } else if (state.installed < state.project.modules) {
        state.installed += Math.min(
          Math.max(1, install.modulesPerDay),
          state.arrived - state.installed,
        );
        if (state.installed === state.project.modules) state.finishLeft = install.finishDays;
      } else if ((state.finishLeft ?? 0) > 0) {
        state.finishLeft = (state.finishLeft ?? 0) - 1;
      }
      if (
        state.installEnd === undefined &&
        state.installed === state.project.modules &&
        (install.mode === "total" || (state.finishLeft ?? 0) <= 0)
      )
        state.installEnd = day;
      if (state.installEnd !== undefined) {
        state.completion = day;
        finishedToday.push(state.project.id);
        events.push(`${state.project.name}: installation complete.`);
      }
    }

    days.push({
      date: isoFromDay(day),
      working,
      line: line.map(({ projectId, module, progress }) => ({ projectId, module, progress })),
      paceDays,
      blocked,
      yard: Object.fromEntries(
        states.filter((state) => state.inYard > 0).map((state) => [state.project.id, state.inYard]),
      ),
      yardTotal,
      inTransit: Object.fromEntries(
        states
          .map((state) => [state.project.id, state.departed - state.arrived] as const)
          .filter(([, count]) => count > 0),
      ),
      installing: [...installing],
      sites: Object.fromEntries(
        states
          .filter((state) => state.project.delivery.kind === "site")
          .map((state) => [
            state.project.id,
            {
              arrived: state.arrived,
              installed: state.installed,
              modules: state.project.modules,
            },
          ]),
      ),
      pickedUp: states.filter((state) => state.pickup === day).map((state) => state.project.id),
      events,
    });
    for (const id of finishedToday) installing.delete(id);
  }

  const results: SimProjectResult[] = states.map((state) => {
    const iso = (day?: number) => (day === undefined ? undefined : isoFromDay(day));
    const lateDays =
      state.completion === undefined || !Number.isFinite(state.due)
        ? 0
        : Math.max(0, state.completion - state.due);
    return {
      projectId: state.project.id,
      firstLoad: iso(state.firstLoad),
      lastLoad: iso(state.lastLoad),
      productionEnd: iso(state.productionEnd),
      pickup: iso(state.pickup),
      installStart: iso(state.installStart),
      installEnd: iso(state.installEnd),
      completion: iso(state.completion),
      lateDays,
      finished: state.completion !== undefined,
    };
  });
  for (const result of results) {
    const name = byId.get(result.projectId)!.project.name;
    if (!result.finished) warnings.push(`${name}: does not finish.`);
    else if (result.lateDays > 0) warnings.push(`${name}: ${result.lateDays} days late.`);
  }
  if (blockedDays) warnings.push(`The line stopped ${blockedDays} days because the yard was full.`);
  const completions = states.flatMap((state) =>
    state.completion === undefined ? [] : [state.completion],
  );
  return {
    days,
    projects: results,
    priority: states.map((state) => state.project.id),
    blockedDays,
    peakOnLine,
    makespanEnd: completions.length ? isoFromDay(Math.max(...completions)) : undefined,
    warnings,
  };
}
