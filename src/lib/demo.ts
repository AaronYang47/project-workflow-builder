import { createDefaultHighLevelProcess } from "@/lib/high-level-workflow";
import { createDefaultDetailedLifecycle } from "@/lib/detailed-workflow";
import { createEmptyExecutionLayer, type WorkflowFile } from "@/types/workflow";

const now = new Date().toISOString();
const highLevel = createDefaultHighLevelProcess();
const detailed = createDefaultDetailedLifecycle(highLevel);

/**
 * The clean starting document contains the approved High-Level lifecycle and
 * its matching L2 scaffold. L3 execution requirements remain optional.
 */
export const DEMO_WORKFLOW: WorkflowFile = {
  graph: {
    schemaVersion: 1,
    metadata: {
      name: "PROFAB Project Lifecycle",
      version: "v1.0-high-level",
      status: "Draft",
      createdAt: now,
      updatedAt: now,
      notes: "High-Level lifecycle skeleton from Initial Contact through Final Close.",
    },
    nodes: detailed.graph.nodes,
    edges: detailed.graph.edges,
    rules: [],
  },
  layout: {
    nodes: detailed.layout.nodes,
    edges: detailed.layout.edges,
    viewport: detailed.layout.viewport,
    snapToGrid: true,
    gridSize: 16,
  },
  highLevel: detailed.highLevel,
  execution: createEmptyExecutionLayer(),
};
