import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import {
  applyFobYardSkip,
  fobYardSkippedIds,
  fobYardTag,
  syncFinalCloseCompletion,
} from "../src/lib/fob-yard";
import { fobYardSkip } from "../src/lib/high-level-workflow";
import { phaseFormsSummary } from "../src/lib/phase-forms-summary";
import { buildProcessSchedule } from "../src/lib/process-schedule";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

function fourPhaseWorkflow(fobYard = false) {
  const file = createProjectWorkflow("FOB yard test");
  file.highLevel!.graph.nodes = [
    { id: "s", type: "start", title: "Start", description: "" },
    { id: "p3", type: "phase", title: "PHASE 3", description: "" },
    { id: "p4", type: "phase", title: "PHASE 4", description: "POST-CONSTRUCTION" },
    { id: "fc", type: "end", title: "Final Close", description: "", fobYard },
  ];
  file.highLevel!.graph.edges = [
    { id: "e1", source: "s", target: "p3" },
    { id: "e2", source: "p3", target: "p4" },
    { id: "e3", source: "p4", target: "fc" },
  ];
  ["l2-p3", "l2-p4", "l2-fc"].forEach((id, index) => {
    const node = createDomainNode(index === 0 ? "projectStart" : "general", id);
    node.title = id;
    node.department = `Dept ${index + 3}`;
    node.conditions = [
      {
        id: `${id}-rc`,
        label: `${id} release`,
        description: "",
        durationValue: 5,
        durationUnit: "days",
      } as never,
    ];
    file.graph.nodes.push(node);
    file.layout.nodes[id] = { nodeId: id, x: 80 + index * 420, y: 200, width: 300, height: 180 };
  });
  file.graph.edges = [
    { id: "l2-e1", source: "l2-p3", target: "l2-p4" },
    { id: "l2-e2", source: "l2-p4", target: "l2-fc" },
  ].map((edge) => ({
    ...edge,
    type: "normal" as const,
    lineStyle: "solid" as const,
    arrowStyle: "arrow" as const,
    customFields: {},
  }));
  file.graph.nodes.find((node) => node.id === "l2-fc")!.conditions = [
    {
      id: "project-completion-recorded",
      label: "Project completion and warranty are recorded",
      durationValue: 1,
      durationUnit: "days",
    } as never,
  ];
  const links: Record<string, string[]> = { p3: ["l2-p3"], p4: ["l2-p4"], fc: ["l2-fc"] };
  for (const node of file.highLevel!.graph.nodes) {
    node.linkedLayer2NodeIds = links[node.id] ?? [];
    node.linkedDetailedNodeIds = links[node.id] ?? [];
  }
  file.highLevel!.layout.nodes = {
    s: { nodeId: "s", x: 0, y: 220 },
    p3: { nodeId: "p3", x: 340, y: 220 },
    p4: { nodeId: "p4", x: 720, y: 220 },
    fc: { nodeId: "fc", x: 1100, y: 220 },
  };
  return file;
}

test("FOB yard skips the Phase leading into Final Close", () => {
  expect(fobYardSkip(fourPhaseWorkflow(false).highLevel!.graph).skippedNodeIds.size).toBe(0);
  const skip = fobYardSkip(fourPhaseWorkflow(true).highLevel!.graph);
  expect([...skip.skippedNodeIds]).toEqual(["p4"]);
  expect([...skip.skippedEdgeIds].sort()).toEqual(["e2", "e3"]);
  expect(skip.bypassEdges.map((edge) => `${edge.source}->${edge.target}`)).toEqual(["p3->fc"]);
});

test("FOB yard removes Phase 4 and its departments from schedule and documents", () => {
  const off = fourPhaseWorkflow(false);
  expect(applyFobYardSkip(off)).toBe(off);
  const on = fourPhaseWorkflow(true);
  expect([...fobYardSkippedIds(on).l2]).toEqual(["l2-p4"]);
  const skipped = applyFobYardSkip(on);
  expect(skipped.highLevel!.graph.nodes.map((node) => node.id)).toEqual(["s", "p3", "fc"]);
  expect(skipped.highLevel!.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
    "s->p3",
    "p3->fc",
  ]);
  expect(skipped.graph.nodes.map((node) => node.id)).not.toContain("l2-p4");
  expect(skipped.graph.edges.map((edge) => `${edge.source}->${edge.target}`)).toEqual([
    "l2-p3->l2-fc",
  ]);
  expect(buildProcessSchedule(on).tasks.map((task) => task.nodeId)).not.toContain("l2-p4");
  expect(buildProcessSchedule(off).tasks.map((task) => task.nodeId)).toContain("l2-p4");
  expect(phaseFormsSummary(skipped).map((phase) => phase.title)).not.toContainEqual("PHASE 4");
});

test("the Final Close FOB yard switch greys out Phase 4 and routes around it", async ({ page }) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(false) },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const phase4 = page.locator('.react-flow__node[data-id="p4"] [data-fob-yard-skipped]');
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await expect(phase4).toHaveCount(0);

  await page.locator('.react-flow__node[data-id="fc"]').click();
  const toggle = page.getByRole("switch", { name: "FOB yard" });
  await toggle.check({ force: true });
  await expect(phase4).toHaveCount(1);
  await expect(page.getByText("Skipped · FOB yard").first()).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('.react-flow__node.fob-yard-skipped[data-id="l2-p4"]')).toHaveCount(1);
  await expect(page.locator(".react-flow__edge.fob-yard-skipped")).toHaveCount(2);
  // L2 routes around the skipped Phase straight to Final Close.
  await expect(page.locator('.react-flow__edge[data-id="fob-yard-l2-p3-l2-fc"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node[data-id="l2-fc"]')).toContainText(
    "FOB Yard Completion",
  );
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.locator('.react-flow__node[data-id="fc"]').click();
  await expect(page.locator('.react-flow__edge[data-id^="fob-yard-bypass-"]')).toHaveCount(1);
  await expect(
    page.locator('.react-flow__edge[data-id="e3"] .react-flow__edge-path'),
  ).toHaveAttribute("style", /stroke: rgb\(168, 179, 194\)|#a8b3c2/);

  await toggle.uncheck({ force: true });
  await expect(phase4).toHaveCount(0);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('.react-flow__edge[data-id^="fob-yard-"]')).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="l2-fc"]')).toContainText(
    "Site Work Completion",
  );
});

test("L2 PDF prints skipped FOB yard cards in grayscale", async ({ page }) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
      window.print = () => {
        const card = document.querySelector<HTMLElement>(
          '#vector-canvas-print .react-flow__node.fob-yard-skipped[data-id="l2-p4"]',
        );
        const colors = Array.from(card?.querySelectorAll<HTMLElement>("*") ?? []).flatMap(
          (element) => {
            const style = getComputedStyle(element);
            return [style.color, style.backgroundColor, style.borderTopColor];
          },
        );
        (window as unknown as { skippedPrintColors: string[] }).skippedPrintColors = colors;
      };
    },
    { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(true) },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('.react-flow__node.fob-yard-skipped[data-id="l2-p4"]')).toBeVisible();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByText("L2 · Detailed Workflow", { exact: true }).last().click();
  const colors = await page
    .waitForFunction(
      () => (window as unknown as { skippedPrintColors?: string[] }).skippedPrintColors,
    )
    .then((result) => result.jsonValue());
  expect(colors.length).toBeGreaterThan(0);
  for (const color of colors) {
    const channels = color.match(/rgba?\((\d+), (\d+), (\d+)/);
    if (channels)
      expect(
        Math.max(...channels.slice(1).map(Number)) - Math.min(...channels.slice(1).map(Number)),
      ).toBeLessThanOrEqual(1);
  }
});

test("Final Close completion condition follows FOB yard; custom text is kept", () => {
  const off = syncFinalCloseCompletion(fourPhaseWorkflow(false));
  const label = (file: typeof off) =>
    file.graph.nodes.find((node) => node.id === "l2-fc")!.conditions[0].label;
  expect(label(off)).toBe("Site Work Completion");
  const on = syncFinalCloseCompletion(fourPhaseWorkflow(true));
  expect(label(on)).toBe("FOB Yard Completion");
  expect(syncFinalCloseCompletion(on)).toBe(on);
  // L4 schedule and the documents read the same text.
  expect(buildProcessSchedule(on).tasks.find((task) => task.nodeId === "l2-fc")!.title).toBe(
    "FOB Yard Completion",
  );
  const custom = fourPhaseWorkflow(true);
  custom.graph.nodes.find((node) => node.id === "l2-fc")!.conditions[0] = {
    id: "custom",
    label: "Customer sign-off",
  };
  expect(label(syncFinalCloseCompletion(custom))).toBe("Customer sign-off");
});

for (const fobYard of [false, true]) {
  test(`L4 phase strip shows Final Close (FOB yard ${fobYard ? "on" : "off"})`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, file }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
            version: 0,
          }),
        );
      },
      { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(fobYard) },
    );
    await page.goto("/process-overview");
    const strip = page.getByRole("region", { name: "Complete process flowchart" });
    await expect(strip.locator("h3")).toHaveText(
      fobYard
        ? ["Start", "PHASE 3", "Final Close"]
        : ["Start", "PHASE 3", "PHASE 4", "Final Close"],
    );
    await expect(
      page
        .getByText(fobYard ? "FOB Yard Completion" : "Site Work Completion")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
  });
}

test("FOB yard skips the Phases chosen on Final Close", () => {
  const pick = (ids: string[]) => {
    const file = fourPhaseWorkflow(true);
    file.highLevel!.graph.nodes.find((node) => node.id === "fc")!.fobYardSkipPhaseIds = ids;
    return file;
  };
  const route = (ids: string[]) =>
    fobYardSkip(pick(ids).highLevel!.graph).bypassEdges.map(
      (edge) => `${edge.source}->${edge.target} via ${edge.skippedNodeIds.join("+")}`,
    );
  expect(route(["p3"])).toEqual(["s->p4 via p3"]);
  expect(route(["p3", "p4"])).toEqual(["s->fc via p3+p4"]);
  expect(route([])).toEqual([]);

  const onlyP3 = applyFobYardSkip(pick(["p3"]));
  expect(onlyP3.highLevel!.graph.nodes.map((node) => node.id)).toEqual(["s", "p4", "fc"]);
  expect(onlyP3.graph.nodes.map((node) => node.id)).not.toContain("l2-p3");
  expect(onlyP3.graph.nodes.map((node) => node.id)).toContain("l2-p4");
  expect(fobYardTag(pick(["p3", "p4"]))?.label).toBe("FOB YARD · PHASE 3, PHASE 4 SKIPPED");
  expect(buildProcessSchedule(pick(["p3"])).tasks.map((task) => task.nodeId)).not.toContain(
    "l2-p3",
  );
});

test("the Final Close inspector lets you tick which Phase to skip", async ({ page }) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(true) },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.locator('.react-flow__node[data-id="fc"]').click();
  const skip3 = page.getByRole("checkbox", { name: "Skip PHASE 3" });
  const skip4 = page.getByRole("checkbox", { name: "Skip PHASE 4" });
  await expect(skip3).not.toBeChecked();
  await expect(skip4).toBeChecked();
  await skip3.check();
  await skip4.uncheck();
  await expect(page.locator('.react-flow__node[data-id="p3"] [data-fob-yard-skipped]')).toHaveCount(
    1,
  );
  await expect(page.locator('.react-flow__node[data-id="p4"] [data-fob-yard-skipped]')).toHaveCount(
    0,
  );
  await expect(page.locator('.react-flow__edge[data-id="fob-yard-bypass-s-p4"]')).toHaveCount(1);
});

test("L2, L3 and the Release Conditions map follow the Phase chosen on Final Close", async ({
  page,
}) => {
  const file = fourPhaseWorkflow(true);
  file.highLevel!.graph.nodes.find((node) => node.id === "fc")!.fobYardSkipPhaseIds = ["p3"];
  await page.addInitScript(
    ({ key, file }) => {
      if (sessionStorage.getItem("fob-seeded")) return;
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
      sessionStorage.setItem("fob-seeded", "yes");
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");

  // L2: Phase 3's department is grey, Phase 4's is not.
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('.react-flow__node.fob-yard-skipped[data-id="l2-p3"]')).toHaveCount(1);
  await expect(page.locator('.react-flow__node.fob-yard-skipped[data-id="l2-p4"]')).toHaveCount(0);

  // L3: the notice shows on Phase 3's department only.
  for (const [id, skipped] of [
    ["l2-p3", 1],
    ["l2-p4", 0],
  ] as const) {
    await page.evaluate((nodeId) => {
      window.dispatchEvent(new CustomEvent("workflow:open-execution", { detail: { nodeId } }));
    }, id);
    await expect(page.getByRole("button", { name: "Back to L2" })).toBeVisible();
    await expect(page.locator("[data-fob-yard-skipped-notice]")).toHaveCount(skipped);
    await page.getByRole("button", { name: "Back to L2" }).click();
  }

  // Release Conditions process map: Phase 3 is marked skipped, Phase 4 is not.
  await page.goto("/release-conditions");
  const map = page.getByRole("region", { name: "Process map" });
  await expect(map.locator("[data-fob-yard-skipped]")).toHaveCount(1);
  await expect(map.locator("[data-fob-yard-skipped]")).toContainText("l2-p3");
  await expect(map.locator("[data-fob-yard-skipped]")).not.toContainText("l2-p4");
});

test("FOB yard lines stay grey until release conditions let the flow through", async ({ page }) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(true) },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  // Start -> PHASE 3 is reached (PHASE 3 holds the project start); its release
  // conditions are open, so the bypass to Final Close is not.
  await expect(page.locator('.react-flow__edge[data-id="e1"]')).toHaveClass(/animated/);
  const l1Bypass = page.locator('.react-flow__edge[data-id="fob-yard-bypass-p3-fc"]');
  await expect(l1Bypass).toHaveCount(1);
  await expect(l1Bypass).not.toHaveClass(/animated/);
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const l2Bypass = page.locator('.react-flow__edge[data-id="fob-yard-l2-p3-l2-fc"]');
  await expect(l2Bypass).toHaveCount(1);
  await expect(l2Bypass).not.toHaveClass(/animated/);
  await expect(page.locator('[data-edge-label="fob-yard-l2-p3-l2-fc"]')).toHaveClass(/slate/);
});

test("L5 FOB yard / Ship & install and the L1 Final Close switch follow each other", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false, activeProjectId: "p1" },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: fourPhaseWorkflow(false) },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(page.locator('.react-flow__node[data-id="fc"]')).toBeVisible();
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  const card = page.locator('[data-sim-project="cloud-p1"]');
  const fob = card.getByRole("radio", { name: "FOB yard" });
  const site = card.getByRole("radio", { name: "Ship & install" });
  await expect(site).toHaveAttribute("aria-checked", "true");
  await expect(card.locator("[data-fob-yard-linked]")).toBeVisible();

  // L5 → L1–L4.
  await fob.click();
  await expect(page.locator("[data-sim-notice]")).toContainText("FOB yard on in L1 Final Close");
  await page.getByRole("link", { name: "L1 · Process" }).click();
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(page.locator('.react-flow__node[data-id="p4"] [data-fob-yard-skipped]')).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await expect(page.locator('.react-flow__node[data-id="l2-fc"]')).toContainText(
    "FOB Yard Completion",
  );

  // L1 → L5.
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await page.locator('.react-flow__node[data-id="fc"]').click();
  await page.getByRole("switch", { name: "FOB yard" }).uncheck({ force: true });
  await expect(page.locator('.react-flow__node[data-id="p4"] [data-fob-yard-skipped]')).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Open Construction Simulation" }).click();
  await expect(site).toHaveAttribute("aria-checked", "true");
  await expect(fob).toHaveAttribute("aria-checked", "false");
});

test("document exports skip only the chosen Phase, even when the schedule applies the skip again", () => {
  const skipped = applyFobYardSkip(fourPhaseWorkflow(true));
  const titles = (file: typeof skipped) => file.highLevel!.graph.nodes.map((node) => node.title);
  expect(titles(skipped)).toEqual(["Start", "PHASE 3", "Final Close"]);
  // Applying it again (as the schedule inside a PDF does) keeps PHASE 3.
  expect(titles(applyFobYardSkip(skipped))).toEqual(["Start", "PHASE 3", "Final Close"]);
  expect(buildProcessSchedule(skipped).phases.map((phase) => phase.title)).toContain("PHASE 3");
  expect(phaseFormsSummary(skipped).map((phase) => phase.title)).toContain("PHASE 3");
  // The PDF tag still names the skipped Phase.
  expect(fobYardTag(skipped)?.label).toContain("PHASE 4");
});
