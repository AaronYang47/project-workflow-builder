import { expect, test } from "playwright/test";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { sequenceSchedule } from "../src/lib/sequence-schedule";
import { parseReleaseConditionLines } from "../src/lib/release-condition-inbox";
import { createE2EWorkflow } from "./support/e2e-workflow";

test("Sequence all chains every step within its Phase and gives missing durations 1 week", () => {
  const file = createE2EWorkflow();
  for (const node of file.graph.nodes)
    node.conditions = node.conditions.map((condition) => ({
      ...condition,
      duration: undefined,
      durationUnit: undefined,
      startOffsetDays: 3,
    }));
  const sequenced = sequenceSchedule(file);
  const schedule = buildProcessSchedule(sequenced);
  const scheduled = schedule.tasks.filter((task) => task.phaseIndex >= 0);
  expect(scheduled.length).toBeGreaterThan(1);
  for (const task of scheduled) {
    expect(task.condition.duration).toBe(1);
    expect(task.condition.durationUnit).toBe("weeks");
    expect(task.condition.startOffsetDays).toBeUndefined();
    expect(task.end).toBeDefined();
  }
  // In Gantt order, each step of a Phase starts when the one above it finishes.
  const ordered = schedule.departments.flatMap((department) =>
    department.chapters.flatMap((chapter) => chapter.tasks),
  );
  for (let phase = 0; phase < schedule.phases.length; phase++) {
    const inPhase = ordered.filter((task) => task.phaseIndex === phase);
    for (let index = 1; index < inPhase.length; index++)
      expect(inPhase[index].start).toBe(inPhase[index - 1].end);
  }
});

test("new steps start at 1 week", () => {
  expect(parseReleaseConditionLines("Permit drawing approved")[0]).toMatchObject({
    duration: 1,
    durationUnit: "weeks",
  });
});
