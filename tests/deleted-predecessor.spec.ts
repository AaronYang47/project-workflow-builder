import { expect, test } from "playwright/test";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { useWorkflowStore } from "../src/store/workflow-store";
import { createE2EWorkflow } from "./support/e2e-workflow";

/** Two Departments in one Phase: the second starts after the first's 2nd condition. */
function chained() {
  const file = createE2EWorkflow();
  file.calendar = { startDate: "2027-01-04", shutdowns: [] };
  file.graph.nodes = file.graph.nodes.map((node) => ({
    ...node,
    conditions: node.conditions.map((condition) => ({
      ...condition,
      duration: 5,
      durationUnit: "days" as const,
    })),
  }));
  const departments = file.graph.nodes.filter(
    (node) => node.type === "general" && node.conditions.length >= 3,
  );
  const [first, second] = departments;
  first.conditions = first.conditions.map((condition) => ({
    ...condition,
    duration: 5,
    durationUnit: "days" as const,
  }));
  second.conditions = second.conditions.map((condition, index) => ({
    ...condition,
    duration: 5,
    durationUnit: "days" as const,
    ...(index === 0
      ? {
          predecessor: {
            nodeId: first.id,
            conditionId: first.conditions[1].id!,
            relation: "finish" as const,
            lagDays: 0,
          },
        }
      : {}),
  }));
  return { file, first, second };
}

test("a deleted predecessor no longer stops the rows after it from being scheduled", () => {
  const { file, first, second } = chained();
  // The condition it followed is gone (saved that way before this fix).
  first.conditions.splice(1, 1);
  const schedule = buildProcessSchedule(file);
  const follower = schedule.tasks.find(
    (task) => task.nodeId === second.id && task.conditionIndex === 0,
  )!;
  expect(follower.issue).toBeUndefined();
  // It now follows the last remaining condition of that Department.
  const last = schedule.tasks
    .filter((task) => task.nodeId === first.id)
    .sort((left, right) => right.conditionIndex - left.conditionIndex)[0];
  expect(follower.start).toBe(last.end);
});

test("deleting a release condition re-points the rows that followed it", () => {
  const { file, first, second } = chained();
  first.conditions[1] = {
    ...first.conditions[1],
    predecessor: {
      nodeId: first.id,
      conditionId: first.conditions[0].id!,
      relation: "finish",
      lagDays: 0,
    },
  };
  useWorkflowStore.getState().replaceFile(file);
  useWorkflowStore.getState().deleteNodeCondition(first.id, first.conditions[1].id);
  const after = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === second.id)!
    .conditions[0];
  // It follows what the deleted one followed.
  expect(after.predecessor).toMatchObject({
    nodeId: first.id,
    conditionId: first.conditions[0].id,
  });
  const follower = buildProcessSchedule(useWorkflowStore.getState().file).tasks.find(
    (task) => task.nodeId === second.id && task.conditionIndex === 0,
  )!;
  expect(follower.issue).toBeUndefined();
});
