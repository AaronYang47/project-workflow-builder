export const NODE_TYPES = [
  "general",
  "projectStart",
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
  /** The L3 form that supplies evidence for this release condition. */
  linkedExecutionItemId?: string;
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
  };
}

export const EDITABLE_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "date",
  "number",
  "select",
  "checkbox",
] as const;
export type EditableFormFieldType = (typeof EDITABLE_FORM_FIELD_TYPES)[number];

/** A user-editable field definition used by custom L3 forms. */
export interface EditableFormField {
  id: string;
  label: string;
  type: EditableFormFieldType;
  required: boolean;
  section: string;
  placeholder?: string;
  help?: string;
  options?: string[];
}

/** Per-execution-item overrides layered over the controlled ProFab register. */
export interface ExecutionFormOverrides {
  title?: string;
  description?: string;
  /** Existing fields are overridden by id; unknown ids are appended. */
  fields?: EditableFormField[];
  /** Controlled fields can be explicitly removed for this execution item. */
  removedFieldIds?: string[];
}


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
  /** Optional user-defined badge shown on the High-Level node. */
  code?: string;
  /** Optional glass tint, stored as a hex value or the transparent preset. */
  backgroundColor?: string;
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

export const EXECUTION_APPLICABILITY = [
  "Required",
  "Conditional",
  "Triggered",
  "Optional",
  "Supporting",
  "Not Applicable",
] as const;
export type ExecutionApplicability =
  (typeof EXECUTION_APPLICABILITY)[number];

export const EXECUTION_APPLICABILITY_DETERMINATIONS = [
  "Pending",
  "Applicable",
  "Not Applicable",
] as const;
export type ExecutionApplicabilityDetermination =
  (typeof EXECUTION_APPLICABILITY_DETERMINATIONS)[number];

export type ExecutionFormValue = string | boolean;

export interface ExecutionFormSnapshot {
  capturedAt: string;
  authorizationState: "Executed" | "Approved" | "Executed & Approved";
  documentRevision: string;
  /** Materialized values include canonical operational bindings and computed
   * fields, so the signed/approved record can be compared with later edits. */
  values: Record<string, ExecutionFormValue>;
}

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
  /** Stable controlled-document identifier from the ProFab form register. */
  catalogId?: string;
  /** Controlled index number, for example 2.10 or 5.11. */
  documentNumber?: string;
  documentCode?: string;
  documentRevision?: string;
  documentLanguage?: "English" | "French" | "Bilingual";
  sourceReference?: string;
  sourceAvailability?: "Included" | "Index Only" | "Supplemental";
  applicability?: ExecutionApplicability;
  applicabilityDetermination?: ExecutionApplicabilityDetermination;
  applicabilityReason?: string;
  formValues?: Record<string, ExecutionFormValue>;
  /** Local form customizations layered over the controlled form register. */
  formOverrides?: ExecutionFormOverrides;
  formSnapshot?: ExecutionFormSnapshot;
  /** A controlled snapshot becomes stale when a bound operational value or
   * local form value changes after execution/approval. */
  formStale?: boolean;
  formStaleFieldIds?: string[];
  /**
   * File-only completion used by L2 nodes. These nodes do not expose an
   * editable L3 form; checking the required file is their completion action.
   */
  checklistComplete?: boolean;
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
  operations?: import("@/types/project-operations").ProjectOperations;
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
