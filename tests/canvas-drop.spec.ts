import { expect, test, type Page } from "playwright/test";
import { seedE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** Dispatch the same drop event the node library's drag produces. */
async function dropNode(page: Page, type: string, x: number, y: number) {
  await page.evaluate(
    ({ type, x, y }) => {
      const target =
        document.elementFromPoint(x, y) ?? document.querySelector(".react-flow__pane")!;
      const data = new DataTransfer();
      data.setData("application/workflow-node", type);
      for (const name of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(name, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            dataTransfer: data,
          }),
        );
      }
    },
    { type, x, y },
  );
}

const savedNodes = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw).state.file.graph.nodes as { id: string; type: string }[]) : [];
  }, WORKFLOW_STORAGE_KEY);

test("dropping from the node library adds nodes to the L2 canvas", async ({ page }) => {
  await seedE2EWorkflow(page);
  await page.goto("/?layer=L2");
  const pane = page.locator(".react-flow__pane").first();
  await expect(pane).toBeVisible();
  await page.waitForTimeout(800);
  const before = await savedNodes(page);
  const box = (await pane.boundingBox())!;

  // A canvas double-click is navigation, never a request to add a Department.
  await pane.dispatchEvent("dblclick", {
    bubbles: true,
    clientX: box.x + box.width - 60,
    clientY: box.y + box.height - 60,
  });
  await expect(page.locator(".react-flow__node")).toHaveCount(before.length);

  await dropNode(page, "general", box.x + box.width - 60, box.y + box.height - 60);
  await expect.poll(async () => (await savedNodes(page)).length).toBe(before.length + 1);
  const afterGeneral = await savedNodes(page);
  expect(afterGeneral.filter((node) => node.type === "general").length).toBe(
    before.filter((node) => node.type === "general").length + 1,
  );

  // A drop without the library's data type is ignored.
  await page.evaluate(() => {
    const pane = document.querySelector(".react-flow__pane")!;
    pane.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
        dataTransfer: new DataTransfer(),
      }),
    );
  });
  await page.waitForTimeout(500);
  expect((await savedNodes(page)).length).toBe(afterGeneral.length);
});
