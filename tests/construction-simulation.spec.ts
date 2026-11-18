import { expect, test } from "playwright/test";
import { createProjectWorkflow } from "../src/lib/project-template";
import {
  defaultProductionPhaseId,
  optimizeScenario,
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
  // Not built by the pickup date: collected the day it is, and counted late.
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

test("the optimizer orders projects so fewer are late", () => {
  const projects = [
    project("relaxed", { modules: 18, dueDate: "2027-12-01" }),
    project("tight", { modules: 6, dueDate: "2027-02-20" }),
  ];
  const naive = simulateScenario(scenario(projects), ["relaxed", "tight"]);
  const best = optimizeScenario(scenario(projects));
  const late = (result: typeof naive) =>
    result.projects.reduce((sum, item) => sum + item.lateDays, 0);
  expect(late(naive)).toBeGreaterThan(0);
  expect(late(best)).toBeLessThan(late(naive));
  expect(best.priority[0]).toBe("tight");
});

test("a saved project brings its production Phase and FOB yard choice", () => {
  const file = createProjectWorkflow("Lakeside");
  file.highLevel!.graph.nodes = [
    { id: "p1", type: "start", title: "PHASE 1", description: "QUALIFICATION" },
    { id: "p2", type: "phase", title: "PHASE 2", description: "PRE-DESIGN" },
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

test("late projects say what held them up", () => {
  const result = simulateScenario(
    scenario([
      project("relaxed", { modules: 18, dueDate: "2027-12-01" }),
      project("tight", { modules: 6, dueDate: "2027-02-20" }),
    ]),
    ["relaxed", "tight"],
  );
  const late = result.projects.find((row) => row.projectId === "tight")!;
  expect(late.lateDays).toBeGreaterThan(0);
  expect(late.reasons[0]).toMatch(/waited \d+ working days for the line/);
  expect(result.warnings.join(" ")).toContain("waited");

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

test("an FOB customer can collect in batches after a few days", () => {
  const result = simulateScenario(
    scenario([
      project("A", {
        modules: 12,
        delivery: { kind: "fob", pickupDate: "2027-01-04", batchSize: 4, pickupDelayDays: 2 },
      }),
    ]),
  );
  const pickupDays = result.days.filter((day) => day.pickedUp.includes("A"));
  expect(pickupDays).toHaveLength(3);
  // The yard never fills up with the whole project: it empties every few modules.
  expect(Math.max(...result.days.map((day) => day.yardTotal))).toBeLessThan(12);
  expect(result.projects[0].completion).toBe(pickupDays.at(-1)!.date);
  // Each batch waits two days for the truck.
  const firstReady = result.days.findIndex((day) => (day.yard.A ?? 0) >= 4);
  const firstPickup = result.days.indexOf(pickupDays[0]);
  expect(firstPickup - firstReady).toBe(2);
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
