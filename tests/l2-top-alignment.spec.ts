import { expect, test } from "playwright/test";
import { seedE2EWorkflow } from "./support/e2e-workflow";

test("Auto arrange lines up Phase frames, and the cards in each Phase, along the top", async ({
  page,
}) => {
  await seedE2EWorkflow(page);
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page.getByRole("button", { name: "Auto arrange" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const frames = Array.from(
          document.querySelectorAll<HTMLElement>(".react-flow__node-phase"),
        );
        const frameTops = frames.map((frame) => Math.round(frame.getBoundingClientRect().top));
        // The top card of every column inside a Phase starts on one line.
        const columnTops = frames.map((frame) => {
          const box = frame.getBoundingClientRect();
          const cards = Array.from(
            document.querySelectorAll<HTMLElement>(".react-flow__node-workflow"),
          ).filter((card) => {
            const rect = card.getBoundingClientRect();
            return rect.left >= box.left && rect.right <= box.right && rect.top >= box.top;
          });
          const byColumn = new Map<number, number>();
          for (const card of cards) {
            const rect = card.getBoundingClientRect();
            const column = Math.round(rect.left);
            byColumn.set(column, Math.min(byColumn.get(column) ?? Infinity, rect.top));
          }
          return [...byColumn.values()].map((top) => Math.round(top));
        });
        return {
          frames: frames.length,
          frameTopsAligned: new Set(frameTops).size === 1,
          columnsAligned: columnTops.every(
            (tops) => tops.length < 2 || Math.max(...tops) - Math.min(...tops) <= 1,
          ),
        };
      }),
    )
    .toEqual({ frames: 4, frameTopsAligned: true, columnsAligned: true });
});
