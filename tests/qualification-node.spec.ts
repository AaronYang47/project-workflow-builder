import { expect, test } from "playwright/test";
import { qualificationRoute } from "../src/lib/qualification";
import { validateWorkflow } from "../src/lib/validation";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("Plans Available? decides the route after Qualification", () => {
  expect(qualificationRoute({})).toBeUndefined();
  expect(qualificationRoute({ plansAvailable: "no" })).toBe("CSA (Concept Consultation)");
  expect(qualificationRoute({ plansAvailable: "yes" })).toBe("LOI / CSA / PCS (choose one)");
  expect(qualificationRoute({ plansAvailable: "yes", commercialPath: "PCS" })).toBe("PCS");
});

test("a Qualification step may lead into Project Start; nothing else may", () => {
  const file = createE2EWorkflow();
  const start = file.graph.nodes.find((node) => node.type === "projectStart")!;
  const qualification = createDomainNode("qualification", "qualification-1");
  file.graph.nodes.push(qualification);
  const edge = (source: string) => ({
    id: `edge-${source}`,
    source,
    target: start.id,
    type: "normal" as const,
    lineStyle: "solid" as const,
    arrowStyle: "closed" as const,
    customFields: {},
  });
  file.graph.edges.push(edge(qualification.id));
  const codes = () => validateWorkflow(file).map((issue) => issue.code);
  expect(codes()).not.toContain("PROJECT_START_INCOMING");
  const other = file.graph.nodes.find((node) => node.type === "general")!;
  file.graph.edges.push(edge(other.id));
  expect(codes()).toContain("PROJECT_START_INCOMING");
});

test("Qualification is added from the L2 library at the far left, linked to Project Start", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, file }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, file: createE2EWorkflow() },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const libraryItem = page.getByRole("button", { name: /^Qualification/ });
  await libraryItem.dblclick();
  const node = page.locator("[data-qualification-node]");
  await expect(node).toBeVisible();
  // Only one per project.
  await expect(libraryItem).toBeDisabled();

  // Far left: left of every other step, and connected into Project Start.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"));
        const lefts = nodes.map((element) => element.getBoundingClientRect().left);
        const own = document
          .querySelector("[data-qualification-node]")!
          .getBoundingClientRect().left;
        return own <= Math.min(...lefts) + 1;
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: /fit view/i }).click();
  await page.waitForTimeout(400);
  // Choices: client, GC pending still allowed, then the route.
  await node.getByLabel("Client Type").selectOption("GC");
  await node.getByLabel("GC Status").selectOption("Pending");
  await expect(node.locator("[data-gc-pending]")).toContainText("can still go ahead");
  await node.getByLabel("Contracting Client").selectOption("TBD");
  await node.getByLabel("Project Type").selectOption("FOB Yard");
  await node.getByRole("button", { name: "No", exact: true }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText(
    "Route: CSA (Concept Consultation)",
  );
  await node.getByRole("button", { name: "Yes", exact: true }).click();
  await node.getByRole("radio", { name: "PCS" }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText("Route: PCS");
  // Every choice can be changed later.
  await node.getByRole("radio", { name: "LOI" }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText("Route: LOI");
  await node.getByLabel("GC Status").selectOption("Confirmed");
  await expect(node.locator("[data-gc-pending]")).toHaveCount(0);

  // Saved with the project.
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const file = JSON.parse(localStorage.getItem(key)!).state.file;
        const qualification = file.graph.nodes.find(
          (item: { type: string }) => item.type === "qualification",
        );
        const start = file.graph.nodes.find(
          (item: { type: string }) => item.type === "projectStart",
        );
        return {
          route: qualification?.config.qualification,
          linked: file.graph.edges.some(
            (edge: { source: string; target: string }) =>
              edge.source === qualification?.id && edge.target === start?.id,
          ),
        };
      }, WORKFLOW_STORAGE_KEY),
    )
    .toEqual({
      route: {
        clientType: "GC",
        gcStatus: "Confirmed",
        contractingClient: "TBD",
        projectType: "FOB Yard",
        plansAvailable: "yes",
        commercialPath: "LOI",
      },
      linked: true,
    });
  // Printed (L2 PDF) copies show the choices as text.
  await expect(node.locator('[data-qualification-print-value="clientType"]')).toHaveText("GC");
  await expect(node.locator('[data-qualification-print-value="projectType"]')).toHaveText(
    "FOB Yard",
  );
});
