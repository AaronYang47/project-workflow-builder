import { readFile } from "node:fs/promises";
import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

for (const theme of ["light", "dark"] as const) {
  test(`Process Locator PDF preserves ${theme} colors, connectors and expanded bounds`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await seedE2EWorkflow(page);
    await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
    await page.goto("/");
    await page.getByRole("button", { name: "L1 · High Level" }).click();
    await page.getByRole("button", { name: "Open minimap and process locator" }).click();
    const diagram = page.getByRole("img", { name: "L1 to L2 process locator diagram" });
    await expect(diagram).toBeVisible();

    // Start collapsed to catch exports using the old, smaller render dimensions.
    const toggles = page.locator("[data-process-locator-l2-toggle]");
    for (const toggle of await toggles.all()) {
      if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
    }
    const camera = await diagram.evaluate((el) => (el as HTMLElement).style.transform);

    // Inspect the actual raster passed to jsPDF, including a connector midpoint.
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const root = document.querySelector<HTMLElement>('[aria-label="L1 to L2 process locator diagram"]');
        if (root && this.width > 1000) {
          const context = this.getContext("2d")!;
          const scale = this.width / root.offsetWidth;
          const edge = root.querySelector<SVGPathElement>(".pyramid-blocked-edge")!;
          const midpoint = edge.getPointAtLength(edge.getTotalLength() / 2);
          const card = root.querySelector<HTMLElement>('button[title="Open L1 · Start"]')!;
          const pixel = (x: number, y: number) => Array.from(context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data);
          root.dataset.exportPixels = JSON.stringify({
            background: pixel(0, 0),
            connector: pixel(midpoint.x, midpoint.y),
            card: pixel(card.offsetLeft + 8, card.offsetTop + 8),
            width: this.width,
            height: this.height,
          });
        }
        return original.apply(this, args);
      };
    });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PDF", exact: true }).click();
    const pdf = await download;
    const pdfPath = testInfo.outputPath(`process-locator-${theme}.pdf`);
    await pdf.saveAs(pdfPath);
    await expect(page.getByRole("button", { name: "Export PDF", exact: true })).toBeEnabled();

    const pixels = JSON.parse((await diagram.getAttribute("data-export-pixels"))!);
    expect(pixels.background).toEqual(theme === "light" ? [255, 255, 255, 255] : [15, 20, 28, 255]);
    expect(pixels.connector).not.toEqual(pixels.background);
    if (theme === "light") expect(Math.min(...pixels.card.slice(0, 3))).toBeGreaterThan(180);
    else expect(Math.max(...pixels.card.slice(0, 3))).toBeLessThan(100);
    const size = await diagram.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
    expect(pixels.width).toBe(size.width * 2);
    expect(pixels.height).toBe(size.height * 2);
    expect(await diagram.evaluate((el) => (el as HTMLElement).style.transform)).toBe(camera);
    const contents = (await readFile(pdfPath)).toString("latin1");
    expect(contents).toContain("%PDF-");
    expect(contents).toContain(`/Width ${pixels.width}`);
    expect(contents).toContain(`/Height ${pixels.height}`);
    await testInfo.attach(`process-locator-${theme}`, { path: pdfPath, contentType: "application/pdf" });
  });
}
