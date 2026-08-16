import { getGateLayoutMetrics } from "@/lib/gate-layout";
import { getAdaptiveNodeSize } from "@/lib/node-layout";
import {
  PRE_GATE_SALES_EDGES,
  PRE_GATE_SALES_NODES,
  getPreGateSalesLayouts,
} from "@/lib/pre-gate-sales-flow";
import {
  LEGACY_REFERENCE_NODE_TYPES,
  REFERENCE_NODE_TYPES,
  type DomainNode,
  type GateRule,
  type NodeLayout,
  type WorkflowFile,
  type WorkflowNodeType,
} from "@/types/workflow";

const stageByType: Record<WorkflowNodeType, string> = {
  general: "Stage",
  projectStart: "Project",
  start: "Start",
  end: "End",
  phase: "Phase",
  gate: "Approval",
  activity: "Activity",
  decision: "Decision",
  handoff: "Handoff",
  document: "Information",
  documentGroup: "Information",
  approval: "Approval",
  commercialRule: "Rule",
  continuousControl: "Control",
  exception: "Exception",
  risk: "Risk",
  note: "Note",
  systemRule: "Rule",
  approvalMatrix: "Reference",
  controlBackbone: "Control",
  responsibilityLane: "Responsibility",
  serviceLegend: "Reference",
  jobNumbering: "Reference",
  businessRules: "Rule",
  terminal: "End",
};
const iconByType: Record<WorkflowNodeType, string> = {
  general: "activity",
  projectStart: "building",
  start: "flag",
  end: "check",
  phase: "box",
  gate: "check",
  activity: "activity",
  decision: "check",
  handoff: "person",
  document: "document",
  documentGroup: "document",
  approval: "check",
  commercialRule: "building",
  continuousControl: "settings",
  exception: "flag",
  risk: "flag",
  note: "document",
  systemRule: "settings",
  approvalMatrix: "document",
  controlBackbone: "settings",
  responsibilityLane: "person",
  serviceLegend: "document",
  jobNumbering: "building",
  businessRules: "check",
  terminal: "check",
};
const preservedTypes = new Set<WorkflowNodeType>([
  "projectStart",
  "phase",
  ...REFERENCE_NODE_TYPES,
]);
const removedNodeTypes = new Set<WorkflowNodeType>(LEGACY_REFERENCE_NODE_TYPES);

function migrateProjectStartNode(node: DomainNode): DomainNode {
  const legacyProjectNumber =
    typeof node.customFields.projectNumber === "string"
      ? node.customFields.projectNumber
      : "";
  const rawProjectId =
    typeof node.customFields.projectId === "string"
      ? node.customFields.projectId
      : legacyProjectNumber;
  const projectId = rawProjectId.match(/^[LP]-\d{2}-\d{3}$/)
    ? rawProjectId
    : rawProjectId && /^\d{5}$/.test(rawProjectId)
      ? `L-${rawProjectId.slice(0, 2)}-${rawProjectId.slice(2)}`
      : "";
  const legacyJobNumber = projectId
    ? `${projectId.slice(2, 4)}${projectId.slice(5)}`
    : "";
  const nodeUuid =
    typeof node.customFields.nodeUuid === "string" &&
    node.customFields.nodeUuid.length === 36
      ? node.customFields.nodeUuid
      : crypto.randomUUID();
  const serviceType =
    String((node.config as Record<string, unknown>).serviceType || "") ||
    (Boolean((node.config as Record<string, unknown>).paidServiceType)
      ? "Paid Service"
      : "Standard");
  const buildingCode = String(
    (node.config as Record<string, unknown>).buildingCode || "",
  );
  const moduleCode = String(
    (node.config as Record<string, unknown>).moduleCode || "",
  );
  const { projectNumber: _legacy, ...restCustomFields } = node.customFields;
  void _legacy;
  const config: DomainNode["config"] = {
    ...node.config,
    stage: node.config.stage?.trim() || "Project",
    iconKey: node.config.iconKey || "building",
    serviceType,
    buildingCode,
    moduleCode,
  } as DomainNode["config"];
  const baseConditions = node.conditions?.length
    ? node.conditions
    : [
        {
          id: "project-id-required",
          label: "Project ID is entered",
          required: true,
          checked: false,
          locked: true,
        },
      ];
  const conditions =
    serviceType === "Paid Service"
      ? [
          ...baseConditions.filter(
            (condition) =>
              condition.id !== "paid-building-required" &&
              condition.id !== "paid-module-required",
          ),
          {
            id: "paid-building-required",
            label: "Building code (B-XX)",
            required: true,
            checked: false,
          },
          {
            id: "paid-module-required",
            label: "Module code (M-XXX)",
            required: true,
            checked: false,
          },
        ]
      : baseConditions.filter(
          (condition) =>
            condition.id !== "paid-building-required" &&
            condition.id !== "paid-module-required",
        );
  return {
    ...node,
    customFields: {
      ...restCustomFields,
      projectId,
      legacyJobNumber,
      nodeUuid,
    },
    config,
    conditions,
  };
}

function migrateGateNode(node: DomainNode): DomainNode {
  const normalizedConfig = { ...node.config };
  delete normalizedConfig.gateNumber;
  delete normalizedConfig.showGateNumber;
  const decisionMode =
    node.config.decisionMode ||
    (node.config.gateLabel &&
    node.config.gateLabel.trim().toUpperCase() !== "GATE"
      ? "binary"
      : "approval");
  const customDecisionGate = decisionMode === "binary";
  const priorRules = (node.config.outcomes || [])
    .filter((outcome) => outcome.id === "yes" && outcome.rule)
    .map((outcome, index) => ({
      id: `rule-migrated-${index + 1}`,
      label: outcome.rule!,
      checked: false,
    }));
  const baseRules: GateRule[] = node.config.gateRules?.length
    ? node.config.gateRules
    : priorRules.length
      ? priorRules
      : [{ id: "rule-1", label: "Enter required condition", checked: false }];
  const legacySignatures = Array.isArray(node.config.signatureRequirements)
    ? node.config.signatureRequirements
    : [];
  const hasNestedSignatures = baseRules.some((rule) =>
    Array.isArray(rule.signatures),
  );
  const gateRules = baseRules.map((rule, index) => {
    const signatures = (
      Array.isArray(rule.signatures)
        ? rule.signatures
        : index === 0 && !hasNestedSignatures
          ? legacySignatures
          : []
    ).map((signature) => {
      const revisions = signature.revisions?.length
        ? signature.revisions.map((revision) => {
            const legacy = revision as unknown as { receivedBy?: string };
            return {
              id: revision.id,
              revision: revision.revision,
              receivedDate: revision.receivedDate,
              department: revision.department || signature.department || "",
              modifiedBy:
                revision.modifiedBy ||
                legacy.receivedBy ||
                signature.signedBy ||
                "",
              status: revision.status,
            };
          })
        : signature.revision || signature.receivedDate
          ? [
              {
                id: `revision-migrated-${signature.id}`,
                revision: signature.revision || "",
                receivedDate: signature.receivedDate || "",
                department: signature.department || "",
                modifiedBy: signature.signedBy || "",
                status: "Current" as const,
              },
            ]
          : [];
      const currentRevision = revisions.find(
        (revision) => revision.status === "Current",
      );
      const revisionReady =
        !signature.revisionControlled ||
        Boolean(
          currentRevision?.revision.trim() &&
          currentRevision.receivedDate &&
          currentRevision.department.trim() &&
          currentRevision.modifiedBy.trim(),
        );
      return {
        ...signature,
        revisions,
        checked: Boolean(signature.checked && revisionReady),
        requirementType: signature.requirementType || "Required",
      };
    });
    const requiredDocumentsReady = signatures
      .filter((signature) => signature.requirementType !== "Optional")
      .every(
        (signature) =>
          signature.checked &&
          Boolean(
            signature.abbreviation.trim() &&
            signature.fullName.trim() &&
            signature.department.trim() &&
            signature.signedBy.trim(),
          ),
      );
    return {
      ...rule,
      checked: Boolean(
        rule.checked &&
          requiredDocumentsReady &&
          !(index === 0 && legacySignatures.length > 0 && !hasNestedSignatures),
      ),
      requirementType: rule.requirementType || "Required",
      signatureLogic: undefined,
      signatures,
    };
  });
  const outcomes = [
    {
      id: "yes",
      label: customDecisionGate ? "YES" : "APPROVED",
      edgeType: "success" as const,
      color: "#16866f",
      enabled: true,
    },
    {
      id: "no",
      label: customDecisionGate ? "NO" : "DENIED",
      edgeType: "failure" as const,
      color: "#b34a47",
      enabled: true,
      rule: "CONDITIONS NOT MET",
    },
  ];
  return {
    ...node,
    title:
      !node.title || node.title === "Approval" ? "Gate review" : node.title,
    description: node.description || "Review the work item before approval",
    config: {
      ...normalizedConfig,
      gateHeaderColor:
        node.config.gateHeaderColor ||
        (customDecisionGate ? node.color || "#2563a9" : "#0d233b"),
      gateTitleColor: node.config.gateTitleColor || "#ffffff",
      gateIconKey: node.config.gateIconKey || "building",
      conditionsTitle: node.config.conditionsTitle || "Approval conditions",
      conditionsSubtitle:
        node.config.conditionsSubtitle || "requirements complete",
      checklistTitle: node.config.checklistTitle || "Conditions checklist",
      checklistHint:
        node.config.checklistHint ||
        "Every applicable required document must be complete",
      conditionLabel: node.config.conditionLabel || "Condition",
      addConditionLabel: node.config.addConditionLabel || "Add condition",
      documentsLabel:
        node.config.documentsLabel || "All applicable required documents",
      addDocumentLabel: node.config.addDocumentLabel || "Add document",
      decisionTitle: node.config.decisionTitle || "Decision",
      decisionSubtitle: node.config.decisionSubtitle || "Approval routing",
      departmentLabel: node.config.departmentLabel || "Department",
      approverLabel: node.config.approverLabel || "Approved by",
      detailsNeededLabel:
        node.config.detailsNeededLabel || "Details needed",
      decisionMode,
      outcomes,
      gateRules,
      signatureRequirements: undefined,
      approvedDepartment:
        typeof node.config.approvedDepartment === "string"
          ? node.config.approvedDepartment
          : "",
      approvedBy:
        typeof node.config.approvedBy === "string"
          ? node.config.approvedBy
          : "",
    },
  };
}

const SERVICE_LEGEND_DESCRIPTIONS: Record<string, string> = {
  paid: "Additional paid work outside the included contract scope.",
  included:
    "Work already included in the approved agreement or paid service scope.",
  free: "Strategic or approved work provided without a client charge.",
  tbd: "Classification must be confirmed after scope and responsibility are clarified.",
};

function migrateServiceLegendNode(node: DomainNode): DomainNode {
  const reference = node.config.reference || {};
  return {
    ...node,
    config: {
      ...node.config,
      reference: {
        ...reference,
        items: (reference.items || []).map((item) => ({
          ...item,
          description:
            item.description ||
            SERVICE_LEGEND_DESCRIPTIONS[item.id] ||
            `Use this color when the condition is classified as ${item.label}.`,
        })),
      },
    },
  };
}

function migrateNode(node: DomainNode): DomainNode {
  if (node.type === "projectStart") return migrateProjectStartNode(node);
  if (node.type === "gate") return migrateGateNode(node);
  if (node.type === "serviceLegend") return migrateServiceLegendNode(node);
  if (preservedTypes.has(node.type))
    return { ...node, config: { ...node.config } };
  return {
    ...node,
    type: "general",
    config: {
      ...node.config,
      stage: node.config.stage?.trim() || stageByType[node.type],
      iconKey: node.config.iconKey || iconByType[node.type],
      outcomes: undefined,
    },
  };
}

export function migrateWorkflowFile(input: WorkflowFile): WorkflowFile {
  const file: WorkflowFile = JSON.parse(JSON.stringify(input));
  let originalNodes = file.layout.nodes;
  const absolute = (
    id: string,
    seen = new Set<string>(),
  ): { x: number; y: number } => {
    const layout = originalNodes[id];
    if (!layout || !layout.parentId || seen.has(id))
      return { x: layout?.x || 0, y: layout?.y || 0 };
    seen.add(id);
    const parent = absolute(layout.parentId, seen);
    return { x: parent.x + layout.x, y: parent.y + layout.y };
  };
  const isLegacyGateWorkflow = file.graph.nodes.some(
    (node) => node.id === "g1-opportunity",
  );
  if (
    isLegacyGateWorkflow &&
    !file.graph.nodes.some((node) => node.id === "lead-inquiry")
  ) {
    const gateOne = absolute("g1-opportunity");
    const injectedLayouts = getPreGateSalesLayouts(gateOne.x - 3150, gateOne.y);
    file.graph.nodes.push(...PRE_GATE_SALES_NODES);
    const existingEdgeIds = new Set(file.graph.edges.map((edge) => edge.id));
    file.graph.edges.push(
      ...PRE_GATE_SALES_EDGES.filter((edge) => !existingEdgeIds.has(edge.id)),
    );
    originalNodes = { ...originalNodes, ...injectedLayouts };
    file.layout.nodes = originalNodes;
  }
  const canonicalPreGateNodes = new Map(
    PRE_GATE_SALES_NODES.map((node) => [node.id, node]),
  );
  file.graph.nodes = file.graph.nodes.map((node) => {
    if (!["qualified-opportunity", "budget-fit"].includes(node.id)) return node;
    const canonical = canonicalPreGateNodes.get(node.id)!;
    return {
      ...canonical,
      title: node.title || canonical.title,
      description: node.description || canonical.description,
      metadata: { ...canonical.metadata, ...node.metadata },
    };
  });
  const canonicalPreGateEdges = new Map(
    PRE_GATE_SALES_EDGES.map((edge) => [edge.id, edge]),
  );
  file.graph.edges = file.graph.edges.map((edge) => {
    const canonical = canonicalPreGateEdges.get(edge.id);
    return canonical ? { ...edge, ...canonical } : edge;
  });
  let nodes = file.graph.nodes
    .filter((node) => !removedNodeTypes.has(node.type))
    .map(migrateNode)
    .map((node) => {
      const conditions = [...(node.conditions || [])];
      if (node.type === "projectStart" && !conditions.some((item) => item.id === "project-id-required")) {
        conditions.unshift({ id: "project-id-required", label: "Project ID is entered", required: true, checked: false, locked: true });
      }
      return {
        ...node,
        conditions,
      };
    });
  if (!nodes.some((node) => node.type === "projectStart")) {
    nodes = [
      {
        id: "project-start",
        type: "projectStart",
        title: "Project Start",
        description: "Enter the required Project ID before the workflow can continue.",
        color: "#2563a9",
        metadata: {},
        conditions: [{ id: "project-id-required", label: "Project ID is entered", required: true, checked: false, locked: true }],
        documents: [],
        criteria: [],
        customFields: { projectId: "", legacyJobNumber: "", nodeUuid: crypto.randomUUID() },
        config: { stage: "Project", iconKey: "building", serviceType: "Standard", buildingCode: "", moduleCode: "" },
      },
      ...nodes,
    ];
    const topLevelLayouts = Object.values(originalNodes).filter((layout) => !layout.parentId);
    const leftMost = topLevelLayouts.length
      ? Math.min(...topLevelLayouts.map((layout) => layout.x))
      : 220;
    const topMost = topLevelLayouts.length
      ? Math.min(...topLevelLayouts.map((layout) => layout.y))
      : 180;
    originalNodes = {
      ...originalNodes,
      "project-start": { nodeId: "project-start", x: leftMost - 440, y: topMost, width: 320, height: 384 },
    };
    file.layout.nodes = originalNodes;
    const incomingTargets = new Set(file.graph.edges.map((edge) => edge.target));
    const firstNode = nodes.find((node) => node.id !== "project-start" && !incomingTargets.has(node.id) && node.type !== "phase");
    if (firstNode) {
      file.graph.edges.unshift({ id: "project-start-to-first", source: "project-start", target: firstNode.id, sourceHandle: "out", targetHandle: "in", type: "normal", label: "Project ID confirmed", lineStyle: "solid", arrowStyle: "closed", customFields: {} });
    }
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const layouts: Record<string, NodeLayout> = {};
  for (const node of nodes) {
    const current = originalNodes[node.id] || {
      nodeId: node.id,
      x: 0,
      y: 0,
      width: 270,
      height: 168,
    };
    const parentId =
      current.parentId && nodeById.get(current.parentId)?.type === "phase"
        ? current.parentId
        : undefined;
    const position = parentId
      ? { x: current.x, y: current.y }
      : absolute(node.id);
    const size =
      node.type === "gate"
        ? getGateLayoutMetrics(node)
        : getAdaptiveNodeSize(node, current);
    layouts[node.id] = {
      nodeId: node.id,
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      parentId,
      zIndex: parentId ? 1 : current.zIndex,
    };
  }
  const edges = file.graph.edges
    .filter(
      (edge) =>
        nodeById.has(edge.source) &&
        nodeById.has(edge.target),
    )
    .map((edge) => {
      const source = nodeById.get(edge.source)!;
      const sourceHandle =
        source.type === "gate"
          ? edge.sourceHandle === "hold" ||
            edge.sourceHandle?.startsWith("no") ||
            ["failure", "rework", "exception", "hold"].includes(edge.type)
            ? "no"
            : "yes"
          : "out";
      const targetHandle =
        nodeById.get(edge.target)?.type === "gate" &&
        (edge.type === "rework" || sourceHandle?.startsWith("no"))
          ? "rework-in"
          : edge.targetHandle || "in";
      const outcome = source.config.outcomes?.find(
        (item) => item.id === sourceHandle,
      );
      return {
        ...edge,
        sourceHandle,
        targetHandle,
        label:
          source.type === "gate"
            ? source.config.gateLabel
              ? outcome?.label || edge.label
              : sourceHandle === "no"
                ? `Denied · Return to ${nodeById.get(edge.target)?.title || "previous Gate"}`
                : edge.label || outcome?.label || "Approved"
            : edge.label,
      };
    });
  return {
    ...file,
    graph: { ...file.graph, nodes, edges },
    layout: { ...file.layout, nodes: layouts, edges: undefined },
  };
}
