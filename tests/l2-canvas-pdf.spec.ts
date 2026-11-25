import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

const cases = [
  { item: "L1 · High-Level Process", startOnL2: false, title: "workflow-L1-high-level-11x17" },
  { item: "L1 · High-Level Process", startOnL2: true, title: "workflow-L1-high-level-11x17" },
  { item: "L2 · Detailed Workflow", startOnL2: true, title: "workflow-L2-detailed-11x17" },
  { item: "L2 · Detailed Workflow", startOnL2: false, title: "workflow-L2-detailed-11x17" },
];

for (const { item, startOnL2, title } of cases) {
  test(`${item} prints an 11 x 17 vector page ${startOnL2 ? "from L2" : "from L1"}`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await seedE2EWorkflow(page);
    await page.addInitScript(() => {
      (window as unknown as { printed: unknown[] }).printed = [];
      window.print = () => {
        const root = document.getElementById("vector-canvas-print");
        (window as unknown as { printed: unknown[] }).printed.push({
          title: document.title,
          nodes: root?.querySelectorAll(".react-flow__node").length ?? 0,
          controls:
            root?.querySelectorAll(".react-flow__controls, .react-flow__minimap").length ?? 0,
          // Arrowheads must point at the copy's own definitions, not the hidden original's.
          strayRefs: Array.from(root?.querySelectorAll("[marker-end]") ?? []).filter(
            (edge) => !edge.getAttribute("marker-end")!.includes("print-"),
          ).length,
          formPhases: root?.querySelectorAll("[data-print-forms-phase]").length ?? 0,
          rows: Number(root?.dataset.printRows ?? 1),
          // Phase frames print a solid border thick enough to stay unbroken on paper.
          faintFrames: Array.from(
            root?.querySelectorAll<HTMLElement>('[data-testid="phase-card"]') ?? [],
          ).filter(
            (frame) =>
              !/^rgba\([^)]*, 1\)$|^rgb\(/.test(frame.style.getPropertyValue("border-color")) ||
              Number.parseFloat(frame.style.getPropertyValue("border-width")) < 2,
          ).length,
          // Every connector ends in the bold print arrowhead.
          missingArrows: Array.from(
            root?.querySelectorAll<SVGPathElement>(".react-flow__edge-path") ?? [],
          ).filter((path) => path.getAttribute("marker-end") !== "url(#print-connector-arrow)")
            .length,
          // Step text is printed even though it is a button on the canvas.
          stepTexts: Array.from(
            root?.querySelectorAll<HTMLElement>('button[aria-label^="Edit step"]') ?? [],
          ).filter((button) => button.textContent?.trim()).length,
          hiddenStepTexts: Array.from(
            root?.querySelectorAll<HTMLElement>('button[aria-label^="Edit step"]') ?? [],
          ).filter((button) => button.textContent?.trim() && button.style.visibility === "hidden")
            .length,
          // Every connector prints highlighted green.
          connectors: root?.querySelectorAll(".react-flow__edge-path").length ?? 0,
          nonGreen: Array.from(
            root?.querySelectorAll<SVGPathElement>(".react-flow__edge-path") ?? [],
          ).filter(
            (path) =>
              path.style.getPropertyValue("stroke") !== "rgb(34, 197, 94)" &&
              path.style.getPropertyValue("stroke") !== "#22c55e",
          ).length,
          // Top-level cards (Phase frames and stand-alone cards) must never overlap on the sheet.
          overlaps: (() => {
            if (!root) return 0;
            root.style.setProperty("display", "block", "important");
            const boxes = Array.from(
              root.querySelectorAll<HTMLElement>(".react-flow__node-phase"),
            ).map((card) => card.getBoundingClientRect());
            root.style.removeProperty("display");
            return boxes.filter((box, index) =>
              boxes.some(
                (other, otherIndex) =>
                  otherIndex > index &&
                  box.left < other.right - 1 &&
                  other.left < box.right - 1 &&
                  box.top < other.bottom - 1 &&
                  other.top < box.bottom - 1,
              ),
            ).length;
          })(),
          formGroups: Array.from(
            new Set(
              Array.from(root?.querySelectorAll<HTMLElement>("[data-print-forms-group]") ?? []).map(
                (group) => group.dataset.printFormsGroup,
              ),
            ),
          ),
        });
      };
    });
    await page.goto("/");
    if (startOnL2) await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await page.getByText(item, { exact: true }).last().click();
    await page.waitForFunction(
      () => (window as unknown as { printed: unknown[] }).printed.length > 0,
    );
    const [printed] = await page.evaluate(
      () =>
        (
          window as unknown as {
            printed: {
              title: string;
              nodes: number;
              controls: number;
              strayRefs: number;
              formPhases: number;
              rows: number;
              faintFrames: number;
              missingArrows: number;
              stepTexts: number;
              hiddenStepTexts: number;
              connectors: number;
              nonGreen: number;
              overlaps: number;
              formGroups: string[];
            }[];
          }
        ).printed,
    );
    expect(printed.title).toBe(title);
    expect(printed.nodes).toBeGreaterThan(3);
    expect(printed.controls).toBe(0);
    expect(printed.connectors).toBeGreaterThan(0);
    expect(printed.nonGreen).toBe(0);
    expect(printed.faintFrames).toBe(0);
    expect(printed.missingArrows).toBe(0);
    expect(printed.hiddenStepTexts).toBe(0);
    expect(printed.strayRefs).toBe(0);
    // Every phase lists its legal forms, customer information and supporting forms.
    expect(printed.formPhases).toBeGreaterThan(0);
    expect(printed.formGroups).toEqual(["legal", "customer", "supporting"]);

    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString(
      "latin1",
    );
    if (item.startsWith("L2")) {
      // A long L2 flow wraps into an S over several rows so it prints larger.
      expect(printed.rows).toBeGreaterThan(1);
      expect(printed.overlaps).toBe(0);
    } else {
      // L1 keeps its Phases in one row.
      expect(printed.rows).toBe(1);
    }
    // 11 x 17 landscape: 17in wide, 11in tall.
    expect(pdf).toMatch(/\/MediaBox\s*\[0 0 1224 792\]/);
    expect((pdf.match(/\/Type\s*\/Page\b/g) || []).length).toBe(1);
    // Text stays text: the page carries fonts rather than one flat picture.
    expect(pdf).toMatch(/\/Type\s*\/Font\b/);
  });
}
