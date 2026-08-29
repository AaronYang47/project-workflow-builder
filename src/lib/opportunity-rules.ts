import type { OpportunityBusinessRuleConfig, OpportunityRoute, OpportunityRuleDefinition } from "@/types/workflow";

/** Defaults are deliberately business settings, not UI constants. */
export const DEFAULT_OPPORTUNITY_BUSINESS_RULES: Required<OpportunityBusinessRuleConfig> = {
  scoreWeights: {
    authority: 15,
    project: 15,
    site: 10,
    design: 10,
    modular: 15,
    budget: 15,
    fundingTimeline: 10,
    teamCommitment: 10,
  },
  scoreGradeThresholds: { strong: 75, moderate: 50, weak: 25 },
  budgetAlignmentTolerancePercent: 15,
  governedLoiAllowed: false,
  commercialEngagement: "Incomplete",
};

export const ROUTE_PRIORITY: OpportunityRoute[] = [
  "NO_GO_ARCHIVE",
  "HOLD_PREQUALIFICATION",
  "TECHNICAL_REVIEW",
  "CONSULTATION_CSA",
  "PCS",
  "GOVERNED_LOI",
  "CLASS_D",
];

/**
 * Stable metadata for the deterministic rule engine. Conditions are expressed
 * as evidence statements so the UI can explain a result without exposing
 * implementation details or internal IDs.
 */
export const OPPORTUNITY_RULE_DEFINITIONS: Record<string, Pick<OpportunityRuleDefinition, "condition" | "enabled">> = {
  "decision-authority-unknown": { condition: "Decision authority status is Unknown", enabled: true },
  "project-scale-missing": { condition: "Storeys and approximate GFA are both missing", enabled: true },
  "modular-incompatibility": { condition: "Modular compatibility is Not Compatible and no corrective path exists", enabled: true },
  "modular-incompatibility-review": { condition: "Modular compatibility is Not Compatible and corrective path is not confirmed", enabled: true },
  "modular-rework-review": { condition: "Modular compatibility indicates material rework", enabled: true },
  "fatal-site-constraint": { condition: "A fatal site or transport constraint is confirmed and not resolvable", enabled: true },
  "fatal-site-constraint-review": { condition: "A fatal site or transport constraint is confirmed but resolution is not final", enabled: true },
  "no-design-consultation": { condition: "Design maturity is No Design", enabled: true },
  "insufficient-design-basis": { condition: "Design exists but no basic design basis is available", enabled: true },
  "modular-review-required": { condition: "Technical design exists without modular compatibility review", enabled: true },
  "client-budget-missing": { condition: "Client budget amount is unavailable", enabled: true },
  "class-d-missing": { condition: "Project scale exists but Class D benchmark is unavailable", enabled: true },
  "budget-alignment-gap": { condition: "Budget variance exceeds the configured tolerance", enabled: true },
};

export const DESIGN_BASIS_LEVELS = new Set([
  "Sketch / Massing",
  "Concept Plans",
  "Preliminary Design",
  "Developed Design",
  "Permit Submission Set",
  "Permit Issued",
  "Construction Documents",
  "IFC / Construction Ready",
]);

export const TECHNICAL_DESIGN_LEVELS = new Set([
  "Sketch / Massing",
  "Concept Plans",
  "Preliminary Design",
  "Developed Design",
  "Permit Submission Set",
  "Permit Issued",
  "Construction Documents",
  "IFC / Construction Ready",
]);

export const SITE_NOT_FINAL = new Set([
  "Option / Conditional Control",
  "Candidate Site Identified",
  "Multiple Candidate Sites",
  "Municipality / Client Has Available Land but Site Not Assigned",
  "Site Being Searched",
  "No Site Identified",
  "Unknown",
]);
