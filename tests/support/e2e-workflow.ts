import type { Page } from "playwright/test";
import { createDefaultDetailedLifecycle } from "../../src/lib/detailed-workflow";
import type { HighLevelNode, WorkflowFile } from "../../src/types/workflow";

/** Browser tests own their data explicitly; runtime startup stays empty. */
export const WORKFLOW_STORAGE_KEY = "project-workflow-builder:v43-no-default-workspace";

function makeHighLevelNode(
  id: string,
  type: HighLevelNode["type"],
  title: string,
  description: string,
  linkedLayer2NodeIds: string[],
): HighLevelNode {
  return {
    id,
    type,
    title,
    description,
    linkedLayer2NodeIds,
    linkedDetailedNodeIds: linkedLayer2NodeIds,
  };
}

/** A compact, current L1 layout used only by browser tests. */
export function createE2EWorkflow(): WorkflowFile {
  const file = createDefaultDetailedLifecycle();
  const now = new Date().toISOString();
  const nodes = [
    makeHighLevelNode("high-level-1", "start", "Start", "Project entry and qualification", ["project-start"]),
    makeHighLevelNode(
      "high-level-2",
      "phase",
      "Phase-01",
      "Qualification and pre-construction",
      ["gate-g1-qualified", "pre-construction", "gate-g2-technical-commitment"],
    ),
    makeHighLevelNode(
      "high-level-3",
      "phase",
      "Phase-02",
      "Production and delivery",
      ["production-readiness", "gate-g3-production-authorization", "factory-production", "gate-g4-factory-release"],
    ),
    makeHighLevelNode(
      "high-level-4",
      "end",
      "Final Close",
      "Warranty and project closeout",
      ["delivery-project-completion", "gate-g5-warranty-start", "commissioning-warranty", "close-out"],
    ),
  ];

  file.graph.metadata = {
    ...file.graph.metadata,
    name: "Workflow Test Fixture",
    version: "v1.0-test",
    status: "Draft",
    createdAt: now,
    updatedAt: now,
  };
  file.highLevel = {
    graph: {
      nodes,
      edges: [
        { id: "e2e-l1-edge-1", source: "high-level-1", target: "high-level-2" },
        { id: "e2e-l1-edge-2", source: "high-level-2", target: "high-level-3" },
        { id: "e2e-l1-edge-3", source: "high-level-3", target: "high-level-4" },
      ],
    },
    layout: {
      nodes: {
        "high-level-1": { nodeId: "high-level-1", x: 0, y: 220 },
        "high-level-2": { nodeId: "high-level-2", x: 320, y: 220 },
        "high-level-3": { nodeId: "high-level-3", x: 664, y: 220 },
        "high-level-4": { nodeId: "high-level-4", x: 1008, y: 220 },
      },
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  };
  return file;
}

export async function seedE2EWorkflow(page: Page) {
  await page.addInitScript(
    ({ key, persistedFile }) => {
      window.localStorage.removeItem(key);
      window.localStorage.setItem(
        key,
        JSON.stringify({
          state: {
            file: persistedFile,
            workspaceOwnerId: "dev-bypass",
            dirty: false,
          },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, persistedFile: createE2EWorkflow() },
  );
}
