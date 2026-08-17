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

export interface ComponentNotePost {
  id: string;
  topic: string;
  body: string;
  createdAt: string;
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
export interface WorkflowFile {
  graph: WorkflowGraph;
  layout: CanvasLayout;
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
