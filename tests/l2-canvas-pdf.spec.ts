import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

for (const fromL1 of [false, true]) {
  test(`L2 PDF contains workflow nodes ${fromL1 ? "when switching from L1" : "from L2"}`, async ({ page }, info) => {
    test.setTimeout(90000);
    await seedE2EWorkflow(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (this.width > 500 && document.querySelector('.react-flow__viewport')) {
          const ctx = this.getContext('2d')!;
          const samples = ctx.getImageData(0, 0, this.width, this.height).data;
          const bg = Array.from(samples.slice(0, 3));
          let different = 0;
          for (let y = 0; y < this.height; y += 12) for (let x = 0; x < this.width; x += 12) {
            const i = (y * this.width + x) * 4;
            if (Math.abs(samples[i] - bg[0]) + Math.abs(samples[i + 1] - bg[1]) + Math.abs(samples[i + 2] - bg[2]) > 45) different++;
          }
          (window as unknown as { exportSample: unknown }).exportSample = { different, width: this.width, height: this.height };
        }
        return original.apply(this, args);
      };
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'L2 · Detailed Workflow' }).click();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    if (fromL1) await page.getByRole('button', { name: 'L1 · High Level' }).click();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByText('L2 · Detailed Workflow', { exact: true }).last().click();
    await (await download).saveAs(info.outputPath(`l2-${fromL1}.pdf`));
    const sample = await page.evaluate(() => (window as unknown as { exportSample: { different: number; width: number; height: number } }).exportSample);
    expect(sample.different).toBeGreaterThan(100);
    expect(Math.max(sample.width, sample.height)).toBeLessThanOrEqual(12000);
  });
}
