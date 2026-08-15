import {
  EDGE_TYPES,
  NODE_TYPES,
  type WorkflowFile,
} from "@/types/workflow";

export const serializeWorkflow = (file: WorkflowFile) =>
  JSON.stringify(file, null, 2);
export function parseWorkflow(input: string): WorkflowFile {
  const value = JSON.parse(input) as Partial<WorkflowFile>;
  const validNode = (node: unknown) => {
    if (!node || typeof node !== "object") return false;
    const item = node as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      NODE_TYPES.includes(item.type as (typeof NODE_TYPES)[number]) &&
      typeof item.title === "string" &&
      typeof item.description === "string" &&
      item.metadata !== null &&
      typeof item.metadata === "object" &&
      Array.isArray(item.roles) &&
      Array.isArray(item.conditions) &&
      Array.isArray(item.documents) &&
      Array.isArray(item.criteria) &&
      item.customFields !== null &&
      typeof item.customFields === "object" &&
      item.config !== null &&
      typeof item.config === "object"
    );
  };
  const validEdge = (edge: unknown) => {
    if (!edge || typeof edge !== "object") return false;
    const item = edge as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      typeof item.source === "string" &&
      typeof item.target === "string" &&
      EDGE_TYPES.includes(item.type as (typeof EDGE_TYPES)[number])
    );
  };
  if (
    !value.graph ||
    !value.layout ||
    value.graph.schemaVersion !== 1 ||
    !value.graph.metadata ||
    typeof value.graph.metadata.name !== "string" ||
    !Array.isArray(value.graph.nodes) ||
    !value.graph.nodes.every(validNode) ||
    !Array.isArray(value.graph.edges) ||
    !value.graph.edges.every(validEdge) ||
    !Array.isArray(value.graph.rules) ||
    !value.layout.nodes ||
    typeof value.layout.nodes !== "object" ||
    !value.layout.viewport ||
    ![
      value.layout.viewport.x,
      value.layout.viewport.y,
      value.layout.viewport.zoom,
    ].every(Number.isFinite) ||
    value.layout.viewport.zoom <= 0 ||
    !Object.values(value.layout.nodes).every(
      (layout) =>
        layout &&
        typeof layout.nodeId === "string" &&
        [layout.x, layout.y, layout.width, layout.height].every(
          Number.isFinite,
        ),
    ) ||
    !value.graph.nodes.every((node) => Boolean(value.layout!.nodes[node.id]))
  )
    throw new Error(
      "This workflow file is incomplete or contains unsupported data.",
    );
  return value as WorkflowFile;
}
export function downloadText(
  name: string,
  content: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
