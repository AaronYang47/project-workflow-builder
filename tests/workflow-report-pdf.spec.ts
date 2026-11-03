import { expect, test } from "playwright/test";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

for (const kind of ["Tech", "Presentation"] as const) {
  test(`${kind} export retains its architecture and displays long text`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const file = createE2EWorkflow();
    const node = file.graph.nodes.find((item) => item.id === "project-start")!;
    node.title = "项目启动 Project start with a long title that must remain visible";
    node.description = "Project details 项目说明 with a long description that should wrap into the card instead of being clipped.";
    await page.addInitScript(({ key, file }) => {
      localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const root = Array.from(document.body.children).find((el) => el instanceof HTMLElement && el.style.zIndex === "-99999") as HTMLElement | undefined;
        if (root && this.width >= 2970) {
          const elements = Array.from(root.querySelectorAll<HTMLElement>("div, p, span"));
          const target = elements.find((el) => el.textContent?.trim() === "项目启动 Project start with a long title that must remain visible" || el.textContent?.trim().endsWith("项目启动 Project start with a long title that must remain visible"));
          (window as unknown as { reportCheck: unknown }).reportCheck = { title: root.innerText.includes("项目启动 Project start with a long title that must remain visible"), description: root.innerText.includes("Project details 项目说明"), hasDiagram: Boolean(root.querySelector("#exec-svg-overlay")), targetFits: target ? target.scrollHeight <= target.clientHeight + 1 && target.scrollWidth <= target.clientWidth + 1 : false };
        }
        return original.apply(this, args);
      };
    }, { key: WORKFLOW_STORAGE_KEY, file });
    await page.goto("/");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByText(`Export PDF for ${kind}`, { exact: true }).click();
    const download = await pending;
    await download.saveAs(testInfo.outputPath(`${kind}.pdf`));
    const result = await page.evaluate(() => (window as unknown as { reportCheck: { title: boolean; description: boolean; hasDiagram: boolean; targetFits: boolean } }).reportCheck);
    expect(result.title && result.description && result.targetFits).toBeTruthy();
    expect(result.hasDiagram).toBe(kind === "Presentation");
  });
}

test("Tech PDF keeps words intact in a dense six-step phase", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const file = createE2EWorkflow();
  const source = file.graph.nodes.find((node) => node.id === "pre-construction")!;
  const phase = file.highLevel!.graph.nodes.find((item) => item.id === "high-level-2")!;
  const nodes = Array.from({ length: 6 }, (_, index) => ({
    ...structuredClone(source), id: `dense-${index}`, title: `Technical Coordination Step ${index + 1}`,
    conditions: Array.from({ length: index < 4 ? 8 : 12 }, (_, item) => ({
      id: `dense-${index}-condition-${item}`,
      label: `Receive Documentation and Verify Construction Coordination Requirements ${item + 1}`,
      required: true, checked: false,
    })),
  }));
  file.graph.nodes.push(...nodes);
  phase.linkedLayer2NodeIds = nodes.map((node) => node.id);
  phase.linkedDetailedNodeIds = [...phase.linkedLayer2NodeIds];
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = Array.from(document.body.children).find((el) => el instanceof HTMLElement && el.style.zIndex === "-99999") as HTMLElement | undefined;
      const texts = Array.from(root?.querySelectorAll<HTMLElement>("[data-tech-condition-text]") || []).filter((el) => el.textContent?.includes("Receive Documentation"));
      if (texts.length && this.width >= 2970) {
        const wordWraps = texts.map((el) => {
          const text = el.firstChild!;
          const content = text.textContent || "";
          const start = content.indexOf("Documentation");
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, start + "Documentation".length);
          return range.getClientRects().length;
        });
        (window as unknown as { techCheck: unknown }).techCheck = { count: texts.length, wordWraps, overflowing: texts.some((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) };
      }
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByText("Export PDF for Tech", { exact: true }).click();
  await (await pending).saveAs(testInfo.outputPath("dense-tech.pdf"));
  const result = await page.evaluate(() => (window as unknown as { techCheck: { count: number; wordWraps: number[]; overflowing: boolean } }).techCheck);
  expect(result.count).toBe(56);
  expect(result.overflowing).toBe(false);
  expect(result.wordWraps.every((count) => count === 1)).toBe(true);
});

test("Presentation PDF shows every release condition inside its original workflow card", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const file = createE2EWorkflow();
  const node = file.graph.nodes.find((item) => item.id === "pre-construction")!;
  node.conditions = Array.from({ length: 18 }, (_, index) => ({
    id: `presentation-condition-${index}`, label: `Condition ${index + 1}: Verify the detailed design and customer approval`,
    checked: index === 0, required: true,
  }));
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = Array.from(document.body.children).find((el) => el instanceof HTMLElement && el.style.zIndex === "-99999") as HTMLElement | undefined;
      const card = root?.querySelector<HTMLElement>('#exec-l2-card-1-1');
      if (card && this.width >= 2970) {
        const entries = Array.from(card.querySelectorAll<HTMLElement>('[data-presentation-condition]'));
        const box = card.getBoundingClientRect();
        (window as unknown as { conditionsCheck: unknown }).conditionsCheck = {
          count: entries.length,
          text: entries.map((entry) => entry.textContent?.trim()),
          marked: entries.map((entry) => entry.textContent?.includes("✓")),
          contained: entries.every((entry) => { const rect = entry.getBoundingClientRect(); return rect.bottom <= box.bottom + 1 && rect.right <= box.right + 1 && entry.scrollWidth <= entry.clientWidth + 1; }),
          svg: Boolean(root?.querySelector('#exec-svg-overlay path')),
          height: root?.offsetHeight,
          bottom: box.bottom - (root?.getBoundingClientRect().top || 0),
        };
      }
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByText("Export PDF for Presentation", { exact: true }).click();
  await (await download).saveAs(testInfo.outputPath("presentation-conditions.pdf"));
  const result = await page.evaluate(() => (window as unknown as { conditionsCheck: { count: number; text: string[]; marked: boolean[]; contained: boolean; svg: boolean; height: number; bottom: number } }).conditionsCheck);
  expect(result.count).toBe(18);
  expect(result.text[17]).toContain("Condition 18: Verify the detailed design and customer approval");
  expect(result.marked[0]).toBe(true);
  expect(result.marked[1]).toBe(false);
  expect(result.contained && result.svg && result.bottom <= result.height).toBe(true);
});

test("Presentation menu downloads distinct versions with and without release conditions", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const file = createE2EWorkflow();
  const node = file.graph.nodes.find((item) => item.id === "pre-construction")!;
  node.conditions = [{ id: "verification", label: "Verify the detailed design approval", required: true, checked: false }];
  await page.addInitScript(({ key, file }) => {
    localStorage.setItem(key, JSON.stringify({ state: { file, workspaceOwnerId: "dev-bypass", dirty: false }, version: 0 }));
    const original = HTMLCanvasElement.prototype.toDataURL;
    (window as unknown as { presentationSnapshots: unknown[] }).presentationSnapshots = [];
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const root = Array.from(document.body.children).find((el) => el instanceof HTMLElement && el.style.zIndex === "-99999") as HTMLElement | undefined;
      if (root?.querySelector('#exec-svg-overlay') && this.width >= 2970) {
        (window as unknown as { presentationSnapshots: unknown[] }).presentationSnapshots.push({
          conditions: root.querySelectorAll('[data-presentation-condition]').length,
          hasExpected: root.textContent?.includes('Verify the detailed design approval'),
          nodes: root.querySelectorAll('[id^="exec-l2-card-"]').length,
          phases: root.querySelectorAll('[id^="exec-l1-card-"]').length,
          connectors: root.querySelectorAll('#exec-svg-overlay path').length,
        });
      }
      return original.apply(this, args);
    };
  }, { key: WORKFLOW_STORAGE_KEY, file });
  await page.goto("/");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByText("With Release Conditions", { exact: true })).toBeVisible();
  await expect(page.getByText("Without Release Conditions", { exact: true })).toBeVisible();
  const withPending = page.waitForEvent("download");
  await page.getByText("Export PDF for Presentation", { exact: true }).click();
  const withPdf = await withPending;
  await withPdf.saveAs(testInfo.outputPath("with-conditions.pdf"));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const withoutPending = page.waitForEvent("download");
  await page.getByText("Export PDF for Presentation · No RC", { exact: true }).click();
  const withoutPdf = await withoutPending;
  await withoutPdf.saveAs(testInfo.outputPath("without-conditions.pdf"));
  expect(withPdf.suggestedFilename()).not.toBe(withoutPdf.suggestedFilename());
  expect(withoutPdf.suggestedFilename()).toContain("No-Release-Conditions");
  const snapshots = await page.evaluate(() => (window as unknown as { presentationSnapshots: { conditions: number; hasExpected: boolean; nodes: number; phases: number; connectors: number }[] }).presentationSnapshots);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0].conditions).toBeGreaterThan(0);
  expect(snapshots[0].hasExpected).toBe(true);
  expect(snapshots[1].conditions).toBe(0);
  expect(snapshots[1].hasExpected).toBe(false);
  expect(snapshots[1]).toMatchObject({ nodes: snapshots[0].nodes, phases: snapshots[0].phases, connectors: snapshots[0].connectors });
  expect(snapshots[1].connectors).toBeGreaterThan(0);
});
