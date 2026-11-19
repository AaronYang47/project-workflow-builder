import { expect, test, type Page } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** One Technical department with two required conditions, plus one unassigned condition. */
async function seedWorkspace(page: Page) {
  const file = createProjectWorkflow("Dialog characterization");
  const chapter = createDomainNode("general", "technical");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Technical";
  chapter.conditions = [
    { id: "design", label: "Design review", duration: 3 },
    { id: "fitup", label: "Fit-up review", duration: 2 },
  ];
  file.graph.nodes = [chapter];
  file.releaseConditionInbox = [
    { id: "inbox-1", label: "Permit received", required: true, checked: false },
  ];
  file.highLevel!.graph.nodes = [
    {
      id: "phase-1",
      type: "phase",
      title: "PHASE 1",
      description: "Technical",
      linkedLayer2NodeIds: [chapter.id],
    },
  ];
  file.highLevel!.graph.edges = [];
  await page.route("**/api/files", (route) =>
    route.fulfill({
      json: {
        ok: true,
        ownerUserId: "dev-bypass",
        files: [
          {
            id: "lib-a",
            key: "users/dev-bypass/legal/a.pdf",
            fileName: "a.pdf",
            fileSize: 2048,
            fileType: "application/pdf",
            category: "legal",
            title: "Library permit",
            description: "",
            uploadedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "lib-b",
            key: "users/dev-bypass/legal/b.pdf",
            fileName: "b.pdf",
            fileSize: 4096,
            fileType: "application/pdf",
            category: "legal",
            title: "Library drawings",
            description: "",
            uploadedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    }),
  );
  await page.addInitScript(
    ({ key, file }) => {
      if (sessionStorage.getItem("dialogs-seeded")) return;
      sessionStorage.setItem("dialogs-seeded", "yes");
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file },
  );
}

const conditionRow = (page: Page, index: number, label: string) =>
  page
    .locator('[data-release-condition-chapter-id="technical"]')
    .getByRole("group", { name: `Step ${index}: ${label}` });

test("forms window adds, retargets and removes a document, and adds Library forms in one batch", async ({
  page,
}) => {
  await seedWorkspace(page);
  await page.goto("/release-conditions");

  await conditionRow(page, 1, "Design review")
    .getByRole("button", { name: "View forms for Design review" })
    .click();
  const forms = page.getByRole("dialog", { name: "Design review" });
  await expect(forms).toBeVisible();

  // Single document: retarget to the second condition and mark it Optional.
  await forms.getByRole("button", { name: "Add Required Documents" }).click();
  const add = page.getByRole("dialog", { name: "Add Required Document" });
  await add.getByRole("combobox", { name: "Choose step for document" }).selectOption("1");
  await add.getByRole("textbox", { name: "Document title" }).fill("Permit set");
  await add.getByRole("button", { name: "Optional", exact: true }).click();
  await expect(add.getByRole("button", { name: "Optional", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await add.getByRole("button", { name: "Add to L3" }).click();
  await expect(add).toHaveCount(0);
  await expect(forms).not.toContainText("Permit set");
  await page.getByRole("button", { name: "Close forms window" }).click();

  await conditionRow(page, 2, "Fit-up review")
    .getByRole("button", { name: "View forms for Fit-up review" })
    .click();
  const fitup = page.getByRole("dialog", { name: "Fit-up review" });
  const required = fitup.getByRole("region", { name: "Required Documents" });
  await expect(required).toContainText("Permit set");
  await expect(required).toContainText("Optional");

  // Library batch: two files at once, then the same files are skipped.
  await fitup.getByRole("button", { name: "Add Forms from Library to Required Documents" }).click();
  const library = page.getByRole("dialog", { name: "Add Forms from Library" });
  await library.getByText("Library permit", { exact: true }).click();
  await library.getByText("Library drawings", { exact: true }).click();
  await expect(library).toContainText("2 selected");
  await library.getByRole("button", { name: "Add selected forms" }).click();
  await expect(library.getByRole("status")).toHaveText("2 forms added.");
  await library.getByText("Library permit", { exact: true }).click();
  await library.getByRole("button", { name: "Add selected forms" }).click();
  await expect(library.getByRole("status")).toHaveText("0 forms added · 1 already existed.");
  await library.getByRole("button", { name: "Close", exact: true }).click();
  await expect(library).toHaveCount(0);
  await expect(required).toContainText("Library permit");
  await expect(required).toContainText("Library drawings");

  // Remove one document.
  await required.getByRole("button", { name: "Remove Permit set" }).click();
  await expect(required).not.toContainText("Permit set");
  await expect(required).toContainText("Library drawings");
});

test("phone Assign dialog moves an unassigned condition into the chosen department", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedWorkspace(page);
  await page.goto("/release-conditions");
  await page.getByRole("button", { name: /Open unassigned conditions, 1 items/ }).click();
  await page.getByRole("button", { name: "Assign Permit received" }).click();
  const assign = page.getByRole("dialog", { name: "Assign step" });
  await expect(assign).toBeVisible();
  await assign.getByRole("button", { name: "Assign to Technical Department CHAPTER 01" }).click();
  await expect(assign).toHaveCount(0);
  await expect(conditionRow(page, 3, "Permit received")).toBeVisible();
});
