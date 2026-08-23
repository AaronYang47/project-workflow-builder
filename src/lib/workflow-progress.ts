import type {
  Condition,
  DomainEdge,
  DomainNode,
  GateRule,
  GateSignatureRequirement,
  WorkflowNodeType,
} from "@/types/workflow";
import { REFERENCE_NODE_TYPES } from "@/types/workflow";
import {
  BUILDING_PATTERN,
  MODULE_PATTERN,
  PROJECT_ID_PATTERN,
} from "@/lib/project-id";
import { ruleHasPaidService } from "@/lib/gate-service-types";
import { evaluateOpportunity } from "@/lib/opportunity-evaluation";

export type GateCompletionState = "none" | "partial" | "complete";

export const COMPUTED_CONDITION_IDS = new Set([
  "project-id-required",
  "paid-building-required",
  "paid-module-required",
]);

export const requirementApplies = (item: { requirementType?: string }) =>
  item.requirementType !== "Optional";

export const currentRevisionComplete = (item: GateSignatureRequirement) => {
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

export const signatureFieldsComplete = (item: GateSignatureRequirement) =>
  Boolean(
    item.abbreviation.trim() &&
      item.fullName.trim() &&
      item.department.trim() &&
      item.signedBy.trim() &&
      currentRevisionComplete(item),
  );

export const signatureComplete = (item: GateSignatureRequirement) =>
  Boolean(item.checked) && signatureFieldsComplete(item);

export const ruleComplete = (rule: GateRule) => {
  const documents = (rule.signatures || []).filter(requirementApplies);
  return (
    Boolean(rule.checked) &&
    (!documents.length || documents.every(signatureComplete))
  );
};

export function getGateConditionProgress(node: DomainNode) {
  const rules = (node.config.gateRules || []).filter(requirementApplies);
  const signatures = rules.flatMap((rule) =>
    (rule.signatures || []).filter(requirementApplies),
  );
  const total = rules.length + signatures.length;
  const completed =
    rules.filter(ruleComplete).length + signatures.filter(signatureComplete).length;
  const started =
    rules.filter((item) => item.checked).length +
    signatures.filter((item) => item.checked).length;
  const state: GateCompletionState =
    total === 0
      ? "complete"
      : completed >= total
        ? "complete"
        : completed === 0 && started === 0
          ? "none"
          : "partial";
  return { completed, total, state };
}

export function gateChecklistSatisfied(node: DomainNode) {
  return (node.config.gateRules || [])
    .filter(requirementApplies)
    .every(ruleComplete);
}

export function gateApprovalReady(node: DomainNode) {
  return (
    gateChecklistSatisfied(node) &&
    Boolean(node.config.approvedDepartment?.trim()) &&
    Boolean(node.config.approvedBy?.trim())
  );
}

function computedConditionSource(node: DomainNode, projectStart?: DomainNode) {
  return node.type === "projectStart" ? node : projectStart || node;
}

export function conditionIsSatisfied(
  condition: Condition,
  node: DomainNode,
  projectStart?: DomainNode,
) {
  const source = computedConditionSource(node, projectStart);
  const projectId = String(
    source.customFields.projectId || source.customFields.projectNumber || "",
  ).trim();
  if (condition.id === "project-id-required") {
    return PROJECT_ID_PATTERN.test(projectId);
  }
  if (condition.id === "paid-building-required") {
    return BUILDING_PATTERN.test(String(source.config.buildingCode || ""));
  }
  if (condition.id === "paid-module-required") {
    return MODULE_PATTERN.test(String(source.config.moduleCode || ""));
  }
  return condition.required === false || condition.checked === true;
}

export function conditionDisplaySatisfied(
  condition: Condition,
  node: DomainNode,
  projectStart?: DomainNode,
) {
  if (condition.id && COMPUTED_CONDITION_IDS.has(condition.id)) {
    return conditionIsSatisfied(condition, node, projectStart);
  }
  return Boolean(condition.checked);
}

export function nodeReleaseReady(node: DomainNode, projectStart?: DomainNode) {
  if (node.type === "gate") return gateApprovalReady(node);
  if (node.type === "opportunityValidation") return true;
  if (
    node.type === "projectStart" &&
    !conditionIsSatisfied(
      { id: "project-id-required", required: true },
      node,
      node,
    )
  ) {
    return false;
  }
  const required = (node.conditions || []).filter(
    (condition) => condition.required !== false,
  );
  return required.every((condition) =>
    conditionIsSatisfied(condition, node, projectStart),
  );
}

export function nodeStatusLabel(node: DomainNode, projectStart?: DomainNode) {
  const stored = String(node.customFields.status || "").trim();
  if (stored) return stored;
  if (node.type === "gate" || (node.config.gateRules || []).length) {
    if (gateApprovalReady(node)) return "Ready";
    const progress = getGateConditionProgress(node);
    if (progress.state === "none") return "Blocked";
    return "In Progress";
  }
  const required = (node.conditions || []).filter(
    (item) => item.required !== false,
  );
  if (!required.length) return "Open";
  const ready = required.filter((item) =>
    conditionIsSatisfied(item, node, projectStart),
  );
  if (ready.length === required.length) return "Ready";
  if (ready.length) return "In Progress";
  return "Blocked";
}

export function nodeHasPaidService(
  node: DomainNode,
  rules = node.config.gateRules,
) {
  return (rules || []).some((rule) => ruleHasPaidService(rule));
}

export function workflowHasPaidService(
  nodes: DomainNode[],
  exceptId?: string,
  exceptRules?: GateRule[],
) {
  return nodes.some((node) =>
    node.id === exceptId
      ? nodeHasPaidService(node, exceptRules)
      : nodeHasPaidService(node),
  );
}

export function getWorkflowProgress(nodes: DomainNode[], edges: DomainEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set(
    edges
      .filter((edge) => !["rework", "reopen", "failure"].includes(edge.type))
      .map((edge) => edge.target),
  );
  const projectStart = nodes.find((node) => node.type === "projectStart");
  const projectStarts = nodes.filter((node) => node.type === "projectStart");
  const explicitStarts = nodes.filter(
    (node) =>
      node.config.stage?.trim().toLowerCase() === "start" &&
      !incoming.has(node.id),
  );
  const starts = projectStarts.length
    ? projectStarts
    : explicitStarts.length
      ? explicitStarts
      : nodes
          .filter(
            (node) =>
              !incoming.has(node.id) &&
              node.type !== "phase" &&
              !(REFERENCE_NODE_TYPES as readonly WorkflowNodeType[]).includes(
                node.type,
              ),
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
    if (source.type !== "gate" && !nodeReleaseReady(source, projectStart))
      continue;
    for (const edge of outgoing.get(sourceId) || []) {
      let allowed = true;
      if (source.type === "gate") {
        allowed =
          (edge.sourceHandle === "yes" && gateApprovalReady(source)) ||
          (edge.sourceHandle !== "yes" && !gateChecklistSatisfied(source));
      } else if (source.type === "opportunityValidation") {
        const evalResult = evaluateOpportunity(source);
        const currentOutcome = evalResult.recommendedOutcome;
        const handle = edge.sourceHandle || "pass-p1-p2";
        allowed = Boolean(
          handle === currentOutcome ||
            (currentOutcome === "pass-p1-p2" &&
              (handle === "pass-p1-p2" || handle === "pass")) ||
            (currentOutcome === "hold-rework" &&
              (handle === "hold-rework" || handle === "hold")) ||
            (currentOutcome === "nogo-disqualified" &&
              (handle === "nogo-disqualified" ||
                handle === "nogo" ||
                handle === "in-rework" ||
                edge.label?.toLowerCase().includes("no-go") ||
                edge.label?.toLowerCase().includes("nogo") ||
                edge.label?.toLowerCase().includes("rework"))),
        );
      }
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
