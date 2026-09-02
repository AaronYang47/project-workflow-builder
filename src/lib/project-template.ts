import {
  createEmptyExecutionLayer,
  createEmptyHighLevelWorkflow,
  type WorkflowFile,
} from "@/types/workflow";
import { clone } from "@/lib/clone";
import { buildProjectId, currentYearSuffix } from "@/lib/project-id";
import { normalizeProjectOperations } from "@/lib/project-operations";

export const createProjectWorkflow = (
  name: string,
  projectNumber = "",
): WorkflowFile => {
  const now = new Date().toISOString();
  const digits = projectNumber.replace(/\D/g, "");
  const yy = currentYearSuffix();
  const projectId = digits.length === 5
    ? buildProjectId(digits.slice(2), "L", digits.slice(0, 2))
    : digits.length === 3
      ? buildProjectId(digits, "L", yy)
      : "";
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
      nodes: [],
      edges: [],
      rules: [],
    },
    layout: {
      nodes: {},
      edges: {},
      viewport: { x: 0, y: 0, zoom: 0.8 },
      snapToGrid: true,
      gridSize: 16,
    },
    highLevel: createEmptyHighLevelWorkflow(),
    execution: createEmptyExecutionLayer(),
    operations: normalizeProjectOperations(undefined, name, projectId),
  };
};

/** Workspace used after a cloud project is deleted or can no longer be restored. */
export const createEmptyWorkspace = (): WorkflowFile => {
  const now = new Date().toISOString();
  return {
    graph: {
      schemaVersion: 1,
      metadata: {
        name: "",
        version: "v1.0-draft",
        status: "Draft",
        createdAt: now,
        updatedAt: now,
        notes: "",
      },
      nodes: [],
      edges: [],
      rules: [],
    },
    layout: {
      nodes: {},
      edges: {},
      viewport: { x: 0, y: 0, zoom: 0.8 },
      snapToGrid: true,
      gridSize: 16,
    },
    highLevel: createEmptyHighLevelWorkflow(),
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
