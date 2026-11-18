/**
 * Recognises L2 nodes from older project versions that are no longer part of
 * the workflow (matrices, explanatory notes, the commercial pathway, retired
 * opportunity steps), by id or title. Re-exported from detailed-workflow.
 */
import type { DomainNode } from "@/types/workflow";

export const LEGACY_DECISION_GATE_IDS = new Set([
  "gate-g2-technical-commitment",
  "gate-g3-production-authorization",
  "gate-g4-factory-release",
  "gate-g5-warranty-start",
]);

export const REMOVED_DUPLICATE_NODE_IDS = new Set<string>();
export const REMOVED_EXPLANATORY_NODE_IDS = new Set(["control-backbone", "business-rules"]);

export const REMOVED_MATRIX_NODE_IDS = new Set(["approval-matrix", "responsibility-lane"]);

export function isRemovedMatrixNodeId(id: string) {
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

export const COMMERCIAL_PATHWAY_ID = "commercial-pathway";

export function isCommercialPathwayId(id: string) {
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

export const RETIRED_OPPORTUNITY_NODE_IDS = new Set([
  "opportunity-intake",
  "opportunity-validation",
  "opportunity-hold",
  "opportunity-no-go",
  "hold-gap-rework",
  "no-go-archive",
]);

export function isRetiredOpportunityId(id: string) {
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
    title === "opportunity qualification" ||
    title === "opportunity qualification module" ||
    workflowSection.includes("opportunity validation") ||
    workflowSection.includes("opportunity qualification") ||
    config.opportunity !== undefined ||
    config.opportunityRole !== undefined ||
    config.opportunitySection !== undefined
  );
}
