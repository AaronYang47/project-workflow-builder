import type {
  Condition,
  DomainEdge,
  DomainNode,
  GateRule,
  GateSignatureRequirement,
  WorkflowNodeType,
  WorkflowFile,
} from "@/types/workflow";
import { REFERENCE_NODE_TYPES } from "@/types/workflow";
import { BUILDING_PATTERN, MODULE_PATTERN } from "@/lib/project-id";
import { ruleHasPaidService } from "@/lib/gate-service-types";
import { executionItemProgress, getExecutionSummary } from "@/lib/execution";
import type { ExecutionItem } from "@/types/workflow";
import { operationsGateStatus } from "@/lib/project-operations";
import type { ProjectOperations } from "@/types/project-operations";
import { releaseConditionForms } from "@/lib/release-condition-forms";
import { applyFobYardSkip } from "@/lib/fob-yard";
import { departmentDisplayName } from "@/lib/department-label";

export type GateCompletionState = "none" | "partial" | "complete";

export const COMPUTED_CONDITION_IDS = new Set([
  "project-id-required",
  "paid-building-required",
  "paid-module-required",
]);

const OPERATIONAL_GATE_NODE_IDS = new Set([
  "gate-g1-qualified",
  "gate-g2-technical-commitment",
  "production-readiness",
  "gate-g3-production-authorization",
  "gate-g4-factory-release",
  "delivery-project-completion",
  "gate-g5-warranty-start",
  "commissioning-warranty",
  "close-out",
]);

export const requirementApplies = (item: { requirementType?: string }) =>
  item.requirementType !== "Optional";

const L3_DOCUMENT_FIELDS = ["legalDocuments", "customerDocuments", "supportingDocuments"] as const;

function conditionL3FormState(condition: Condition, node: DomainNode) {
  const suffix = `::release-condition::${condition.id || "default"}`;
  const documents = [
    ...releaseConditionForms(node, condition),
    ...L3_DOCUMENT_FIELDS.filter((field) => field !== "legalDocuments").flatMap((field) => {
      const raw = node.customFields[`${field}${suffix}`];
      if (typeof raw !== "string") return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }),
  ];
  // Forms listed by the specification mirror the condition's own tick; files
  // attached in L3 carry their own ticks.
  const attached = documents.filter(
    (document) => !String(document.id ?? "").startsWith("specified-form-"),
  );
  const attachedRequired = attached.filter((document) => document.required !== false);
  return {
    hasForms: documents.length > 0,
    requiredComplete: documents
      .filter((document) => document.required !== false)
      .every((document) => document.checked === true),
    /** Every required attached file is ticked (and there is at least one). */
    attachedComplete:
      attachedRequired.length > 0 &&
      attachedRequired.every((document) => document.checked === true),
  };
}

export function conditionHasL3Forms(condition: Condition, node: DomainNode) {
  // Linked execution items are the standard L3 form source for generated
  // workflows, even when no custom document record has been uploaded yet.
  if (condition.linkedExecutionItemId) return true;
  return conditionL3FormState(condition, node).hasForms;
}

export const currentRevisionComplete = (item: GateSignatureRequirement) => {
  if (!item.revisionControlled) return true;
  const current = item.revisions?.find((revision) => revision.status === "Current");
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
  return Boolean(rule.checked) && (!documents.length || documents.every(signatureComplete));
};

export function getGateConditionProgress(node: DomainNode) {
  const rules = (node.config.gateRules || []).filter(requirementApplies);
  const signatures = rules.flatMap((rule) => (rule.signatures || []).filter(requirementApplies));
  const total = rules.length + signatures.length;
  const completed = rules.filter(ruleComplete).length + signatures.filter(signatureComplete).length;
  const started =
    rules.filter((item) => item.checked).length + signatures.filter((item) => item.checked).length;
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
  return (node.config.gateRules || []).filter(requirementApplies).every(ruleComplete);
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
  executionItems?: ExecutionItem[],
  operations?: ProjectOperations,
) {
  // The Job Number reminder is informational for release and ticked by hand:
  // entering a Job Number no longer forces it on (its files can tick it).
  if (condition.id === "project-id-required") {
    const forms = conditionL3FormState(condition, node);
    return condition.checked === true || forms.attachedComplete;
  }
  if (condition.linkedExecutionItemId) {
    const linkedItem = executionItems?.find((item) => item.id === condition.linkedExecutionItemId);
    return Boolean(
      // L3-backed conditions are completed by the L3 form flow. Keeping the
      // condition flag in the check prevents an L2 checkbox from bypassing
      // required fields in that form.
      condition.checked === true &&
      linkedItem &&
      executionItemProgress(linkedItem, operations, {
        checklistOnly: true,
      }) === "complete",
    );
  }
  const l3Forms = conditionL3FormState(condition, node);
  if (l3Forms.hasForms) {
    // Ticking every required file in L3 / Release Conditions ticks the condition.
    return l3Forms.requiredComplete && (condition.checked === true || l3Forms.attachedComplete);
  }
  const source = computedConditionSource(node, projectStart);
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
  executionItems?: ExecutionItem[],
  operations?: ProjectOperations,
) {
  if (condition.id && COMPUTED_CONDITION_IDS.has(condition.id)) {
    return conditionIsSatisfied(condition, node, projectStart, executionItems, operations);
  }
  if (condition.linkedExecutionItemId && executionItems) {
    return conditionIsSatisfied(condition, node, projectStart, executionItems, operations);
  }
  return conditionIsSatisfied(condition, node, projectStart, executionItems, operations);
}

export function nodeReleaseReady(
  node: DomainNode,
  projectStart?: DomainNode,
  executionItems?: ExecutionItem[],
  operations?: ProjectOperations,
) {
  if (node.type === "gate") {
    const checklistReady = gateApprovalReady(node);
    if (!checklistReady || !operations) return checklistReady;
    const operationalGate = operationsGateStatus(node.id, operations);
    return operationalGate.ready;
  }
  const required = (node.conditions || []).filter(
    (condition) => condition.required !== false && condition.id !== "project-id-required",
  );
  const conditionsReady = required.every((condition) =>
    conditionIsSatisfied(condition, node, projectStart, executionItems, operations),
  );
  if (!conditionsReady || !executionItems) return conditionsReady;

  const executionSummary = getExecutionSummary(node.id, executionItems, operations, {
    checklistOnly: true,
  });
  const executionReady =
    !executionSummary.hasItems ||
    executionSummary.requiredCompletedCount === executionSummary.requiredCount;
  if (!executionReady) return false;
  if (operations && OPERATIONAL_GATE_NODE_IDS.has(node.id)) {
    return operationsGateStatus(node.id, operations).ready;
  }
  return true;
}

export function nodeStatusLabel(
  node: DomainNode,
  projectStart?: DomainNode,
  executionItems?: ExecutionItem[],
  operations?: ProjectOperations,
) {
  const stored = String(node.customFields.status || "").trim();
  if (stored) return stored;
  if (node.type === "gate" || (node.config.gateRules || []).length) {
    if (gateApprovalReady(node)) {
      if (!operations || operationsGateStatus(node.id, operations).ready) return "Ready";
    }
    const progress = getGateConditionProgress(node);
    if (progress.state === "none") return "Blocked";
    return "In Progress";
  }
  const required = (node.conditions || []).filter(
    (item) => item.required !== false && item.id !== "project-id-required",
  );
  if (!required.length) return "Open";
  const ready = required.filter((item) =>
    conditionIsSatisfied(item, node, projectStart, executionItems, operations),
  );
  if (ready.length === required.length) {
    if (
      operations &&
      OPERATIONAL_GATE_NODE_IDS.has(node.id) &&
      !operationsGateStatus(node.id, operations).ready
    ) {
      return "In Progress";
    }
    return "Ready";
  }
  if (ready.length) return "In Progress";
  return "Blocked";
}

export function nodeHasPaidService(node: DomainNode, rules = node.config.gateRules) {
  return (rules || []).some((rule) => ruleHasPaidService(rule));
}

export function workflowHasPaidService(
  nodes: DomainNode[],
  exceptId?: string,
  exceptRules?: GateRule[],
) {
  return nodes.some((node) =>
    node.id === exceptId ? nodeHasPaidService(node, exceptRules) : nodeHasPaidService(node),
  );
}

export function getWorkflowProgress(
  nodes: DomainNode[],
  edges: DomainEdge[],
  executionItems?: ExecutionItem[],
  operations?: ProjectOperations,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Set(
    edges
      .filter((edge) => !["rework", "reopen", "failure"].includes(edge.type))
      .map((edge) => edge.target),
  );
  const projectStart = nodes.find((node) => node.type === "projectStart");
  const projectStarts = nodes.filter((node) => node.type === "projectStart");
  const explicitStarts = nodes.filter(
    (node) => node.config.stage?.trim().toLowerCase() === "start" && !incoming.has(node.id),
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
              !(REFERENCE_NODE_TYPES as readonly WorkflowNodeType[]).includes(node.type),
          )
          .slice(0, 1);
  const reachedNodeIds = new Set(starts.map((node) => node.id));
  const activeEdgeIds = new Set<string>();
  const queue = starts.map((node) => node.id);
  const outgoing = new Map<string, DomainEdge[]>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);

  while (queue.length) {
    const sourceId = queue.shift()!;
    const source = nodeById.get(sourceId);
    if (!source) continue;
    if (
      source.type !== "gate" &&
      !nodeReleaseReady(source, projectStart, executionItems, operations)
    )
      continue;
    for (const edge of outgoing.get(sourceId) || []) {
      let allowed = true;
      if (source.type === "gate") {
        allowed =
          (edge.sourceHandle === "yes" && gateApprovalReady(source)) ||
          (edge.sourceHandle !== "yes" && !gateChecklistSatisfied(source));
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

/**
 * Progress of the project as it runs: with FOB yard on, the skipped Phases
 * are left out and the flow continues along the bypass, so FOB yard lines
 * (ids starting "fob-yard-") turn active once their source is released.
 */
export function getFileProgress(file: WorkflowFile) {
  const running = applyFobYardSkip(file);
  return getWorkflowProgress(
    running.graph.nodes,
    running.graph.edges,
    running.execution?.items,
    running.operations,
  );
}

/**
 * A department's release conditions (and their files) can be ticked only once
 * the flow has reached it: every earlier department on the way has all its
 * release conditions complete (and every Gate on the way is approved). With
 * FOB yard on, the flow runs around the skipped Phases. Returns the message
 * naming what to finish first, or undefined when ticking is allowed. A
 * department the flow can't reach at all (not connected) is not blocked.
 */
export function sequentialExecutionBlocker(file: WorkflowFile, nodeId: string) {
  const running = applyFobYardSkip(file);
  const node = running.graph.nodes.find((item) => item.id === nodeId);
  if (!node || node.type === "phase" || node.type === "gate") return undefined;
  const progress = getWorkflowProgress(
    running.graph.nodes,
    running.graph.edges,
    running.execution?.items,
    running.operations,
  );
  if (progress.reachedNodeIds.has(nodeId)) return undefined;

  const nodeById = new Map(running.graph.nodes.map((item) => [item.id, item]));
  const projectStart = running.graph.nodes.find((item) => item.type === "projectStart");
  const sources = new Map<string, string[]>();
  for (const edge of running.graph.edges) {
    if (["rework", "reopen", "failure"].includes(edge.type)) continue;
    sources.set(edge.target, [...(sources.get(edge.target) ?? []), edge.source]);
  }
  // Walk back to the nearest reached steps: those are what hold this one up.
  const blocking: DomainNode[] = [];
  const seen = new Set([nodeId]);
  const queue = [...(sources.get(nodeId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = nodeById.get(id);
    if (!step) continue;
    if (progress.reachedNodeIds.has(id)) {
      const ready =
        step.type === "gate"
          ? gateApprovalReady(step)
          : nodeReleaseReady(step, projectStart, running.execution?.items, running.operations);
      if (!ready) blocking.push(step);
      continue;
    }
    queue.push(...(sources.get(id) ?? []));
  }
  if (!blocking.length) return undefined;
  const label = (step: DomainNode) => {
    const name = departmentDisplayName(step);
    return name === "Department" && step.title.trim() ? step.title.trim() : name;
  };
  const names = blocking.map((step) =>
    step.type === "gate" ? `${step.title} (Gate approval)` : label(step),
  );
  return `Finish every release condition in ${names.join(", ")} first. ${label(node)} can be ticked once the previous department is complete.`;
}
