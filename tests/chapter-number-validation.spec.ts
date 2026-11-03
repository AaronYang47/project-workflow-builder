import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { validateWorkflow } from "../src/lib/validation";

function setup(numbers: string[]) {
  const file = createProjectWorkflow("Chapter validation");
  file.graph.nodes = numbers.map((number, index) => {
    const node = createDomainNode(index === 0 ? "projectStart" : "general", `step-${index}`);
    node.title = `Step ${index + 1}`;
    node.config.stage = number;
    return node;
  });
  file.highLevel!.graph.nodes = [{ id: "phase", type: "phase", title: "Phase", description: "", linkedLayer2NodeIds: file.graph.nodes.map((node) => node.id) }];
  return file;
}
const orderIssues = (file: ReturnType<typeof setup>) => validateWorkflow(file).filter((issue) => issue.code === "CHAPTER_NUMBER_ORDER");

test("Validation warns for out-of-order and duplicate Chapter numbers without editing them", () => {
  const file = setup(["10", "09", "09"]);
  const issues = orderIssues(file);
  expect(issues.map((issue) => issue.nodeId)).toEqual(["step-1", "step-2"]);
  expect(issues[0].message).toContain("09");
  expect(file.graph.nodes.map((node) => node.config.stage)).toEqual(["10", "09", "09"]);
});

test("Validation accepts increasing numbers with gaps and ignores nonnumeric labels", () => {
  expect(orderIssues(setup(["12", "Chapter", "20", "35"]))).toEqual([]);
});

test("Without L1 links Validation follows forward L2 connections, not array position or return routes", () => {
  const file = setup(["20", "10"]);
  file.highLevel!.graph.nodes = [];
  const edge = { id: "forward", source: "step-1", target: "step-0", type: "normal" as const, lineStyle: "solid" as const, arrowStyle: "closed" as const, customFields: {} };
  file.graph.edges = [edge, { ...edge, id: "back", source: "step-0", target: "step-1", type: "rework" }];
  expect(orderIssues(file)).toEqual([]);
  file.graph.edges = [{ ...edge, source: "step-0", target: "step-1" }];
  expect(orderIssues(file)).toHaveLength(1);
});

test("zero is invalid, and reverse L2 connections are checked even when L1 links are present", () => {
  const file = setup(["00", "02"]);
  expect(validateWorkflow(file)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_CHAPTER_NUMBER", nodeId: "step-0" })]));
  file.graph.nodes[0].config.stage = "01";
  file.graph.edges = [{ id: "reversed", source: "step-1", target: "step-0", type: "normal", lineStyle: "solid", arrowStyle: "closed", customFields: {} }];
  expect(orderIssues(file)).toEqual([expect.objectContaining({ nodeId: "step-0" })]);
});

test("Validation panel runs current checks on open and updates after chapter edits", async ({ page }) => {
  const file = setup(["00", "02"]);
  file.layout.nodes = Object.fromEntries(file.graph.nodes.map((node, index) => [node.id, { nodeId: node.id, x: index * 600, y: 150, width: 384, height: 400 }]));
  file.graph.edges = [{ id: "forward", source: "step-0", target: "step-1", type: "normal", lineStyle: "solid", arrowStyle: "closed", customFields: {} }];
  await page.addInitScript(({ file }) => localStorage.setItem("project-workflow-builder:v43-no-default-workspace", JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 })), { file });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page.getByRole("button", { name: /^Validation/ }).click();
  const panel = page.getByRole("region", { name: "Validation results" });
  await expect(panel).toContainText("INVALID_CHAPTER_NUMBER");
  const first = page.locator('[data-id="step-0"]').getByRole("textbox", { name: "Chapter" });
  await first.fill("03");
  await first.blur();
  await expect(panel).toContainText("CHAPTER_NUMBER_ORDER");
  await expect(panel).not.toContainText("INVALID_CHAPTER_NUMBER");
  await first.fill("01");
  await first.blur();
  await expect(panel).not.toContainText("CHAPTER_NUMBER_ORDER");
});
