import { getAdaptiveNodeSize } from "@/lib/node-layout";
import type { DomainEdge, DomainNode, NodeLayout } from "@/types/workflow";

export const SALES_MAINLINE_NODE_IDS = [
  "lead-inquiry",
  "client-decision-maker",
  "project-intent-scale",
  "site-design-readiness",
  "budget-financing-timeline",
  "consultants-modular-fit",
  "class-d-reality-check",
  "assign-owner-type",
  "select-engagement-path",
] as const;

const node = (
  id: string,
  title: string,
  description: string,
  stage: string,
  color: string,
  iconKey = "activity",
): DomainNode => ({
  id,
  type: "general",
  title,
  description,
  color,
  metadata: { workflowSection: "Opportunity Validation" },
  conditions: [],
  documents: [],
  criteria: [],
  customFields: {},
  config: {
    stage,
    iconKey,
  },
});

const decisionGate = (
  id: string,
  title: string,
  description: string,
  gateLabel: string,
  color: string,
  condition: string,
): DomainNode => ({
  id,
  type: "gate",
  title,
  description,
  color,
  metadata: {
    workflowSection: "Opportunity Validation",
    responsibleDepartment: "Sales & Pre-Construction",
  },
  conditions: [],
  documents: [],
  criteria: [condition],
  customFields: {},
  config: {
    gateLabel,
    decisionMode: "binary",
    gateIconKey: "check",
    gateHeaderColor: color,
    gateTitleColor: "#ffffff",
    outcomes: [
      {
        id: "yes",
        label: "PROCEED",
        edgeType: "success",
        color: "#16866f",
        enabled: true,
      },
      {
        id: "no",
        label: "NO-GO",
        edgeType: "failure",
        color: "#dc2626",
        enabled: true,
        rule: "Severe budget/scope disconnect, non-modular fit, or no decision authority",
      },
    ],
    gateRules: [
      {
        id: `${id}-condition-1`,
        label: condition,
        checked: false,
        requirementType: "Required",
        signatures: [],
      },
    ],
    approvedDepartment: "Sales & Pre-Construction",
    approvedBy: "",
  },
});

const edge = (
  id: string,
  source: string,
  target: string,
  label = "",
  type: DomainEdge["type"] = "normal",
): DomainEdge => ({
  id,
  source,
  target,
  sourceHandle: "out",
  targetHandle: "in",
  label,
  type,
  lineStyle: "solid",
  arrowStyle: "closed",
  customFields: { workflowSection: "Opportunity Validation" },
});

export const PRE_GATE_SALES_NODES: DomainNode[] = [
  node(
    "lead-inquiry",
    "Lead / Inquiry Intake",
    "Capture incoming lead: company, primary contact, referral/marketing source, and contact details.",
    "Intake",
    "#3f668c",
    "person",
  ),
  node(
    "client-decision-maker",
    "Client Profile & Decision Maker",
    "Record client profile and verify true Decision Maker (decision, signing authority, and budget control).",
    "Client Profiling",
    "#3b73a3",
    "person",
  ),
  node(
    "project-intent-scale",
    "Project Intent & High-Level Scale",
    "Clarify project intent, building use, location, storeys, gross floor area (sq.ft.), and unit count for Class D baseline.",
    "Scope Definition",
    "#2d6a9f",
    "building",
  ),
  node(
    "site-design-readiness",
    "Site & Design Maturity Status",
    "Assess Site status (Owned/Option/Searching, constraints) and classify Design maturity (Level 0: No Plans to Level 4: Permit Issued).",
    "Readiness",
    "#4f6f8f",
    "document",
  ),
  node(
    "budget-financing-timeline",
    "Budget, Financing & Timeline",
    "Record client budget basis (target cost/ceiling, turnkey vs modular), financing structure (equity/loan/grant), and target milestone dates.",
    "Commercial",
    "#546e7a",
    "settings",
  ),
  node(
    "consultants-modular-fit",
    "Consultants & Modular Fit Assessment",
    "Identify external consultants (Architect/Engineer) and perform high-level modular feasibility check (logistics, grid, red flags).",
    "Feasibility",
    "#455a64",
    "activity",
  ),
  decisionGate(
    "class-d-reality-check",
    "Class D Budget Reality Check",
    "Compare gross floor area × $/sq.ft. assumption against client budget to verify fundamental economic and modular feasibility.",
    "REALITY CHECK",
    "#0f8a7b",
    "Class D benchmark aligns with budget expectations or client accepts scope/budget calibration",
  ),
  node(
    "no-go-archive",
    "NO-GO / Disqualified Archive",
    "Archive opportunity due to irreconcilable budget disconnect, fatal site/transport barrier, or client non-responsiveness.",
    "Archive",
    "#9b5960",
    "flag",
  ),
  node(
    "assign-owner-type",
    "Assign Owner Type & Gap Mitigation",
    "Classify into Owner Type (Project-Ready, Design-Needed, Site-Unresolved, Concept-Stage, Permit-Ready) and define controlled gap resolution strategies.",
    "Strategy",
    "#2e7d6f",
    "box",
  ),
  node(
    "select-engagement-path",
    "Select Commercial Engagement Path",
    "Select appropriate commercial instrument (CSA, PCS, LOI, Paid Feasibility, or Direct Technical Review) to formalize pre-construction commitment.",
    "Commercial",
    "#16866f",
    "check",
  ),
  node(
    "hold-gap-rework",
    "HOLD / Gap Resolution Loop",
    "Hold opportunity while client resolves manageable gaps: complete site feasibility, engage design coordination, or finalize funding criteria.",
    "Hold / Rework",
    "#d97706",
    "flag",
  ),
];

export const PRE_GATE_SALES_EDGES: DomainEdge[] = [
  edge("opp-lead-to-client", "lead-inquiry", "client-decision-maker"),
  edge("opp-client-to-scale", "client-decision-maker", "project-intent-scale"),
  edge("opp-scale-to-site", "project-intent-scale", "site-design-readiness"),
  edge("opp-site-to-budget", "site-design-readiness", "budget-financing-timeline"),
  edge("opp-budget-to-fit", "budget-financing-timeline", "consultants-modular-fit"),
  edge("opp-fit-to-reality", "consultants-modular-fit", "class-d-reality-check"),
  {
    ...edge(
      "opp-reality-no",
      "class-d-reality-check",
      "no-go-archive",
      "NO-GO",
      "failure",
    ),
    sourceHandle: "no",
  },
  {
    ...edge(
      "opp-reality-yes",
      "class-d-reality-check",
      "assign-owner-type",
      "PROCEED",
      "success",
    ),
    sourceHandle: "yes",
  },
  edge("opp-owner-to-engagement", "assign-owner-type", "select-engagement-path"),
  edge(
    "opp-engagement-to-g1",
    "select-engagement-path",
    "g1-opportunity",
    "Proceed to Gate 1",
    "success",
  ),
  {
    ...edge(
      "opp-g1-hold-return",
      "g1-opportunity",
      "hold-gap-rework",
      "HOLD · Gaps Identified",
      "hold",
    ),
    sourceHandle: "no",
  },
  edge(
    "opp-hold-to-owner",
    "hold-gap-rework",
    "assign-owner-type",
    "Re-evaluate Strategy",
    "rework",
  ),
];

export function getPreGateSalesLayouts(
  originX = -3200,
  originY = 120,
): Record<string, NodeLayout> {
  const step = 350;
  const positions: Record<string, { x: number; y: number }> = {
    "lead-inquiry": { x: originX, y: originY },
    "client-decision-maker": { x: originX + step, y: originY },
    "project-intent-scale": { x: originX + step * 2, y: originY },
    "site-design-readiness": { x: originX + step * 3, y: originY },
    "budget-financing-timeline": { x: originX + step * 4, y: originY },
    "consultants-modular-fit": { x: originX + step * 5, y: originY },
    "class-d-reality-check": { x: originX + step * 6, y: originY },
    "no-go-archive": { x: originX + step * 6, y: originY + 280 },
    "assign-owner-type": { x: originX + step * 7, y: originY },
    "select-engagement-path": { x: originX + step * 8, y: originY },
    "hold-gap-rework": { x: originX + step * 7.5, y: originY + 280 },
  };
  return Object.fromEntries(
    PRE_GATE_SALES_NODES.map((item) => {
      const size = getAdaptiveNodeSize(item);
      return [item.id, { nodeId: item.id, ...positions[item.id], ...size }];
    }),
  );
}

