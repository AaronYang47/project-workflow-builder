import { execFileSync } from "node:child_process";
import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

for (const [gantt, extraDepartment] of [
  [false, false],
  [false, true],
  [true, false],
]) {
  test(`${gantt ? "Gantt" : extraDepartment ? "Narrow flowchart" : "Flowchart"} PDF phase headers stay aligned and clear of titles`, async ({
    page,
  }, testInfo) => {
    const file = createProjectWorkflow("27001 PROF ABC 1 St 1 Su");
    const links = !extraDepartment
      ? [[0, 1], [1, 2], [2, 3], [4]]
      : [[0, 1, 2], [2, 3], [3, 4], [5]];
    const departments = !extraDepartment
      ? ["Sales", "Technical", "Purchasing", "Production", "Site/After Service"]
      : ["Sales", "Design", "Technical", "Purchasing", "Production", "Site/After Service"];
    file.graph.nodes = departments.map((name, index) => {
      const node = createDomainNode("general", `header-department-${index}`);
      node.config.stage = name;
      node.conditions = [
        {
          id: `header-condition-${index}`,
          label: `${name} release`,
          duration: [1, 120, 28, 91, 91, 91][index],
        },
      ];
      return node;
    });
    file.highLevel!.graph.nodes = [
      "QUALIFICATION",
      "PRE-CONSTRUCTION",
      "CONSTRUCTION",
      "POST-CONSTRUCTION",
    ].map((description, index) => ({
      id: `header-phase-${index}`,
      type: "phase",
      title: `PHASE ${index + 1}`,
      description,
      linkedLayer2NodeIds: links[index].map((department) => file.graph.nodes[department].id),
    }));
    file.highLevel!.graph.edges = [0, 1, 2].map((index) => ({
      id: `header-edge-${index}`,
      source: `header-phase-${index}`,
      target: `header-phase-${index + 1}`,
    }));
    await page.addInitScript(
      ({ key, file }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
            version: 0,
          }),
        );
        const measure = (root: ParentNode) =>
          Array.from(root.querySelectorAll<HTMLElement>(".phase-card")).map((card) => {
            const bounds = card.getBoundingClientRect();
            const label = card.querySelector<HTMLElement>(".phase-involvement")!;
            const title = card.querySelector<HTMLElement>(".phase-title")!;
            const meta = card.querySelector<HTMLElement>(".phase-meta")!;
            const duration = card.querySelector<HTMLElement>(".phase-duration")!;
            return {
              top: label.getBoundingClientRect().top - bounds.top,
              singleLine: (() => {
                const parts = Array.from(
                  card.querySelectorAll<HTMLElement>(".phase-duration-part"),
                );
                return parts.every(
                  (part) =>
                    Math.abs(
                      part.getBoundingClientRect().top - parts[0].getBoundingClientRect().top,
                    ) < 1,
                );
              })(),
              right: bounds.right - label.getBoundingClientRect().right,
              clear: meta.getBoundingClientRect().bottom <= title.getBoundingClientRect().top,
              durationClear:
                title.getBoundingClientRect().bottom <= duration.getBoundingClientRect().top,
              contained:
                label.getBoundingClientRect().left >= bounds.left &&
                label.getBoundingClientRect().right <= bounds.right,
              overflow: [meta, title, duration].some(
                (element) =>
                  element.scrollHeight > element.clientHeight + 1 ||
                  element.scrollWidth > element.clientWidth + 1,
              ),
            };
          });
        const serialize = XMLSerializer.prototype.serializeToString;
        XMLSerializer.prototype.serializeToString = function (node) {
          if (node instanceof Element && node.querySelector(".phase-card")) {
            const clone = node.cloneNode(true) as Element;
            document.body.appendChild(clone);
            (window as unknown as { clonedPhaseHeaders: unknown }).clonedPhaseHeaders =
              measure(clone);
            clone.remove();
          }
          return serialize.call(this, node);
        };
        const original = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (...args) {
          (window as unknown as { phaseHeaders: unknown }).phaseHeaders = measure(document);
          return original.apply(this, args);
        };
      },
      { key: WORKFLOW_STORAGE_KEY, file },
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page
      .getByText(`High Level Process System Flowchart${gantt ? " with Gantt Chart" : ""}`, {
        exact: true,
      })
      .click();
    const path = testInfo.outputPath("phase-headers.pdf");
    await (await pending).saveAs(path);
    // Optional preview image for manual review; the assertions below do not need Poppler.
    try {
      execFileSync("pdftoppm", [
        "-f",
        "1",
        "-singlefile",
        "-scale-to",
        "1800",
        "-png",
        path,
        testInfo.outputPath("phase-headers"),
      ]);
    } catch {
      // pdftoppm is not installed on this machine.
    }
    const headers = await page.evaluate(() => {
      type Header = {
        top: number;
        right: number;
        singleLine: boolean;
        clear: boolean;
        durationClear: boolean;
        contained: boolean;
        overflow: boolean;
      };
      const state = window as unknown as { phaseHeaders: Header[]; clonedPhaseHeaders: Header[] };
      return [...state.phaseHeaders, ...state.clonedPhaseHeaders];
    });
    expect(headers).toHaveLength(8);
    for (const header of headers) {
      expect(header.singleLine).toBe(true);
      expect(header.top).toBeCloseTo(14, 0);
      expect(header.right).toBeCloseTo(13, 0);
      expect(header.clear).toBe(true);
      expect(header.durationClear).toBe(true);
      expect(header.contained).toBe(true);
      expect(header.overflow).toBe(false);
      expect(Math.abs(header.top - headers[0].top)).toBeLessThan(1);
      expect(Math.abs(header.right - headers[0].right)).toBeLessThan(1);
    }
  });
}
