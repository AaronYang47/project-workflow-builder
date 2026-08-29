export const NODE_TYPES = [
  "general",
  "projectStart",
  "opportunityValidation",
  "start",
  "end",
  "phase",
  "gate",
  "activity",
  "decision",
  "handoff",
  "document",
  "documentGroup",
  "approval",
  "commercialRule",
  "continuousControl",
  "exception",
  "risk",
  "note",
  "systemRule",
  "approvalMatrix",
  "controlBackbone",
  "responsibilityLane",
  "serviceLegend",
  "jobNumbering",
  "businessRules",
  "terminal",
] as const;
export type WorkflowNodeType = (typeof NODE_TYPES)[number];

// Reference / decorative node types: rendered by `ReferenceNode`, sized via
// `ReferenceConfig`, and excluded from connectivity rules.
export const REFERENCE_NODE_TYPES = [
  "approvalMatrix",
  "controlBackbone",
  "responsibilityLane",
  "serviceLegend",
  "jobNumbering",
  "businessRules",
  "terminal",
] as const satisfies readonly WorkflowNodeType[];
export type ReferenceNodeType = (typeof REFERENCE_NODE_TYPES)[number];

// Reference types that existed in earlier file formats and are removed during
// migration. Differs from `REFERENCE_NODE_TYPES` by excluding `terminal`
// (still valid in the current schema).
export const LEGACY_REFERENCE_NODE_TYPES = [
  "approvalMatrix",
  "controlBackbone",
  "responsibilityLane",
  "serviceLegend",
  "jobNumbering",
  "businessRules",
] as const satisfies readonly WorkflowNodeType[];

export const isReferenceNodeType = (
  type: WorkflowNodeType,
): type is ReferenceNodeType =>
  (REFERENCE_NODE_TYPES as readonly WorkflowNodeType[]).includes(type);

export const EDGE_TYPES = [
  "normal",
  "success",
  "failure",
  "hold",
  "rework",
  "dependency",
  "supporting",
  "exception",
  "approval",
  "reopen",
] as const;
export type WorkflowEdgeType = (typeof EDGE_TYPES)[number];
export type WorkflowStatus = "Draft" | "In Review" | "Approved" | "Archived";

export interface OutcomeHandle {
  id: string;
  label: string;
  edgeType: WorkflowEdgeType;
  color?: string;
  enabled?: boolean;
  rule?: string;
}
export type RequirementType = "Required" | "Optional";
export interface RevisionRecord {
  id: string;
  revision: string;
  receivedDate: string;
  department: string;
  modifiedBy: string;
  status: "Current" | "Superseded";
}
export interface GateSignatureRequirement {
  id: string;
  abbreviation: string;
  fullName: string;
  department: string;
  signedBy: string;
  checked: boolean;
  requirementType?: RequirementType;
  owner?: string;
  receivedDate?: string;
  revision?: string;
  status?: string;
  serviceType?: string;
  revisionControlled?: boolean;
  revisions?: RevisionRecord[];
  collapsed?: boolean;
}
export interface GateRule {
  id: string;
  label: string;
  checked: boolean;
  signatures?: GateSignatureRequirement[];
  requirementType?: RequirementType;
  condition?: string;
  serviceTypeId?: string;
  buildingCode?: string;
  moduleCode?: string;
}
export interface ReferenceSection {
  id: string;
  title: string;
  items: string[];
}
export interface ReferenceTableRow {
  id: string;
  label: string;
  approvals: boolean[];
}
export interface ReferenceLegendItem {
  id: string;
  label: string;
  color: string;
  description?: string;
}
export interface ReferenceConfig {
  columns?: string[];
  rows?: ReferenceTableRow[];
  sections?: ReferenceSection[];
  items?: ReferenceLegendItem[];
  current?: string[];
  proposed?: string[];
  rules?: string[];
}
export interface DocumentConfig {
  abbreviation: string;
  fullName: string;
  purpose: string;
  owner: string;
  requirementType: "Required" | "Optional";
  requiresApproval: boolean;
  requiresSignature: boolean;
  status: string;
  revisionControlled: boolean;
}
export interface Condition {
  id?: string;
  label?: string;
  required?: boolean;
  checked?: boolean;
  locked?: boolean;
  expression?: string;
  description?: string;
}

export interface DomainNode {
  id: string;
  type: WorkflowNodeType;
  title: string;
  description: string;
  color?: string;
  icon?: string;
  metadata: Record<string, string>;
  conditions: Condition[];
  documents: string[];
  criteria: string[];
  customFields: Record<string, string | number | boolean>;
  config: Record<string, unknown> & {
    stage?: string;
    iconKey?: string;
    outcomes?: OutcomeHandle[];
    gateRules?: GateRule[];
    signatureRequirements?: GateSignatureRequirement[];
    approvedDepartment?: string;
    approvedBy?: string;
    gateLabel?: string;
    decisionMode?: "approval" | "binary";
    gateIconKey?: string;
    gateHeaderColor?: string;
    gateTitleColor?: string;
    conditionsTitle?: string;
    conditionsSubtitle?: string;
    checklistTitle?: string;
    checklistHint?: string;
    conditionLabel?: string;
    addConditionLabel?: string;
    documentsLabel?: string;
    addDocumentLabel?: string;
    decisionTitle?: string;
    decisionSubtitle?: string;
    departmentLabel?: string;
    approverLabel?: string;
    detailsNeededLabel?: string;
    document?: DocumentConfig;
    reference?: ReferenceConfig;
    componentNotes?: Record<string, ComponentNote>;
    collapsed?: boolean;
    locked?: boolean;
    serviceType?: string;
    buildingCode?: string;
    moduleCode?: string;
    paidServiceType?: unknown;
    /** Optional role for the decomposed Opportunity screening workspace. */
    opportunityRole?: "decisionHub";
    /** Optional evidence area rendered by an Opportunity section node. */
    opportunitySection?: "client" | "project" | "site" | "design" | "commercial" | "team";
    opportunityParentId?: string;
    /** Stable child ids created by the reversible Opportunity split action. */
    opportunitySectionNodeIds?: string[];
    opportunity?: OpportunityValidationConfig;
  };
}

export interface OpportunityValidationConfig {
  /** Stable child ids created by the reversible Opportunity split action. */
  opportunitySectionNodeIds?: string[];
  /**
   * The structured intake is the source of truth for the screening workspace.
   * The fields below it are retained solely to open older persisted workflows safely.
   */
  intake?: OpportunityIntake;
  evaluation?: OpportunityEvaluationSnapshot;

  /** Per-workflow business settings. Undefined values use the deterministic defaults. */
  businessRules?: OpportunityBusinessRuleConfig;

  // Legacy V1 questionnaire fields — intentionally retained for migration compatibility.
  companyName?: string;
  contactPerson?: string;
  leadSource?: string;
  contactPhone?: string;
  contactEmail?: string;
  decisionMakerName?: string;
  decisionMakerRole?: string;
  decisionMakerConfirmed?: boolean;
  decisionMakerNotes?: string;

  clientTierType?: "Standard" | "Returning" | "Trusted" | "Strategic";

  projectIntent?: string;
  projectLocation?: string;
  storeys?: number | string;
  grossFloorArea?: number | string;
  unitCount?: number | string;

  siteStatus?: "Owned" | "Under Option" | "Searching" | "Unresolved";
  siteAddress?: string;
  siteConstraints?: string;
  designStage?:
    | "Level 0: No Plans"
    | "Level 1: Concept"
    | "Level 2: Preliminary"
    | "Level 3: Permit Set"
    | "Level 4: Permit Issued";

  clientBudget?: string;
  budgetScope?: "Turnkey Total" | "Modular Scope Only";
  targetCostPerSqFt?: string;
  fundingSource?:
    | "Equity"
    | "Commercial Loan"
    | "Government Grant"
    | "Financing Program"
    | "TBD";
  fundingSecured?: boolean;
  targetTimeline?: string;

  consultantsInfo?: string;
  modularFitPassed?: boolean;
  realityCheckStatus?: "passed" | "failed" | "pending";

  opportunityScore?: number;
  opportunityGrade?: "P1" | "P2" | "P3" | "P4" | "P5";

  ownerType?:
    | "Project-Ready"
    | "Design-Needed"
    | "Site-Unresolved"
    | "Concept-Stage"
    | "Permit-Ready";
  gapMitigationNotes?: string;

  riskTags?: Array<
    | "Financing-Dependent"
    | "Accelerated-Schedule"
    | "Non-Standard-Grid"
    | "Zoning-Unconfirmed"
    | "High-Cost-Variance"
  >;

  loiConfig?: {
    scopeSummary?: string;
    maxDays?: number;
    maxHours?: number;
    reviewDate?: string;
    conversionTrigger?: string;
    isConvertedToPaid?: boolean;
  };

  gateConditions?: Array<{
    id: string;
    label: string;
    type: "Mandatory" | "Conditional" | "Optional";
    satisfied: boolean;
    note?: string;
  }>;

  hardGateOverride?: boolean;

  engagementPath?:
    | "CSA"
    | "PCS"
    | "LOI"
    | "Paid Feasibility"
    | "Direct Technical Review"
    | "Decline / No-Go";
  engagementStatus?: "Draft" | "Out for Signature" | "Executed";

  decisionOutcome?:
    | "pass-p1-p2"
    | "csa-pcs"
    | "loi-governed"
    | "path-loi"
    | "class-d"
    | "consultation-csa"
    | "pcs"
    | "governed-loi"
    | "technical-review"
    | "site-feasibility"
    | "hold-rework"
    | "nogo-disqualified"
    | "draft"
    | "pass"
    | "hold"
    | "nogo";
}

export type KnownStatus = "Yes" | "No" | "Unknown";

export interface OpportunityStakeholder {
  id: string;
  name?: string;
  role?: string;
  organization?: string;
  email?: string;
  phone?: string;
  decisionRole?:
    | "Final Decision Maker"
    | "Financial Approver"
    | "Technical Approver"
    | "Project Lead"
    | "Owner / Partner"
    | "Board / Committee"
    | "Consultant"
    | "Influencer"
    | "Other";
}

export interface OpportunityTeamMember {
  id: string;
  name?: string;
  company?: string;
  role?:
    | "Architect"
    | "Structural Engineer"
    | "Mechanical Engineer"
    | "Electrical Engineer"
    | "Civil Engineer"
    | "Geotechnical"
    | "General Contractor"
    | "Construction Manager"
    | "Project Manager"
    | "Quantity Surveyor"
    | "Municipality"
    | "Owner Representative"
    | "Financing Contact"
    | "Other";
  email?: string;
  phone?: string;
  status?: "Engaged" | "Proposed" | "TBD" | "Not Required" | "Unknown";
}

export interface OpportunityIntake {
  clientAuthority?: {
    clientName?: string;
    clientType?: string;
    primaryContactName?: string;
    primaryContactRole?: string;
    email?: string;
    phone?: string;
    decisionAuthorityStatus?: "Confirmed" | "Partially Confirmed" | "Unknown";
    finalDecisionAuthorityIdentified?: KnownStatus;
    requiredDecisionPartiesIdentified?: KnownStatus;
    approvalPath?: string;
    notes?: string;
    clientRelationship?: "Standard" | "Returning" | "Trusted" | "Strategic";
    stakeholders?: OpportunityStakeholder[];
  };
  projectDefinition?: {
    projectName?: string;
    projectType?: string;
    buildingCount?: string;
    storeys?: string;
    grossFloorArea?: string;
    unitsRoomsBeds?: string;
    buildingDimensions?: string;
    estimatedModuleCount?: string;
  };
  siteLand?: {
    siteStatus?: string;
    siteAddress?: string;
    municipality?: string;
    province?: string;
    candidateSiteCount?: string;
    siteOwner?: string;
    siteControlNotes?: string;
    zoningKnown?: KnownStatus;
    servicingKnown?: KnownStatus;
    accessKnown?: KnownStatus;
    foundationConceptKnown?: KnownStatus;
    craneSettingAccessKnown?: KnownStatus;
    transportationConstraintsKnown?: KnownStatus;
    fatalConstraintConfirmed?: boolean;
    fatalConstraintResolvable?: KnownStatus;
  };
  design?: {
    designMaturity?: string;
    drawingPackageAvailable?: KnownStatus;
    drawingRevision?: string;
    drawingDate?: string;
    architectIdentified?: KnownStatus;
    designNotes?: string;
    modularCompatibilityStatus?: string;
    reviewedBy?: "Sales Preliminary" | "Technical" | "Engineering" | "Not Reviewed";
    geometryModularFriendly?: KnownStatus | "Technical Review Required";
    transportableGeometryLikelyFeasible?: KnownStatus | "Technical Review Required";
    siteAccessLikelyFeasible?: KnownStatus | "Technical Review Required";
    craneSettingConceptFeasible?: KnownStatus | "Technical Review Required";
    structuralConceptCompatible?: KnownStatus | "Technical Review Required";
    majorDesignConversionLikely?: KnownStatus | "Technical Review Required";
    viableCorrectivePath?: KnownStatus;
  };
  budgetFundingTimeline?: {
    clientBudgetProvided?: KnownStatus;
    clientBudgetAmount?: string;
    clientBudgetRangeLow?: string;
    clientBudgetRangeHigh?: string;
    budgetBasis?: string;
    classDAvailable?: KnownStatus;
    classDAmount?: string;
    classDDate?: string;
    classDRevision?: string;
    fundingStatus?: string;
    targetDesignStart?: string;
    targetPermit?: string;
    targetConstructionStart?: string;
    targetProduction?: string;
    targetDelivery?: string;
    targetOccupancy?: string;
    timelineStatus?: "Realistic" | "Aggressive" | "Unrealistic" | "Unknown" | "Requires Review";
  };
  teamCommitment?: {
    members?: OpportunityTeamMember[];
    clientAttendedMeetings?: KnownStatus;
    clientProvidedDocuments?: KnownStatus;
    clientProvidedBudget?: KnownStatus;
    clientAssignedProjectContact?: KnownStatus;
    clientEngagedConsultants?: KnownStatus;
    clientRequestedFormalNextStep?: KnownStatus;
    clientAcceptedPaidEarlyWork?: KnownStatus;
    clientRespondsToRequests?: KnownStatus;
  };
}

export interface OpportunityBusinessRuleConfig {
  scoreWeights?: Partial<Record<"authority" | "project" | "site" | "design" | "modular" | "budget" | "fundingTimeline" | "teamCommitment", number>>;
  scoreGradeThresholds?: { strong?: number; moderate?: number; weak?: number };
  budgetAlignmentTolerancePercent?: number;
  governedLoiAllowed?: boolean;
  commercialEngagement?: "Complete" | "Incomplete" | "Blocked";
}

export interface OpportunityEvaluationSnapshot {
  rules?: OpportunityRuleResult[];
  eligibility?: OpportunityEligibility[];
  recommendedRoute?: OpportunityRoute;
  otherEligibleRoutes?: OpportunityRoute[];
  score?: { value: number; grade: "Strong" | "Moderate" | "Weak" | "High Risk"; breakdown: Record<string, number> };
  overallStatus?: OpportunityOverallStatus;
  requiredActions?: string[];
  riskFlags?: string[];
  evaluatedAt?: string;
}

export type OpportunityRuleCategory = "HARD" | "CONDITIONAL" | "RISK";
export type OpportunityRuleSeverity = "HOLD" | "BLOCK" | "NO_GO" | "WARNING" | "ACTION" | "INFO";
export interface OpportunityRuleDefinition {
  id: string;
  name: string;
  category: OpportunityRuleCategory;
  severity: OpportunityRuleSeverity;
  condition: string;
  outcome: string;
  message: string;
  recommendedAction?: string;
  enabled: boolean;
}
export interface OpportunityRuleResult {
  id: string;
  name: string;
  category: OpportunityRuleCategory;
  severity: OpportunityRuleSeverity;
  /** Stable, human-readable condition that produced this result. */
  condition?: string;
  outcome: string;
  message: string;
  recommendedAction?: string;
  enabled?: boolean;
}
export type OpportunityEligibilityStatus = "ELIGIBLE" | "CONDITIONALLY_ELIGIBLE" | "NOT_YET_ELIGIBLE" | "NOT_ELIGIBLE";
export interface OpportunityEligibility {
  key: "CLASS_D" | "CONSULTATION_CSA" | "PCS" | "GOVERNED_LOI" | "TECHNICAL_REVIEW" | "TECHNICAL_HANDOFF" | "PRE_CONSTRUCTION" | "HOLD";
  label: string;
  status: OpportunityEligibilityStatus;
  reasons: string[];
}
export type OpportunityRoute = "CLASS_D" | "CONSULTATION_CSA" | "PCS" | "GOVERNED_LOI" | "TECHNICAL_REVIEW" | "HOLD_PREQUALIFICATION" | "NO_GO_ARCHIVE";
export type OpportunityOverallStatus = "NO-GO" | "HOLD" | "BLOCKED" | "TECHNICAL REVIEW REQUIRED" | "ACTION REQUIRED" | "READY";

export interface ComponentNotePost {
  id: string;
  topic: string;
  body: string;
  createdAt: string;
  parentId?: string;
}

export interface ComponentNote {
  posts: ComponentNotePost[];
}

export interface DomainEdge {
  id: string;
  type: WorkflowEdgeType;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: Condition;
  lineStyle: "solid" | "dashed" | "dotted";
  arrowStyle: "arrow" | "closed" | "none";
  customFields: Record<string, string | number | boolean>;
}

export interface WorkflowMetadata {
  name: string;
  version: string;
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  notes: string;
}
export interface WorkflowGraph {
  schemaVersion: 1;
  metadata: WorkflowMetadata;
  nodes: DomainNode[];
  edges: DomainEdge[];
  rules: ValidationRule[];
}

export interface NodeLayout {
  nodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  zIndex?: number;
}
export interface EdgeRoutePoint {
  x: number;
  y: number;
}
export interface EdgeLayout {
  edgeId: string;
  points: EdgeRoutePoint[];
}
export interface CanvasLayout {
  nodes: Record<string, NodeLayout>;
  edges?: Record<string, EdgeLayout>;
  viewport: { x: number; y: number; zoom: number };
  snapToGrid: boolean;
  gridSize: number;
}

export const HIGH_LEVEL_NODE_TYPES = [
  "start",
  "phase",
  "primaryGate",
  "end",
] as const;
export type HighLevelNodeType = (typeof HIGH_LEVEL_NODE_TYPES)[number];

export interface HighLevelNode {
  id: string;
  type: HighLevelNodeType;
  title: string;
  description: string;
  linkedDetailedNodeIds?: string[];
  linkedLayer2NodeIds?: string[];
}

export interface HighLevelEdge {
  id: string;
  source: string;
  target: string;
}

export interface HighLevelGraph {
  nodes: HighLevelNode[];
  edges: HighLevelEdge[];
}

export interface HighLevelNodeLayout {
  nodeId: string;
  x: number;
  y: number;
}

export interface HighLevelLayout {
  nodes: Record<string, HighLevelNodeLayout>;
  viewport: { x: number; y: number; zoom: number };
}

export interface HighLevelWorkflow {
  graph: HighLevelGraph;
  layout: HighLevelLayout;
}

export const createEmptyHighLevelWorkflow = (): HighLevelWorkflow => ({
  graph: {
    nodes: [],
    edges: [],
  },
  layout: {
    nodes: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  },
});

export const EXECUTION_ITEM_TYPES = [
  "Document",
  "Agreement",
  "Approval",
  "Task",
  "Evidence",
] as const;
export type ExecutionItemType = (typeof EXECUTION_ITEM_TYPES)[number];

export const EXECUTION_ITEM_STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "Blocked",
  "Passed",
] as const;
export type ExecutionItemStatus = (typeof EXECUTION_ITEM_STATUSES)[number];

export const EXECUTION_SIGNATURE_STATUSES = [
  "Not Required",
  "Pending",
  "Partially Signed",
  "Signed",
  "Rejected",
] as const;
export type ExecutionSignatureStatus =
  (typeof EXECUTION_SIGNATURE_STATUSES)[number];

export const EXECUTION_APPROVAL_STATUSES = [
  "Pending",
  "Approved",
  "Rejected",
] as const;
export type ExecutionApprovalStatus =
  (typeof EXECUTION_APPROVAL_STATUSES)[number];

export const EXECUTION_TASK_STATUSES = [
  "Not Started",
  "In Progress",
  "Complete",
  "Blocked",
] as const;
export type ExecutionTaskStatus = (typeof EXECUTION_TASK_STATUSES)[number];

export interface ExecutionItem {
  id: string;
  linkedLayer2NodeId: string;
  type: ExecutionItemType;
  title: string;
  description: string;
  required: boolean;
  status: ExecutionItemStatus;
  signatureRequired: boolean;
  approvalRequired: boolean;
  responsibleRole: string;
  dueDate: string;
  notes: string;
  signatureStatus?: ExecutionSignatureStatus;
  signers?: string[];
  approvalStatus?: ExecutionApprovalStatus;
  taskStatus?: ExecutionTaskStatus;
}

export interface ExecutionLayer {
  items: ExecutionItem[];
}

export const createEmptyExecutionLayer = (): ExecutionLayer => ({
  items: [],
});

export interface WorkflowFile {
  graph: WorkflowGraph;
  layout: CanvasLayout;
  highLevel?: HighLevelWorkflow;
  execution?: ExecutionLayer;
}

export type ValidationSeverity = "error" | "warning" | "info";
export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}
export interface ValidationRule {
  id: string;
  name: string;
  enabled: boolean;
  severity: ValidationSeverity;
  kind: "requiredField" | "disallowCycles" | "requireOutgoing";
  nodeType?: WorkflowNodeType;
  field?: string;
}
