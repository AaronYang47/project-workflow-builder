import { expect, test } from "playwright/test";

/** Pairs of line modules drawn on top of each other right now. */
const overlapping = () =>
  Array.from(document.querySelectorAll<SVGGElement>("[data-scene-line-module]"))
    .map((module) => module.getBoundingClientRect())
    .reduce((count, box, index, boxes) => {
      for (const other of boxes.slice(index + 1))
        if (Math.min(box.right, other.right) - Math.max(box.left, other.left) > 4) count += 1;
      return count;
    }, 0);

test("modules joining the line slide in behind the others instead of landing on them", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "construction-simulation:scenarios:v1",
      JSON.stringify([
        {
          id: "line-entry",
          name: "Line entry",
          factory: {
            startDate: "2027-01-04",
            targetOnLine: 18,
            normalMax: 19,
            crowdedMax: 23,
            yardCapacity: 60,
            installCrews: 2,
          },
          projects: [
            {
              id: "entry-project",
              name: "Entry project",
              color: "#2563eb",
              source: { kind: "virtual" },
              modules: 40,
              weeksPerModule: 1,
              splittable: false,
              earliestStart: "2027-01-04",
              dueDate: "2027-12-31",
              delivery: { kind: "fob", pickupDate: "2027-12-01", pickupCustom: true },
            },
          ],
        },
      ]),
    );
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/construction-simulation");
  await page.getByRole("radio", { name: "1 d/s" }).click();
  const day = page.getByRole("slider", { name: "Simulation day" });
  // Step through several working days and watch each slide as it happens.
  let worst = 0;
  for (const start of [6, 7, 8, 9, 10]) {
    await day.fill(String(start));
    await page.waitForTimeout(1200);
    const atRest = await page.evaluate(overlapping);
    await page.getByRole("button", { name: "Next day" }).click();
    for (let frame = 0; frame < 8; frame += 1) {
      await page.waitForTimeout(frame === 0 ? 15 : 40);
      worst = Math.max(worst, (await page.evaluate(overlapping)) - atRest);
    }
  }
  expect(worst).toBe(0);
});
