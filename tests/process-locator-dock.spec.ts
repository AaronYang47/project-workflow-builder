import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

test("process locator button snaps to the corner it is dragged to and still opens on click", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "L1 · High Level" }).click();
  const button = page.getByRole("button", { name: "Open minimap and process locator" });
  await expect(button).toBeVisible();
  // Drag handlers attach on hydration; a drag before that is an inert mouse move.
  await page.waitForLoadState("networkidle");
  const start = (await button.boundingBox())!;
  expect(start.x).toBeLessThan(640);
  expect(start.y).toBeGreaterThan(400);

  // Drag towards the top-right corner; it snaps there and remembers it.
  // Grab the right end: Next.js' dev badge also sits bottom-left in dev mode,
  // and dragging it would move (and persist) the badge instead of our button.
  await page.mouse.move(start.x + start.width - 30, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(900, 200, { steps: 8 });
  await page.mouse.move(1270, 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pwb.process-locator.dock"))).toBe("top-right");
  await expect.poll(async () => (await button.boundingBox())!.x).toBeGreaterThan(640);
  expect((await button.boundingBox())!.y).toBeLessThan(400);
  await expect(page.getByRole("img", { name: /process locator diagram/ })).toHaveCount(0);

  // A press without moving opens the locator.
  await button.click();
  await expect(page.getByRole("img", { name: /process locator diagram/ })).toBeVisible();
});
