import { getAdaptiveNodeSize, PHASE_CONTENT_TOP } from "@/lib/node-layout";
import { GATE_SERVICE_TYPES } from "@/lib/gate-service-types";
import type {
  DomainEdge,
  DomainNode,
  GateRule,
  GateSignatureRequirement,
  OutcomeHandle,
  ReferenceConfig,
  WorkflowFile,
  WorkflowNodeType,
} from "@/types/workflow";

const signature = (
  id: string,
  abbreviation: string,
  fullName: string,
  department: string,
): GateSignatureRequirement => ({
  id,
  abbreviation,
  fullName,
  department,
  signedBy: "",
  checked: false,
  requirementType: "Required",
  applicable: true,
  owner: department,
  receivedDate: "",
  revision: "",
  status: "Draft",
  serviceType: "Included / TBD",
  revisionControlled: true,
  revisions: [],
});

const rule = (
  id: string,
  label: string,
  signatures: GateSignatureRequirement[] = [],
): GateRule => ({
  id,
  label,
  checked: false,
  requirementType: "Required",
  applicable: true,
  signatures,
});

const gateNode = (
  id: string,
  phase: string,
  title: string,
  description: string,
  department: string,
  rules: GateRule[],
  color: string,
  customOutcomes?: OutcomeHandle[],
): DomainNode => ({
  id,
  type: "gate",
  title,
  description,
  color,
  metadata: { phase, responsibleDepartment: department },
  conditions: [],
  documents: rules.flatMap((item) =>
    (item.signatures || []).map((document) => document.abbreviation),
  ),
  criteria: rules.map((item) => item.label),
  customFields: { phase },
  config: {
    outcomes: customOutcomes || [
      {
        id: "yes",
        label: "APPROVED",
        edgeType: "success",
        color: "#16866f",
        enabled: true,
      },
      {
        id: "no",
        label: "DENIED",
        edgeType: "failure",
        color: "#dc2626",
        enabled: true,
      },
    ],
    gateRules: rules,
    approvedDepartment: department,
    approvedBy: "",
  },
});

const edge = (
  id: string,
  source: string,
  target: string,
  label: string,
  type: DomainEdge["type"],
  sourceHandle: string,
): DomainEdge => ({
  id,
  source,
  target,
  label,
  type,
  sourceHandle,
  targetHandle: sourceHandle.startsWith("no") ? "rework-in" : "in",
  lineStyle: "solid",
  arrowStyle: "closed",
  condition:
    sourceHandle === "yes"
      ? {
          expression:
            "ALL gate rules AND ALL required signatures AND approver details",
          description:
            "Advance only when the complete gate checklist is approved.",
        }
      : { expression: "NOT approved", description: label },
  customFields: {},
});

const phaseNode = (
  id: string,
  title: string,
  description: string,
  color: string,
): DomainNode => ({
  id,
  type: "phase",
  title,
  description,
  color,
  metadata: {},
  conditions: [],
  documents: [],
  criteria: [],
  customFields: {},
  config: { locked: false },
});
const referenceNode = (
  id: string,
  type: WorkflowNodeType,
  title: string,
  description: string,
  color: string,
  reference: ReferenceConfig,
): DomainNode => ({
  id,
  type,
  title,
  description,
  color,
  metadata: {},
  conditions: [],
  documents: [],
  criteria: [],
  customFields: {},
  config: { reference },
});

const gateNodes: DomainNode[] = [
  gateNode(
    "g1-opportunity",
    "Phase 1 · Sales / Pre-construction / Commitment",
    "G1 · Opportunity Qualification & Client Commitment",
    "Qualify the opportunity, establish client commitment, and control the start of internal work.",
    "Sales Team",
    [
      rule("g1-information", "Basic project information is available"),
      rule("g1-qualified", "Opportunity is commercially qualified"),
      rule(
        "g1-commitment",
        "Client commitment received through an approved instrument",
        [
          signature(
            "g1-commitment-doc",
            "CSA / PCS / LOI",
            "Selected commitment instrument (choose the applicable agreement)",
            "Sales Team",
          ),
        ],
      ),
      rule("g1-job-number", "Job number is assigned before work begins"),
    ],
    "#1f5fa7",
  ),
  gateNode(
    "g2-scope",
    "Phase 1 · Sales / Pre-construction / Commitment",
    "G2 · Scope & Responsibility Setup",
    "Gather project information and define the high-level scope, responsibilities, site constraints, and ownership boundaries.",
    "Sales Team + Technical / Project Manager",
    [
      rule(
        "g2-information",
        "Project information, plans, specifications, and site information are collected",
      ),
      rule("g2-rm", "Responsibility Matrix is established", [
        signature(
          "g2-rm-doc",
          "RM",
          "Responsibility Matrix",
          "Sales + Technical / Project Manager",
        ),
      ]),
      rule(
        "g2-risks",
        "Key site, scope, and responsibility risks are identified",
      ),
      rule("g2-sdr", "Initial Site Discovery Report is logged when applicable"),
      rule("g2-rfi-ser", "Initial RFI and SER items are logged as required"),
    ],
    "#3f7f35",
  ),
  gateNode(
    "g3-design",
    "Phase 2 · Scope / Responsibility / Design Coordination",
    "G3 · Design & Commercial Alignment",
    "Coordinate design, refine the scope, align the estimate, and confirm the commercial direction before product approval.",
    "Technical Team (BIM / Design) + Commercial",
    [
      rule("g3-design", "Design is sufficiently coordinated"),
      rule("g3-scope", "Scope is clear and the SOW is drafted or refined", [
        signature(
          "g3-sow-doc",
          "SOW",
          "Scope of Work",
          "Technical + Commercial",
        ),
      ]),
      rule(
        "g3-estimate",
        "Progressive estimate is updated from CEC Class D toward C / B",
      ),
      rule(
        "g3-sales-agreement",
        "Sales Agreement is signed or clearly progressing",
        [signature("g3-sa-doc", "SA", "Sales Agreement", "Sales + Commercial")],
      ),
      rule(
        "g3-pdaf",
        "Preliminary Design Approval Form is completed when applicable",
        [
          signature(
            "g3-pdaf-doc",
            "PDAF",
            "Preliminary Design Approval Form",
            "Technical Team",
          ),
        ],
      ),
      rule("g3-rfi-ser", "Open RFI and SER items are controlled"),
    ],
    "#5a8d35",
  ),
  gateNode(
    "g4-product-approval",
    "Phase 3 · Procurement / Production / Delivery",
    "G4 · Product Approval & Purchasing Release",
    "Approve the product selection, confirm funding, and release purchasing inputs.",
    "Commercial + Procurement",
    [
      rule("g4-pso", "Product Sign-Off is approved", [
        signature(
          "g4-pso-doc",
          "PSO",
          "Product Sign-Off Form",
          "Client + Commercial",
        ),
      ]),
      rule("g4-funds", "Required funds and commercial authority are confirmed"),
      rule(
        "g4-inputs",
        "Purchasing inputs, selections, and specifications are ready",
      ),
    ],
    "#d59a00",
  ),
  gateNode(
    "g5-production",
    "Phase 3 · Procurement / Production / Delivery",
    "G5 · Production Release",
    "Confirm production readiness and freeze enough approved information to build.",
    "Production + Procurement",
    [
      rule("g5-prerequisites", "Production prerequisites are complete"),
      rule("g5-permits", "Permits and approvals are acceptable"),
      rule("g5-materials", "Materials and procurement readiness are confirmed"),
      rule("g5-schedule", "Production schedule is ready", [
        signature(
          "g5-mps-doc",
          "MPS",
          "Module Production Schedule",
          "Production + Procurement",
        ),
      ]),
      rule(
        "g5-baseline",
        "Final production baseline is accepted; MQC, MIR, and TRR controls are identified",
      ),
    ],
    "#e97714",
  ),
  gateNode(
    "g6-site-readiness",
    "Phase 3 · Procurement / Production / Delivery",
    "G6 · Shipment & Site Readiness",
    "Confirm module readiness, site readiness, logistics, delivery access, installation planning, and exception controls.",
    "Site Team + Logistics",
    [
      rule("g6-mso", "Module Sign-Off is complete", [
        signature(
          "g6-mso-doc",
          "MSO",
          "Module Sign-Off",
          "Production + Quality",
        ),
      ]),
      rule("g6-module", "Module is ready for shipment"),
      rule(
        "g6-site",
        "Site, crane, access, delivery, and installation logistics are ready",
      ),
      rule(
        "g6-readiness-pack",
        "Shipment and site readiness packet is approved",
        [
          signature(
            "g6-readiness-doc",
            "MDR / MIC / MSI",
            "Delivery, installation, and site inspection readiness packet",
            "Site Team + Logistics",
          ),
        ],
      ),
      rule(
        "g6-field-controls",
        "MALR, WSVR, CCV, damage, delay, and incident controls are assigned",
      ),
    ],
    "#1f5fa7",
  ),
  gateNode(
    "g7-handover",
    "Phase 4 · Closeout / Handover / Warranty",
    "G7 · Final Acceptance & Handover",
    "Complete final inspection, resolve or accept deficiencies, hand over the turnover package, and begin warranty.",
    "Project Manager + Admin / Closeout",
    [
      rule(
        "g7-inspection",
        "Final inspection is complete and deficiencies are resolved or accepted",
      ),
      rule("g7-turnover", "Turnover and as-built package is complete", [
        signature(
          "g7-turnover-doc",
          "DPLR / FIR / ABDP",
          "Deficiency, final inspection, and as-built documentation package",
          "Project Manager + Closeout",
        ),
      ]),
      rule("g7-handover", "Client handover is accepted", [
        signature(
          "g7-handover-doc",
          "PCR / CSHF",
          "Project closeout report and client satisfaction handover form",
          "Client + Project Manager",
        ),
      ]),
      rule("g7-warranty", "Warranty and Maintenance Agreement is signed", [
        signature(
          "g7-wma-doc",
          "WMA",
          "Warranty and Maintenance Agreement",
          "Client + Service",
        ),
      ]),
    ],
    "#6f4a96",
  ),
];

const phaseNodes: DomainNode[] = [
  phaseNode(
    "phase-1",
    "PHASE 1",
    "Sales / Pre-construction / Commitment",
    "#2f6fac",
  ),
  phaseNode(
    "phase-2",
    "PHASE 2",
    "Scope / Responsibility / Design Coordination",
    "#4f8a3f",
  ),
  phaseNode(
    "phase-3",
    "PHASE 3",
    "Procurement / Production / Delivery",
    "#d99a16",
  ),
  phaseNode("phase-4", "PHASE 4", "Closeout / Handover / Warranty", "#70509a"),
];

const terminalNode = referenceNode(
  "project-complete",
  "terminal",
  "Project Complete",
  "Warranty begins after final acceptance and handover.",
  "#5d8f36",
  {},
);

const referenceNodes: DomainNode[] = [
  referenceNode(
    "service-legend",
    "serviceLegend",
    "Service Type Legend",
    "Editable commercial classifications",
    "#52734d",
    {
      items: GATE_SERVICE_TYPES.map((type) => ({
        id: type.id,
        label: type.label,
        color: type.color,
        description: type.description,
      })),
    },
  ),
  referenceNode(
    "approval-matrix",
    "approvalMatrix",
    "Decision / Approval Matrix",
    "Toggle the roles authorized for each action",
    "#334e73",
    {
      columns: ["Sales Team", "Manager (Dept.)", "CRO", "CEO"],
      rows: [
        {
          id: "matrix-loi",
          label: "LOI (No-Cost)",
          approvals: [false, false, true, true],
        },
        {
          id: "matrix-csa",
          label: "CSA / PCS (Within Approved Rate)",
          approvals: [true, true, false, false],
        },
        {
          id: "matrix-sa",
          label: "Sales Agreement (SA)",
          approvals: [false, false, true, true],
        },
        {
          id: "matrix-co-low",
          label: "Change Order (≤ Threshold)",
          approvals: [true, true, false, false],
        },
        {
          id: "matrix-co-high",
          label: "Change Order (> Threshold)",
          approvals: [false, false, true, true],
        },
        {
          id: "matrix-credit",
          label: "Write-Off / Credit (> Threshold)",
          approvals: [false, false, true, true],
        },
      ],
    },
  ),
  referenceNode(
    "job-numbering",
    "jobNumbering",
    "Job Numbering — Current & Future",
    "Editable comparison",
    "#3e6c9d",
    {
      current: [
        "Format: 27xxxx (5 digits)",
        "No clear link to year or type",
        "Shared across entities",
      ],
      proposed: [
        "Primary number: Contract / Client",
        "Secondary number: Project / Module",
        "Clear coding for type, year, region",
        "MasterFormat / coding structure",
      ],
    },
  ),
  referenceNode(
    "control-backbone",
    "controlBackbone",
    "Continuous Control & System Backbone",
    "Controls apply across the complete project lifecycle",
    "#245d88",
    {
      sections: [
        {
          id: "estimate",
          title: "1. Progressive Estimating",
          items: [
            "CEC — Cost Estimate Classification",
            "Class D for early rough pricing",
            "Progressively refined through the project",
          ],
        },
        {
          id: "rfi",
          title: "2. RFI / SER Control",
          items: [
            "RFI — Request for Information",
            "SER — Specification Exception Report",
            "Can occur across multiple stages",
          ],
        },
        {
          id: "change",
          title: "3. Change Control",
          items: [
            "CD / DC — Change Directive",
            "CO — Change Order",
            "CT — Change Tracker",
            "Return approved changes to impacted Gate",
          ],
        },
        {
          id: "document",
          title: "4. Document Control",
          items: [
            "Received date",
            "Revision control",
            "Naming convention",
            "Version history",
            "Archive / backup",
          ],
        },
        {
          id: "time",
          title: "5. Time Tracking",
          items: [
            "Track internal time on free or strategic work",
            "Free to the client does not mean free to the company",
          ],
        },
        {
          id: "system",
          title: "6. System Backbone",
          items: [
            "No work without a Job Number",
            "Lead ID → Project ID → Sub / Module ID",
            "Standardized digital naming",
          ],
        },
      ],
    },
  ),
  referenceNode(
    "responsibility-lane",
    "responsibilityLane",
    "Detailed Workflow & Responsibility Highlights",
    "Role lane aligned to the seven Gates",
    "#476b8d",
    {
      sections: [
        {
          id: "role-g1",
          title: "G1 · Sales Team",
          items: [
            "Lead generation",
            "Opportunity qualification",
            "Client commitment",
          ],
        },
        {
          id: "role-g2",
          title: "G2 · Sales + Technical",
          items: [
            "Information collection",
            "Responsibility Matrix",
            "Scope setup",
          ],
        },
        {
          id: "role-g3",
          title: "G3 · Technical / BIM",
          items: [
            "Design coordination",
            "Commercial alignment",
            "Estimate refinement",
          ],
        },
        {
          id: "role-g4",
          title: "G4 · Commercial + Procurement",
          items: [
            "Product sign-off",
            "Funding confirmation",
            "Purchasing release",
          ],
        },
        {
          id: "role-g5",
          title: "G5 · Production + Procurement",
          items: ["Production readiness", "Schedule", "Quality controls"],
        },
        {
          id: "role-g6",
          title: "G6 · Site Team + Logistics",
          items: ["Shipment", "Site readiness", "Delivery and installation"],
        },
        {
          id: "role-g7",
          title: "G7 · PM + Closeout",
          items: ["Final inspection", "Handover", "Warranty"],
        },
      ],
    },
  ),
  referenceNode(
    "business-rules",
    "businessRules",
    "Key Business Rules",
    "Editable cross-workflow controls",
    "#193f69",
    {
      rules: [
        "Sales owns G1",
        "CSA and PCS are paid services",
        "LOI is a strategic free-service exception and requires CRO / CEO approval",
        "SA may not always be signed early",
        "RM comes before detailed SOW",
        "PSO and funds unlock purchasing",
        "Change control can affect multiple Gates",
        "No work without a Job Number",
      ],
    },
  ),
];

const nodes: DomainNode[] = [
  ...phaseNodes,
  ...gateNodes,
  terminalNode,
];

const edges: DomainEdge[] = [
  edge(
    "approved-g1-g2",
    "g1-opportunity",
    "g2-scope",
    "Approved · Proceed to G2",
    "success",
    "yes",
  ),
  edge(
    "approved-g2-g3",
    "g2-scope",
    "g3-design",
    "Approved · Proceed to G3",
    "success",
    "yes",
  ),
  edge(
    "approved-g3-g4",
    "g3-design",
    "g4-product-approval",
    "Approved · Proceed to G4",
    "success",
    "yes",
  ),
  edge(
    "approved-g4-g5",
    "g4-product-approval",
    "g5-production",
    "Approved · Proceed to G5",
    "success",
    "yes",
  ),
  edge(
    "approved-g5-g6",
    "g5-production",
    "g6-site-readiness",
    "Approved · Proceed to G6",
    "success",
    "yes",
  ),
  edge(
    "approved-g6-g7",
    "g6-site-readiness",
    "g7-handover",
    "Approved · Proceed to G7",
    "success",
    "yes",
  ),
  edge(
    "approved-g7-complete",
    "g7-handover",
    "project-complete",
    "Approved · Project complete / Warranty begins",
    "success",
    "yes",
  ),
  edge(
    "denied-g1",
    "g1-opportunity",
    "g1-opportunity",
    "Denied · Return to Sales / Archive / Hold",
    "rework",
    "no",
  ),
  edge(
    "denied-g2-g1",
    "g2-scope",
    "g1-opportunity",
    "Denied · Information collection / Scope clarification",
    "rework",
    "no",
  ),
  edge(
    "denied-g3-g2",
    "g3-design",
    "g2-scope",
    "Denied · Design revision / RFI / SER / Commercial clarification",
    "rework",
    "no",
  ),
  edge(
    "denied-g4-g3",
    "g4-product-approval",
    "g3-design",
    "Denied · Product selection / Client sign-off / Funding",
    "rework",
    "no",
  ),
  edge(
    "denied-g5-g4",
    "g5-production",
    "g4-product-approval",
    "Denied · PM / Technical / Procurement / Permit / Schedule",
    "rework",
    "no",
  ),
  edge(
    "denied-g6-g5",
    "g6-site-readiness",
    "g5-production",
    "Denied · Return to G5",
    "rework",
    "no",
  ),
  edge(
    "denied-g7-g6",
    "g7-handover",
    "g6-site-readiness",
    "Denied · Deficiency correction / Final inspection / Turnover completion",
    "rework",
    "no",
  ),
];

const phaseChildren: Record<string, string[]> = {
  "phase-1": ["g1-opportunity", "g2-scope"],
  "phase-2": ["g3-design"],
  "phase-3": ["g4-product-approval", "g5-production", "g6-site-readiness"],
  "phase-4": ["g7-handover", "project-complete"],
};
const layoutNodes: WorkflowFile["layout"]["nodes"] = {};
let phaseX = 64;
let tallestPhase = 0;
for (const phase of phaseNodes) {
  const childIds = phaseChildren[phase.id];
  let childX = 40;
  let childBottom = 0;
  for (const childId of childIds) {
    const child = nodes.find((item) => item.id === childId)!;
    const size = getAdaptiveNodeSize(child);
    layoutNodes[childId] = {
      nodeId: childId,
      x: childX,
      y: PHASE_CONTENT_TOP,
      width: size.width,
      height: size.height,
      parentId: phase.id,
      zIndex: 1,
    };
    childX += size.width + 120;
    childBottom = Math.max(childBottom, PHASE_CONTENT_TOP + size.height);
  }
  const width = childX - 80;
  const height = childBottom + 42;
  layoutNodes[phase.id] = {
    nodeId: phase.id,
    x: phaseX,
    y: 64,
    width,
    height,
    zIndex: -1,
  };
  phaseX += width + 96;
  tallestPhase = Math.max(tallestPhase, height);
}
let referenceY = tallestPhase + 300;
for (const node of referenceNodes) {
  const size = getAdaptiveNodeSize(node);
  layoutNodes[node.id] = {
    nodeId: node.id,
    x: 64,
    y: referenceY,
    width: size.width,
    height: size.height,
  };
  referenceY += size.height + 72;
}

const now = new Date().toISOString();

export const DEMO_WORKFLOW: WorkflowFile = {
  graph: {
    schemaVersion: 1,
    metadata: {
      name: "PROFAB Project Workflow — 4 Phases / 7 Gates",
      version: "v1.0-draft",
      status: "Draft",
      createdAt: now,
      updatedAt: now,
      notes:
        "Editable workflow reconstructed from the provided process overview and operational logic map. Approver names intentionally remain blank until assigned.",
    },
    nodes,
    edges,
    rules: [
      {
        id: "required-gate-fields",
        name: "Gate titles are required",
        enabled: true,
        severity: "error",
        kind: "requiredField",
        nodeType: "gate",
        field: "title",
      },
      {
        id: "gate-outgoing",
        name: "Every gate requires an outgoing route",
        enabled: true,
        severity: "warning",
        kind: "requireOutgoing",
        nodeType: "gate",
      },
      {
        id: "cycles-allowed",
        name: "Rework cycles are allowed",
        enabled: false,
        severity: "warning",
        kind: "disallowCycles",
      },
    ],
  },
  layout: {
    nodes: layoutNodes,
    viewport: { x: 0, y: 0, zoom: 0.2 },
    snapToGrid: true,
    gridSize: 16,
  },
};
