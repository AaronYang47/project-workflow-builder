import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

const outputDir = join(process.cwd(), "tmp", "glass-visual-qa");
const storageKey = WORKFLOW_STORAGE_KEY;

async function seedGlassQaWorkspace(page: Page) {
  const now = new Date().toISOString();
  const file = createE2EWorkflow();
  const qaNode = createDomainNode("general", "glass-qa-node");
  qaNode.title = "Glass QA Node";
  const qaPhase = createDomainNode("phase", "glass-qa-phase");
  qaPhase.title = "Glass QA Phase";
  const qaReference = createDomainNode("terminal", "glass-qa-reference");
  qaReference.title = "Glass QA Reference";
  file.graph.nodes.push(qaNode, qaPhase, qaReference);
  file.layout.nodes[qaNode.id] = {
    nodeId: qaNode.id,
    x: 560,
    y: 860,
    width: 320,
    height: 240,
  };
  file.layout.nodes[qaPhase.id] = {
    nodeId: qaPhase.id,
    x: 980,
    y: 860,
    width: 520,
    height: 320,
  };
  file.layout.nodes[qaReference.id] = {
    nodeId: qaReference.id,
    x: 1640,
    y: 860,
    width: 320,
    height: 240,
  };
  file.highLevel!.graph.nodes[0] = {
    ...file.highLevel!.graph.nodes[0],
    title: "Start · GLASS QA",
    backgroundColor: "#34d399",
  };
  file.highLevel!.graph.nodes[1] = {
    ...file.highLevel!.graph.nodes[1],
    backgroundColor: "#fbbf24",
  };
  file.graph.metadata = {
    ...file.graph.metadata,
    name: "Glass UI Visual QA",
    version: "v1.0-visual-qa",
    status: "Draft",
    createdAt: now,
    updatedAt: now,
  };

  await page.addInitScript(
    ({ key, persistedFile }) => {
      window.localStorage.setItem("theme", "dark");
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            file: persistedFile,
            workspaceOwnerId: "dev-bypass",
            activeProjectId: "glass-ui-visual-qa",
            dirty: false,
          },
          version: 0,
        }),
      );
    },
    { key: storageKey, persistedFile: file },
  );
}

async function expectGlassMaterial(page: Page, selector: string) {
  const cards = page.locator(selector);
  expect(await cards.count()).toBeGreaterThan(0);
  await expect(cards.first()).toBeVisible();
  const materials = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        backdropFilter: style.backdropFilter,
        borderColor: style.borderColor,
      };
    }),
  );
  expect(materials.every((material) => material.backdropFilter.includes("blur"))).toBe(true);
  expect(materials.every((material) => material.backgroundImage !== "none")).toBe(true);
  expect(materials.every((material) => material.borderColor.length > 0)).toBe(true);
}

test("L1 and L2 cards keep their glass material in dark and light themes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  mkdirSync(outputDir, { recursive: true });
  await seedGlassQaWorkspace(page);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.goto("/");

  await page.locator('button[aria-label="L1 · High Level"]').click();
  await expect(page.getByText("Start · GLASS QA", { exact: true }).first()).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectGlassMaterial(page, ".high-level-node-card");
  const l1Tints = await page.locator('.high-level-node-card[data-glass-tint="true"]').evaluateAll((cards) =>
    cards.map((card) => ({
      tint: getComputedStyle(card).getPropertyValue("--node-glass-tint").trim(),
      backgroundImage: getComputedStyle(card).backgroundImage,
    })),
  );
  expect(l1Tints).toEqual(expect.arrayContaining([
    expect.objectContaining({ tint: "52 211 153" }),
    expect.objectContaining({ tint: "251 191 36" }),
  ]));
  expect(new Set(l1Tints.map((card) => card.backgroundImage)).size).toBeGreaterThan(1);
  await page.screenshot({
    path: join(outputDir, "l1-dark.png"),
    animations: "disabled",
  });

  await page.locator('button[aria-label="L2 · Detailed Workflow"]').click();
  await expect(page.locator('[data-id="pre-construction"]')).toBeVisible();
  await expect(page.locator('[data-id="glass-qa-node"] .workflow-node.l2-node-card')).toHaveCount(1);
  await expect(page.locator('[data-id="glass-qa-phase"] .l2-phase-card')).toHaveCount(1);
  await expect(page.locator('[data-id="glass-qa-reference"] .l2-node-card')).toHaveCount(1);
  await expect(page.locator('[data-id="glass-qa-reference"]')).toContainText("Release conditions");
  await expect(page.locator('[data-id="glass-qa-reference"]')).toContainText("UUID");
  await expect(
    page.locator('[data-id="glass-qa-reference"] [aria-label="Completion description"]'),
  ).toHaveClass(/text-xs/);
  await page.locator('[data-id="glass-qa-reference"] .l2-node-card').click({
    position: { x: 12, y: 12 },
  });
  const inspectorDescription = page.getByLabel("Description", { exact: true });
  await expect(inspectorDescription).toBeVisible();
  await inspectorDescription.fill("Completion certificate and warranty handoff");
  await inspectorDescription.blur();
  await expect(
    page.locator('[data-id="glass-qa-reference"] [aria-label="Completion description"]'),
  ).toHaveValue("Completion certificate and warranty handoff");
  await page
    .locator('[data-id="glass-qa-reference"] [aria-label="Completion description"]')
    .fill("Final completion record is ready");
  await page
    .locator('[data-id="glass-qa-reference"] [aria-label="Completion description"]')
    .blur();
  await expect(inspectorDescription).toHaveValue("Final completion record is ready");
  await expect(
    page.locator('[data-id="glass-qa-reference"] button[aria-label="Check release condition 1"]'),
  ).toBeVisible();
  await expectGlassMaterial(page, ".l2-node-card");
  const l2Tints = await page.locator('.l2-node-card[data-glass-tint="true"]').evaluateAll((cards) =>
    cards.map((card) => ({
      tint: getComputedStyle(card).getPropertyValue("--node-glass-tint").trim(),
      backgroundImage: getComputedStyle(card).backgroundImage,
    })),
  );
  expect(l2Tints).toEqual(expect.arrayContaining([
    expect.objectContaining({ tint: "251 191 36" }),
    expect.objectContaining({ tint: "52 211 153" }),
  ]));
  await page.screenshot({
    path: join(outputDir, "l2-dark.png"),
    animations: "disabled",
  });

  await page.locator('button[aria-label="Toggle theme"]').click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await expectGlassMaterial(page, ".l2-node-card");
  await page.screenshot({
    path: join(outputDir, "l2-light.png"),
    animations: "disabled",
  });

  await page.locator('button[aria-label="L1 · High Level"]').click();
  await expectGlassMaterial(page, ".high-level-node-card");
  await page.screenshot({
    path: join(outputDir, "l1-light.png"),
    animations: "disabled",
  });
  expect(browserErrors).toEqual([]);
});
