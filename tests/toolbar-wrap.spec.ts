import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

for (const width of [1440, 1280, 1024, 390]) {
  test(`toolbar wraps controls without horizontal scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedE2EWorkflow(page);
    await page.goto("/");
    const toolbar = page.locator("[data-workflow-toolbar]");
    await expect(toolbar.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    const overflow = await toolbar.evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      return Array.from(root.querySelectorAll<HTMLElement>("div, button, a")).filter((element) => {
        const box = element.getBoundingClientRect();
        if (!box.width || !box.height) return false;
        return box.right > bounds.right + 1 || box.left < bounds.left - 1 ||
          (["auto", "scroll"].includes(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1);
      }).map((element) => element.getAttribute("aria-label") || element.className);
    });
    expect(overflow).toEqual([]);
    if (width >= 1280) {
      const rows = await toolbar.evaluate((element) => getComputedStyle(element).gridTemplateRows.split(" ").length);
      expect(rows).toBe(2);
    }
  });
}
