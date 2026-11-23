import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { ensureEstimationWorkflow } from "../src/lib/estimation-workflow";
import { estimateSummary, preliminaryEstimationReady } from "../src/lib/preliminary-estimation";
import { getWorkflowProgress } from "../src/lib/workflow-progress";
import { createE2EWorkflow } from "./support/e2e-workflow";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("Qualification inserts one [1.06] Estimation before Project Start", () => {
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-test");
  const start = file.graph.nodes.find((node) => node.type === "projectStart")!;
  file.graph.nodes.push(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -1300,
    y: 80,
    width: 1180,
    height: 390,
  };
  file.graph.edges.push({
    id: "qual-start",
    source: qualification.id,
    target: start.id,
    type: "normal",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: {},
  });
  const updated = ensureEstimationWorkflow(file);
  const estimation = updated.graph.nodes.find((node) => node.type === "estimation")!;
  expect(estimation).toBeTruthy();
  const agreement = updated.graph.nodes.find((node) => node.config.commercialRouteGroup === true)!;
  expect(agreement).toBeTruthy();
  expect(
    updated.graph.edges.filter(
      (edge) => edge.source === qualification.id && edge.target === agreement.id,
    ),
  ).toHaveLength(3);
  expect(
    updated.graph.edges.filter(
      (edge) => edge.source === agreement.id && edge.target === estimation.id,
    ),
  ).toHaveLength(3);
  expect(
    updated.graph.edges.some((edge) => edge.source === estimation.id && edge.target === start.id),
  ).toBe(true);
  expect(
    ensureEstimationWorkflow(updated).graph.nodes.filter((node) => node.type === "estimation"),
  ).toHaveLength(1);
  expect(
    getWorkflowProgress(updated.graph.nodes, updated.graph.edges).reachedNodeIds.has(estimation.id),
  ).toBe(false);
});

test("Estimation remains an L2 node rather than an L1 phase", () => {
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-test");
  file.graph.nodes.push(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -1300,
    y: 80,
    width: 1180,
    height: 390,
  };
  file.highLevel!.graph.nodes[0].linkedLayer2NodeIds = [qualification.id];
  const updated = ensureEstimationWorkflow(file);
  expect(updated.highLevel!.graph.nodes.some((node) => node.title === "Estimation")).toBe(false);
  expect(updated.graph.nodes.some((node) => node.type === "estimation")).toBe(true);
});

test("[1.06] total and review gate use base price plus options and credits", () => {
  const node = createDomainNode("estimation", "estimate");
  node.customFields = {
    estimationBasePrice: 2_400_000,
    estimationOptionsAndCredits: 30_000,
    estimationModuleBudget: 5_000_000,
    estimationPreparedBy: "Sales",
    estimationReviewed: true,
  };
  expect(estimateSummary(node).total).toBe(2_430_000);
  expect(estimateSummary(node).budgetFits).toBe(true);
  expect(preliminaryEstimationReady(node)).toBe(true);
  node.customFields.estimationReviewed = false;
  expect(preliminaryEstimationReady(node)).toBe(false);
});

test("Estimation renders Qualification context and stays locked before approval", async ({
  page,
}) => {
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-test");
  file.graph.nodes.push(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -1300,
    y: 80,
    width: 1180,
    height: 390,
  };
  const workflow = ensureEstimationWorkflow(file);
  await page.addInitScript(
    ({ key, value }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: value, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, value: workflow },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator("[data-estimation-node]");
  await expect(card).toBeVisible();
  await expect(card.locator("[data-estimation-status]")).toHaveText("Waiting for Qualification");
  await expect(card.getByRole("button", { name: "Estimate" })).toBeDisabled();
  const connector = page.locator(
    `.react-flow__edge[data-id="edge-commercial-route-group-estimation-1-06-csa"]`,
  );
  await expect(connector).toBeVisible();
  await expect(connector.locator(".workflow-edge-flow")).toHaveCount(0);
});

test("Estimate dialog calculates, then confirms a compact result on the node", async ({ page }) => {
  const file = createE2EWorkflow();
  const estimation = createDomainNode("estimation", "estimate-dialog-test");
  file.graph.nodes = [estimation];
  file.graph.edges = [];
  file.layout.nodes = {
    [estimation.id]: {
      nodeId: estimation.id,
      x: 100,
      y: 100,
      width: 390,
      height: 240,
    },
  };
  await page.addInitScript(
    ({ key, value }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: value, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, value: file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator("[data-estimation-node]");
  await expect(card).toBeVisible();
  await expect(card.getByRole("spinbutton")).toHaveCount(0);
  await card.getByRole("button", { name: "Estimate" }).click();
  const dialog = page.getByRole("dialog", { name: "Preliminary Estimation [1.06]" });
  await dialog.getByRole("spinbutton", { name: "Base price" }).fill("2400000");
  await dialog.getByRole("spinbutton", { name: "Options / credits" }).fill("30000");
  await dialog.getByRole("textbox", { name: "Prepared by" }).fill("Sales");
  await dialog.getByRole("button", { name: "Calculate" }).click();
  await expect(dialog.locator("[data-estimation-preview]")).toContainText("$2,430,000");
  await expect(card.locator("[data-estimation-result]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Confirm" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.locator("[data-estimation-result]")).toContainText("$2,430,000");
});
