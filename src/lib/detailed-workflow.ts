import { createDomainNode } from "@/lib/create-domain-node";
import { createExecutionItem } from "@/lib/execution";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import {
  createDefaultHighLevelProcess,
  isLegacyDefaultHighLevelFamily,
} from "@/lib/high-level-workflow";
import { PROFAB_FORMS } from "@/lib/profab-forms";
import type {
  DomainEdge,
  DomainNode,
  ExecutionItem,
  ExecutionLayer,
  HighLevelWorkflow,
  NodeLayout,
  WorkflowFile,
} from "@/types/workflow";

/**
 * The canonical L2 lifecycle derived from JF's operating model. L2 keeps the
 * primary sequence and gate milestones visible; form-level evidence belongs
 * to the linked L3 execution items below each phase or Gate.
 */
export const DETAILED_LIFECYCLE_IDS = [
  "project-start",
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
  "close-out",
] as const;

/**
 * Canonical L1 ownership for every L2 lifecycle card. Keeping this as one
 * explicit map prevents the overview from silently dropping L2 cards that are
 * not part of the primary row.
 */
export const DEFAULT_HIGH_LEVEL_L2_LINKS: Record<string, string[]> = {
  "high-level-1": ["project-start"],
  "high-level-2": [],
  "high-level-3": ["gate-g1-qualified"],
  "high-level-4": ["pre-construction", "gate-g2-technical-commitment"],
  "high-level-5": [
    "production-readiness",
    "gate-g3-production-authorization",
  ],
  "high-level-6": ["factory-production", "gate-g4-factory-release"],
  "high-level-7": [
    "delivery-project-completion",
    "gate-g5-warranty-start",
  ],
  "high-level-8": ["commissioning-warranty"],
  "high-level-9": ["close-out"],
};

const LEGACY_DECISION_GATE_IDS = new Set([
  "gate-g2-technical-commitment",
  "gate-g3-production-authorization",
  "gate-g4-factory-release",
  "gate-g5-warranty-start",
]);

const REMOVED_DUPLICATE_NODE_IDS = new Set<string>();
const REMOVED_EXPLANATORY_NODE_IDS = new Set(["control-backbone", "business-rules"]);

const REMOVED_MATRIX_NODE_IDS = new Set([
  "approval-matrix",
  "responsibility-lane",
]);

function isRemovedMatrixNodeId(id: string) {
  return (
    REMOVED_MATRIX_NODE_IDS.has(id) ||
    id.startsWith("approvalMatrix-") ||
    id.startsWith("responsibilityLane-") ||
    id.startsWith("approval-matrix-") ||
    id.startsWith("responsibility-lane-")
  );
}

/** Identifies the two retired matrix nodes in current and legacy files. */
export function isRemovedMatrixNode(node: DomainNode) {
  const title = node.title.trim().toLowerCase();
  return (
    isRemovedMatrixNodeId(node.id) ||
    node.type === "approvalMatrix" ||
    node.type === "responsibilityLane" ||
    title === "approval matrix" ||
    title === "approval matrix — forms & actions" ||
    title === "rm — responsibility matrix" ||
    title === "pm — responsibility matrix" ||
    title === "responsibility matrix"
  );
}

export function isRemovedExplanatoryNode(node: DomainNode) {
  const title = node.title.trim().toLowerCase();
  return (
    REMOVED_EXPLANATORY_NODE_IDS.has(node.id) ||
    node.type === "controlBackbone" ||
    node.type === "businessRules" ||
    title.includes("jf business rules") ||
    title.includes("control backbone")
  );
}

const COMMERCIAL_PATHWAY_ID = "commercial-pathway";

function isCommercialPathwayId(id: string) {
  return id === COMMERCIAL_PATHWAY_ID || id.startsWith(`${COMMERCIAL_PATHWAY_ID}-`);
}

/** Identifies a legacy standalone Commercial Pathway node. */
export function isCommercialPathwayNode(node: DomainNode) {
  const title = node.title.trim().toLowerCase();
  const config = node.config as Record<string, unknown>;
  return (
    isCommercialPathwayId(node.id) ||
    config.commercialPathway === true ||
    title === "commercial pathway" ||
    node.metadata.opportunityModuleRole === "commercial-path"
  );
}

const RETIRED_OPPORTUNITY_NODE_IDS = new Set([
  "opportunity-intake",
  "opportunity-validation",
  "opportunity-hold",
  "opportunity-no-go",
  "hold-gap-rework",
  "no-go-archive",
]);

function isRetiredOpportunityId(id: string) {
  return (
    RETIRED_OPPORTUNITY_NODE_IDS.has(id) ||
    id.startsWith("opportunityValidation-") ||
    id.startsWith("opportunity-section-") ||
    id.startsWith("opportunity-")
  );
}

/** Identifies the fully retired Opportunity Qualification module in saved files. */
export function isRemovedOpportunityNode(node: DomainNode) {
  const title = node.title.trim().toLowerCase();
  const workflowSection = String(node.metadata.workflowSection || "").toLowerCase();
  const config = node.config as Record<string, unknown>;
  return (
    isRetiredOpportunityId(node.id) ||
    String(node.type) === "opportunityValidation" ||
    (title.includes("opportunity") && title.includes("qualification")) ||
    workflowSection.includes("opportunity validation") ||
    workflowSection.includes("opportunity qualification") ||
    config.opportunity !== undefined ||
    config.opportunityRole !== undefined ||
    config.opportunitySection !== undefined
  );
}

type DetailedLifecycle = Pick<WorkflowFile, "graph" | "layout"> & {
  highLevel: HighLevelWorkflow;
  execution: ExecutionLayer;
};

const colors = {
  start: "#2563a9",
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
    lineStyle: options.type === "rework" || options.type === "hold"
      ? "dashed"
      : options.type === "supporting"
        ? "dotted"
        : "solid",
    arrowStyle: "closed",
    customFields: { workflowSection: "Lifecycle Scaffold" },
  };
}

function gatePhaseNode(
  id: string,
  title: string,
  description: string,
  rules: string[],
): DomainNode {
  const node = generalNode(id, title, description, colors.gate, rules);
  return {
    ...node,
    config: {
      ...node.config,
      stage: "Primary Gate",
      iconKey: "flag",
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

  const gate1 = gatePhaseNode(
    "gate-g1-qualified",
    "G1 — QUALIFIED & COMMERCIALLY ENGAGED",
    "Release only an eligible opportunity with a bounded route, executed commercial engagement, and authorized Gate decision.",
    [
      "Required Gate 1 evidence is complete and contains no active hard stop",
      "An eligible bounded commercial route is assigned and engagement is executed",
      "Authorized Gate 1 decision is recorded",
    ],
  );
  gate1.conditions[0].linkedExecutionItemId = "exec-gate1-evidence";
  gate1.conditions[1].linkedExecutionItemId = "exec-gate1-engagement";
  gate1.conditions[2].linkedExecutionItemId = "exec-g1-approval";

  const preConstruction = generalNode(
    "pre-construction",
    "PRE-CONSTRUCTION",
    "Develop design, technical, site, cost, and scope definition according to client maturity; converge the applicable Class C basis.",
    colors.preConstruction,
    [
      "Design basis or CSA/PCS consultation scope is recorded",
      "Site, foundation, servicing, transport, and logistics constraints are reviewed",
      "CEC Class D assumptions and Class C entry basis are documented",
      "SOW/RM boundaries and open RFIs have an owner",
    ],
  );

  const productionReadiness = generalNode(
    "production-readiness",
    "PRODUCTION READINESS",
    "Freeze production inputs, procurement planning, capacity, and the release package.",
    colors.readiness,
    [
      "Production package and design inputs are complete",
      "PSO basis, procurement plan, and factory capacity are confirmed",
      "Open technical risks have an owner and disposition",
      "MPS draft and client schedule interfaces are aligned",
    ],
  );

  const factoryProduction = generalNode(
    "factory-production",
    "FACTORY PRODUCTION",
    "Manufacture modules with controlled quality, inspection, and issue resolution.",
    colors.factory,
    [
      "MPS progress is tracked",
      "MQC and MIR records are current",
      "Non-conformances and punch items are controlled",
    ],
  );

  const delivery = generalNode(
    "delivery-project-completion",
    "DELIVERY / PROJECT COMPLETION",
    "Coordinate transport, delivery, crane/set, installation, site interfaces, and deficiency resolution.",
    colors.delivery,
    [
      "SSP and site access prerequisites are confirmed",
      "Modules are delivered and received in acceptable condition",
      "MAI/MIC/MSI, envelope, utility, and site interface checks are complete",
      "Deficiencies and incidents have a controlled disposition",
    ],
  );

  const commissioning = generalNode(
    "commissioning-warranty",
    "COMMISSIONING & WARRANTY",
    "Complete commissioning, manuals, inspection records, handover, warranty service, and final obligations.",
    colors.warranty,
    [
      "Commissioning and handover evidence is complete",
      "WMA/warranty owner and start date are recorded",
      "Warranty issues and closeout obligations are tracked to closure",
    ],
  );

  const closeOut = generalNode(
    "close-out",
    "Project Close-out",
    "Close the project after warranty completion and all outstanding obligations are resolved.",
    colors.close,
    [
      "Final documentation, as-builts, and client satisfaction evidence are issued",
      "Outstanding commercial, claims, NOC/RNOC, and warranty obligations are closed",
    ],
  );

  const nodes = [
    projectStart,
    gate1,
    preConstruction,
    gatePhaseNode("gate-g2-technical-commitment", "G2 — PROJECT / TECHNICAL COMMITMENT", "Authorize the project and technical basis for production readiness.", [
      "Project scope and technical basis accepted",
      "Site, transport, foundation, and interface responsibilities reviewed",
      "Client commitment and commercial terms confirmed",
    ]),
    productionReadiness,
    gatePhaseNode("gate-g3-production-authorization", "G3 — PRODUCTION AUTHORIZATION", "Release the approved package to factory production.", [
      "Production package approved",
      "Material, capacity, and commercial release confirmed",
      "Required technical approvals recorded",
    ]),
    factoryProduction,
    gatePhaseNode("gate-g4-factory-release", "G4 — FACTORY COMPLETION / RELEASE", "Release completed factory work to delivery.", [
      "Factory completion and QA records accepted",
      "Punch list and non-conformances dispositioned",
      "Delivery readiness and transport plan confirmed",
    ]),
    delivery,
    gatePhaseNode("gate-g5-warranty-start", "G5 — PROJECT COMPLETION / WARRANTY START", "Accept project completion and start the warranty period.", [
      "Project completion accepted",
      "Outstanding deficiencies have a controlled disposition",
      "Warranty start date and responsibilities recorded",
    ]),
    commissioning,
    closeOut,
  ];
  const linkedConditions: Record<string, string[]> = {
    "pre-construction": ["exec-precon-pdaf", "exec-precon-sdr", "exec-precon-cec", "exec-precon-sow"],
    "gate-g2-technical-commitment": ["exec-precon-cec", "exec-precon-sow", "exec-precon-rm"],
    "production-readiness": ["exec-production-pso", "exec-production-mps", "exec-precon-ser", "exec-production-mps"],
    "gate-g3-production-authorization": ["exec-production-pso", "exec-production-mps", "exec-g3-approval"],
    "factory-production": ["exec-production-mps", "exec-factory-mqc", "exec-factory-mir"],
    "gate-g4-factory-release": ["exec-factory-mso", "exec-factory-mqc", "exec-factory-trr"],
    "delivery-project-completion": ["exec-delivery-ssp", "exec-delivery-mdr", "exec-delivery-msi", "exec-delivery-dplr"],
    "gate-g5-warranty-start": ["exec-commissioning-fir", "exec-delivery-dplr", "exec-commissioning-wma"],
    "commissioning-warranty": ["exec-commissioning-fir", "exec-commissioning-wma", "exec-commissioning-pcr"],
    "close-out": ["exec-commissioning-abdp", "exec-commissioning-pcr"],
  };
  for (const node of nodes) {
    const itemIds = linkedConditions[node.id] || [];
    node.conditions = node.conditions.map((condition, index) => ({
      ...condition,
      linkedExecutionItemId:
        itemIds[index] || condition.linkedExecutionItemId,
    }));
  }
  return nodes;
}


function createControlledExecution(idMap?: Map<string, string>): ExecutionLayer {
  const linked = (id: string) => idMap?.get(id) || id;
  const formItems = PROFAB_FORMS.map((form) => {
    const created = createExecutionItem(
      form.executionId,
      linked(form.linkedLayer2NodeId),
      form.type,
    );
    const determination: ExecutionItem["applicabilityDetermination"] =
      form.defaultApplicability === "Required"
        ? "Applicable"
        : form.defaultApplicability === "Conditional" ||
            form.defaultApplicability === "Triggered"
          ? "Pending"
          : form.defaultApplicability === "Not Applicable"
            ? "Not Applicable"
            : "Applicable";
    return {
      ...created,
      catalogId: form.id,
      documentNumber: form.index,
      documentCode: form.code,
      documentRevision: form.sourceVersion || "Register-derived controlled draft",
      documentLanguage: "Bilingual" as const,
      sourceReference:
        form.sourceAvailability === "Included" ||
        form.sourceAvailability === "Supplemental"
          ? `Combined Forms.pdf · pages ${form.sourcePages}`
          : "Combined Forms.pdf · controlled index only",
      sourceAvailability: form.sourceAvailability,
      title: `${form.code === "—" ? form.index : form.code} / ${form.title}`,
      description: form.description,
      required: form.defaultApplicability === "Required",
      applicability: form.defaultApplicability,
      applicabilityDetermination: determination,
      signatureRequired: Boolean(form.signatureRequired),
      signatureStatus: form.signatureRequired ? "Pending" as const : "Not Required" as const,
      approvalRequired: Boolean(form.approvalRequired),
      approvalStatus: form.approvalRequired ? "Pending" as const : created.approvalStatus,
      responsibleRole: form.responsibleRole,
      formValues: {},
    };
  });
  const control = (
    id: string,
    nodeId: string,
    title: string,
    type: "Approval" | "Evidence" | "Task",
    description: string,
    responsibleRole: string,
  ) => {
    const created = createExecutionItem(id, linked(nodeId), type);
    return {
      ...created,
      catalogId: `control-${id}`,
      title,
      description,
      responsibleRole,
      approvalRequired: type === "Approval",
      approvalStatus: type === "Approval" ? "Pending" as const : created.approvalStatus,
      applicability: "Required" as const,
      applicabilityDetermination: "Applicable" as const,
    };
  };
  return {
    items: [
      ...formItems,
      control("exec-gate1-evidence", "gate-g1-qualified", "Gate 1 required evidence", "Evidence", "Confirm the required Gate 1 evidence is complete before release.", "Sales / Technical"),
      control("exec-gate1-engagement", "gate-g1-qualified", "Gate 1 commercial engagement confirmation", "Evidence", "Confirm the selected bounded commercial instrument is executed and matches the eligible route.", "Sales / Management"),
      control("exec-g1-approval", "gate-g1-qualified", "G1 qualified & commercially engaged approval", "Approval", "Authorized release of an objectively eligible and commercially engaged opportunity into pre-construction.", "Management"),
      control("exec-g2-approval", "gate-g2-technical-commitment", "G2 project / technical commitment approval", "Approval", "Accept the Class C basis, scope, responsibilities, site interfaces, technical path, and commercial commitment.", "Technical / Management"),
      control("exec-g3-approval", "gate-g3-production-authorization", "G3 production authorization", "Approval", "Release the approved production package, materials, capacity, and technical approvals.", "Management / Factory"),
      control("exec-g4-approval", "gate-g4-factory-release", "G4 factory completion / release approval", "Approval", "Accept factory completion, QA evidence, punch/NCR disposition, and transport readiness. Factory completion alone is not shipment release.", "Factory / Technical"),
      control("exec-g5-approval", "gate-g5-warranty-start", "G5 project completion / warranty start approval", "Approval", "Accept project completion, controlled deficiencies, warranty scope, start date, and responsibilities.", "Client / Project Management"),
      control("exec-close-final", "close-out", "Final close commercial and obligation reconciliation", "Task", "Close claims, credits, changes, notices, unresolved obligations, warranty actions, and final acceptance evidence.", "Project Management / Finance"),
    ],
  };
}

export function createDefaultDetailedLifecycle(
  highLevel: HighLevelWorkflow = createDefaultHighLevelProcess(),
): DetailedLifecycle {
  const defaultHighLevel = createDefaultHighLevelProcess();
  const isLegacyDefault = isLegacyDefaultHighLevelFamily(highLevel);
  const normalizedHighLevel =
    highLevel.graph.nodes.length < 4 || isLegacyDefault
      ? {
          ...defaultHighLevel,
          layout: isLegacyDefault
            ? {
                ...defaultHighLevel.layout,
                viewport: highLevel.layout.viewport,
              }
            : defaultHighLevel.layout,
        }
      : highLevel;
  const nodes = createScaffoldNodes();
  const edges: DomainEdge[] = [
    edge("lifecycle-start-to-g1", "project-start", "gate-g1-qualified", {
      label: "Project record confirmed",
    }),
    edge("lifecycle-g1-to-precon", "gate-g1-qualified", "pre-construction", {
      label: "Qualified & engaged",
    }),
    edge("lifecycle-precon-to-g2", "pre-construction", "gate-g2-technical-commitment", {
      label: "Technical basis ready",
    }),
    edge("lifecycle-g2-to-readiness", "gate-g2-technical-commitment", "production-readiness", {
      label: "Approved",
    }),
    edge("lifecycle-readiness-to-g3", "production-readiness", "gate-g3-production-authorization", {
      label: "Release package ready",
    }),
    edge("lifecycle-g3-to-factory", "gate-g3-production-authorization", "factory-production", {
      label: "Approved",
    }),
    edge("lifecycle-factory-to-g4", "factory-production", "gate-g4-factory-release", {
      label: "Factory complete",
    }),
    edge("lifecycle-g4-to-delivery", "gate-g4-factory-release", "delivery-project-completion", {
      label: "Released",
    }),
    edge("lifecycle-delivery-to-g5", "delivery-project-completion", "gate-g5-warranty-start", {
      label: "Completion evidence",
    }),
    edge("lifecycle-g5-to-commissioning", "gate-g5-warranty-start", "commissioning-warranty", {
      label: "Warranty starts",
    }),
    edge("lifecycle-commissioning-to-close", "commissioning-warranty", "close-out", {
      label: "Closeout ready",
    }),
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
  const linkedHighLevel: HighLevelWorkflow = {
    ...normalizedHighLevel,
    graph: {
      ...normalizedHighLevel.graph,
      nodes: normalizedHighLevel.graph.nodes.map((node) => ({
        ...node,
        linkedLayer2NodeIds:
          DEFAULT_HIGH_LEVEL_L2_LINKS[node.id] || node.linkedLayer2NodeIds,
        linkedDetailedNodeIds:
          DEFAULT_HIGH_LEVEL_L2_LINKS[node.id] || node.linkedDetailedNodeIds,
      })),
    },
  };
  return {
    graph: { schemaVersion: 1, metadata: { name: "", version: "", status: "Draft", createdAt: "", updatedAt: "", notes: "" }, nodes, edges, rules: [] },
    layout: { nodes: layout, edges: {}, viewport: { x: 0, y: 0, zoom: 0.55 }, snapToGrid: true, gridSize: 16 },
    highLevel: linkedHighLevel,
    execution: createControlledExecution(),
  };
}

/** Add the canonical lifecycle scaffold to a project without replacing any
 * existing nodes, links, or user-entered values. Used when an older saved file
 * only contains a partial lifecycle. */
export function ensureDetailedLifecycleScaffold(file: WorkflowFile): WorkflowFile {
  if (!file.graph.nodes.length) {
    return file;
  }
  const existingHighLevel = file.highLevel || createDefaultHighLevelProcess();
  // Older saved workspaces either had only the first two L1 cards or used the
  // original 13-card default. Upgrade those known defaults to the compact JF
  // lifecycle; keep a genuinely customized L1 untouched.
  const defaultHighLevel = createDefaultHighLevelProcess();
  const isDefaultFamily = isLegacyDefaultHighLevelFamily(existingHighLevel);
  const highLevel: HighLevelWorkflow =
    existingHighLevel.graph.nodes.length < 4 || isDefaultFamily
      ? {
          ...defaultHighLevel,
          layout: isDefaultFamily
            ? {
                ...defaultHighLevel.layout,
                viewport: existingHighLevel.layout.viewport,
              }
            : defaultHighLevel.layout,
        }
      : existingHighLevel;
  const scaffold = createDefaultDetailedLifecycle(highLevel);
  const existingProjectStart = file.graph.nodes.find((node) => node.type === "projectStart");
  const idMap = new Map<string, string>();
  if (existingProjectStart) idMap.set("project-start", existingProjectStart.id);
  const retiredNodeIds = new Set(
    file.graph.nodes
      .filter((node) => isRemovedOpportunityNode(node) || isCommercialPathwayNode(node))
      .map((node) => node.id),
  );
  const isRetiredNodeId = (id: string) =>
    retiredNodeIds.has(id) || isRetiredOpportunityId(id) || isCommercialPathwayId(id);

  const removedExplanatoryNodeIds = new Set(
    file.graph.nodes.filter(isRemovedExplanatoryNode).map((node) => node.id),
  );
  const isRemovedExplanatoryId = (id: string) =>
    REMOVED_EXPLANATORY_NODE_IDS.has(id) || removedExplanatoryNodeIds.has(id);
  const removedMatrixNodeIds = new Set(
    file.graph.nodes.filter(isRemovedMatrixNode).map((node) => node.id),
  );
  const isRemovedMatrixId = (id: string) =>
    isRemovedMatrixNodeId(id) || removedMatrixNodeIds.has(id);
  // Filter out any legacy Opportunity/Commercial Pathway nodes, explanatory
  // reference cards, and the retired matrix nodes from the existing file.
  const nodes = file.graph.nodes
    .filter(
      (node) =>
        !isRemovedOpportunityNode(node) &&
        !isCommercialPathwayNode(node) &&
        !REMOVED_DUPLICATE_NODE_IDS.has(node.id) &&
        !isRemovedExplanatoryNode(node) &&
        !isRemovedMatrixNode(node),
    );

  for (const node of scaffold.graph.nodes) {
    if (idMap.has(node.id)) continue;
    const sameId = nodes.find((item) => item.id === node.id);
    if (sameId) {
      if ((DETAILED_LIFECYCLE_IDS as readonly string[]).includes(node.id)) {
        const existingConditions = new Map(
          sameId.conditions.map((condition) => [condition.id, condition]),
        );
        nodes[nodes.indexOf(sameId)] = {
          ...sameId,
          type: node.type,
          title: node.title,
          description: node.description,
          color: node.color,
          metadata: { ...sameId.metadata, ...node.metadata },
          conditions: node.conditions.map((condition) => {
            const existing = existingConditions.get(condition.id);
            return {
              ...condition,
              checked: existing?.checked ?? condition.checked,
              required: condition.required,
              linkedExecutionItemId: condition.linkedExecutionItemId,
            };
          }),
          config: {
            ...node.config,
            ...sameId.config,
            stage: node.config.stage,
            iconKey: node.config.iconKey,
          },
        };
        idMap.set(node.id, sameId.id);
        continue;
      }
      if (LEGACY_DECISION_GATE_IDS.has(node.id) && sameId.type === "gate") {
        nodes[nodes.indexOf(sameId)] = {
          ...node,
          id: sameId.id,
          metadata: { ...sameId.metadata, ...node.metadata },
          customFields: { ...sameId.customFields, ...node.customFields },
        };
      }
      idMap.set(node.id, sameId.id);
      continue;
    }
    const normalizedTitle = node.title.trim().toLowerCase();
    const sameTitle = nodes.find((item) => {
      const title = item.title.trim().toLowerCase();
      if (title === normalizedTitle) return true;
      return node.id === "pre-construction" &&
        (title === "pre-construction assessment" || title === "preconstruction");
    });
    if (sameTitle) {
      const shouldRemoveDecisionModule =
        LEGACY_DECISION_GATE_IDS.has(node.id) && sameTitle.type === "gate";
      const shouldRefreshPhase = node.id === "pre-construction" || node.id === "close-out";
      if (shouldRemoveDecisionModule) {
        nodes[nodes.indexOf(sameTitle)] = {
          ...node,
          id: sameTitle.id,
          metadata: { ...sameTitle.metadata, ...node.metadata },
          customFields: { ...sameTitle.customFields, ...node.customFields },
        };
      } else if (shouldRefreshPhase) {
        const existingConditionLabels = new Set(
          sameTitle.conditions.map((condition) => condition.label?.trim()).filter(Boolean),
        );
        nodes[nodes.indexOf(sameTitle)] = {
          ...sameTitle,
          description: node.description,
          color: node.color || sameTitle.color,
          metadata: { ...sameTitle.metadata, ...node.metadata },
          conditions: [
            ...sameTitle.conditions,
            ...node.conditions.filter((condition) => !existingConditionLabels.has(condition.label?.trim())),
          ],
          config: { ...sameTitle.config, ...node.config },
        };
      }
      idMap.set(node.id, sameTitle.id);
      continue;
    }
    nodes.push(node);
    idMap.set(node.id, node.id);
  }
  const layouts = { ...file.layout.nodes };
  for (const [id, layout] of Object.entries(scaffold.layout.nodes)) {
    const mappedId = idMap.get(id) || id;
    // The lifecycle scaffold owns these canonical positions. Reusing the old
    // ad-hoc coordinates is what caused the expanded process to stack on top
    // of itself.
    layouts[mappedId] = { ...layout, nodeId: mappedId };
  }
  // Remove layouts for all retired Opportunity/Commercial Pathway nodes.
  for (const key of Object.keys(layouts)) {
    if (
      isRetiredNodeId(key) ||
      isRemovedExplanatoryId(key) ||
      isRemovedMatrixId(key)
    ) delete layouts[key];
  }

  const existingEdges = file.graph.edges.filter(
    (edge) =>
      !isRetiredNodeId(edge.source) &&
      !isRetiredNodeId(edge.target) &&
      !REMOVED_DUPLICATE_NODE_IDS.has(edge.source) &&
      !REMOVED_DUPLICATE_NODE_IDS.has(edge.target) &&
      !isRemovedExplanatoryId(edge.source) &&
      !isRemovedExplanatoryId(edge.target) &&
      !isRemovedMatrixId(edge.source) &&
      !isRemovedMatrixId(edge.target),
  ).map((existingEdge) =>
    LEGACY_DECISION_GATE_IDS.has(existingEdge.source) && existingEdge.sourceHandle === "yes"
      ? { ...existingEdge, sourceHandle: "out" }
      : existingEdge,
  );
  for (const scaffoldEdge of scaffold.graph.edges) {
    const source = idMap.get(scaffoldEdge.source) || scaffoldEdge.source;
    const target = idMap.get(scaffoldEdge.target) || scaffoldEdge.target;
    if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) continue;
    const exists = existingEdges.some((edge) => edge.source === source && edge.target === target && edge.sourceHandle === scaffoldEdge.sourceHandle);
    if (!exists) existingEdges.push({ ...scaffoldEdge, id: `${scaffoldEdge.id}-${source}-${target}`, source, target });
  }
  const usesCanonicalHighLevelLinks =
    highLevel.graph.nodes.length === Object.keys(DEFAULT_HIGH_LEVEL_L2_LINKS).length &&
    highLevel.graph.nodes.every((node) => Boolean(DEFAULT_HIGH_LEVEL_L2_LINKS[node.id]));
  const linkedHighLevel: HighLevelWorkflow = {
    ...highLevel,
    graph: {
      ...highLevel.graph,
      nodes: highLevel.graph.nodes.map((node) => {
        const existingLinks = node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [];
        const resolvedExisting = existingLinks
          .map((id) => idMap.get(id) || id)
          .filter(
            (id) =>
              !isRetiredNodeId(id) &&
              !isRemovedMatrixId(id) &&
              !isRemovedExplanatoryId(id),
          );
        const scaffoldLinks = (
          scaffold.highLevel.graph.nodes.find((item) => item.id === node.id)
            ?.linkedLayer2NodeIds ?? []
        )
          .map((id) => idMap.get(id) || id)
          .filter((id) => !isRetiredNodeId(id));
        const nextLinks = usesCanonicalHighLevelLinks
          ? scaffoldLinks
          : resolvedExisting.length
            ? Array.from(new Set(resolvedExisting))
            : [];
        return {
          ...node,
          linkedLayer2NodeIds: nextLinks,
          linkedDetailedNodeIds: nextLinks,
        };
      }),
    },
  };
  const existingItems = (file.execution?.items ?? [])
    .filter(
      (item) =>
        !REMOVED_DUPLICATE_NODE_IDS.has(item.linkedLayer2NodeId) &&
        !isRemovedExplanatoryId(item.linkedLayer2NodeId) &&
        !isRemovedMatrixId(item.linkedLayer2NodeId) &&
        !isRetiredNodeId(item.linkedLayer2NodeId),
    )
    .map((item) => {
      const mappedId = idMap.get(item.linkedLayer2NodeId);
      return mappedId
        ? { ...item, linkedLayer2NodeId: mappedId }
        : item;
    });
  const seeded = createControlledExecution(idMap);
  const executionItems = [...existingItems];
  for (const item of seeded.items) {
    const existingIndex = executionItems.findIndex(
      (entry) =>
        entry.id === item.id ||
        (item.catalogId && entry.catalogId === item.catalogId) ||
        (item.documentNumber && entry.documentNumber === item.documentNumber) ||
        (entry.linkedLayer2NodeId === item.linkedLayer2NodeId &&
          entry.title === item.title),
    );
    if (existingIndex < 0) {
      executionItems.push(item);
      continue;
    }
    const existing = executionItems[existingIndex];
    const wasControlled = Boolean(existing.catalogId);
    executionItems[existingIndex] = {
      ...item,
      ...existing,
      id: existing.id,
      linkedLayer2NodeId: item.linkedLayer2NodeId,
      type: item.type,
      title: item.title,
      description: item.description,
      required: item.required,
      catalogId: item.catalogId,
      documentNumber: item.documentNumber,
      documentCode: item.documentCode,
      documentRevision: existing.documentRevision || item.documentRevision,
      documentLanguage: existing.documentLanguage || item.documentLanguage,
      sourceReference: item.sourceReference,
      sourceAvailability: item.sourceAvailability,
      signatureRequired: item.signatureRequired,
      approvalRequired: item.approvalRequired,
      responsibleRole: existing.responsibleRole || item.responsibleRole,
      applicability: wasControlled
        ? existing.applicability || item.applicability
        : item.applicability,
      applicabilityDetermination: wasControlled
        ? existing.applicabilityDetermination || item.applicabilityDetermination
        : item.applicabilityDetermination,
      formValues: existing.formValues || item.formValues,
    };
  }

  return {
    ...file,
    graph: { ...file.graph, nodes, edges: existingEdges },
    layout: { ...file.layout, nodes: layouts, viewport: scaffold.layout.viewport },
    highLevel: linkedHighLevel,
    execution: { items: executionItems },
  };
}
