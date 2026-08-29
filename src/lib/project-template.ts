import {
  createEmptyExecutionLayer,
  type WorkflowFile,
} from "@/types/workflow";
import { clone } from "@/lib/clone";
import { buildProjectId, currentYearSuffix, legacyJobNumberFromProjectId } from "@/lib/project-id";
import { createDefaultHighLevelProcess } from "@/lib/high-level-workflow";
import { createDefaultDetailedLifecycle } from "@/lib/detailed-workflow";

export const createProjectWorkflow = (
  name: string,
  projectNumber: string,
): WorkflowFile => {
  const now = new Date().toISOString();
  const digits = projectNumber.replace(/\D/g, "");
  const yy = currentYearSuffix();
  const projectId = digits.length === 5
    ? buildProjectId(digits.slice(2), "L", digits.slice(0, 2))
    : digits.length === 3
      ? buildProjectId(digits, "L", yy)
      : "";
  const detailed = createDefaultDetailedLifecycle(createDefaultHighLevelProcess());
  const nodes = detailed.graph.nodes.map((node) =>
    node.id === "project-start"
      ? {
          ...node,
          conditions: [
            { id: "project-id-required", label: "Project ID is entered", required: true, checked: Boolean(projectId), locked: true },
          ],
          customFields: {
            ...node.customFields,
            projectId,
            legacyJobNumber: legacyJobNumberFromProjectId(projectId),
            nodeUuid: crypto.randomUUID(),
          },
        }
      : node,
  );
  return {
    graph: {
      schemaVersion: 1,
      metadata: {
        name,
        version: "v1.0-draft",
        status: "Draft",
        createdAt: now,
        updatedAt: now,
        notes: "",
      },
      nodes,
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
};

export const duplicateWorkflowFile = (
  file: WorkflowFile,
  name: string,
): WorkflowFile => {
  const copy = clone(file);
  const now = new Date().toISOString();
  copy.graph.metadata = {
    ...copy.graph.metadata,
    name,
    createdAt: now,
    updatedAt: now,
  };
  copy.graph.nodes = copy.graph.nodes.map((node) =>
    node.type === "projectStart"
      ? {
          ...node,
          customFields: {
            ...node.customFields,
            nodeUuid: crypto.randomUUID(),
          },
        }
      : node,
  );
  return copy;
};
