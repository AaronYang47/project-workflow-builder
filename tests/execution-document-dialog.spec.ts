import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

test("late library results do not replace a document title being entered", async ({ page }) => {
  let releaseFiles: (() => void) | undefined;
  await page.route("**/api/files", async (route) => {
    await new Promise<void>((resolve) => { releaseFiles = resolve; });
    await route.fulfill({ json: { ok: true, ownerUserId: "dev-bypass", files: [{ id: "remote", fileName: "contract.pdf", title: "Remote Contract", fileSize: 1200, fileType: "application/pdf", category: "legal", description: "", uploadedAt: "2026-10-27" }] } });
  });
  await seedE2EWorkflow(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "RC · Forms & execution" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("workflow:open-execution", { detail: { nodeId: "pre-construction" } })));
  await page.getByRole("button", { name: "Add Legal Document" }).click();
  const title = page.getByPlaceholder("e.g. Master Services Agreement 2026");
  await title.fill("Custom agreement");
  await expect.poll(() => Boolean(releaseFiles)).toBe(true);
  releaseFiles!();
  await expect(page.getByText("Remote Contract", { exact: true })).toBeVisible();
  await expect(title).toHaveValue("Custom agreement");
  await page.getByRole("button", { name: "Add to L3 List" }).click();
  await expect(page.getByText("Custom agreement", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add Legal Document" }).click();
  await expect(title).toHaveValue("Remote Contract");
});
