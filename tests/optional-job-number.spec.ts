import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { useWorkflowStore } from "../src/store/workflow-store";
import {
  conditionHasL3Forms,
  conditionIsSatisfied,
  nodeReleaseReady,
} from "../src/lib/workflow-progress";
import {
  jobNumberFromProjectName,
  syncProjectNameIdentity,
  syncWorkflowJobNumberOnLoad,
} from "../src/lib/project-id";
import { WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("missing Job Number does not block, while entering a 5-digit Job Number auto-ticks the condition without forms", () => {
  const node = createDomainNode("projectStart", "start");
  node.conditions = [
    {
      id: "project-id-required",
      label: "Job Number is entered",
      required: false,
      checked: false,
      locked: true,
    },
  ];
  expect(conditionHasL3Forms(node.conditions[0], node)).toBe(false);
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(false);
  expect(nodeReleaseReady(node, node, [], undefined)).toBe(true);

  node.customFields.projectId = "27001";
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(true);

  node.customFields.projectId = "L-27-001";
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(true);

  expect(syncProjectNameIdentity("PROF Address 1 St 1 Su", "27001")).toBe(
    "27001 PROF Address 1 St 1 Su",
  );
  expect(syncProjectNameIdentity("My Workflow", "27001")).toBe("27001 My Workflow");
  expect(syncProjectNameIdentity("", "27001")).toBe("27001");
  expect(syncProjectNameIdentity("27001 My Workflow", "28002")).toBe("28002 My Workflow");
  expect(syncProjectNameIdentity("27001 My Workflow", "")).toBe("My Workflow");
  expect(jobNumberFromProjectName("27001 PROF ABC 1 St 1 Su")).toBe("27001");
  expect(jobNumberFromProjectName("27084_FDBR_85-87Chauveau")).toBe("27084");
  expect(jobNumberFromProjectName("123456 Street")).toBe("");

  const titledFile = createProjectWorkflow("27001 PROF ABC 1 St 1 Su");
  titledFile.graph.nodes = [createDomainNode("projectStart", "project-start")];
  const synced = syncWorkflowJobNumberOnLoad(titledFile);
  const syncedStart = synced.graph.nodes[0];
  expect(syncedStart.customFields.projectId).toBe("L-27-001");
  expect(syncedStart.customFields.legacyJobNumber).toBe("27001");
  expect(syncedStart.conditions[0].checked).toBe(true);
});

test("Job Number auto-ticks the condition without forms and stays synced bidirectionally with the top-left workflow title", async ({
  page,
}) => {
  const file = createProjectWorkflow("No Job Number");
  const start = createDomainNode("projectStart", "start");
  start.conditions[0].required = false;
  file.graph.nodes = [start];
  file.layout.nodes[start.id] = { nodeId: start.id, x: 0, y: 0, width: 420, height: 550 };
  await page.addInitScript(
    ({ key, file }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator('[data-id="start"]');
  const titleInput = page.getByRole("textbox", { name: "Workflow name" });
  const jobInput = card.getByRole("textbox", { name: "Job Number (5 digits)" });

  await expect(card.getByText("Job Number not set. You can add it later.")).toBeVisible();
  await expect(card).toContainText("Ready");
  const check = card.getByRole("button", { name: "Check step 1" });
  await expect(check).toBeDisabled();

  // Entering 5 digits in the node auto-ticks "Job Number is entered" and prepends to the title.
  await jobInput.fill("27001");
  await expect(card.getByText("Job Number not set. You can add it later.")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Uncheck step 1" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Uncheck step 1" })).toBeDisabled();
  await expect(titleInput).toHaveValue("27001 No Job Number");

  // Deleting even a single digit from the node immediately clears the old Job Number from the title.
  await jobInput.focus();
  await jobInput.press("Backspace");
  await expect(jobInput).toHaveValue("2700");
  await expect(titleInput).toHaveValue("No Job Number");
  await expect(card.getByRole("button", { name: "Check step 1" })).toBeVisible();

  // Completing the 5th digit syncs the new Job Number to the title and auto-ticks again.
  await jobInput.type("2");
  await expect(jobInput).toHaveValue("27002");
  await expect(titleInput).toHaveValue("27002 No Job Number");
  await expect(card.getByRole("button", { name: "Uncheck step 1" })).toBeVisible();

  // Clearing Job Number on the node unticks the condition and removes the 5-digit prefix from title.
  await jobInput.fill("");
  await expect(card.getByRole("button", { name: "Check step 1" })).toBeVisible();
  await expect(titleInput).toHaveValue("No Job Number");

  // Typing a 5-digit Job Number at the left of the top-left title populates the node and auto-ticks.
  await titleInput.fill("28002 PROF ABC 1 St 1 Su");
  await expect(jobInput).toHaveValue("28002");
  await expect(card.getByRole("button", { name: "Uncheck step 1" })).toBeVisible();
  await expect(card).toContainText("28002 PROF");

  // Removing the 5-digit prefix from the top-left title clears the node and unticks.
  await titleInput.fill("PROF ABC 1 St 1 Su");
  await expect(jobInput).toHaveValue("");
  await expect(card.getByRole("button", { name: "Check step 1" })).toBeVisible();
});

test("loading a titled workflow with a 5-digit Job Number populates Project Start automatically", async ({
  page,
}) => {
  const file = createProjectWorkflow("27001 PROF ABC 1 St 1 Su");
  const start = createDomainNode("projectStart", "start");
  file.graph.nodes = [start];
  file.layout.nodes[start.id] = { nodeId: start.id, x: 0, y: 0, width: 420, height: 550 };
  await page.addInitScript(
    ({ key, file }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const card = page.locator('[data-id="start"]');
  await expect(card.getByRole("textbox", { name: "Job Number (5 digits)" })).toHaveValue("27001");
  await expect(card).toContainText("27001 PROF");
  await expect(card.getByRole("button", { name: "Uncheck step 1" })).toBeVisible();
});

test("a cloud project can be created without a Job Number", async ({ page }) => {
  const user = { id: "owner", name: "Owner", email: "owner@example.com" };
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { user } }));
  let saved: { name: string; projectNumber: string } | undefined;
  await page.route("**/api/projects", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({
        json: {
          project: {
            id: "new",
            name: saved!.name,
            project_number: "",
            created_at: "",
            updated_at: "",
          },
        },
      });
    }
    return route.fulfill({ json: { projects: [] } });
  });
  await page.addInitScript(
    ({ key, user }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { authUser: user, workspaceOwnerId: user.id, dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, user },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Job Number not set. You can add it later.")).toBeVisible();
  await dialog.getByRole("textbox", { name: "Company code" }).fill("PROF");
  await dialog.getByRole("textbox", { name: "Project address" }).fill("Test Street");
  await dialog.getByRole("textbox", { name: "Storeys" }).fill("1");
  await dialog.getByRole("textbox", { name: "Suites" }).fill("1");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect.poll(() => saved?.projectNumber).toBe("");
  expect(saved?.name).toBe("PROF Test Street 1 St 1 Su");
});

test("ticking every required file of a release condition ticks the condition", () => {
  const node = createDomainNode("general", "sales");
  node.conditions = [{ id: "nda", label: "NDA & EDAT", required: true }];
  const files = (checked: boolean[]) =>
    JSON.stringify(
      checked.map((value, index) => ({
        id: `doc-${index}`,
        title: `File ${index + 1}`,
        required: true,
        checked: value,
      })),
    );
  node.customFields["customerDocuments::release-condition::nda"] = files([true, false]);
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(false);
  node.customFields["customerDocuments::release-condition::nda"] = files([true, true]);
  expect(conditionIsSatisfied(node.conditions[0], node)).toBe(true);

  // The Job Number condition does not require forms; it tracks the Job Number above.
  const start = createDomainNode("projectStart", "start");
  start.customFields["customerDocuments::release-condition::project-id-required"] = files([false]);
  expect(conditionHasL3Forms(start.conditions[0], start)).toBe(false);
  expect(conditionIsSatisfied(start.conditions[0], start)).toBe(false);
  start.customFields["customerDocuments::release-condition::project-id-required"] = files([true]);
  expect(conditionIsSatisfied(start.conditions[0], start)).toBe(false);
  start.customFields.projectId = "L-27-001";
  expect(conditionIsSatisfied(start.conditions[0], start)).toBe(true);
});

test("adding Project Start to a workflow whose title has a Job Number populates the node and shows auto status in L3", async ({
  page,
}) => {
  const file = createProjectWorkflow("27001 PROF ABC 1 St 1 Su");
  useWorkflowStore.getState().replaceFile(file);
  const startId = useWorkflowStore.getState().addNode("projectStart", { x: 100, y: 100 });
  const added = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === startId)!;
  expect(added.customFields.projectId).toBe("L-27-001");
  expect(added.customFields.legacyJobNumber).toBe("27001");
  expect(added.conditions[0].checked).toBe(true);

  await page.addInitScript(
    ({ key, persisted }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: persisted, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, persisted: useWorkflowStore.getState().file },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page
    .locator(`[data-id="${startId}"]`)
    .getByRole("button", { name: "Open L3 details for step 1" })
    .click();
  await expect(page.getByText("No form required · Auto from Job Number")).toBeVisible();
  await expect(page.getByRole("button", { name: "Uncheck step" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Uncheck step" })).toBeDisabled();
});
