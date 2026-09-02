import { expect, test, type Page } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

async function openLayer1(page: Page) {
  await seedE2EWorkflow(page);
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  await expect(
    page.getByText("Start", { exact: true }).first(),
  ).toBeVisible();
}

async function assertNoDocumentOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

async function visibleUnnamedInteractive(page: Page) {
  return page
    .locator(
      "input:visible, select:visible, textarea:visible, button:visible, a[href]:visible",
    )
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const control = element as HTMLInputElement;
          const textName = ["BUTTON", "A"].includes(control.tagName)
            ? control.textContent?.trim()
            : "";
          return !(
            control.labels?.length ||
            control.getAttribute("aria-label")?.trim() ||
            control.getAttribute("aria-labelledby")?.trim() ||
            control.getAttribute("title")?.trim() ||
            textName
          );
        })
        .map((element) => {
          const control = element as HTMLInputElement;
          return {
            tag: control.tagName,
            type: control.type,
            id: control.id,
            placeholder: control.placeholder,
          };
        }),
    );
}

async function duplicatePageIds(page: Page) {
  return page.locator("[id]").evaluateAll((elements) => {
    const counts = new Map<string, number>();
    for (const element of elements) {
      counts.set(element.id, (counts.get(element.id) || 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => ({ id, count }));
  });
}

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];

for (const viewport of viewports) {
  test(`${viewport.name} keeps L1, L2, and L3 inside the document viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openLayer1(page);
    await assertNoDocumentOverflow(page);

    await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
    await expect(page.locator('[data-id="gate-g1-qualified"]')).toBeVisible();
    await assertNoDocumentOverflow(page);

    await page.locator('[data-id="pre-construction"]').click();
    await page.getByRole("button", { name: "L3 · Execution View" }).click();
    await expect(page.getByText("L3 · Execution Layer")).toBeVisible();
    await assertNoDocumentOverflow(page);
  });
}

test("visible form controls have accessible names and page ids are unique", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLayer1(page);
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("workflow:open-execution", {
        detail: { nodeId: "pre-construction" },
      }),
    );
  });
  await expect(page.getByText("PRE-CONSTRUCTION", { exact: true })).toBeVisible();

  expect(await visibleUnnamedInteractive(page)).toEqual([]);
  expect(await duplicatePageIds(page)).toEqual([]);
});

test("Gate screening and required-file checklists retain accessible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openLayer1(page);

  for (const target of [
    { nodeId: "gate-g1-qualified", text: "G1 — QUALIFIED & COMMERCIALLY ENGAGED" },
    { nodeId: "pre-construction", text: "PRE-CONSTRUCTION" },
  ]) {
    await page.getByRole("button", { name: "L1 · High Level" }).click();
    await page.evaluate(
      ({ nodeId }) => {
        window.dispatchEvent(
          new CustomEvent("workflow:open-execution", {
            detail: { nodeId },
          }),
        );
      },
      target,
    );
    await expect(page.getByText(target.text, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("required-file-checklist")).toBeVisible();
    await expect(page.getByRole("button", { name: /Edit execution item/ })).toHaveCount(0);
    expect(await visibleUnnamedInteractive(page), target.nodeId).toEqual([]);
    expect(await duplicatePageIds(page), target.nodeId).toEqual([]);
  }
});
