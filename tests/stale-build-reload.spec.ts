import { expect, test } from "playwright/test";
import { isStaleBuildError } from "../src/components/stale-build-reload";

test("recognises the errors an old page hits after a new deploy", () => {
  const chunk = new Error("Failed to load chunk /_next/static/chunks/0d55fgk_jc4vg.js");
  chunk.name = "ChunkLoadError";
  expect(isStaleBuildError(chunk)).toBe(true);
  expect(isStaleBuildError("Loading chunk 123 failed.")).toBe(true);
  expect(isStaleBuildError(new Error("Cannot read properties of undefined"))).toBe(false);
});

test("a missing code file reloads the page once", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => sessionStorage.removeItem("falcon:stale-build-reload"));
  const reloaded = page.waitForEvent("load");
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.src = "/_next/static/chunks/does-not-exist-after-deploy.js";
    document.body.appendChild(script);
  });
  await reloaded;
  // The guard is set, so a second failure right away does not loop.
  expect(
    await page.evaluate(() => sessionStorage.getItem("falcon:stale-build-reload")),
  ).toBeTruthy();
});
