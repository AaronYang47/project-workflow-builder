import type { WorkflowFile } from "@/types/workflow";
import { buildProjectId, currentYearSuffix, legacyJobNumberFromProjectId } from "@/lib/project-id";

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
      nodes: [
        {
          id: "project-start",
          type: "projectStart",
          title: "Project Start",
          description: "Start the project and establish its project record.",
          color: "#2563a9",
          metadata: {},
          conditions: [
            { id: "project-id-required", label: "Project ID is entered", required: true, checked: Boolean(projectId), locked: true },
          ],
          documents: [],
          criteria: [],
          customFields: {
            projectId,
            legacyJobNumber: legacyJobNumberFromProjectId(projectId),
            nodeUuid: crypto.randomUUID(),
          },
          config: { stage: "Project", iconKey: "building", serviceType: "Standard", buildingCode: "", moduleCode: "" },
        },
      ],
      edges: [],
      rules: [],
    },
    layout: {
      nodes: {
        "project-start": {
          nodeId: "project-start",
          x: 220,
          y: 180,
          width: 320,
          height: 384,
        },
      },
      edges: {},
      viewport: { x: 0, y: 0, zoom: 1 },
      snapToGrid: true,
      gridSize: 16,
    },
  };
};
