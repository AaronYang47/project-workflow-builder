export const APPROVAL_ROLES = [
  "Coordinator",
  "Project Manager",
  "Estimator",
  "Engineering",
  "Finance",
  "CRO",
  "CEO",
  "Client",
] as const;

export type ApprovalRole = (typeof APPROVAL_ROLES)[number];
export type EstimateClass = "D" | "C" | "B" | "A";

export interface ApprovalRequest {
  id: string;
  kind: string;
  reference?: string;
  amount: number;
  contractPercent: number;
  cumulativeCreditAmount: number;
  requiredRole: ApprovalRole;
  requestedBy: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
  decidedBy?: string;
  decidedByRole?: ApprovalRole | "";
  decidedAt?: string;
  evidence?: string | string[];
  reason?: string;
}

export interface QualificationQuestion {
  id: string;
  order: number;
  prompt: string;
  answer: "Yes" | "No" | "Unknown" | "";
  evidence: string;
  gateRequired: boolean;
}

export interface PaymentMilestone {
  id: string;
  label: string;
  percent: number;
  status: string;
  invoiceId: string;
  dueDate?: string;
}

export interface CommercialInvoice {
  id: string;
  invoiceNumber: string;
  milestoneId: string;
  issuedDate: string;
  dueDate: string;
  amount: number;
  status: string;
  evidenceReference: string;
}

export interface CommercialReceipt {
  id: string;
  receiptNumber?: string;
  invoiceId: string;
  receivedDate?: string;
  amount: number;
  method?: string;
  evidenceReference?: string;
  verifiedBy?: string;
}

export interface DesignBoundary {
  deliveryModel: "Unselected" | "ProFab Design" | "Client Design / ProFab Consultation" | string;
  architectOfRecord: string;
  profabScope: string;
  clientConsultantScope: string;
  exclusions: string;
  boundaryAccepted: boolean;
  acceptedByClient: string;
  acceptedAt: string;
  agreementReference: string;
  [key: string]: unknown;
}

export type SecondaryGateStatus = "Blocked" | "In Progress" | "Ready" | "Passed" | "Not Applicable";

export interface SecondaryGate {
  id: string;
  label: string;
  ownerParty: string;
  responsiblePerson: string;
  requiredEvidence: string[];
  evidenceReferences: string[];
  targetDate: string;
  status: SecondaryGateStatus;
  approvedBy: string;
  approvedAt?: string;
  naReason?: string;
  [key: string]: unknown;
}

export interface EstimateAssembly {
  id: string;
  assembly: string;
  masterFormat?: string;
  unit?: string;
  quantity: number;
  rate: number;
  wastePercent?: number;
  included: boolean;
  [key: string]: unknown;
}

export interface ConvergenceTask {
  id: string;
  fromClass: EstimateClass;
  toClass: EstimateClass;
  status: "Not Started" | "In Progress" | "Complete";
  evidence: string;
  owner: string;
}

export interface EstimateVersion {
  id: string;
  version: number;
  estimateClass: EstimateClass | string;
  amount: number;
  status: "Draft" | "Current" | "Superseded" | "Approved";
  createdBy: string;
  sourceRevision: string;
  createdAt: string;
  basisStage?: "Concept" | "Preliminary" | "Permit" | "IFC" | string;
  accuracyRangeLowPercent?: number;
  accuracyRangeHighPercent?: number;
  contingencyPercent?: number;
  assumptions?: string[];
  approvedAt?: string;
  approvedBy?: string;
  [key: string]: unknown;
}

export interface ProductionActivity {
  id: string;
  name: string;
  owner: string;
  predecessorIds: string[];
  baselineStart: string;
  baselineFinish: string;
  forecastStart: string;
  forecastFinish: string;
  actualStart: string;
  actualFinish: string;
  percentComplete: number;
  capacityHours: number;
  requiredHours: number;
  critical: boolean;
  status: string;
  [key: string]: unknown;
}

export interface WarrantyFollowUp {
  id: string;
  offsetDays: number;
  dueDate: string;
  owner: string;
  escalationOwner: string;
  status: "Scheduled" | "Due" | "Overdue" | "Complete";
  completedAt?: string;
}

export interface TimeEntry {
  id: string;
  user: string;
  date: string;
  projectNumber: string;
  activity: string;
  hours: number;
  billable: boolean;
  source: "Manual" | "ICS" | string;
  sourceReference: string;
  notes: string;
}

export interface BimObjectResponsibility {
  id: string;
  objectName: string;
  discipline: string;
  masterFormatCode: string;
  cnmsCode: string;
  gpfName: string;
  modelReference: string;
  navisworksSet: string;
  stitchSequence: number;
  designOwner: string;
  procurementOwner: string;
  productionOwner: string;
  installOwner: string;
  status: string;
  [key: string]: unknown;
}

export interface ProjectOperations {
  updatedAt: string;
  identity: {
    clientId: string;
    leadId: string;
    projectNumber: string;
    lifecycleState: string;
    [key: string]: any;
  };
  qualification: QualificationQuestion[];
  clientPath: {
    clientType: string;
    selectedSubGates: string[];
    classificationReason: string;
    relationship?: string;
    designMaturity?: string;
    siteMaturity?: string;
    fundingMaturity?: string;
    classifiedAt?: string;
    classifiedBy?: string;
    [key: string]: any;
  };
  commercial: {
    currency: string;
    contractValue: number;
    engagementType: string;
    agreementStatus: string;
    agreementReference: string;
    executedDate: string;
    paymentPlan: PaymentMilestone[];
    invoices: CommercialInvoice[];
    receipts: CommercialReceipt[];
    paymentRelease: {
      id: string;
      status: string;
      evidence: string | string[];
      releasedAt?: string;
      releasedBy?: string;
      approverRole?: ApprovalRole | "";
      reasons: string[];
      [key: string]: any;
    };
    [key: string]: any;
  };
  approvals: { requests: ApprovalRequest[]; [key: string]: any };
  designBoundary: DesignBoundary;
  siteReadiness: { gates: SecondaryGate[]; [key: string]: any };
  estimating: {
    inputs: Record<string, number | string>;
    assemblies: EstimateAssembly[];
    calculatedClassDAmount: number;
    versions: EstimateVersion[];
    convergenceTasks: ConvergenceTask[];
    [key: string]: any;
  };
  warranty: {
    dayZeroDate: string;
    durationMonths: number;
    expiryDate: string;
    owner: string;
    triggerEvidence: string;
    followUps: WarrantyFollowUp[];
    [key: string]: any;
  };
  production: {
    factoryWeeklyCapacityHours: number;
    committedWeeklyCapacityHours: number;
    procurementUnlocked: boolean;
    productionStartAuthorized: boolean;
    activities: ProductionActivity[];
    [key: string]: any;
  };
  timeBudget: {
    budgetHours: number;
    warningThresholdPercent: number;
    criticalThresholdPercent: number;
    entries: TimeEntry[];
    [key: string]: any;
  };
  bim: {
    gpfPattern: string;
    objects: BimObjectResponsibility[];
    [key: string]: any;
  };
  spec: Record<string, any>;
  audit: Array<Record<string, unknown>>;
  [key: string]: any;
}
