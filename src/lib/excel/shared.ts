import { GATE_SERVICE_TYPES, parseGateServiceTypeId } from "@/lib/gate-service-types";
import { asString } from "@/lib/excel-format";
import type {
  DomainNode,
  GateRule,
  RequirementType,
  WorkflowFile,
} from "@/types/workflow";

export function signatureDocumentNames(rules: GateRule[] | undefined) {
  return (rules || []).flatMap((rule) =>
    (rule.signatures || []).map((item) => item.abbreviation).filter(Boolean),
  );
}

export function extraNodeDocuments(
  node: DomainNode,
  rules = node.config.gateRules,
) {
  const names = new Set(signatureDocumentNames(rules));
  return (node.documents || []).filter((name) => Boolean(name) && !names.has(name));
}

export function withSignatureDocuments(
  node: DomainNode,
  rules: GateRule[],
  extras = extraNodeDocuments(node, node.config.gateRules),
): DomainNode {
  return {
    ...node,
    documents: [
      ...signatureDocumentNames(rules),
      ...extras.filter((name) => Boolean(name)),
    ],
    config: { ...node.config, gateRules: rules },
  };
}

export function resolveSheetNode(file: WorkflowFile, nodeId: string) {
  return file.graph.nodes.find((node) => node.id === nodeId);
}

function phaseSheetKey(text: string) {
  const match = text.trim().match(/^phase\s*(\d+)\b/i);
  return match ? `phase-${match[1]}` : text.trim().toLowerCase();
}

export function resolveSheetPhase(
  file: WorkflowFile,
  sheetName: string,
  phaseId: string,
) {
  const byId = file.graph.nodes.find(
    (node) => node.id === phaseId && node.type === "phase",
  );
  if (byId) return byId;
  const sheetKey = phaseSheetKey(sheetName);
  return file.graph.nodes.find((node) => {
    if (node.type !== "phase") return false;
    return (
      node.title.toLowerCase() === sheetName.toLowerCase() ||
      phaseSheetKey(node.title) === sheetKey
    );
  });
}

export function serviceLabel(id?: string) {
  return GATE_SERVICE_TYPES.find((item) => item.id === id)?.label || "";
}

export function parseServiceTypeId(value: unknown) {
  return parseGateServiceTypeId(value);
}

export function parseRequirement(value: unknown, fallback?: RequirementType) {
  const text = asString(value).trim().toLowerCase();
  if (!text) return fallback;
  if (text === "optional" || text === "false") return "Optional" as const;
  if (text === "required" || text === "true") return "Required" as const;
  return fallback;
}

export function usesGateForm(node: DomainNode) {
  return (
    node.type === "gate" ||
    node.type === "decision" ||
    Boolean(node.config.gateRules?.length)
  );
}

export function interfaceText(node: DomainNode) {
  const gate = usesGateForm(node);
  return {
    conditionsTitle:
      node.config.conditionsTitle ||
      (gate ? "Approval conditions" : "Release conditions"),
    documentsLabel:
      node.config.documentsLabel || "All applicable required documents",
    departmentLabel: node.config.departmentLabel || "Department",
    approverLabel: node.config.approverLabel || "Approved by",
    decisionTitle: node.config.decisionTitle || "Decision",
    titleLabel: gate ? "Title" : "Node name",
    descriptionLabel: gate ? "Description" : "Node content",
  };
}

export function updateGraphNode(
  file: WorkflowFile,
  nodeId: string,
  updater: (node: DomainNode) => DomainNode,
): WorkflowFile {
  return {
    ...file,
    graph: {
      ...file.graph,
      nodes: file.graph.nodes.map((node) =>
        node.id === nodeId ? updater(node) : node,
      ),
    },
  };
}
