import { getAdaptiveNodeSize } from "@/lib/node-layout";
import type { DomainEdge, DomainNode, NodeLayout } from "@/types/workflow";

const node = (
  id: string,
  title: string,
  description: string,
  stage: string,
  color: string,
): DomainNode => ({
  id,
  type: "general",
  title,
  description,
  color,
  metadata: { workflowSection: "Pre-Gate Sales" },
  conditions: [],
  documents: [],
  criteria: [],
  customFields: {},
  config: {
    stage,
    iconKey:
      stage === "Decision"
        ? "check"
        : stage === "Archive"
          ? "flag"
          : "activity",
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
    workflowSection: "Pre-Gate Sales",
    responsibleDepartment: "Sales Team",
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
        label: "YES",
        edgeType: "success",
        color: "#16866f",
        enabled: true,
      },
      {
        id: "no",
        label: "NO",
        edgeType: "failure",
        color: "#dc2626",
        enabled: true,
        rule: "CONDITIONS NOT MET",
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
    approvedDepartment: "Sales Team",
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
  customFields: { workflowSection: "Pre-Gate Sales" },
});

export const PRE_GATE_SALES_NODES: DomainNode[] = [
  node(
    "lead-inquiry",
    "Lead / Inquiry",
    "New client lead or project inquiry received.",
    "Start",
    "#3f668c",
  ),
  node(
    "sales-intake",
    "Sales Intake",
    "Sales records and reviews the incoming opportunity.",
    "Activity",
    "#3f668c",
  ),
  node(
    "basic-client-project-info",
    "Basic Client + Project Information",
    "Capture the client, project, timing, location, and initial need.",
    "Information",
    "#526d82",
  ),
  decisionGate(
    "qualified-opportunity",
    "Qualified Opportunity?",
    "Decide whether the opportunity should proceed.",
    "QUALIFICATION",
    "#7c3aed",
    "Opportunity meets the qualification criteria",
  ),
  node(
    "archive-follow-up",
    "Archive / Follow-Up",
    "Archive the lead or schedule future follow-up.",
    "Archive",
    "#9b5960",
  ),
  node(
    "collect-plans-scope-site",
    "Collect Plans / Basic Scope / Site Info",
    "Collect available plans, basic scope, and site information.",
    "Activity",
    "#3f668c",
  ),
  node(
    "quick-class-d-benchmark",
    "Quick Class D Benchmark",
    "Prepare an early Class D benchmark for budget alignment.",
    "Activity",
    "#3f668c",
  ),
  decisionGate(
    "budget-fit",
    "Budget Fit?",
    "Confirm whether the benchmark aligns with the client budget.",
    "BUDGET CHECK",
    "#0f8a7b",
    "Class D benchmark fits the client budget",
  ),
  node(
    "hold-archive",
    "Hold / Archive",
    "Place the opportunity on hold or archive it.",
    "Archive",
    "#9b5960",
  ),
  node(
    "select-engagement-path",
    "Select Engagement Path",
    "Choose the appropriate commercial engagement route.",
    "Activity",
    "#3f668c",
  ),
  node(
    "engagement-approval",
    "CSA / PCS / Strategic No-Charge Approval",
    "Confirm the applicable paid-service or strategic no-charge approval path before G1.",
    "Approval",
    "#16866f",
  ),
];

export const PRE_GATE_SALES_EDGES: DomainEdge[] = [
  edge("pre-sales-lead-intake", "lead-inquiry", "sales-intake"),
  edge("pre-sales-intake-info", "sales-intake", "basic-client-project-info"),
  edge(
    "pre-sales-info-qualified",
    "basic-client-project-info",
    "qualified-opportunity",
  ),
  {
    ...edge(
      "pre-sales-qualified-no",
      "qualified-opportunity",
      "archive-follow-up",
      "NO",
      "failure",
    ),
    sourceHandle: "no",
  },
  {
    ...edge(
      "pre-sales-qualified-yes",
      "qualified-opportunity",
      "collect-plans-scope-site",
      "YES",
      "success",
    ),
    sourceHandle: "yes",
  },
  edge(
    "pre-sales-plans-benchmark",
    "collect-plans-scope-site",
    "quick-class-d-benchmark",
  ),
  edge("pre-sales-benchmark-budget", "quick-class-d-benchmark", "budget-fit"),
  {
    ...edge(
      "pre-sales-budget-no",
      "budget-fit",
      "hold-archive",
      "NO",
      "failure",
    ),
    sourceHandle: "no",
  },
  {
    ...edge(
      "pre-sales-budget-yes",
      "budget-fit",
      "select-engagement-path",
      "YES",
      "success",
    ),
    sourceHandle: "yes",
  },
  edge(
    "pre-sales-path-engagement",
    "select-engagement-path",
    "engagement-approval",
  ),
  edge(
    "pre-sales-engagement-g1",
    "engagement-approval",
    "g1-opportunity",
    "Proceed to G1",
    "success",
  ),
];

export function getPreGateSalesLayouts(
  originX = -1800,
  originY = 120,
): Record<string, NodeLayout> {
  const positions: Record<string, { x: number; y: number }> = {
    "lead-inquiry": { x: originX, y: originY },
    "sales-intake": { x: originX + 350, y: originY },
    "basic-client-project-info": { x: originX + 700, y: originY },
    "qualified-opportunity": { x: originX + 1050, y: originY },
    "archive-follow-up": { x: originX + 1050, y: originY + 280 },
    "collect-plans-scope-site": { x: originX + 1400, y: originY },
    "quick-class-d-benchmark": { x: originX + 1750, y: originY },
    "budget-fit": { x: originX + 2100, y: originY },
    "hold-archive": { x: originX + 2100, y: originY + 280 },
    "select-engagement-path": { x: originX + 2450, y: originY },
    "engagement-approval": { x: originX + 2800, y: originY },
  };
  return Object.fromEntries(
    PRE_GATE_SALES_NODES.map((item) => {
      const size = getAdaptiveNodeSize(item);
      return [item.id, { nodeId: item.id, ...positions[item.id], ...size }];
    }),
  );
}
