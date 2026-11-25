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

});

