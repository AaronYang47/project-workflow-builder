import { createDomainNode } from "@/lib/create-domain-node";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { createDefaultHighLevelProcess } from "@/lib/high-level-workflow";
import type {
  DomainEdge,
  DomainNode,
  HighLevelWorkflow,
  NodeLayout,
  WorkflowFile,
} from "@/types/workflow";

/**
 * A deliberately small L2 scaffold for the JF lifecycle. It uses only the
 * node types that the current builder can render reliably: Project Start,
 * Opportunity Validation, General Node, Decision Module, and Project Complete.
 * Detailed execution requirements remain in L3 and can be added later.
 */
export const DETAILED_LIFECYCLE_IDS = [
  "project-start",
  "opportunity-intake",
] as const;

type DetailedLifecycle = Pick<WorkflowFile, "graph" | "layout"> & {
  highLevel: HighLevelWorkflow;
};

const colors = {
  start: "#2563a9",
  opportunity: "#1f5fa7",
  preConstruction: "#7657b5",
  readiness: "#397d91",
  factory: "#9a5c24",
  delivery: "#177a77",
  warranty: "#52734d",
  gate: "#2563a9",
  hold: "#d97706",
  noGo: "#b34a47",
  close: "#5d8f36",
};

function edge(
  id: string,
  source: string,
  target: string,
  options: Partial<Pick<DomainEdge, "type" | "label" | "sourceHandle" | "targetHandle">> = {},
): DomainEdge {
  return {
    id,
    source,
    target,
    type: options.type || "normal",
    sourceHandle: options.sourceHandle || "out",
    targetHandle: options.targetHandle || "in",
    label: options.label,
    lineStyle: options.type === "rework" || options.type === "hold" ? "dashed" : "solid",
    arrowStyle: "closed",
    customFields: { workflowSection: "Lifecycle Scaffold" },
  };
}

function gateNode(
  id: string,
  title: string,
  description: string,
  rules: string[],
): DomainNode {
  const node = createDomainNode("gate", id);
  return {
    ...node,
    title,
    description,
    color: colors.gate,
    metadata: { workflowSection: "Lifecycle Scaffold" },
    config: {
      ...node.config,
      stage: "Primary Gate",
      gateLabel: title.split("—")[0].trim(),
      decisionMode: "approval",
      gateRules: rules.map((label, index) => ({
        id: `${id}-rule-${index + 1}`,
        label,
        checked: false,
        requirementType: "Required",
        signatures: [],
      })),
      outcomes: [
        { id: "yes", label: "APPROVED", edgeType: "success", color: "#16866f", enabled: true },
        { id: "no", label: "RETURN / HOLD", edgeType: "failure", color: "#b34a47", enabled: true },
      ],
    },
  };
}

function generalNode(
  id: string,
  title: string,
  description: string,
  color: string,
  conditions: string[],
): DomainNode {
  const node = createDomainNode("general", id);
  return {
    ...node,
    title,
    description,
    color,
    metadata: { workflowSection: "Lifecycle Scaffold" },
    conditions: conditions.map((label, index) => ({
      id: `${id}-condition-${index + 1}`,
      label,
      required: true,
      checked: false,
    })),
    config: { ...node.config, stage: "Lifecycle Phase", iconKey: "activity" },
  };
}

function createScaffoldNodes() {
  const projectStart = createDomainNode("projectStart", "project-start");
  projectStart.title = "Project Start";
  projectStart.description = "Establish the project record and confirm the project identifier.";
  projectStart.metadata = { workflowSection: "Lifecycle Scaffold" };

  const opportunityIntake = createDomainNode("opportunityValidation", "opportunity-intake");
  opportunityIntake.title = "Opportunity Node";
  opportunityIntake.description = "Card contents cleared";
  opportunityIntake.config = {
    ...opportunityIntake.config,
    opportunity: { intake: {} },
  };
  opportunityIntake.metadata = { workflowSection: "Lifecycle Scaffold" };

  return [
    projectStart,
    opportunityIntake,
  ];
}

export function createDefaultDetailedLifecycle(
  highLevel: HighLevelWorkflow = createDefaultHighLevelProcess(),
): DetailedLifecycle {
  const nodes = createScaffoldNodes();
  const edges: DomainEdge[] = [
    edge("lifecycle-start-to-intake", "project-start", "opportunity-intake", { label: "Project ID confirmed" }),
  ];
  const layout: Record<string, NodeLayout> = {};
  const mainIds = DETAILED_LIFECYCLE_IDS;
  let x = 0;
  for (const id of mainIds) {
    const node = nodes.find((item) => item.id === id)!;
    const size = getAdaptiveNodeSize(node);
    layout[id] = { nodeId: id, x, y: 220, width: size.width, height: size.height };
    x += size.width + 160;
  }
  const linkMap: Record<string, string[]> = {
    "high-level-1": ["project-start"],
    "high-level-2": ["opportunity-intake"],
  };
  const linkedHighLevel: HighLevelWorkflow = {
    ...highLevel,
    graph: {
      ...highLevel.graph,
      nodes: highLevel.graph.nodes.map((node) => ({
        ...node,
        linkedLayer2NodeIds: linkMap[node.id] || node.linkedLayer2NodeIds,
      })),
    },
  };
  return {
    graph: { schemaVersion: 1, metadata: { name: "", version: "", status: "Draft", createdAt: "", updatedAt: "", notes: "" }, nodes, edges, rules: [] },
    layout: { nodes: layout, edges: {}, viewport: { x: 0, y: 0, zoom: 0.55 }, snapToGrid: true, gridSize: 16 },
    highLevel: linkedHighLevel,
  };
}

/** Add the canonical lifecycle scaffold to a project without replacing any
 * existing nodes, links, or user-entered values. Used when an older saved file
 * only contains Project Start and Opportunity Validation. */
export function ensureDetailedLifecycleScaffold(file: WorkflowFile): WorkflowFile {
  if (!file.graph.nodes.length) {
    return file;
  }
  const highLevel = file.highLevel || createDefaultHighLevelProcess();
  const scaffold = createDefaultDetailedLifecycle(highLevel);
  const existingProjectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  const idMap = new Map<string, string>();
  if (existingProjectStart) idMap.set("project-start", existingProjectStart.id);

  const isLegacyOpportunityNode = (id: string) =>
    id === "opportunity-validation" ||
    id === "opportunity-hold" ||
    id === "opportunity-no-go" ||
    id === "hold-gap-rework" ||
    id === "no-go-archive";

  // Filter out any legacy cleared opportunity nodes from existing file
  const nodes = file.graph.nodes
    .filter((node) => !isLegacyOpportunityNode(node.id));

  for (const node of scaffold.graph.nodes) {
    if (idMap.has(node.id)) continue;
    const sameTitle = nodes.find((item) => item.title.trim().toLowerCase() === node.title.trim().toLowerCase());
    if (sameTitle) {
      idMap.set(node.id, sameTitle.id);
      continue;
    }
    nodes.push(node);
    idMap.set(node.id, node.id);
  }
  const layouts = { ...file.layout.nodes };
  for (const [id, layout] of Object.entries(scaffold.layout.nodes)) {
    const mappedId = idMap.get(id) || id;
    if (!layouts[mappedId]) layouts[mappedId] = { ...layout, nodeId: mappedId };
  }
  // Remove layouts for cleared legacy opportunity nodes
  for (const key of Object.keys(layouts)) {
    if (isLegacyOpportunityNode(key)) delete layouts[key];
  }

  const existingEdges = file.graph.edges.filter(
    (edge) => !isLegacyOpportunityNode(edge.source) && !isLegacyOpportunityNode(edge.target),
  );
  for (const scaffoldEdge of scaffold.graph.edges) {
    const source = idMap.get(scaffoldEdge.source) || scaffoldEdge.source;
    const target = idMap.get(scaffoldEdge.target) || scaffoldEdge.target;
    if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) continue;
    const exists = existingEdges.some((edge) => edge.source === source && edge.target === target && edge.sourceHandle === scaffoldEdge.sourceHandle);
    if (!exists) existingEdges.push({ ...scaffoldEdge, id: `${scaffoldEdge.id}-${source}-${target}`, source, target });
  }
  const linkedHighLevel: HighLevelWorkflow = {
    ...highLevel,
    graph: {
      ...highLevel.graph,
      nodes: highLevel.graph.nodes.map((node) => ({
        ...node,
        linkedLayer2NodeIds: node.id === "high-level-2"
          ? ["opportunity-intake"]
          : (node.linkedLayer2NodeIds || []).length
            ? (node.linkedLayer2NodeIds || []).filter((id) => !isLegacyOpportunityNode(id))
            : (node.linkedDetailedNodeIds || []).length
              ? (node.linkedDetailedNodeIds || []).filter((id) => !isLegacyOpportunityNode(id))
              : node.id.startsWith("high-level-")
                ? (scaffold.highLevel.graph.nodes.find((item) => item.id === node.id)?.linkedLayer2NodeIds || []).map((id) => idMap.get(id) || id)
                : undefined,
      })),
    },
  };
  return {
    ...file,
    graph: { ...file.graph, nodes, edges: existingEdges },
    layout: { ...file.layout, nodes: layouts },
    highLevel: linkedHighLevel,
  };
}
