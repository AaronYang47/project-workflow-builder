import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import {
  precedingConditionBlocker,
  releaseConditionBlocker,
  sequentialExecutionBlocker,
} from "../src/lib/workflow-progress";
import { validateWorkflow } from "../src/lib/validation";
import { useWorkflowStore } from "../src/store/workflow-store";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

const DOCS_KEY = "legalDocuments::release-condition::rc-second";

function fixture() {
  const file = createProjectWorkflow("Previous department");
  file.graph.nodes = ["first", "second"].map((id, index) => {
    const node = createDomainNode(index === 0 ? "projectStart" : "general", id);
    node.title = `Chapter ${index + 1}`;
    node.config.stage = index === 0 ? "Sales" : "Technical";
    node.conditions = [{ id: `rc-${id}`, label: `Finish ${id}`, required: true, checked: false }];
    file.layout.nodes[id] = { nodeId: id, x: index * 660, y: 100, width: 384, height: 500 };
    return node;
  });
  file.graph.nodes[1].customFields[DOCS_KEY] = JSON.stringify([
    { id: "doc-1", title: "Signed drawing", checked: false, required: true },
  ]);
  file.graph.edges = [
    {
      id: "sequence",
      source: "first",
      target: "second",
      sourceHandle: "out",
      targetHandle: "in",
      type: "success",
      label: "",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    },
  ];
  return file;
}

test("the next department's conditions and files can't be ticked before the previous one is done", () => {
  useWorkflowStore.getState().replaceFile(fixture());
  const store = useWorkflowStore.getState;
  const second = () => store().file.graph.nodes.find((node) => node.id === "second")!;
  expect(sequentialExecutionBlocker(store().file, "second")).toContain("Department Sales");

  // A direct release condition.
  store().updateNode("second", { conditions: [{ ...second().conditions[0], checked: true }] });
  expect(second().conditions[0].checked).toBe(false);
  expect(store().deleteBlocked?.title).toBe("Finish the previous department first");

  // A file inside a release condition.
  store().updateNode("second", {
    customFields: {
      ...second().customFields,
      [DOCS_KEY]: JSON.stringify([{ id: "doc-1", title: "Signed drawing", checked: true }]),
    },
  });
  expect(JSON.parse(String(second().customFields[DOCS_KEY]))[0].checked).toBe(false);

  // Untick is always allowed; once the previous department is done, ticking works.
  store().updateNode("first", {
    conditions: [
      {
        ...store().file.graph.nodes.find((node) => node.id === "first")!.conditions[0],
        checked: true,
      },
    ],
  });
  expect(sequentialExecutionBlocker(store().file, "second")).toBeUndefined();
  store().updateNode("second", { conditions: [{ ...second().conditions[0], checked: true }] });
  expect(second().conditions[0].checked).toBe(true);
});

test("clicking a blocked condition on L2 shows the popup", async ({ page }) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: fixture() },
  );
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const second = page.locator('.react-flow__node[data-id="second"]');
  await second.getByRole("button", { name: "Check release condition 1" }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText("Finish the previous department first")).toBeVisible();
  await expect(dialog).toContainText("Department Sales");
  await page.getByRole("button", { name: "Got it" }).click();
  // Still unticked.
  await expect(second.getByRole("button", { name: "Check release condition 1" })).toBeVisible();
});

test("ticks made out of order before the rule are flagged in validation, not removed", () => {
  const file = fixture();
  file.graph.nodes[1].conditions[0].checked = true;
  const issue = validateWorkflow(file).find((item) => item.code === "OUT_OF_ORDER_TICKS");
  expect(issue?.nodeId).toBe("second");
  expect(issue?.message).toContain("Department Sales");
  expect(file.graph.nodes[1].conditions[0].checked).toBe(true);
  file.graph.nodes[0].conditions[0].checked = true;
  expect(validateWorkflow(file).some((item) => item.code === "OUT_OF_ORDER_TICKS")).toBe(false);
});

function multiConditionFixture() {
  const file = createProjectWorkflow("Condition sequence");
  const sales = createDomainNode("general", "sales");
  sales.title = "Sales";
  sales.config.stage = "Sales";
  sales.conditions = [
    { id: "sales-1", label: "Sales condition 1", required: true, checked: false },
    { id: "sales-2", label: "Sales condition 2", required: true, checked: false },
    { id: "sales-3", label: "Sales condition 3", required: true, checked: false },
  ];
  sales.customFields["legalDocuments::release-condition::sales-2"] = JSON.stringify([
    { id: "leg-2", title: "Signed contract", checked: false, required: true },
  ]);
  sales.customFields["customerDocuments::release-condition::sales-2"] = JSON.stringify([
    { id: "customer-doc-2", title: "Client sheet", checked: false, required: true },
  ]);
  sales.customFields["supportingDocuments::release-condition::sales-2"] = JSON.stringify([
    { id: "sup-2", title: "Site photo", checked: false, required: true },
  ]);

  const tech = createDomainNode("general", "tech");
  tech.title = "Technical";
  tech.config.stage = "Technical";
  tech.conditions = [
    { id: "tech-1", label: "Technical condition 1", required: true, checked: false },
  ];
  tech.customFields["customerDocuments::release-condition::tech-1"] = JSON.stringify([
    { id: "customer-doc-tech", title: "Technical intake", checked: false, required: true },
  ]);

  file.graph.nodes = [sales, tech];
  file.layout.nodes = {
    sales: { nodeId: "sales", x: 0, y: 120, width: 384, height: 420 },
    tech: { nodeId: "tech", x: 520, y: 120, width: 384, height: 340 },
  };
  file.graph.edges = [
    {
      id: "sales-to-tech",
      source: "sales",
      target: "tech",
      sourceHandle: "out",
      targetHandle: "in",
      type: "success",
      label: "",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    },
  ];
  return file;
}

test("earlier required conditions on the same department block later conditions and L3 files", () => {
  useWorkflowStore.getState().replaceFile(multiConditionFixture());
  const store = useWorkflowStore.getState;
  const sales = () => store().file.graph.nodes.find((node) => node.id === "sales")!;

  expect(precedingConditionBlocker(store().file, "sales", "sales-1")).toBeUndefined();
  expect(releaseConditionBlocker(store().file, "sales", "sales-2")).toMatchObject({
    title: "Finish the previous release condition first",
  });

  // Trying to tick Condition 2 on L2 is blocked and shows the popup.
  store().updateNode("sales", {
    conditions: sales().conditions.map((c) => (c.id === "sales-2" ? { ...c, checked: true } : c)),
  });
  expect(sales().conditions[1].checked).toBe(false);
  expect(store().deleteBlocked?.title).toBe("Finish the previous release condition first");
  expect(store().deleteBlocked?.message).toContain("Sales condition 1");

  // Trying to tick any L3 file on Condition 2 is also blocked.
  for (const field of ["legalDocuments", "customerDocuments", "supportingDocuments"]) {
    const key = `${field}::release-condition::sales-2`;
    store().updateNode("sales", {
      customFields: {
        ...sales().customFields,
        [key]: JSON.stringify([{ id: "doc", title: "File", checked: true, required: true }]),
      },
    });
    expect(JSON.parse(String(sales().customFields[key]))[0].checked).toBe(false);
  }

  // Completing Condition 1 unblocks Condition 2, while Condition 3 stays blocked until Condition 2 passes.
  store().updateNode("sales", {
    conditions: sales().conditions.map((c) => (c.id === "sales-1" ? { ...c, checked: true } : c)),
  });
  expect(precedingConditionBlocker(store().file, "sales", "sales-2")).toBeUndefined();
  expect(precedingConditionBlocker(store().file, "sales", "sales-3")).toContain(
    "Sales condition 2",
  );
  store().updateNode("sales", {
    customFields: {
      ...sales().customFields,
      "legalDocuments::release-condition::sales-2": JSON.stringify([
        { id: "leg-2", title: "Signed contract", checked: true, required: true },
      ]),
    },
  });
  expect(
    JSON.parse(String(sales().customFields["legalDocuments::release-condition::sales-2"]))[0]
      .checked,
  ).toBe(true);

  // Optional earlier conditions do not block later conditions.
  store().replaceFile(multiConditionFixture());
  store().updateNode("sales", {
    conditions: sales().conditions.map((c) => (c.id === "sales-1" ? { ...c, required: false } : c)),
  });
  expect(precedingConditionBlocker(store().file, "sales", "sales-2")).toBeUndefined();
});

test("clicking blocked L2 conditions or L3 files shows the popup across all three document boxes", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, file }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, file: multiConditionFixture() },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();

  // 1. L2: clicking Condition 2 on Sales while Condition 1 is incomplete shows the condition popup.
  const salesCard = page.locator('.react-flow__node[data-id="sales"]');
  await salesCard.getByRole("button", { name: "Check release condition 2" }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText("Finish the previous release condition first")).toBeVisible();
  await expect(dialog).toContainText("Sales condition 1");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(salesCard.getByRole("button", { name: "Check release condition 2" })).toBeVisible();

  // 2. L3 files page for Sales Condition 2: every file box is blocked with popup until Condition 1 is done.
  await salesCard.getByRole("button", { name: "Open L3 details for release condition 2" }).click();
  await expect(
    page.getByText(/Finish “Sales condition 1” in Department Sales first/),
  ).toBeVisible();

  for (const title of ["Signed contract", "Client sheet", "Site photo"]) {
    const box = page.getByRole("checkbox", { name: `Required file: ${title}` });
    await box.click();
    await expect(dialog.getByText("Finish the previous release condition first")).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(box).not.toBeChecked();
  }

  // 3. Complete Condition 1 in the L3 selector pill circle, then Condition 2 files can be ticked.
  await page
    .getByRole("button", { name: /Sales condition 1/ })
    .getByRole("checkbox")
    .click();
  for (const title of ["Signed contract", "Client sheet", "Site photo"]) {
    const box = page.getByRole("checkbox", { name: `Required file: ${title}` });
    await box.check();
    await expect(dialog).toHaveCount(0);
    await expect(box).toBeChecked();
  }

  // 4. L3 files page for Technical while Sales is incomplete shows the department popup.
  await page.getByRole("button", { name: "Back to L2 Detailed Workflow" }).click();
  const techCard = page.locator('.react-flow__node[data-id="tech"]');
  await techCard.getByRole("button", { name: "Open L3 details for release condition 1" }).click();
  const techBox = page.getByRole("checkbox", { name: "Required file: Technical intake" });
  await techBox.click();
  await expect(dialog.getByText("Finish the previous department first")).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(techBox).not.toBeChecked();
});

test("a department placed before Project Start (SALES) blocks Project Start until finished", () => {
  const file = createProjectWorkflow("Before Project Start");
  const intake = createDomainNode("general", "intake");
  intake.title = "Pre-Sales Intake";
  intake.config.stage = "Intake";
  intake.conditions = [{ id: "intake-1", label: "Check intake", required: true, checked: false }];
  const start = createDomainNode("projectStart", "project-start");
  file.graph.nodes = [intake, start];
  file.graph.edges = [
    {
      id: "intake-to-start",
      source: "intake",
      target: "project-start",
      sourceHandle: "out",
      targetHandle: "in",
      type: "success",
      label: "",
      lineStyle: "solid",
      arrowStyle: "closed",
      customFields: {},
    },
  ];
  expect(sequentialExecutionBlocker(file, "project-start")).toContain("Department Intake");
  intake.conditions[0].checked = true;
  expect(sequentialExecutionBlocker(file, "project-start")).toBeUndefined();
});
