import { expect, test } from "playwright/test";
import {
  departmentLoad,
  portfolioRange,
  stackLabels,
  tasksOn,
  weekStart,
  type PortfolioProject,
} from "../src/lib/portfolio-schedule";

const project = (
  id: string,
  department: string,
  steps: [string, string, string][],
): PortfolioProject => ({
  id,
  name: id,
  color: "#000",
  phases: [],
  unscheduled: 0,
  start: steps.map((step) => step[1]).sort()[0],
  end: steps.map((step) => step[2]).sort().at(-1),
  departments: [
    {
      name: department,
      tasks: steps.map(([title, start, end]) => ({
        key: `${id}:${title}`,
        projectId: id,
        title,
        chapter: "",
        department,
        phase: "PHASE 1",
        phaseColor: "#00f",
        start,
        end,
      })),
    },
  ],
});

test("L6 lines projects up by date and counts projects sharing a department each week", () => {
  // Different step orders and start dates: only the dates matter.
  const a = project("A", "Department SALES", [
    ["NDA", "2026-11-02", "2026-11-13"],
    ["Survey", "2026-11-16", "2026-11-20"],
  ]);
  const b = project("B", "Department Sales", [["Survey", "2026-11-09", "2026-11-18"]]);
  expect(weekStart("2026-11-12")).toBe("2026-11-09");
  const [sales] = departmentLoad([a, b]);
  expect(departmentLoad([a, b])).toHaveLength(1);
  expect(sales.weeks.get("2026-11-02")?.size).toBe(1);
  expect(sales.weeks.get("2026-11-09")?.size).toBe(2);
  expect(sales.weeks.get("2026-11-16")?.size).toBe(2);
  expect(tasksOn([a, b], "2026-11-10").map((task) => task.key)).toEqual(["A:NDA", "B:Survey"]);
  expect(portfolioRange([a, b])).toEqual({ start: "2026-11-02", end: "2026-11-20" });
});

test("L6 milestone labels that would overlap go on separate lines", () => {
  const { lines, count } = stackLabels([
    { key: "B start", x: 388, width: 98 },
    { key: "A start", x: 298, width: 98 },
    { key: "A handoff", x: 448, width: 113 },
    { key: "B handoff", x: 538, width: 113 },
    { key: "far", x: 900, width: 98 },
  ]);
  expect(lines.get("A start")).toBe(0);
  expect(lines.get("B start")).toBe(1);
  expect(lines.get("A handoff")).toBe(0);
  expect(lines.get("B handoff")).toBe(1);
  expect(lines.get("far")).toBe(0);
  expect(count).toBe(2);
});
