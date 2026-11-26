import { expect, test } from "playwright/test";
import { applyGanttEdit } from "../src/lib/gantt-edit";
import { buildPortfolioProject } from "../src/lib/portfolio-schedule";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { buildProcessTimeline, normalizeScheduleCalendar } from "../src/lib/schedule-calendar";
import { createE2EWorkflow } from "./support/e2e-workflow";

const withDurations = () => {
  const file = createE2EWorkflow();
  for (const node of file.graph.nodes)
    node.conditions = node.conditions.map((condition) => ({
      ...condition,
      duration: 1,
      durationUnit: "weeks" as const,
    }));
  return file;
};

test("a Project Start Date anchors schedule day 0 and the handoff follows from Sales", () => {
  const file = withDurations();
  file.calendar = { startDate: "2030-01-01", projectStartDate: "2026-10-05", shutdowns: [] };
  const schedule = buildProcessSchedule(file);
  const timeline = buildProcessTimeline(file, schedule);
  expect(timeline.enabled).toBe(true);
  expect(timeline.projectStartDate).toBe("2026-10-05");
  expect(timeline.dateAt(0)).toBe("2026-10-05");
  if (timeline.originDay !== null)
    expect(timeline.handoffDate).toBe(timeline.dateAt(timeline.originDay));
  // A Project Start Date alone is a valid calendar.
  expect(
    normalizeScheduleCalendar({ projectStartDate: "2026-10-05", shutdowns: [] }),
  ).toMatchObject({ startDate: "2026-10-05", projectStartDate: "2026-10-05" });
});

test("L6 shows each project's start and handoff, and its drags save like L4", () => {
  const file = withDurations();
  file.calendar = { startDate: "2026-10-05", projectStartDate: "2026-10-05", shutdowns: [] };
  const project = buildPortfolioProject(file, { id: "p", name: "P", color: "#000" });
  expect(project.projectStartDate).toBe("2026-10-05");
  const task = project.departments.flatMap((department) => department.tasks)[0];
  const moved = buildPortfolioProject(
    applyGanttEdit(file, task.scheduleKey, { kind: "move", startDay: task.startDay + 3 }),
    { id: "p", name: "P", color: "#000" },
  );
  const after = moved.departments
    .flatMap((department) => department.tasks)
    .find((item) => item.scheduleKey === task.scheduleKey)!;
  expect(after.startDay).toBe(task.startDay + 3);
  const resized = buildPortfolioProject(
    applyGanttEdit(file, task.scheduleKey, { kind: "resize", days: task.days + 2 }),
    { id: "p", name: "P", color: "#000" },
  );
  expect(
    resized.departments
      .flatMap((department) => department.tasks)
      .find((item) => item.scheduleKey === task.scheduleKey)!.days,
  ).toBe(task.days + 2);
});
