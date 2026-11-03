import { expect, test } from "playwright/test";
import { createProjectWorkflow } from "../src/lib/project-template";
import { createDomainNode } from "../src/lib/create-domain-node";
import { estimatePhaseHeaderHeight, PHASE_FRAME_GAP, PHASE_HEADER_GUTTER, spacePhaseFrames } from "../src/lib/phase-layout";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function fixture() {
  const file = createProjectWorkflow("Phase spacing");
  for (let index = 0; index < 2; index++) {
    const phase = createDomainNode("phase", `phase-${index}`);
    phase.title = "PHASE 1 — CUSTOMER QUALIFICATION";
    phase.description = "Chapters grouped from the supplied process specification. Conditional and parallel work are described in the Chapter notes.";
    const chapter = createDomainNode("general", `chapter-${index}`);
    chapter.title = `Chapter ${index + 1}`;
    file.graph.nodes.push(phase, chapter);
    file.layout.nodes[phase.id] = { nodeId: phase.id, x: index * 540, y: 0, width: 532, height: 900 };
    file.layout.nodes[chapter.id] = { nodeId: chapter.id, parentId: phase.id, x: index * 540 + 36, y: 180, width: 460, height: 600 };
    file.highLevel!.graph.nodes.push({ id: `l1-${index}`, type: "phase", title: phase.title, description: phase.description, linkedLayer2NodeIds: [chapter.id] });
  }
  return file;
}

test("long Phase headers reserve space and Phase frames have their own gap", () => {
  const file = fixture();
  const spaced = spacePhaseFrames(file);
  const phase = spaced.graph.nodes.find((node) => node.id === "phase-0")!;
  expect(spaced.layout.nodes["chapter-0"].y).toBeGreaterThanOrEqual(estimatePhaseHeaderHeight(phase, 532) + PHASE_HEADER_GUTTER);
  expect(spaced.layout.nodes["phase-1"].x - (spaced.layout.nodes["phase-0"].x + 532)).toBeGreaterThanOrEqual(PHASE_FRAME_GAP);
  expect(spaced.layout.nodes["chapter-1"].x - spaced.layout.nodes["phase-1"].x).toBe(36);
  expect(spacePhaseFrames(spaced)).toBe(spaced);
});

test("rendered long Phase header stays above Chapter after Auto arrange", async ({ page }) => {
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
  }, { key: WORKFLOW_STORAGE_KEY, file: fixture() });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const clearance = async () => {
    const header = await page.locator('[data-id="phase-0"] [data-phase-header]').boundingBox();
    const chapter = await page.locator('[data-id="chapter-0"]').boundingBox();
    return header && chapter ? chapter.y - header.y - header.height : -Infinity;
  };
  await expect.poll(clearance).toBeGreaterThan(5);
  await page.getByRole("button", { name: "Auto arrange nodes" }).click();
  await expect.poll(clearance).toBeGreaterThan(5);
});
