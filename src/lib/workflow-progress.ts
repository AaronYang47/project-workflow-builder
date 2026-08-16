import type {
  DomainEdge,
  DomainNode,
  GateRule,
  GateSignatureRequirement,
  WorkflowNodeType,
} from "@/types/workflow";
import { REFERENCE_NODE_TYPES } from "@/types/workflow";

export type GateCompletionState = "none" | "partial" | "complete";

const applies = (item: { requirementType?: string }) =>
  item.requirementType !== "Optional";
const currentRevisionComplete = (item: GateSignatureRequirement) => {
  if (!item.revisionControlled) return true;
  const current = item.revisions?.find(
    (revision) => revision.status === "Current",
  );
  return Boolean(
    current?.revision.trim() &&
    current.receivedDate &&
    current.department.trim() &&
    current.modifiedBy.trim(),
  );
};
const signatureComplete = (item: GateSignatureRequirement) =>
  item.checked &&
  Boolean(item.abbreviation.trim()) &&
  Boolean(item.fullName.trim()) &&
  Boolean(item.department.trim()) &&
  Boolean(item.signedBy.trim()) &&
  currentRevisionComplete(item);
const ruleComplete = (rule: GateRule) => {
  const documents = (rule.signatures || []).filter(applies);
  const documentsReady =
    !documents.length || documents.every(signatureComplete);
  return rule.checked && documentsReady;
};

export function getGateConditionProgress(node: DomainNode) {
  const rules = (node.config.gateRules || []).filter(applies);
  const signatures = rules.flatMap((rule) =>
    (rule.signatures || []).filter(applies),
  );
  const total = rules.length + signatures.length;
  const completed =
    rules.filter((rule) => rule.checked).length +
    signatures.filter((signature) => signature.checked).length;
  const state: GateCompletionState =
    completed === 0
      ? "none"
      : completed >= total && total > 0
        ? "complete"
        : "partial";
  return { completed, total, state };
}

export function gateChecklistSatisfied(node: DomainNode) {
  const rules = (node.config.gateRules || []).filter(applies);
  return rules.length > 0 && rules.every(ruleComplete);
}

export function gateApprovalReady(node: DomainNode) {
  return (
    gateChecklistSatisfied(node) &&
    Boolean(node.config.approvedDepartment?.trim()) &&
    Boolean(node.config.approvedBy?.trim())
  );
}

export function nodeReleaseReady(node: DomainNode) {
  if (node.type === "gate") return gateApprovalReady(node);
  const projectId = String(
    node.customFields.projectId || node.customFields.projectNumber || "",
  ).trim();
  if (node.type === "projectStart" && !/^[LP]-\d{2}-\d{3}$/.test(projectId))
    return false;
  const required = (node.conditions || []).filter(
    (condition) => condition.required !== false,
  );
  return required.every((condition) => {
    if (condition.id === "project-id-required") {
      return /^[LP]-\d{2}-\d{3}$/.test(projectId);
    }
    if (condition.id === "paid-building-required") {
      return /^B-\d{2}$/.test(
        String((node.config as Record<string, unknown>).buildingCode || ""),
      );
    }
    if (condition.id === "paid-module-required") {
      return /^M-\d{3}$/.test(
        String((node.config as Record<string, unknown>).moduleCode || ""),
      );
    }
    return condition.checked === true;
  });
}

export function getWorkflowProgress(nodes: DomainNode[], edges: DomainEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set(
    edges
      .filter((edge) => !["rework", "reopen", "failure"].includes(edge.type))
      .map((edge) => edge.target),
  );
  const projectStarts = nodes.filter((node) => node.type === "projectStart");
  const explicitStarts = nodes.filter(
    (node) =>
      node.config.stage?.trim().toLowerCase() === "start" &&
      !incoming.has(node.id),
  );
  // A Project Start is the authoritative workflow entry. Stage labels such as
  // "Start" on Lead / Inquiry are descriptive and must not create a bypass.
  const starts =       projectStarts.length
    ? projectStarts
    : explicitStarts.length
      ? explicitStarts
    : nodes
        .filter(
          (node) =>
            !incoming.has(node.id) &&
            node.type !== "phase" &&
            !(REFERENCE_NODE_TYPES as readonly WorkflowNodeType[]).includes(node.type),
        )
        .slice(0, 1);
  const reachedNodeIds = new Set(starts.map((node) => node.id));
  const activeEdgeIds = new Set<string>();
  const queue = starts.map((node) => node.id);
  const outgoing = new Map<string, DomainEdge[]>();
  for (const edge of edges)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);

  while (queue.length) {
    const sourceId = queue.shift()!;
    const source = nodeById.get(sourceId);
    if (!source) continue;
    if (source.type !== "gate" && !nodeReleaseReady(source)) continue;
    for (const edge of outgoing.get(sourceId) || []) {
      const allowed =
        source.type !== "gate" ||
        (edge.sourceHandle === "yes" && gateApprovalReady(source)) ||
        (edge.sourceHandle !== "yes" && !gateChecklistSatisfied(source));
      if (!allowed) continue;
      activeEdgeIds.add(edge.id);
      if (!reachedNodeIds.has(edge.target)) {
        reachedNodeIds.add(edge.target);
        queue.push(edge.target);
      }
    }
  }

  return { reachedNodeIds, activeEdgeIds };
}
