import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { sequentialExecutionBlocker } from "../src/lib/workflow-progress";
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
