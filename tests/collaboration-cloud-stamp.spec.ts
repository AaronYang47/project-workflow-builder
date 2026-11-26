import { expect, test } from "playwright/test";
import { adoptCloudStamp, cloudStamp } from "../src/lib/collaboration/collaboration-manager";
import { useWorkflowStore } from "../src/store/workflow-store";
import { createE2EWorkflow } from "./support/e2e-workflow";

test("a session that takes editing control saves from the editor's latest cloud version", () => {
  const store = useWorkflowStore.getState();
  store.loadProject(createE2EWorkflow(), "project-1", "owner", "2026-11-26T01:00:00.000Z");
  // The other session saved twice since this one loaded.
  adoptCloudStamp("project-1", "2026-11-26T01:27:00.174Z");
  expect(useWorkflowStore.getState().cloudUpdatedAt).toBe("2026-11-26T01:27:00.174Z");
  // Late or out-of-order messages never move it backwards; other projects are ignored.
  adoptCloudStamp("project-1", "2026-11-26T01:26:00.000Z");
  adoptCloudStamp("project-2", "2026-11-27T00:00:00.000Z");
  expect(useWorkflowStore.getState().cloudUpdatedAt).toBe("2026-11-26T01:27:00.174Z");
  // Full-state syncs carry it to sessions that join later.
  expect(cloudStamp()).toEqual({
    cloud: { projectId: "project-1", updatedAt: "2026-11-26T01:27:00.174Z" },
  });
});
