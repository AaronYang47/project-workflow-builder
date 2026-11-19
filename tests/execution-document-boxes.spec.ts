import { expect, test, type Page } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

/** One Technical chapter whose condition has two Required and two Supporting documents. */
async function openL3(page: Page) {
  const file = createProjectWorkflow("L3 boxes characterization");
  const chapter = createDomainNode("general", "technical");
  chapter.title = "CHAPTER 01";
  chapter.config.stage = "Technical";
  chapter.conditions = [{ id: "design", label: "Design review", duration: 3 }];
  chapter.customFields["legalDocuments::release-condition::design"] = JSON.stringify([
    {
      id: "leg-1",
      title: "Permit set",
      code: "LEG-11",
      category: "legal",
      status: "Required",
      checked: false,
      required: true,
    },
    {
      id: "leg-2",
      title: "Shop drawings",
      category: "legal",
      status: "Optional",
      checked: false,
      required: false,
    },
  ]);
  chapter.customFields["customerDocuments::release-condition::design"] = JSON.stringify([
    {
      id: "contact-1",
      title: "Client contact sheet",
      code: "CUST-21",
      category: "customer",
      status: "Required",
      checked: false,
      required: true,
    },
    {
      id: "selection-form",
      title: "Customer Selection Form",
      fileName: "Customer_Selection_Form.json",
      category: "customer",
      status: "Required",
      checked: false,
      required: true,
      formKind: "customer-selection",
    },
  ]);
  chapter.customFields["supportingDocuments::release-condition::design"] = JSON.stringify([
    {
      id: "sup-1",
      title: "Load calculation",
      category: "supporting",
      status: "Required",
      checked: false,
      required: true,
    },
    {
      id: "sup-2",
      title: "Site photos",
      code: "SUP-77",
      category: "supporting",
      status: "Optional",
      checked: false,
      required: false,
    },
  ]);
  file.graph.nodes = [chapter];
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
  await page.addInitScript(
    ({ key, file }) => {
      if (sessionStorage.getItem("l3-boxes-seeded")) return;
      sessionStorage.setItem("l3-boxes-seeded", "yes");
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
  await page.goto("/?executionNode=technical&condition=design");
  await expect(
    page
      .getByRole("region", { name: "L3 Execution Layer" })
      .or(page.locator('[aria-label="L3 Execution Layer"]'))
      .first(),
  ).toBeVisible();
}

const box = (page: Page, title: string) =>
  page
    .locator("div.flex.flex-col.rounded-xl")
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();

test("Required and Supporting boxes count, tick, label and remove documents", async ({ page }) => {
  await openL3(page);
  const required = box(page, "Required Documents");
  const supporting = box(page, "Supporting Documents");

  await expect(required).toContainText("Forms / Documents for this step");
  await expect(required).toContainText("0/2 Executed");
  await expect(required).toContainText("LEG-11");
  await expect(required).toContainText("FORM");
  await expect(supporting).toContainText("Engineering drawings, calculations & evidence");
  await expect(supporting).toContainText("0/2 Verified");
  await expect(supporting).toContainText("SUP-01");
  await expect(supporting).toContainText("SUP-77");

  await required.getByRole("checkbox", { name: "Required file: Permit set" }).check();
  await expect(required).toContainText("1/2 Executed");
  await expect(required).toContainText("Executed");
  await supporting.getByRole("checkbox", { name: "Required file: Load calculation" }).check();
  await expect(supporting).toContainText("1/2 Verified");
  await expect(supporting.getByText("Verified", { exact: true })).toHaveCount(1);

  await supporting.getByRole("button", { name: "Remove document" }).first().click();
  await expect(supporting).not.toContainText("Load calculation");
  await expect(supporting).toContainText("0/1 Verified");
  await supporting.getByRole("button", { name: "Remove document" }).click();
  await expect(supporting).toContainText("No supporting documents added yet.");

  await required.getByRole("button", { name: "Add Required Document" }).click();
  await expect(page.getByRole("heading", { name: "Add Required Document" })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await supporting.getByRole("button", { name: "Add Supporting Document" }).click();
  await expect(page.getByRole("heading", { name: "Add Supporting Document" })).toBeVisible();
});

test("Customer Information box ticks documents but keeps an incomplete selection form locked", async ({
  page,
}) => {
  await openL3(page);
  const customer = box(page, "Customer Information");
  await expect(customer).toContainText("0/2 Verified");
  await expect(customer).toContainText("CUST-21");
  await expect(
    customer.getByRole("checkbox", { name: "Required file: Customer Selection Form" }),
  ).toBeDisabled();
  await expect(customer.getByRole("button", { name: "Open Form" })).toBeVisible();

  await customer.getByRole("checkbox", { name: "Required file: Client contact sheet" }).check();
  await expect(customer).toContainText("1/2 Verified");
  await customer.getByRole("checkbox", { name: "Required file: Client contact sheet" }).uncheck();
  await expect(customer).toContainText("0/2 Verified");

  await customer.getByRole("button", { name: "Remove form" }).first().click();
  await expect(customer).not.toContainText("Client contact sheet");
  await expect(customer).toContainText("0/1 Verified");

  await customer.getByRole("button", { name: "Add Customer Information Form" }).click();
  await expect(page.getByRole("heading", { name: /Add Customer/ })).toBeVisible();
});
