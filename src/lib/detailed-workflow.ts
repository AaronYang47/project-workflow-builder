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
  "gate-g1-qualified",
  "pre-construction",
  "gate-g2-technical-commitment",
  "production-readiness",
  "gate-g3-production-authorization",
  "factory-production",
  "gate-g4-factory-release",
  "delivery-project-completion",
  "gate-g5-warranty-start",
  "commissioning-warranty",
  "final-close",
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
  opportunityIntake.title = "OPPORTUNITY EVIDENCE INTAKE";
  opportunityIntake.description = "Evidence-first intake: Decision Authority, Project Scale, Site, Design Maturity vs Modular Fit, Budget & Team.";
  opportunityIntake.metadata = { workflowSection: "Lifecycle Scaffold" };

  return [
    projectStart,
    opportunityIntake,
    gateNode("gate-g1-qualified", "G1 — QUALIFIED & COMMERCIALLY ENGAGED", "Authorize managed pre-construction after qualification and commercial engagement.", [
      "Opportunity evidence reviewed and route selected",
      "Commercial engagement instrument authorized",
      "Client decision authority and required parties confirmed",
    ]),
    generalNode("pre-construction", "PRE-CONSTRUCTION", "Develop design, technical, site, cost, and scope definition according to client maturity.", colors.preConstruction, [
      "Design basis or consultation scope recorded",
      "Site and foundation feasibility reviewed",
      "Class D cost and scope assumptions documented",
    ]),
    gateNode("gate-g2-technical-commitment", "G2 — PROJECT / TECHNICAL COMMITMENT", "Authorize the project and technical basis for production readiness.", [
      "Project scope and technical basis accepted",
      "Site, transport, and foundation interfaces reviewed",
      "Client commitment and commercial terms confirmed",
    ]),
    generalNode("production-readiness", "PRODUCTION READINESS", "Freeze production inputs, procurement planning, capacity, and release package.", colors.readiness, [
      "Production package and design inputs complete",
      "Procurement and factory capacity confirmed",
      "Open technical risks have an owner and disposition",
    ]),
    gateNode("gate-g3-production-authorization", "G3 — PRODUCTION AUTHORIZATION", "Release the approved package to factory production.", [
      "Production package approved",
      "Material, capacity, and commercial release confirmed",
      "Required technical approvals recorded",
    ]),
    generalNode("factory-production", "FACTORY PRODUCTION", "Manufacture modules with quality control, inspection, and issue resolution.", colors.factory, [
      "Manufacturing progress is tracked",
      "Quality inspections are current",
      "Non-conformances and punch items are controlled",
    ]),
    gateNode("gate-g4-factory-release", "G4 — FACTORY COMPLETION / RELEASE", "Release completed factory work to delivery.", [
      "Factory completion and QA records accepted",
      "Punch list and non-conformances dispositioned",
      "Delivery readiness and transport plan confirmed",
    ]),
    generalNode("delivery-project-completion", "DELIVERY / PROJECT COMPLETION", "Coordinate delivery, installation, interface work, and deficiency resolution.", colors.delivery, [
      "Modules delivered and installation complete",
      "Site interfaces and deficiencies reviewed",
      "Completion evidence assembled",
    ]),
    gateNode("gate-g5-warranty-start", "G5 — PROJECT COMPLETION / WARRANTY START", "Accept project completion and start the warranty period.", [
      "Project completion accepted",
      "Outstanding deficiencies have a controlled disposition",
      "Warranty start date and responsibilities recorded",
    ]),
    generalNode("commissioning-warranty", "COMMISSIONING & WARRANTY", "Support commissioning, manage warranty issues, and track closeout obligations.", colors.warranty, [
      "Commissioning and handover evidence complete",
      "Warranty issues are tracked to closure",
      "Final obligations and claims are reconciled",
    ]),
    (() => {
      const node = createDomainNode("terminal", "final-close");
      return {
        ...node,
        title: "FINAL CLOSE",
        description: "Close the project after warranty completion and all outstanding obligations are resolved.",
        color: colors.close,
        metadata: { workflowSection: "Lifecycle Scaffold" },
        config: {
          ...node.config,
          reference: {
            sections: [
              { id: "closeout", title: "Closeout checks", items: ["Warranty obligations closed", "Final documents issued", "Commercial and claims reconciliation complete"] },
            ],
          },
        },
      } satisfies DomainNode;
    })(),
  ];
}

export function createDefaultDetailedLifecycle(
  highLevel: HighLevelWorkflow = createDefaultHighLevelProcess(),
): DetailedLifecycle {
  const nodes = createScaffoldNodes();
  const edges: DomainEdge[] = [
    edge("lifecycle-start-to-intake", "project-start", "opportunity-intake", { label: "Project ID confirmed" }),
    edge("lifecycle-intake-to-g1", "opportunity-intake", "gate-g1-qualified", { sourceHandle: "pass-p1-p2", label: "Qualified & Engaged", type: "success" }),
    edge("lifecycle-g1-preconstruction", "gate-g1-qualified", "pre-construction", { sourceHandle: "yes", label: "Approved" }),
    edge("lifecycle-preconstruction-g2", "pre-construction", "gate-g2-technical-commitment", { label: "Technical basis ready" }),
    edge("lifecycle-g2-readiness", "gate-g2-technical-commitment", "production-readiness", { sourceHandle: "yes", label: "Approved" }),
    edge("lifecycle-readiness-g3", "production-readiness", "gate-g3-production-authorization", { label: "Release package ready" }),
    edge("lifecycle-g3-factory", "gate-g3-production-authorization", "factory-production", { sourceHandle: "yes", label: "Approved" }),
    edge("lifecycle-factory-g4", "factory-production", "gate-g4-factory-release", { label: "Factory complete" }),
    edge("lifecycle-g4-delivery", "gate-g4-factory-release", "delivery-project-completion", { sourceHandle: "yes", label: "Released" }),
    edge("lifecycle-delivery-g5", "delivery-project-completion", "gate-g5-warranty-start", { label: "Completion evidence" }),
    edge("lifecycle-g5-warranty", "gate-g5-warranty-start", "commissioning-warranty", { sourceHandle: "yes", label: "Warranty starts" }),
    edge("lifecycle-warranty-close", "commissioning-warranty", "final-close", { label: "Closeout ready" }),
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
    "high-level-3": ["gate-g1-qualified"],
    "high-level-4": ["pre-construction"],
    "high-level-5": ["gate-g2-technical-commitment"],
    "high-level-6": ["production-readiness"],
    "high-level-7": ["gate-g3-production-authorization"],
    "high-level-8": ["factory-production"],
    "high-level-9": ["gate-g4-factory-release"],
    "high-level-10": ["delivery-project-completion"],
    "high-level-11": ["gate-g5-warranty-start"],
    "high-level-12": ["commissioning-warranty"],
    "high-level-13": ["final-close"],
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
