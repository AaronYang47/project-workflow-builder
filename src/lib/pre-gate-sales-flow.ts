import { getAdaptiveNodeSize } from "@/lib/node-layout";
import type { DomainEdge, DomainNode, NodeLayout } from "@/types/workflow";

export const SALES_MAINLINE_NODE_IDS = ["opportunity-validation"] as const;

export const PRE_GATE_SALES_NODES: DomainNode[] = [
  {
    id: "opportunity-validation",
    type: "opportunityValidation",
    title: "Opportunity Qualification & Commercial Baseline",
    description:
      "Validate client lead, confirm decision makers, assess Class D scale & budget reality, assign owner type, and secure engagement commitment.",
    color: "#1f5fa7",
    metadata: { workflowSection: "Opportunity Validation" },
    conditions: [
      {
        id: "dm-confirmed",
        label: "True Decision Maker confirmed",
        required: true,
        checked: true,
      },
      {
        id: "scale-captured",
        label: "Class D scale inputs (storeys, area, units) captured",
        required: true,
        checked: true,
      },
      {
        id: "site-design-documented",
        label: "Site status & design maturity classified",
        required: true,
        checked: true,
      },
      {
        id: "reality-check-passed",
        label: "Class D budget reality check & modular fit verified",
        required: true,
        checked: true,
      },
      {
        id: "owner-gap-controlled",
        label: "Owner Type assigned & gaps have mitigation plan",
        required: true,
        checked: true,
      },
      {
        id: "engagement-instrument",
        label: "Engagement instrument (CSA/PCS/LOI) selected",
        required: true,
        checked: true,
      },
    ],
    documents: ["CSA / PCS / LOI"],
    criteria: [],
    customFields: {},
    config: {
      stage: "Opportunity Validation",
      iconKey: "check",
      outcomes: [
        {
          id: "pass",
          label: "GATE 1 PASS",
          edgeType: "success",
          color: "#16866f",
          enabled: true,
        },
        {
          id: "hold",
          label: "HOLD · Gaps Loop",
          edgeType: "hold",
          color: "#d97706",
          enabled: true,
        },
        {
          id: "nogo",
          label: "NO-GO · Disqualified",
          edgeType: "failure",
          color: "#dc2626",
          enabled: true,
        },
      ],
      opportunity: {
        companyName: "Apex Urban Developments",
        contactPerson: "Marcus Vance, VP Development",
        leadSource: "Direct Architect Referral",
        contactPhone: "(250) 555-0192",
        contactEmail: "[email protected]",
        decisionMakerName: "Marcus Vance",
        decisionMakerRole: "Managing Partner & Signing Authority",
        decisionMakerConfirmed: true,
        decisionMakerNotes:
          "Controls acquisition budget; board sign-off threshold is $15M.",
        projectIntent: "4-Storey Multi-Family Rental",
        projectLocation: "Kelowna, BC",
        storeys: 4,
        grossFloorArea: 28000,
        unitCount: 36,
        siteStatus: "Owned",
        siteAddress: "1080 Enterprise Way, Kelowna BC",
        siteConstraints:
          "Municipal water/sewer at lot line; crane pad feasible on South frontage.",
        designStage: "Level 1: Concept",
        clientBudget: "9800000",
        budgetScope: "Turnkey Total",
        targetCostPerSqFt: "350",
        fundingSource: "Commercial Loan",
        fundingSecured: true,
        targetTimeline: "Target occupancy in 15 months",
        consultantsInfo:
          "Kasian Architecture (Concept sketches); structural via ProFab engineering.",
        modularFitPassed: true,
        realityCheckStatus: "passed",
        ownerType: "Design-Needed",
        gapMitigationNotes:
          "Drawings currently at concept level -> Execute CSA to coordinate architectural modularization and preliminary MEP engineering.",
        engagementPath: "CSA",
        engagementStatus: "Draft",
        decisionOutcome: "pass",
      },
    },
  },
  {
    id: "no-go-archive",
    type: "general",
    title: "NO-GO / Disqualified Archive",
    description:
      "Archive opportunity due to irreconcilable budget disconnect, fatal site/transport barrier, or client non-responsiveness.",
    color: "#9b5960",
    metadata: { workflowSection: "Opportunity Validation" },
    conditions: [],
    documents: [],
    criteria: [],
    customFields: {},
    config: {
      stage: "Archive",
      iconKey: "flag",
    },
  },
  {
    id: "hold-gap-rework",
    type: "general",
    title: "HOLD / Gap Resolution Loop",
    description:
      "Hold opportunity while client resolves manageable gaps: complete site feasibility, engage design coordination, or finalize funding criteria.",
    color: "#d97706",
    metadata: { workflowSection: "Opportunity Validation" },
    conditions: [],
    documents: [],
    criteria: [],
    customFields: {},
    config: {
      stage: "Hold / Rework",
      iconKey: "flag",
    },
  },
];

export const PRE_GATE_SALES_EDGES: DomainEdge[] = [
  {
    id: "opp-pass-to-g1",
    source: "opportunity-validation",
    target: "g1-opportunity",
    sourceHandle: "pass",
    targetHandle: "in",
    label: "Gate 1 PASS · Validated Opportunity",
    type: "success",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: { workflowSection: "Opportunity Validation" },
  },
  {
    id: "opp-hold-return",
    source: "opportunity-validation",
    target: "hold-gap-rework",
    sourceHandle: "hold",
    targetHandle: "in",
    label: "HOLD · Gaps Identified",
    type: "hold",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: { workflowSection: "Opportunity Validation" },
  },
  {
    id: "opp-hold-re-evaluate",
    source: "hold-gap-rework",
    target: "opportunity-validation",
    sourceHandle: "out",
    targetHandle: "in",
    label: "Re-evaluate Strategy",
    type: "rework",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: { workflowSection: "Opportunity Validation" },
  },
  {
    id: "opp-nogo-archive",
    source: "opportunity-validation",
    target: "no-go-archive",
    sourceHandle: "nogo",
    targetHandle: "in",
    label: "NO-GO",
    type: "failure",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: { workflowSection: "Opportunity Validation" },
  },
];

export function getPreGateSalesLayouts(
  originX = -1200,
  originY = 120,
): Record<string, NodeLayout> {
  const positions: Record<string, { x: number; y: number }> = {
    "opportunity-validation": { x: originX, y: originY },
    "hold-gap-rework": { x: originX + 220, y: originY + 840 },
    "no-go-archive": { x: originX - 220, y: originY + 840 },
  };
  return Object.fromEntries(
    PRE_GATE_SALES_NODES.map((item) => {
      const size = getAdaptiveNodeSize(item);
      return [item.id, { nodeId: item.id, ...positions[item.id], ...size }];
    }),
  );
}


