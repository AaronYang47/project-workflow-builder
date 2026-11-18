import { expect, test } from "playwright/test";
import { createProjectWorkflow } from "../src/lib/project-template";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { createE2EWorkflow } from "./support/e2e-workflow";
import {
  defaultProductionPhaseId,
  applySimulatedDays,
  NEW_FACTORY_PRODUCTION_ROW,
  fobPickupDate,
  productionReleaseConditions,
  simulatedLineDays,
  optimizeScenario,
  scheduleNotes,
  simProjectFromWorkflow,
  simulateScenario,
  type SimFactory,
  type SimProject,
  type SimScenario,
} from "../src/lib/simulation";

const factory = (patch: Partial<SimFactory> = {}): SimFactory => ({
  targetOnLine: 18,
  normalMax: 19,
  crowdedMax: 23,
  yardCapacity: 100,
  installCrews: 2,
  startDate: "2027-01-04",
  ...patch,
});

const project = (id: string, patch: Partial<SimProject> = {}): SimProject => ({
  id,
  name: id,
  color: "#2563eb",
  source: { kind: "virtual" },
  modules: 18,
  weeksPerModule: 4,
  splittable: false,
  earliestStart: "2027-01-04",
  dueDate: "2027-12-31",
  delivery: { kind: "fob", pickupDate: "2027-01-04" },
  ...patch,
});

const scenario = (projects: SimProject[], patch: Partial<SimFactory> = {}): SimScenario => ({
  id: "s",
  name: "Scenario",
  factory: factory(patch),
  projects,
});

const loadOrder = (result: ReturnType<typeof simulateScenario>) => {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const day of result.days)
    for (const item of [...day.line].sort((a, b) => b.progress - a.progress)) {
      const key = `${item.projectId}#${item.module}`;
      if (!seen.has(key)) {
        seen.add(key);
        order.push(item.projectId);
      }
    }
  return order;
};

test("the line fills to about 18 modules and never goes above 19", () => {
  const result = simulateScenario(scenario([project("A", { modules: 40 })]));
  expect(result.peakOnLine).toBeGreaterThanOrEqual(18);
  expect(result.peakOnLine).toBeLessThanOrEqual(19);
  expect(Math.max(...result.days.map((day) => day.line.length))).toBeLessThanOrEqual(19);
  const a = result.projects[0];
  expect(a.finished).toBe(true);
  // The first module needs 4 weeks (28 days on a 7-day calendar) to travel the line.
  const firstOff = result.days.findIndex((day) => (day.yard.A ?? 0) > 0);
  expect(firstOff).toBeGreaterThanOrEqual(27);
  expect(firstOff).toBeLessThanOrEqual(29);
});

test("the slowest module on the line sets the pace", () => {
  const result = simulateScenario(
    scenario([
      project("fast", { modules: 4, weeksPerModule: 2 }),
      project("slow", { modules: 4, weeksPerModule: 6 }),
    ]),
    ["fast", "slow"],
  );
  // The day after the slow module joins, the whole line runs at its 6-week pace.
  const together = result.days.filter(
    (day) =>
      day.line.some((item) => item.projectId === "fast") &&
      day.line.some((item) => item.projectId === "slow"),
  )[1];
  expect(together?.paceDays).toBe(42);
  const fastAlone = result.days.filter(
    (day) => day.line.length && day.line.every((item) => item.projectId === "fast"),
  )[1];
  expect(fastAlone?.paceDays).toBe(14);
});

test("a project that isn't splittable goes on in one run; a splittable one lets an urgent project in", () => {
  const urgentLater = project("urgent", {
    modules: 6,
    earliestStart: "2027-01-08",
    dueDate: "2027-03-01",
  });
  const keepTogether = simulateScenario(scenario([project("long", { modules: 20 }), urgentLater]), [
    "urgent",
    "long",
  ]);
  const order = loadOrder(keepTogether);
  expect(order.indexOf("urgent")).toBeGreaterThan(order.lastIndexOf("long"));

  const split = simulateScenario(
    scenario([project("long", { modules: 20, splittable: true }), urgentLater]),
    ["urgent", "long"],
  );
  const splitOrder = loadOrder(split);
  expect(splitOrder.indexOf("urgent")).toBeLessThan(splitOrder.lastIndexOf("long"));
});

test("a full yard stops the line until the customer collects", () => {
  const result = simulateScenario(
    scenario(
      [
        project("waits", { modules: 6, delivery: { kind: "fob", pickupDate: "2027-04-01" } }),
        project("next", { modules: 6 }),
      ],
      { yardCapacity: 4 },
    ),
    ["waits", "next"],
  );
  expect(result.blockedDays).toBeGreaterThan(0);
  expect(Math.max(...result.days.map((day) => day.yardTotal))).toBeLessThanOrEqual(4);
  expect(result.warnings.join(" ")).toContain("yard was full");
});

test("FOB yard projects are collected on the pickup date once every module is built", () => {
  const result = simulateScenario(
    scenario([project("A", { modules: 3, delivery: { kind: "fob", pickupDate: "2027-06-01" } })]),
  );
  expect(result.projects[0].pickup).toBe("2027-06-01");
  const late = simulateScenario(
    scenario([
      project("A", {
        modules: 3,
        dueDate: "2027-01-20",
        delivery: { kind: "fob", pickupDate: "2027-01-20" },
      }),
    ]),
  );
  // A pickup reservation stays in effect even when the modules finish after it.
  expect(late.projects[0].pickup! > "2027-01-20").toBe(true);
  expect(late.projects[0].lateDays).toBeGreaterThan(0);
});

test("site projects ship, arrive and wait for a free install crew", () => {
  const site = (id: string): SimProject =>
    project(id, {
      modules: 4,
      delivery: {
        kind: "site",
        transport: "all-done",
        transportDays: 2,
        modulesPerDay: 4,
        install: { mode: "total", days: 10 },
      },
    });
  const result = simulateScenario(scenario([site("A"), site("B")], { installCrews: 1 }), [
    "A",
    "B",
  ]);
  const [a, b] = result.projects;
  expect(a.finished && b.finished).toBe(true);
  expect(b.installStart! > a.installEnd!).toBe(true);
  // Shipped once all were built, then two days on the road.
  expect(a.installStart! >= a.productionEnd!).toBe(true);
  const dispatch = result.days.findIndex((day) => day.departures.A === 4);
  expect(dispatch).toBeGreaterThanOrEqual(0);
  expect(result.days[dispatch].date).toBe(a.productionEnd);
  expect(result.days[dispatch + 1].inTransit.A).toBe(4);
  expect(result.days[dispatch + 1].departures.A).toBeUndefined();
});

test("the factory doesn't move on Friday to Sunday with a Monday–Thursday calendar", () => {
  const result = simulateScenario(
    scenario([project("A", { modules: 2 })], {
      calendar: { startDate: "2027-01-01", shutdowns: [], workWeek: "mon-thu" },
    }),
  );
  for (const [index, day] of result.days.entries()) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    if (![5, 6, 0].includes(weekday) || index === 0) continue;
    expect(day.working).toBe(false);
    expect(day.line.map((item) => item.progress)).toEqual(
      result.days[index - 1].line.map((item) => item.progress),
    );
  }
});

test("the time axis uses the earliest eligible project date over a legacy factory start", () => {
  const projects = [
    project("later", { earliestStart: "2027-01-18" }),
    project("earlier", { earliestStart: "2027-01-11" }),
  ];
  const result = simulateScenario(scenario(projects, { startDate: "2027-03-01" }));
  expect(result.days[0].date).toBe("2027-01-11");
  expect(result.projects.find((row) => row.projectId === "earlier")?.firstLoad).toBe("2027-01-11");
});

test("the optimizer puts due dates first so fewer projects are late", () => {
  const projects = [
    project("relaxed", { modules: 18, dueDate: "2027-12-01" }),
    project("tight", { modules: 6, dueDate: "2027-02-20" }),
  ];
  const naive = simulateScenario(scenario(projects), ["relaxed", "tight"]);
  const lateness = (result: ReturnType<typeof simulateScenario>) =>
    result.projects.reduce((sum, item) => sum + item.lateDays, 0);
  expect(lateness(naive)).toBeGreaterThan(0);
  const best = optimizeScenario(scenario(projects));
  expect(best.priority[0]).toBe("tight");
  expect(lateness(best)).toBeLessThan(lateness(naive));
});

test("a saved project brings its production Phase and FOB yard choice", () => {
  const file = createProjectWorkflow("Lakeside");
  file.highLevel!.graph.nodes = [
    { id: "p1", type: "start", title: "PHASE 1", description: "QUALIFICATION" },
    { id: "p2", type: "phase", title: "PHASE 2", description: "PRE-CONSTRUCTION" },
    { id: "p3", type: "phase", title: "PHASE 3", description: "CONSTRUCTION" },
    { id: "fc", type: "end", title: "Final Close", description: "", fobYard: true },
  ];
  file.highLevel!.graph.edges = [
    { id: "a", source: "p1", target: "p2" },
    { id: "b", source: "p2", target: "p3" },
    { id: "c", source: "p3", target: "fc" },
  ];
  expect(defaultProductionPhaseId(file)).toBe("p3");
  const sim = simProjectFromWorkflow(file, "abc", 0, "2027-01-04");
  expect(sim).toMatchObject({
    id: "cloud-abc",
    name: "Lakeside",
    productionPhaseId: "p3",
    source: { kind: "cloud", projectId: "abc" },
  });
  expect(sim.delivery.kind).toBe("fob");
  // Earliest pickup = when the last module leaves the line.
  expect(sim.delivery).toMatchObject({
    pickupDate: fobPickupDate({
      earliestStart: sim.earliestStart,
      modules: sim.modules,
      weeksPerModule: sim.weeksPerModule,
    }),
  });
  expect(fobPickupDate({ earliestStart: "2027-01-04", modules: 18, weeksPerModule: 4 })).toBe(
    "2027-02-27",
  );
  // Collecting in batches can start with the first module off the line.
  expect(
    fobPickupDate({ earliestStart: "2027-01-04", modules: 200, weeksPerModule: 2 }, 18, 1),
  ).toBe("2027-01-18");
  // Pipeline: (18 + 18 − 1) places × 4 weeks ÷ 18 ≈ 7.8 weeks; 36 modules: 53 places ≈ 11.8 weeks.
  expect(fobPickupDate({ earliestStart: "2027-01-04", modules: 36, weeksPerModule: 4 }, 18)).toBe(
    "2027-03-27",
  );
});

test("a yard too small for an FOB project stops the run early with a clear warning", () => {
  const result = simulateScenario(
    scenario(
      [project("big", { modules: 6, delivery: { kind: "fob", pickupDate: "2027-02-01" } })],
      { yardCapacity: 2 },
    ),
  );
  expect(result.days.length).toBeLessThan(200);
  expect(result.warnings.join(" ")).toContain("Line stuck");
  expect(result.projects[0].finished).toBe(false);
});

test("a project may allow a tight line, up to 23 modules, which is counted and warned", () => {
  const normal = simulateScenario(scenario([project("A", { modules: 40 })]));
  expect(normal.peakOnLine).toBeLessThanOrEqual(19);
  expect(normal.tightDays).toBe(0);
  const tight = simulateScenario(scenario([project("A", { modules: 40, allowTight: true })]));
  expect(tight.peakOnLine).toBeGreaterThan(19);
  expect(tight.peakOnLine).toBeLessThanOrEqual(23);
  expect(tight.tightDays).toBeGreaterThan(0);
  expect(tight.days.some((day) => day.tight)).toBe(true);
  expect(tight.warnings.join(" ")).toContain("tight");
});

test("projects report what held them up", () => {
  const result = simulateScenario(
    scenario([
      project("relaxed", { modules: 18, dueDate: "2027-12-01" }),
      project("tight", { modules: 6, dueDate: "2027-02-20" }),
    ]),
    ["relaxed", "tight"],
  );
  const late = result.projects.find((row) => row.projectId === "tight")!;
  expect(late.reasons[0]).toMatch(/waited \d+ working days for the line/);

  const site = (id: string): SimProject =>
    project(id, {
      modules: 4,
      delivery: {
        kind: "site",
        transport: "all-done",
        transportDays: 0,
        modulesPerDay: 4,
        install: { mode: "total", days: 20 },
      },
    });
  const crews = simulateScenario(scenario([site("A"), site("B")], { installCrews: 1 }), ["A", "B"]);
  expect(crews.projects[1].reasons.join(" ")).toMatch(/waited \d+ days for an install crew/);
});

test("an FOB customer can collect in batches", () => {
  const result = simulateScenario(
    scenario([
      project("A", {
        modules: 12,
        delivery: { kind: "fob", pickupDate: "2027-01-04", batchSize: 4 },
      }),
    ]),
  );
  const pickupDays = result.days.filter((day) => day.pickedUp.includes("A"));
  expect(pickupDays).toHaveLength(3);
  // The yard never fills up with the whole project: it empties every few modules.
  expect(Math.max(...result.days.map((day) => day.yardTotal))).toBeLessThan(12);
  expect(result.projects[0].completion).toBe(pickupDays.at(-1)!.date);
  // A batch leaves the day it is ready.
  const firstReady = result.days.findIndex(
    (day) => (day.yard.A ?? 0) >= 4 || day.pickedUp.includes("A"),
  );
  expect(result.days.indexOf(pickupDays[0])).toBe(firstReady);
});

test("FOB batches are not collected before the earliest pickup date", () => {
  const result = simulateScenario(
    scenario(
      [
        project("A", {
          modules: 8,
          delivery: { kind: "fob", pickupDate: "2027-05-03", batchSize: 4 },
        }),
      ],
      { yardCapacity: 20 },
    ),
  );
  const pickups = result.days.filter((day) => day.pickedUp.includes("A"));
  expect(pickups.length).toBeGreaterThan(0);
  expect(pickups.every((day) => day.date >= "2027-05-03")).toBe(true);
});

test("a stuck yard names the project and the rule holding it", () => {
  const result = simulateScenario(
    scenario(
      [
        project("Big", {
          modules: 108,
          weeksPerModule: 2,
          delivery: {
            kind: "site",
            transport: "all-done",
            transportDays: 1,
            modulesPerDay: 4,
            install: { mode: "rate", modulesPerDay: 4, finishDays: 5 },
          },
        }),
      ],
      { yardCapacity: 24 },
    ),
  );
  const stuck = result.warnings.find((warning) => warning.startsWith("Line stuck"))!;
  expect(stuck).toContain("Big (24 in the yard; shipping starts only when all 108 are built)");
  expect(stuck).toContain("Enlarge the yard");
});

test("L5 line days are written into the chosen L4 release condition", () => {
  const file = createE2EWorkflow();
  const departments = productionReleaseConditions(file, "high-level-3");
  const target = {
    nodeId: departments[0].nodeId,
    conditionId: departments[0].conditions[1].conditionId,
  };
  expect(departments[0].nodeId).toBe("production-readiness");
  expect(simulatedLineDays({ firstLoad: "2027-01-04", productionEnd: "2027-02-27" })).toBe(55);
  expect(simulatedLineDays({ firstLoad: "2027-01-04" })).toBeUndefined();
  const next = applySimulatedDays(file, target, 55, "Plan A");
  const task = buildProcessSchedule(next).tasks.find(
    (item) => item.nodeId === target.nodeId && item.conditionId === target.conditionId,
  )!;
  expect(task.days).toBe(55);
  expect(task.condition).toMatchObject({
    duration: 55,
    durationUnit: "days",
    simulated: { days: 55, scenario: "Plan A" },
  });
  expect(productionReleaseConditions(next, "high-level-3")[0].conditions[1]).toMatchObject({
    days: 55,
    simulated: 55,
  });
  // Other release conditions are untouched; an unknown target changes nothing.
  expect(next.graph.nodes.find((node) => node.id === target.nodeId)!.conditions[0]).toEqual(
    file.graph.nodes.find((node) => node.id === target.nodeId)!.conditions[0],
  );
  expect(applySimulatedDays(file, { nodeId: "x", conditionId: "y" }, 5, "A")).toBe(file);

  // It can also start a number of days after another release condition starts.
  const first = departments[0].conditions[0];
  expect(departments[0].conditions[1].after.map((item) => item.conditionId)).toContain(
    first.conditionId,
  );
  const timed = applySimulatedDays(
    file,
    {
      ...target,
      start: {
        nodeId: target.nodeId,
        conditionId: first.conditionId,
        relation: "start",
        lagDays: 5,
      },
    },
    55,
    "Plan A",
  );
  // (The fixture's earlier Phases have no durations, so check the stored timing.)
  expect(timed.graph.nodes.find((node) => node.id === target.nodeId)!.conditions[1]).toMatchObject({
    predecessor: { conditionId: first.conditionId, relation: "start", lagDays: 5 },
    startOffsetDays: undefined,
  });
  expect(productionReleaseConditions(timed, "high-level-3")[0].conditions[1].start).toEqual({
    nodeId: target.nodeId,
    conditionId: first.conditionId,
    relation: "start",
    lagDays: 5,
  });
  // Or a number of days after its Phase starts.
  const offset = applySimulatedDays(
    file,
    { ...target, start: { relation: "start", lagDays: 3 } },
    55,
    "Plan A",
  );
  expect(productionReleaseConditions(offset, "high-level-3")[0].conditions[1].start).toMatchObject({
    lagDays: 3,
  });
});

test("L5 line days can go into a new Factory Production row in L4", () => {
  const file = createE2EWorkflow();
  const department = productionReleaseConditions(file, "high-level-3")[0];
  const option = department.conditions.at(-1)!;
  expect(option.conditionId).toBe(NEW_FACTORY_PRODUCTION_ROW);
  const next = applySimulatedDays(
    file,
    {
      nodeId: department.nodeId,
      conditionId: NEW_FACTORY_PRODUCTION_ROW,
      start: {
        nodeId: department.nodeId,
        conditionId: department.conditions[0].conditionId,
        relation: "start",
        lagDays: 5,
      },
    },
    62,
    "Plan A",
  );
  const row = next.graph.nodes.find((node) => node.id === department.nodeId)!.conditions.at(-1)!;
  expect(row).toMatchObject({
    id: "factory-production",
    label: "Factory Production",
    duration: 62,
    durationUnit: "days",
    simulated: { days: 62, scenario: "Plan A" },
    predecessor: { conditionId: department.conditions[0].conditionId, lagDays: 5 },
  });
  // Now it is a real row, so the "new row" choice is gone for that Department.
  const after = productionReleaseConditions(next, "high-level-3")[0].conditions;
  expect(after.at(-1)).toMatchObject({ conditionId: "factory-production", days: 62 });
  expect(after.some((item) => item.conditionId === NEW_FACTORY_PRODUCTION_ROW)).toBe(false);
});

test("Auto schedule splits a project to fit another in, and says when splitting can't help", () => {
  const calendar = {
    startDate: "2027-01-01",
    workWeek: "mon-thu" as const,
    holidayRegion: "CA-ON" as const,
    automaticShutdowns: true,
    shutdowns: [],
  };
  const withCalendar = (projects: SimProject[]) =>
    scenario(projects, { yardCapacity: 50, calendar, startDate: undefined });
  const blue = (splittable: boolean) =>
    project("blue", {
      name: "Blue",
      modules: 30,
      earliestStart: "2027-08-25",
      dueDate: "2027-12-31",
      splittable,
    });
  const green = project("green", {
    name: "Green",
    modules: 12,
    earliestStart: "2027-09-15",
    dueDate: "2027-11-15",
  });

  // Blue can't be split: Green waits behind it and is late, though it could make it alone.
  const locked = optimizeScenario(withCalendar([blue(false), green]));
  expect(locked.projects.find((row) => row.projectId === "green")!.lateDays).toBeGreaterThan(0);
  expect(scheduleNotes(withCalendar([blue(false), green]), locked).join(" ")).toContain(
    'Tick "Can be split" there',
  );

  // Blue can be split: Green goes in between and both are on time.
  const split = optimizeScenario(withCalendar([blue(true), green]));
  expect(split.projects.every((row) => row.finished && row.lateDays === 0)).toBe(true);
  expect(split.loadRuns.map((run) => run.projectId)).toEqual(["blue", "green", "blue"]);
  expect(scheduleNotes(withCalendar([blue(true), green]), split).join(" ")).toMatch(
    /Split on the line: Blue ×\d+ → Green ×12 → Blue ×\d+\./,
  );

  // Twelve 4-week modules can't be done by 6 Oct from 25 Aug, even alone.
  const tight = withCalendar([
    project("blue", {
      name: "Blue",
      modules: 18,
      earliestStart: "2027-08-25",
      dueDate: "2027-11-23",
    }),
    project("green", {
      name: "Green",
      modules: 12,
      earliestStart: "2027-08-25",
      dueDate: "2027-10-06",
    }),
  ]);
  const notes = scheduleNotes(tight, optimizeScenario(tight)).join(" ");
  expect(notes).toContain("Green can't be on time even with the line to itself");
  expect(notes).toContain("Splitting won't help");
});

test("a loading plan in blocks runs a splittable project in parts", () => {
  const projects = [project("a", { modules: 6, splittable: true }), project("b", { modules: 6 })];
  const result = simulateScenario(
    scenario(projects),
    ["a", "b"],
    [
      { projectId: "a", modules: 2 },
      { projectId: "b", modules: 6 },
      { projectId: "a", modules: 4 },
    ],
  );
  expect(result.loadRuns).toEqual([
    { projectId: "a", modules: 2 },
    { projectId: "b", modules: 6 },
    { projectId: "a", modules: 4 },
  ]);
  // Without a plan, the order alone decides (one run each).
  expect(simulateScenario(scenario(projects), ["a", "b"]).loadRuns).toEqual([
    { projectId: "a", modules: 6 },
    { projectId: "b", modules: 6 },
  ]);
});
