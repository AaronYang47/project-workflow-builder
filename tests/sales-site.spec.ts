import { expect, test, type Page } from "playwright/test";
import { createEmptyQualificationForm101 } from "../src/lib/qualification-form-101";

/** The Sales site on a phone, against a stand-in for /api/sales/*. */

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

async function mockSalesServer(page: Page) {
  const state = {
    signedIn: false,
    linked: false,
    drafts: [] as Record<string, unknown>[],
    submits: [] as Record<string, unknown>[],
  };
  const form101 = createEmptyQualificationForm101();
  form101.sectionA.projectName = "Maison Laurier";
  await page.route("**/api/sales/me", (route) =>
    route.fulfill({
      json: state.signedIn
        ? {
            user: { id: "sales-1", email: "sam@example.com", name: "Sam Seller" },
            sales: { linked: state.linked, team: state.linked ? "Tech Team" : "" },
          }
        : { user: null, sales: null },
    }),
  );
  await page.route("**/api/auth/login", (route) => {
    state.signedIn = true;
    return route.fulfill({
      json: { user: { id: "sales-1", email: "sam@example.com", name: "Sam Seller" }, sales: true },
    });
  });
  await page.route("**/api/sales/link", (route) => {
    const code = route.request().postDataJSON().code;
    if (code !== "ABCD-2345")
      return route.fulfill({ status: 404, json: { error: "This access code is not valid." } });
    state.linked = true;
    return route.fulfill({ json: { linked: true, team: "Tech Team" } });
  });
  await page.route("**/api/sales/projects", (route) =>
    route.fulfill({
      json: {
        team: "Tech Team",
        projects: [
          { id: "p1", name: "26014 Maison Laurier" },
          { id: "p2", name: "26020 Résidence Côté" },
        ],
        drafts: [],
        canCreate: true,
      },
    }),
  );
  await page.route("**/api/sales/intake/p1/submit", (route) => {
    state.submits.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        projectId: "p1",
        projectName: "26014 Maison Laurier",
        jobNumber: "26014",
        submission: {
          by: "Sam Seller",
          email: "sam@example.com",
          at: "2026-11-26T12:00:00Z",
          revision: "1",
        },
        history: [
          { revision: "0", at: "2026-11-20T12:00:00Z", by: "Ann", first: true, changes: [] },
        ],
      },
    });
  });
  await page.route("**/api/sales/intake/p1", (route) => {
    if (route.request().method() === "PUT") {
      state.drafts.push(route.request().postDataJSON());
      return route.fulfill({ json: { savedAt: "2026-11-26T12:00:00Z" } });
    }
    return route.fulfill({
      json: {
        key: "p1",
        isNew: false,
        projectName: "26014 Maison Laurier",
        jobNumber: "",
        form101,
        submission: { by: "Ann", email: "", at: "2026-11-20T12:00:00Z", revision: "0" },
        draftSavedAt: null,
        savedJobNumber: "",
        savedForm101: form101,
        history: [
          { revision: "0", at: "2026-11-20T12:00:00Z", by: "Ann", first: true, changes: [] },
        ],
      },
    });
  });
  return state;
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("Sales sign in, enter the access code, fill in a project and submit it on a phone", async ({
  page,
}) => {
  const server = await mockSalesServer(page);
  await page.goto("/sales");

  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel("Password").fill("a-test-password-1");
  await page.getByRole("button", { name: "Sign in" }).last().click();

  // The code is typed loosely; the page formats it.
  const code = page.getByLabel("Access code");
  await code.fill("abcd2345");
  await expect(code).toHaveValue("ABCD-2345");
  await page.getByRole("button", { name: "Continue" }).click();

  // Only project names, with search.
  await expect(page.locator("[data-sales-project]")).toHaveCount(2);
  await page.getByLabel("Search projects").fill("côté");
  await expect(page.locator("[data-sales-project]")).toHaveCount(1);
  await page.getByLabel("Search projects").fill("");
  expect(await noSideScroll(page)).toBe(true);
  await page.locator('[data-sales-project="26014 Maison Laurier"]').click();

  await expect(page.locator("[data-sales-form-title]")).toHaveText("26014 Maison Laurier");
  // An update: the last answers are already there.
  await expect(page.locator("[data-sales-update-banner]")).toContainText("Updating Rev 0");
  const jobNumber = page.locator("[data-sales-job-number]");
  await jobNumber.fill("26a01");
  await expect(jobNumber).toHaveValue("2601");
  await expect(page.getByText("The Job number has 5 digits.")).toBeVisible();
  await jobNumber.fill("26014");
  // Saved as a draft a moment after typing stops.
  await expect.poll(() => server.drafts.at(-1)?.jobNumber).toBe("26014");
  await expect(page.locator('[data-sales-save-state="saved"]')).toBeVisible();

  // A real swipe scrolls the page (the app's canvas pages lock scrolling).
  await page.locator('[data-step-index="2"]').click();
  await page.mouse.move(180, 500);
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  // The Back / Next bar stays on screen while typing.
  await page.getByLabel("Owner company").focus();
  await expect(page.locator("[data-sales-nav]")).toBeVisible();

  // Every step fits the phone screen.
  for (let step = 1; step <= 8; step++) {
    await page.locator(`[data-step-index="${step}"]`).click();
    expect(await noSideScroll(page), `step ${step}`).toBe(true);
  }
  await page.locator('[data-step-index="2"]').click();
  await page.getByLabel("Owner company").fill("Immeubles Laurier");
  // Sales never get the internal route pop-up.
  await page.getByLabel("Owner contact").click();
  await expect(page.getByText("Route impact")).toHaveCount(0);

  // Big Yes / No buttons, and the phone's own date picker.
  await page.locator('[data-step-index="4"]').click();
  await page
    .getByRole("group", { name: "Project budget established" })
    .getByRole("button", { name: "Yes" })
    .click();
  await page.getByLabel("Project budget CAD").fill("1,250,000");
  await page.getByLabel("Target date: Delivery").fill("2027-06-01");
  // The form's own examples are a tap away.
  await page.locator('[data-step-index="6"]').click();
  await page.locator('[data-sales-disclosure="discipline-civil"] > button').click();
  await page.getByRole("button", { name: "+ Foundation plan" }).click();
  await expect(page.getByLabel("2. Architecture item 1", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("1. Civil item 1", { exact: true })).toHaveValue("Foundation plan");

  // Changed questions are marked as Sales edit them.
  await page.locator('[data-step-index="2"]').click();
  await expect(page.locator('[data-sales-question="q3"] [data-sales-changed]')).toBeVisible();
  await expect(page.locator('[data-sales-question="q4"] [data-sales-changed]')).toHaveCount(0);

  await page.locator('[data-step-index="8"]').click();
  const changes = page.locator("[data-sales-changes]");
  await expect(changes).toContainText("This update changes");
  await expect(changes).toContainText("Owner company");
  await expect(changes).toContainText("Job number");
  await expect(page.locator("[data-sales-submit]")).toHaveText(/Submit update \(Rev 1\)/);
  await expect(page.locator("[data-sales-missing] button").first()).toBeVisible();
  await page.locator("[data-sales-submit]").click();

  await expect(page.locator("[data-sales-submitted]")).toContainText("Rev 1");
  expect(server.submits).toHaveLength(1);
  expect(server.submits[0].jobNumber).toBe("26014");
  expect(
    (server.submits[0].form101 as { sectionA: { parties: { owner: { company: string } } } })
      .sectionA.parties.owner.company,
  ).toBe("Immeubles Laurier");
  const sent = server.submits[0].form101 as {
    sectionA: { budgetEstablished: string; projectName: string; targetDates: { delivery: string } };
    sectionB: { disciplines: { civil: { items: { item: string }[] } } };
  };
  expect(sent.sectionA.budgetEstablished).toBe("yes");
  // Dates are kept the way the form in the app keeps them.
  expect(sent.sectionA.targetDates.delivery).toBe("2027.06.01");
  expect(sent.sectionB.disciplines.civil.items[0].item).toBe("Foundation plan");

  await page.locator("[data-sales-generate-pdf]").click();
  await expect(page.locator("[data-sales-pdf-name]")).toHaveText(
    "S_1.01_QF_26014_Maison_Laurier_rev1.pdf",
  );
  await expect(page.locator("[data-sales-share-pdf]")).toBeVisible();
});

test("a wrong access code says so and shows no projects", async ({ page }) => {
  const server = await mockSalesServer(page);
  server.signedIn = true;
  await page.goto("/sales");
  await page.getByLabel("Access code").fill("ZZZZ9999");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("This access code is not valid.")).toBeVisible();
  await expect(page.locator("[data-sales-project]")).toHaveCount(0);
});

test("an update with nothing changed cannot be submitted", async ({ page }) => {
  const server = await mockSalesServer(page);
  server.signedIn = true;
  server.linked = true;
  await page.goto("/sales?form=p1");
  await expect(page.locator("[data-sales-update-banner]")).toBeVisible();
  await page.locator('[data-step-index="8"]').click();
  await expect(page.locator("[data-sales-changes]")).toContainText(
    "Nothing has changed since Rev 0",
  );
  await expect(page.locator("[data-sales-submit]")).toBeDisabled();
});

test.describe("on a phone set to French", () => {
  test.use({ locale: "fr-CA" });

  test("the Sales site opens in French and the EN / FR switch is remembered", async ({ page }) => {
    const server = await mockSalesServer(page);
    server.signedIn = true;
    server.linked = true;
    await page.goto("/sales");
    await expect(page.locator("[data-sales-language]")).toHaveAttribute(
      "data-sales-language",
      "fr",
    );
    await expect(page.locator("[data-sales-new-project]")).toContainText("Nouveau projet");
    await expect(page.getByRole("heading", { name: "Projets" })).toBeVisible();

    await page.locator('[data-sales-project="26014 Maison Laurier"]').click();
    await expect(page.locator("[data-sales-update-banner]")).toContainText(
      "Mise à jour de la rév. 0",
    );
    await page.locator('[data-step-index="1"]').click();
    await expect(page.getByText("Usage principal du bâtiment")).toBeVisible();
    await expect(page.getByText("Habitation", { exact: true })).toBeVisible();
    await page.locator('[data-step-index="6"]').click();
    await expect(page.locator('[data-sales-disclosure="discipline-civil"]')).toContainText(
      "Génie civil",
    );
    await page.locator('[data-sales-disclosure="discipline-civil"] > button').click();
    await expect(page.getByText("La position ET l’orientation")).toBeVisible();
    await page.getByRole("button", { name: "+ Plan d’implantation à jour" }).click();
    await expect(page.getByLabel("1. Civil item 1", { exact: true })).toHaveValue(
      "Plan d’implantation à jour",
    );
    await page.locator('[data-step-index="8"]').click();
    await expect(page.locator("[data-sales-changes]")).toContainText(
      "Cette mise à jour modifie 1 réponse",
    );
    await expect(page.locator("[data-sales-changes]")).toContainText("Génie civil");

    // Switch by hand: English, and it stays English after reloading.
    await page.locator("[data-sales-language] button", { hasText: "en" }).click();
    await expect(page.locator("[data-sales-submit]")).toHaveText(/Submit update \(Rev 1\)/);
    await page.reload();
    await expect(page.locator("[data-sales-language]")).toHaveAttribute(
      "data-sales-language",
      "en",
    );
  });
});
