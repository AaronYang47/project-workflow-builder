import type {
  EditableFormField,
  ExecutionApplicability,
  ExecutionItem,
  ExecutionItemType,
} from "@/types/workflow";

export type ProfabFormFieldType =
  | "text"
  | "textarea"
  | "date"
  | "number"
  | "select"
  | "checkbox";

export type ProfabFormComputedValue =
  | "canonical-file-number"
  | "class-d-total"
  | "warranty-expiry"
  | "change-approval-role"
  | "capacity-utilization"
  | "project-lifecycle-state";

export interface ProfabFormFieldCondition {
  source: "form" | "operations";
  key: string;
  operator:
    | "equals"
    | "not-equals"
    | "one-of"
    | "truthy"
    | "falsy"
    | "greater-than";
  value?: string | number | boolean | Array<string | number | boolean>;
}

export interface ProfabFormFieldDefinition {
  id: string;
  label: string;
  type: ProfabFormFieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  section: string;
  origin: "common" | "profile" | "specific";
  /** Canonical path inside WorkflowFile.operations. Draft edits are mirrored
   * to this path so every L3 form reads the same operational fact. */
  bindingPath?: string;
  bindingValueType?: "string" | "number" | "boolean";
  computed?: ProfabFormComputedValue;
  readOnly?: boolean;
  requiredWhen?: ProfabFormFieldCondition | ProfabFormFieldCondition[];
  visibleWhen?: ProfabFormFieldCondition | ProfabFormFieldCondition[];
}

type FormProfile =
  | "presentation"
  | "agreement"
  | "meeting"
  | "analysis"
  | "approval"
  | "register"
  | "report"
  | "instructions"
  | "schedule"
  | "service"
  | "package"
  | "notice";

export interface ProfabFormDefinition {
  id: string;
  executionId: string;
  index: string;
  code: string;
  title: string;
  stage: "Corporate" | "Pre-Construction" | "Factory" | "On-Site" | "Post-Construction";
  linkedLayer2NodeId: string;
  lifecycleTouchpoints: string[];
  type: ExecutionItemType;
  profile: FormProfile;
  description: string;
  focusLabel: string;
  responsibleRole: string;
  approvalRoles: string[];
  defaultApplicability: ExecutionApplicability;
  signatureRequired?: boolean;
  approvalRequired?: boolean;
  sourceAvailability: "Included" | "Index Only" | "Supplemental";
  sourcePages?: string;
  sourceVersion?: string;
  sourceNote?: string;
  fields: ProfabFormFieldDefinition[];
}

const field = (
  id: string,
  label: string,
  type: ProfabFormFieldType = "text",
  required = true,
  options?: string[],
  help?: string,
  meta: Partial<
    Pick<
      ProfabFormFieldDefinition,
      | "section"
      | "origin"
      | "bindingPath"
      | "bindingValueType"
      | "computed"
      | "readOnly"
      | "requiredWhen"
      | "visibleWhen"
    >
  > = {},
): ProfabFormFieldDefinition => ({
  id,
  label,
  type,
  required,
  options,
  help,
  section: meta.section || "Form Details",
  origin: meta.origin || "profile",
  ...meta,
});

const common = (
  id: string,
  label: string,
  type: ProfabFormFieldType = "text",
  required = true,
  meta: Parameters<typeof field>[6] = {},
) => field(id, label, type, required, undefined, undefined, {
  section: "Record Control",
  origin: "common",
  ...meta,
});

const specific = (
  id: string,
  label: string,
  type: ProfabFormFieldType = "text",
  required = true,
  options?: string[],
  help?: string,
  meta: Parameters<typeof field>[6] = {},
) => field(id, label, type, required, options, help, {
  section: "Form-Specific Control",
  origin: "specific",
  ...meta,
});

const commonFields = (focusLabel: string): ProfabFormFieldDefinition[] => [
  common("projectName", "Project name"),
  common("clientId", "Client / lead ID", "text", false, {
    bindingPath: "identity.clientId",
    readOnly: true,
  }),
  common("projectNumber", "Project number", "text", false, {
    bindingPath: "identity.projectNumber",
    readOnly: true,
    help: undefined,
  } as Parameters<typeof field>[6]),
  common("projectFileNumber", "Project / file number", "text", false, {
    computed: "canonical-file-number",
    readOnly: true,
  }),
  common("preparedBy", "Prepared by"),
  common("recordDate", "Record date", "date"),
  field("primaryRecord", focusLabel, "textarea", true, undefined, undefined, {
    section: "Form Details",
    origin: "common",
  }),
  field("evidenceReferences", "Evidence / attachment references", "textarea", true, undefined, "List controlled filenames, drawing revisions, photos, transmittals, or external record IDs.", {
    section: "Evidence & Control",
    origin: "common",
  }),
];

const profileFields: Record<FormProfile, ProfabFormFieldDefinition[]> = {
  presentation: [
    field("audience", "Intended audience"),
    field("purpose", "Purpose / call to action", "textarea"),
    field("contentRevision", "Content revision"),
    field("releaseStatus", "Release status", "select", true, ["Draft", "Reviewed", "Released", "Withdrawn"]),
  ],
  agreement: [
    field("counterparty", "Counterparty / purchaser"),
    field("scopeBasis", "Scope and commercial basis", "textarea"),
    field("effectiveDate", "Effective date", "date"),
    field("executionState", "Execution state", "select", true, ["Draft", "Out for Signature", "Executed", "Expired", "Terminated"]),
  ],
  meeting: [
    field("meetingDate", "Meeting date", "date"),
    field("attendees", "Attendees and organizations", "textarea"),
    field("decisions", "Decisions made", "textarea"),
    field("openActions", "Open actions, owners, and due dates", "textarea"),
  ],
  analysis: [
    field("basis", "Analysis / estimate basis", "textarea"),
    field("assumptions", "Assumptions and exclusions", "textarea"),
    field("findings", "Findings", "textarea"),
    field("recommendation", "Recommendation / next action", "textarea"),
  ],
  approval: [
    field("approvalSubject", "Item / revision submitted for approval"),
    field("approver", "Authorized approver"),
    field("approvalDate", "Approval date", "date"),
    field("decision", "Approval decision", "select", true, ["Pending", "Approved", "Approved with conditions", "Rejected"]),
  ],
  register: [
    field("reference", "Record / issue reference"),
    field("owner", "Action owner"),
    field("targetDate", "Target / response date", "date"),
    field("recordStatus", "Record status", "select", true, ["Open", "In review", "Responded", "Closed", "Cancelled"]),
  ],
  report: [
    field("subjectReference", "Module / area / subject reference"),
    field("inspectionDate", "Inspection / event date", "date"),
    field("findings", "Findings and objective evidence", "textarea"),
    field("disposition", "Disposition", "select", true, ["Accept", "Accept with action", "Hold", "Reject", "Closed"]),
  ],
  instructions: [
    field("applicableRevision", "Applicable drawing / instruction revision"),
    field("prerequisites", "Prerequisites", "textarea"),
    field("workSequence", "Controlled work sequence", "textarea"),
    field("issuedTo", "Issued to / acknowledged by"),
  ],
  schedule: [
    field("baselineDate", "Baseline date", "date"),
    field("schedulePeriod", "Schedule period / milestone range"),
    field("criticalMilestones", "Critical milestones and constraints", "textarea"),
    field("scheduleStatus", "Schedule status", "select", true, ["Draft", "Baseline", "Forecast", "At risk", "Complete"]),
  ],
  service: [
    field("serviceRequest", "Service request / issue", "textarea"),
    field("serviceOwner", "Service owner"),
    field("responseDate", "Response / attendance date", "date"),
    field("serviceStatus", "Service status", "select", true, ["Requested", "Scheduled", "In progress", "Resolved", "Closed"]),
  ],
  package: [
    field("packageContents", "Package contents / index", "textarea"),
    field("revisionBasis", "Revision and change basis", "textarea"),
    field("transmittalReference", "Transmittal reference"),
    field("acceptanceStatus", "Acceptance status", "select", true, ["Compiling", "Issued for review", "Accepted", "Returned for correction"]),
  ],
  notice: [
    field("noticeRecipient", "Notice recipient and authority"),
    field("eventDate", "Event / concern date", "date"),
    field("impact", "Schedule, cost, quality, or safety impact", "textarea"),
    field("responseRequiredBy", "Response required by", "date"),
  ],
};

const condition = (
  source: ProfabFormFieldCondition["source"],
  key: string,
  operator: ProfabFormFieldCondition["operator"],
  value?: ProfabFormFieldCondition["value"],
): ProfabFormFieldCondition => ({ source, key, operator, value });

const agreementStatusOptions = [
  "Draft",
  "Out for Signature",
  "Executed",
  "Expired",
  "Terminated",
];
const gateStatusOptions = ["Blocked", "In Progress", "Ready", "Passed", "Not Applicable"];

/** Detailed schemas for the forms that directly control the JF requirements.
 * The remaining register entries receive two purpose-specific controls below,
 * in addition to their record/profile fields. */
const DETAILED_FORM_FIELDS: Record<string, ProfabFormFieldDefinition[]> = {
  "2.1": [
    specific("scopeBasis", "ProFab consultation scope", "textarea", true, undefined, "Consultation does not transfer the client's design responsibility unless ProFab Design is expressly selected.", { bindingPath: "designBoundary.profabScope" }),
    specific("executionState", "CSA execution state", "select", true, agreementStatusOptions, undefined, { bindingPath: "commercial.agreementStatus" }),
    specific("effectiveDate", "CSA executed date", "date", false, undefined, undefined, { bindingPath: "commercial.executedDate", requiredWhen: condition("operations", "commercial.agreementStatus", "equals", "Executed"), visibleWhen: condition("operations", "commercial.agreementStatus", "equals", "Executed") }),
    specific("csaAgreementReference", "CSA controlled agreement reference", "text", true, undefined, undefined, { bindingPath: "commercial.agreementReference" }),
    specific("csaDeliveryModel", "Design delivery boundary", "select", true, ["Unselected", "ProFab Design", "Client Design / ProFab Consultation"], undefined, { bindingPath: "designBoundary.deliveryModel" }),
    specific("csaArchitectOfRecord", "Architect of record / client's lead consultant", "text", false, undefined, undefined, { bindingPath: "designBoundary.architectOfRecord", visibleWhen: condition("operations", "designBoundary.deliveryModel", "equals", "Client Design / ProFab Consultation") }),
    specific("csaClientConsultantScope", "Client design-team responsibilities", "textarea", true, undefined, undefined, { bindingPath: "designBoundary.clientConsultantScope" }),
    specific("csaExclusions", "ProFab exclusions and reliance assumptions", "textarea", true, undefined, undefined, { bindingPath: "designBoundary.exclusions" }),
    specific("csaBoundaryAccepted", "Client accepted the design / consultation boundary", "checkbox", true, undefined, undefined, { bindingPath: "designBoundary.boundaryAccepted", bindingValueType: "boolean" }),
    specific("csaAcceptedBy", "Boundary accepted by", "text", false, undefined, undefined, { bindingPath: "designBoundary.acceptedByClient", requiredWhen: condition("operations", "designBoundary.boundaryAccepted", "truthy") }),
    specific("csaAcceptedAt", "Boundary acceptance date", "date", false, undefined, undefined, { bindingPath: "designBoundary.acceptedAt", requiredWhen: condition("operations", "designBoundary.boundaryAccepted", "truthy") }),
  ],
  "2.3": [
    specific("executionState", "LOI execution state", "select", true, agreementStatusOptions, undefined, { bindingPath: "commercial.agreementStatus" }),
    specific("effectiveDate", "LOI executed date", "date", false, undefined, undefined, { bindingPath: "commercial.executedDate", requiredWhen: condition("operations", "commercial.agreementStatus", "equals", "Executed"), visibleWhen: condition("operations", "commercial.agreementStatus", "equals", "Executed") }),
    specific("loiAgreementReference", "LOI controlled reference", "text", true, undefined, undefined, { bindingPath: "commercial.agreementReference" }),
    specific("loiEngagementType", "Commercial engagement path", "select", true, ["None", "CSA", "PCS", "LOI", "Sales Agreement", "Paid Feasibility"], undefined, { bindingPath: "commercial.engagementType" }),
    specific("loiContractValue", "Authorized paid next-step value", "number", true, undefined, undefined, { bindingPath: "commercial.contractValue", bindingValueType: "number" }),
    specific("loiCurrency", "Currency", "select", true, ["CAD", "USD"], undefined, { bindingPath: "commercial.currency" }),
    specific("loiAuthorizationRole", "ProFab authorizing officer", "select", true, ["CRO", "CEO"], "Only the CEO or CRO may approve an LOI."),
    specific("loiIntentScope", "Activities authorized during LOI period", "textarea"),
    specific("loiNonBindingTerms", "Non-binding terms and binding exceptions", "textarea"),
    specific("loiExpiryDate", "LOI expiry date", "date"),
    specific("loiConversionTrigger", "Paid agreement / Gate 1 conversion trigger", "textarea"),
  ],
  "2.9": [
    specific("sdrSiteAddress", "Site address / legal description"),
    specific("sdrVisitDate", "Site visit date", "date"),
    specific("sdrCivilStatus", "Civil readiness", "select", true, gateStatusOptions, undefined, { bindingPath: "siteReadiness.gates.0.status" }),
    specific("sdrFoundationStatus", "Foundation readiness", "select", true, gateStatusOptions, undefined, { bindingPath: "siteReadiness.gates.1.status" }),
    specific("sdrUtilitiesStatus", "Utilities readiness", "select", true, gateStatusOptions, undefined, { bindingPath: "siteReadiness.gates.2.status" }),
    specific("sdrSiteReadinessStatus", "Access / crane / laydown readiness", "select", true, gateStatusOptions, undefined, { bindingPath: "siteReadiness.gates.3.status" }),
    specific("sdrPreDeliveryStatus", "Pre-delivery site check", "select", true, gateStatusOptions, undefined, { bindingPath: "siteReadiness.gates.4.status" }),
    specific("sdrAccessConstraints", "Road, bridge, overhead and crane-access constraints", "textarea"),
    specific("sdrFoundationObservations", "Geotechnical / foundation observations", "textarea"),
    specific("sdrUtilityObservations", "Utility locations, capacity and responsibility", "textarea"),
    specific("sdrPhotoSurvey", "Photo / survey evidence register", "textarea"),
  ],
  "2.10": [
    specific("estimateClass", "Estimate class", "select", true, ["D", "C", "B", "A"], undefined, { bindingPath: "estimating.currentClass" }),
    specific("estimateBasisStage", "Maturity basis", "select", true, ["Concept", "Preliminary", "Permit", "IFC"], undefined, { bindingPath: "estimating.basisStage" }),
    specific("cecStoreys", "Storeys", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.storeys", bindingValueType: "number" }),
    specific("cecGrossSquareFeet", "Gross square footage", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.grossSquareFeet", bindingValueType: "number" }),
    specific("cecFixedFactor", "Fixed factor ($/sq.ft.)", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.fixedFactorPerSquareFoot", bindingValueType: "number" }),
    specific("cecWindowCount", "Window count", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.windowCount", bindingValueType: "number" }),
    specific("cecWindowRate", "Window unit rate", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.windowUnitRate", bindingValueType: "number" }),
    specific("cecDoorCount", "Exterior door count", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.exteriorDoorCount", bindingValueType: "number" }),
    specific("cecDoorRate", "Exterior door unit rate", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.exteriorDoorUnitRate", bindingValueType: "number" }),
    specific("cecRoofSquareFeet", "Roof square footage", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.roofSquareFeet", bindingValueType: "number" }),
    specific("cecRoofRate", "Roof unit rate", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.roofRate", bindingValueType: "number" }),
    specific("cecComplexityFactor", "Complexity factor", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.complexityFactor", bindingValueType: "number" }),
    specific("cecLocationFactor", "Location factor", "number", true, undefined, undefined, { bindingPath: "estimating.inputs.locationFactor", bindingValueType: "number" }),
    specific("cecClassDTotal", "Calculated Class D amount", "number", true, undefined, "Calculated from area, fixed factor, openings, roof, assemblies, complexity and location.", { computed: "class-d-total", readOnly: true, visibleWhen: condition("form", "estimateClass", "equals", "D") }),
    specific("cecSourceRevision", "Drawing / model source revision"),
    specific("cecConvergenceEvidence", "Evidence required for the next estimate class", "textarea"),
  ],
  "2.11": [
    specific("rfiNumber", "RFI number"),
    specific("rfiDiscipline", "Discipline", "select", true, ["Architectural", "Structural", "Mechanical", "Electrical", "Civil", "Site", "Commercial", "Production"]),
    specific("rfiQuestion", "Information requested / question", "textarea"),
    specific("rfiDrawingReference", "Drawing, specification or model reference"),
    specific("rfiRequestedFrom", "Requested from"),
    specific("rfiRequiredBy", "Response required by", "date"),
    specific("rfiCostImpact", "Potential cost impact", "select", true, ["None", "Unknown", "Potential", "Confirmed"]),
    specific("rfiScheduleImpact", "Potential schedule impact", "select", true, ["None", "Unknown", "Potential", "Confirmed"]),
    specific("rfiResponse", "Controlled response", "textarea", false, undefined, undefined, { requiredWhen: condition("form", "recordStatus", "one-of", ["Responded", "Closed"]), visibleWhen: condition("form", "recordStatus", "one-of", ["Responded", "Closed"]) }),
    specific("rfiResponseBy", "Response authored / approved by", "text", false, undefined, undefined, { requiredWhen: condition("form", "recordStatus", "one-of", ["Responded", "Closed"]), visibleWhen: condition("form", "recordStatus", "one-of", ["Responded", "Closed"]) }),
  ],
  "2.14": [
    specific("rmDeliveryModel", "Delivery / design model", "select", true, ["Unselected", "ProFab Design", "Client Design / ProFab Consultation"], undefined, { bindingPath: "designBoundary.deliveryModel" }),
    specific("rmArchitectOfRecord", "Architect of record", "text", false, undefined, undefined, { bindingPath: "designBoundary.architectOfRecord" }),
    specific("rmProfabScope", "ProFab responsibility boundary", "textarea", true, undefined, undefined, { bindingPath: "designBoundary.profabScope" }),
    specific("rmClientScope", "Client / consultant responsibility boundary", "textarea", true, undefined, undefined, { bindingPath: "designBoundary.clientConsultantScope" }),
    specific("rmExclusions", "Explicit exclusions / unassigned interfaces", "textarea", true, undefined, undefined, { bindingPath: "designBoundary.exclusions" }),
    specific("rmBoundaryAccepted", "Responsibility boundary accepted", "checkbox", true, undefined, undefined, { bindingPath: "designBoundary.boundaryAccepted", bindingValueType: "boolean" }),
    specific("rmAcceptedBy", "Client acceptance", "text", false, undefined, undefined, { bindingPath: "designBoundary.acceptedByClient", requiredWhen: condition("operations", "designBoundary.boundaryAccepted", "truthy") }),
    specific("rmAcceptedAt", "Acceptance date", "date", false, undefined, undefined, { bindingPath: "designBoundary.acceptedAt", requiredWhen: condition("operations", "designBoundary.boundaryAccepted", "truthy") }),
    specific("rmMatrixRevision", "Responsibility matrix revision"),
    specific("rmOpenInterfaces", "Open / unassigned interface resolution", "textarea"),
  ],
  "2.18": [
    specific("coNumber", "Change order number"),
    specific("coKind", "Commercial adjustment type", "select", true, ["Change", "Credit"]),
    specific("coDescription", "Changed scope and reason", "textarea"),
    specific("coAmount", "Change / credit amount", "number"),
    specific("coContractValue", "Current contract value", "number", true, undefined, undefined, { bindingPath: "commercial.contractValue", bindingValueType: "number", readOnly: true }),
    specific("coContractPercent", "Contract value impact (%)", "number"),
    specific("coCumulativeCredit", "Cumulative credits including this order", "number", false, undefined, undefined, { requiredWhen: condition("form", "coKind", "equals", "Credit"), visibleWhen: condition("form", "coKind", "equals", "Credit") }),
    specific("coRequiredAuthority", "Required ProFab approval authority", "text", true, undefined, "Calculated against the live CRO/CEO change and credit thresholds.", { computed: "change-approval-role", readOnly: true }),
    specific("coScheduleDays", "Schedule impact (calendar days)", "number"),
    specific("coEffectiveDate", "Effective date", "date"),
    specific("coClientAcceptance", "Client acceptance / signature evidence", "textarea"),
  ],
  "3.1": [
    specific("mpsRevision", "MPS controlled revision", "text", true, undefined, undefined, { bindingPath: "production.mpsRevision" }),
    specific("mpsFactoryCapacity", "Factory weekly capacity (hours)", "number", true, undefined, undefined, { bindingPath: "production.factoryWeeklyCapacityHours", bindingValueType: "number" }),
    specific("mpsCommittedCapacity", "Committed weekly capacity (hours)", "number", true, undefined, undefined, { bindingPath: "production.committedWeeklyCapacityHours", bindingValueType: "number" }),
    specific("mpsCapacityUtilization", "Capacity utilization", "text", true, undefined, undefined, { computed: "capacity-utilization", readOnly: true }),
    specific("mpsProcurementUnlocked", "Procurement unlocked", "checkbox", false, undefined, undefined, { bindingPath: "production.procurementUnlocked", bindingValueType: "boolean", readOnly: true }),
    specific("mpsProductionAuthorized", "Production start authorized", "checkbox", false, undefined, undefined, { bindingPath: "production.productionStartAuthorized", bindingValueType: "boolean", readOnly: true }),
    specific("mpsModuleSequence", "Module / building production sequence", "textarea"),
    specific("mpsCriticalPath", "Critical-path activities and dependencies", "textarea"),
    specific("mpsBaselineWindow", "Approved baseline production window"),
    specific("mpsForecastWindow", "Current forecast production window"),
  ],
  "5.5": [
    specific("effectiveDate", "Warranty Day 0", "date", true, undefined, undefined, { bindingPath: "warranty.dayZeroDate" }),
    specific("wmaTriggerEvidence", "Day 0 trigger / acceptance evidence", "textarea", true, undefined, undefined, { bindingPath: "warranty.triggerEvidence" }),
    specific("wmaDurationMonths", "Warranty duration (months)", "number", true, undefined, undefined, { bindingPath: "warranty.durationMonths", bindingValueType: "number" }),
    specific("wmaExpiryDate", "Warranty expiry", "date", true, undefined, undefined, { computed: "warranty-expiry", readOnly: true, visibleWhen: condition("operations", "warranty.dayZeroDate", "truthy") }),
    specific("wmaOwner", "Warranty owner", "text", true, undefined, undefined, { bindingPath: "warranty.owner" }),
    specific("wmaCoverage", "Covered work / systems", "textarea"),
    specific("wmaExclusions", "Warranty exclusions", "textarea"),
    specific("wmaMaintenance", "Required owner maintenance", "textarea"),
    specific("wmaClaimRoute", "Claim intake and escalation route", "textarea"),
    specific("wmaFollowUpPlan", "30 / 60 / 90 and project-specific follow-up plan", "textarea"),
  ],
};

const FORM_SPECIFIC_CONTROL_LABELS: Record<string, string> = {
  "1.1": "Approved capability claims and reference-project permissions",
  "1.2": "Client interest, opportunity hypothesis and agreed next contact",
  "2.1": "Consultation service boundary and client design-team interface",
  "2.1.1": "Initial goals, decision makers and paid-next-step actions",
  "2.1.2": "Scope refinements, unresolved decisions and conversion actions",
  "2.2": "Confidential information classes, permitted recipients and survival term",
  "2.3": "LOI authority, expiry and conversion to a paid controlled agreement",
  "2.4": "Site, code, transport and commercial feasibility decision",
  "2.5": "Contract scope, price, payment milestones and release conditions",
  "2.6": "Authorized electronic file set, transfer channel and receipt confirmation",
  "2.7": "Pre-construction deliverables, fees, meetings and completion criteria",
  "2.8": "Approved preliminary design package, revision and client exceptions",
  "2.9": "Observed site facts and secondary-gate readiness evidence",
  "2.10": "Estimate maturity, assumptions, assemblies and D-to-A version basis",
  "2.11": "Controlled question, impact, response and closure reference",
  "2.12": "Specification exception, affected assemblies and approved disposition",
  "2.13": "Detailed inclusions, exclusions, interfaces and deliverable boundaries",
  "2.13.1": "Client-facing modular delivery responsibility overview",
  "2.14": "Party-by-party responsibility ownership and unassigned interfaces",
  "2.15": "Selected product, manufacturer, colour, substitution and release status",
  "2.16": "Current project baseline, success criteria and key stakeholder summary",
  "2.17": "Directed change scope, interim authority and not-to-exceed exposure",
  "2.18": "Agreed scope, price, schedule impact and threshold authority",
  "2.18.1": "Directive/order linkage, pricing status, implementation and closure",
  "2.19": "Client-caused occupancy delay facts, impact and cure requirement",
  "3.1": "Module sequence, factory capacity and baseline-to-forecast movement",
  "3.2": "Factory quality checkpoint, acceptance criteria and traceable evidence",
  "3.3": "Module-specific inspection result, deficiency and reinspection status",
  "3.4": "Transport dimensions, protection, route, permits and staging release",
  "3.5": "Per-module factory release decision and residual punch-item control",
  "4.1": "Site hazards, emergency plan, access rules and accountable parties",
  "4.2": "Module delivery time, carrier, received condition and damage exceptions",
  "4.3": "Controlled assembly sequence, interfaces, tolerances and hold points",
  "4.4": "Module installation checklist steps and incomplete-work evidence",
  "4.5": "Installed-module inspection criteria, deficiencies and photo record",
  "4.6": "Survey grid, level/alignment readings, tolerance and correction evidence",
  "4.7": "Envelope joints, test method, leakage findings and corrective work",
  "4.8": "Utility system connection, test authority and outstanding work",
  "4.9": "Module damage location, cause, severity, responsibility and repair",
  "4.10": "Incident facts, persons, immediate control and notification record",
  "4.10.1": "Incident response chronology, corrective actions and closure evidence",
  "5.1": "Delegated discipline, design party, sealed deliverable and due date",
  "5.2": "Installation support request, boundary, urgency and resolution",
  "5.3": "Deficiency location, owner, due date, verification and acceptance",
  "5.4": "Final inspection authority, accepted scope and residual deficiencies",
  "5.5": "Warranty Day 0, term, maintenance duty and claim route",
  "5.6": "Closeout status, lessons learned and unresolved obligation transfer",
  "5.7": "As-built discipline completeness, approved revisions and DWF delivery",
  "5.8": "Handover documents, training, client satisfaction and reservations",
  "5.9": "Media assets, permitted channels, restrictions, consent term and expiry",
  "5.10": "Concern facts, contract reference, requested remedy and urgency",
  "5.11": "Response position, corrective plan, owner, timing and closure proof",
};

type FieldMeta = Parameters<typeof field>[6];

const indexedFieldId = (index: string, key: string) =>
  `form_${index.replace(/\./g, "_")}_${key}`;

const indexedSpecific = (
  index: string,
  key: string,
  label: string,
  type: ProfabFormFieldType,
  required = true,
  options?: string[],
  help?: string,
  meta: FieldMeta = {},
) => specific(indexedFieldId(index, key), label, type, required, options, help, meta);

const formSelect = (
  index: string,
  key: string,
  label: string,
  options: string[],
  help?: string,
  meta: FieldMeta = {},
) => indexedSpecific(index, key, label, "select", true, options, help, meta);

const formText = (
  index: string,
  key: string,
  label: string,
  required = true,
  help?: string,
  meta: FieldMeta = {},
) => indexedSpecific(index, key, label, "text", required, undefined, help, meta);

const formDate = (
  index: string,
  key: string,
  label: string,
  required = true,
  help?: string,
  meta: FieldMeta = {},
) => indexedSpecific(index, key, label, "date", required, undefined, help, meta);

const formNumber = (
  index: string,
  key: string,
  label: string,
  required = true,
  help?: string,
  meta: FieldMeta = {},
) => indexedSpecific(index, key, label, "number", required, undefined, help, meta);

const formArea = (
  index: string,
  key: string,
  label: string,
  required = true,
  help?: string,
  meta: FieldMeta = {},
) => indexedSpecific(index, key, label, "textarea", required, undefined, help, meta);

const FORM_OPERATIONAL_FIELDS: Record<string, ProfabFormFieldDefinition[]> = {
  "1.1": [
    formSelect("1.1", "audienceType", "Audience type", ["Potential client", "Builder / developer", "Architect / consultant", "Partner", "Internal"]),
    formSelect("1.1", "presentationRelease", "Presentation release state", ["Draft", "Reviewed", "Approved for issue", "Released", "Withdrawn"]),
    formSelect("1.1", "referencePermission", "Reference-project permission", ["Internal only", "Approved client reference", "Publicly approved", "Not permitted"]),
  ],
  "1.2": [
    formText("1.2", "leadId", "Lead ID", true, "Keep the lead ID across qualification and any later project conversion.", { bindingPath: "identity.leadId" }),
    formSelect("1.2", "interestLevel", "Interest level", ["Exploratory", "Qualified", "Active", "Deferred", "Declined"]),
    formSelect("1.2", "nextStep", "Agreed next step", ["Discovery", "Consultation", "Feasibility", "Pre-construction", "No action"]),
    formSelect("1.2", "qualificationStatus", "Qualification status", ["New", "In review", "Qualified", "On hold", "Closed"]),
  ],
  "2.1": [
    formSelect("2.1", "billingBasis", "Consultation billing basis", ["Fixed fee", "Hourly", "Not-to-exceed", "Milestone", "No charge by exception"]),
    formSelect("2.1", "shopDrawingTrigger", "Shop-drawing trigger", ["Not authorized", "Authorized after paid gate", "Authorized with Sales Agreement", "Authorized by written exception"]),
    formSelect("2.1", "consultationCloseStatus", "Consultation close status", ["Open", "Deliverables in progress", "Ready for review", "Accepted", "Closed"]),
  ],
  "2.1.1": [
    formSelect("2.1.1", "meetingType", "Meeting type", ["Initial intake", "Design review", "Commercial review", "Gate review", "Exception review"]),
    formSelect("2.1.1", "clientMaturity", "Client / project maturity", ["Project-ready", "Permit-ready", "Concept-stage", "Design-needed", "Site unresolved"]),
    formSelect("2.1.1", "decisionStatus", "Decision status", ["Open", "Decision recorded", "Escalated", "Closed"]),
  ],
  "2.1.2": [
    formSelect("2.1.2", "meetingType", "Meeting type", ["Progress review", "Design review", "Commercial review", "Gate review", "Change review"]),
    formSelect("2.1.2", "scopeDecision", "Scope decision", ["No change", "Refine scope", "Add service", "Remove service", "Escalate"]),
    formSelect("2.1.2", "conversionStatus", "Conversion status", ["Open", "Ready for paid agreement", "Awaiting client", "On hold", "Closed"]),
  ],
  "2.2": [
    formSelect("2.2", "confidentialityScope", "Confidentiality scope", ["Project documents", "Pricing / commercial", "Technical / design", "All project information"]),
    formSelect("2.2", "permittedRecipients", "Permitted recipients", ["Named parties only", "Named parties and consultants", "Project team", "No onward disclosure"]),
    formSelect("2.2", "survivalTerm", "Confidentiality survival term", ["Contract term", "2 years", "5 years", "Indefinite", "As stated in agreement"]),
  ],
  "2.3": [
    formSelect("2.3", "loiScopeType", "LOI scope type", ["Discovery only", "Consultation", "Feasibility", "Pre-construction", "Other governed path"]),
    formSelect("2.3", "loiConversionStatus", "LOI conversion status", ["Not ready", "Ready for paid agreement", "Converted", "Expired", "Terminated"]),
    formSelect("2.3", "loiAuthorityCheck", "Authority check", ["Pending", "CRO confirmed", "CEO confirmed", "Rejected"]),
  ],
  "2.4": [
    formSelect("2.4", "feasibilityDecision", "Feasibility decision", ["Proceed", "Proceed with conditions", "Hold", "No-go"]),
    formSelect("2.4", "siteControl", "Site control", ["Confirmed", "Conditional", "Unresolved", "Not applicable"]),
    formSelect("2.4", "modularFit", "Modular compatibility", ["Compatible", "Compatible with conditions", "Requires redesign", "Not reviewed"]),
    formSelect("2.4", "riskBand", "Feasibility risk band", ["Low", "Medium", "High", "Critical"]),
  ],
  "2.5": [
    formSelect("2.5", "paymentMilestonePlan", "Payment milestone plan", ["25% signing / 25% production / 25% factory / 25% final", "Contract-specific", "Pending commercial approval"]),
    formSelect("2.5", "deliveryResponsibility", "Delivery responsibility", ["ProFab", "Client / GC", "Shared", "Contract-specific"]),
    formSelect("2.5", "changeControlRoute", "Change-control route", ["Change Directive then Change Order", "Change Order only", "Contract-specific", "Not defined"]),
  ],
  "2.6": [
    formSelect("2.6", "transferMethod", "Transfer method", ["Secure email", "Shared drive", "Client portal", "Physical media", "Other controlled channel"]),
    formSelect("2.6", "authorizationState", "Transfer authorization", ["Pending", "Authorized", "Authorized with restrictions", "Rejected"]),
    formSelect("2.6", "receiptState", "Recipient receipt", ["Pending", "Sent", "Received", "Rejected", "Unable to verify"]),
    formSelect("2.6", "documentSetState", "Document-set state", ["Draft", "Authorized", "Transferred", "Superseded"]),
  ],
  "2.7": [
    formSelect("2.7", "serviceType", "Pre-construction service type", ["Project management", "Technical coordination", "Estimating", "Design coordination", "Feasibility", "Combined"]),
    formSelect("2.7", "feeBasis", "Fee basis", ["Hourly", "Fixed fee", "Not-to-exceed", "Milestone", "Contract-specific"]),
    formSelect("2.7", "shopDrawingRelease", "Shop-drawing release", ["Not released", "Released after technical commitment", "Released by Sales Agreement", "Exception approved"]),
    formSelect("2.7", "serviceCompletion", "Service completion", ["Not started", "In progress", "Ready for review", "Accepted", "Closed"]),
  ],
  "2.8": [
    formSelect("2.8", "designMaturity", "Design maturity", ["Concept", "Preliminary", "Permit", "IFC", "Client-supplied approved package"]),
    formSelect("2.8", "designApproval", "Design approval decision", ["Pending", "Approved", "Approved with conditions", "Returned", "Rejected"]),
    formSelect("2.8", "exceptionState", "Client exception state", ["None", "Open", "Accepted", "Rejected", "Escalated"]),
    formSelect("2.8", "nextDesignAction", "Next design action", ["Proceed", "Revise package", "Obtain consultant input", "Hold", "Close"]),
  ],
  "2.9": [
    formSelect("2.9", "surveyType", "Site discovery type", ["Desktop review", "Site visit", "Survey", "Geotechnical review", "Combined"]),
    formSelect("2.9", "overallReadiness", "Overall site readiness", ["Blocked", "In Progress", "Ready", "Passed", "Not Applicable"]),
    formSelect("2.9", "siteAuthority", "Site information authority", ["Client", "GC", "Consultant", "Municipality", "ProFab observation"]),
  ],
  "2.10": [
    formSelect("2.10", "estimateApproval", "Estimate approval state", ["Draft", "In review", "Approved", "Superseded"]),
    formSelect("2.10", "nextEstimateClass", "Next estimate class", ["D", "C", "B", "A", "No further class"]),
    formSelect("2.10", "costConfidence", "Cost confidence", ["Low", "Moderate", "High", "Confirmed"]),
  ],
  "2.11": [
    formSelect("2.11", "priority", "RFI priority", ["Routine", "Important", "Urgent", "Critical"]),
    formSelect("2.11", "closureBasis", "RFI closure basis", ["Response issued", "Drawing revised", "Instruction issued", "No action required", "Transferred to change control"]),
  ],
  "2.12": [
    formSelect("2.12", "exceptionType", "Exception type", ["Code / specification", "Client preference", "Site condition", "Supplier / material", "Design coordination", "Other"]),
    formSelect("2.12", "severity", "Exception severity", ["Low", "Medium", "High", "Critical"]),
    formSelect("2.12", "disposition", "Exception disposition", ["Open", "Accepted", "Rejected", "Approved with condition", "Closed"]),
    formSelect("2.12", "affectedPhase", "Affected phase", ["Pre-construction", "Production readiness", "Factory production", "Delivery", "Warranty"]),
  ],
  "2.13": [
    formSelect("2.13", "scopeState", "Scope state", ["Draft", "Under review", "Approved", "Superseded"]),
    formSelect("2.13", "boundaryModel", "Scope boundary model", ["ProFab-led", "Client / GC-led", "Shared", "Unassigned"]),
    formSelect("2.13", "interfaceState", "Interface state", ["Complete", "Open", "At risk", "Escalated"]),
    formSelect("2.13", "changeRoute", "Scope change route", ["Change Directive", "Change Order", "Technical clarification", "No change"]),
  ],
  "2.13.1": [
    formSelect("2.13.1", "deliveryModel", "Modular delivery model", ["ProFab Design", "Client Design / ProFab Consultation", "Shared", "Unselected"]),
    formSelect("2.13.1", "responsibilityClarity", "Responsibility clarity", ["Clear", "Clear with open interfaces", "Partially defined", "Not defined"]),
    formSelect("2.13.1", "clientRelease", "Client-facing release state", ["Draft", "Issued for review", "Accepted", "Returned for correction"]),
  ],
  "2.14": [
    formSelect("2.14", "ownershipModel", "Ownership model", ["Single accountable party", "Shared accountability", "Consultant-led", "Client / GC-led", "Unassigned"]),
    formSelect("2.14", "interfaceRisk", "Interface risk", ["Low", "Medium", "High", "Critical"]),
    formSelect("2.14", "matrixApproval", "Matrix approval state", ["Draft", "Under review", "Accepted", "Returned for correction"]),
  ],
  "2.15": [
    formSelect("2.15", "productCategory", "Product category", ["Structural", "Envelope", "Interior", "MEP", "Appliance", "Other"]),
    formSelect("2.15", "selectionState", "Selection state", ["Pending", "Selected", "Approved", "Substitution required", "Rejected"]),
    formSelect("2.15", "substitutionState", "Substitution state", ["None", "Requested", "Under review", "Approved", "Rejected"]),
    formSelect("2.15", "releaseRoute", "Release route", ["Client approval", "Technical approval", "Management exception", "Not released"]),
  ],
  "2.16": [
    formSelect("2.16", "projectLifecycle", "Project lifecycle state", ["Lead", "Client", "Project", "Construction", "Completed", "Warranty", "Closed"]),
    formSelect("2.16", "deliveryModel", "Delivery model", ["Design-build", "Client design / consultation", "ProFab design", "Hybrid", "Not defined"]),
    formSelect("2.16", "baselineConfidence", "Baseline confidence", ["Draft", "Working", "Committed", "At risk"]),
  ],
  "2.17": [
    formSelect("2.17", "directiveState", "Directive state", ["Draft", "Authorized", "Implemented", "Converted to Change Order", "Cancelled"]),
    formSelect("2.17", "interimAuthority", "Interim authority", ["Project Manager", "CRO", "CEO", "Client", "Not authorized"]),
    formSelect("2.17", "urgency", "Directive urgency", ["Routine", "Expedited", "Immediate", "Emergency"]),
    formSelect("2.17", "costTreatment", "Interim cost treatment", ["Not-to-exceed", "Time and materials", "Pending pricing", "No cost"]),
  ],
  "2.18": [
    formSelect("2.18", "approvalState", "Change Order approval state", ["Draft", "Submitted", "Approved", "Approved with conditions", "Rejected"]),
    formSelect("2.18", "implementationState", "Implementation state", ["Not released", "Released", "In progress", "Complete", "On hold"]),
  ],
  "2.18.1": [
    formSelect("2.18.1", "changeState", "Change tracker state", ["Open", "Pricing", "Awaiting approval", "Approved", "Implemented", "Closed", "Cancelled"]),
    formSelect("2.18.1", "pricingState", "Pricing state", ["Not started", "In progress", "Submitted", "Agreed", "Not required"]),
    formSelect("2.18.1", "implementationState", "Implementation state", ["Not released", "Released", "In progress", "Complete", "On hold"]),
    formSelect("2.18.1", "closureState", "Closure state", ["Open", "Awaiting evidence", "Closed", "Escalated"]),
  ],
  "2.19": [
    formSelect("2.19", "delayCause", "Delay cause", ["Foundation", "Utilities", "Site access", "Client decision", "Permit", "Weather", "Other"]),
    formSelect("2.19", "responsibleParty", "Responsible party", ["Client", "GC / site", "ProFab", "Third party", "Shared", "TBD"]),
    formSelect("2.19", "noticeState", "Notice state", ["Draft", "Issued", "Acknowledged", "Cured", "Escalated", "Closed"]),
    formSelect("2.19", "cureState", "Cure status", ["Not requested", "Requested", "In progress", "Complete", "Not accepted"]),
  ],
  "3.1": [
    formSelect("3.1", "productionRelease", "Production release state", ["Not authorized", "Authorized", "Hold", "Released"]),
    formSelect("3.1", "scheduleConfidence", "Schedule confidence", ["Draft", "Baseline", "Forecast", "At risk", "Complete"]),
    formSelect("3.1", "sequenceBasis", "Module sequence basis", ["Contract baseline", "Client priority", "Factory capacity", "Site readiness", "Revised sequence"]),
  ],
  "3.2": [
    formSelect("3.2", "checkpointType", "Quality checkpoint", ["Incoming", "In-process", "Final", "Rework"]),
    formSelect("3.2", "inspectionResult", "Inspection result", ["Pass", "Pass with action", "Hold", "Fail"]),
    formSelect("3.2", "ncrState", "NCR / punch status", ["None", "Open", "Corrected", "Accepted", "Escalated"]),
    formSelect("3.2", "responsibleFunction", "Responsible function", ["Factory", "Quality", "Technical", "Supplier", "Shared"]),
  ],
  "3.3": [
    formSelect("3.3", "inspectionOutcome", "Module inspection outcome", ["Not inspected", "Pass", "Pass with action", "Hold", "Fail"]),
    formSelect("3.3", "defectSeverity", "Defect severity", ["None", "Minor", "Major", "Critical"]),
    formSelect("3.3", "reinspectionState", "Reinspection state", ["Not required", "Required", "Scheduled", "Passed", "Failed"]),
    formSelect("3.3", "releaseImpact", "Release impact", ["None", "Monitor", "Blocks module", "Blocks shipment"]),
  ],
  "3.4": [
    formSelect("3.4", "transportReadiness", "Transport readiness", ["Not ready", "Ready with conditions", "Ready", "Hold", "Released"]),
    formSelect("3.4", "permitState", "Route / permit state", ["Not required", "Pending", "Obtained", "Expired", "Rejected"]),
    formSelect("3.4", "carrierState", "Carrier state", ["Unassigned", "Booked", "Confirmed", "On site", "Released"]),
    formSelect("3.4", "stagingState", "Staging state", ["Not staged", "Staged", "Protected", "Exception", "Cleared"]),
  ],
  "3.5": [
    formSelect("3.5", "releaseDecision", "Factory release decision", ["Pending", "Approved", "Approved with conditions", "Hold", "Rejected"]),
    formSelect("3.5", "punchState", "Residual punch state", ["None", "Open", "Accepted with action", "Closed"]),
    formSelect("3.5", "shipmentAuthorization", "Shipment authorization", ["Not authorized", "Authorized", "Authorized with conditions", "Hold"]),
    formSelect("3.5", "signoffState", "Module sign-off state", ["Draft", "Submitted", "Signed", "Returned"]),
  ],
  "4.1": [
    formSelect("4.1", "safetyPlanState", "Safety plan state", ["Draft", "Submitted", "Approved", "Rejected", "Superseded"]),
    formSelect("4.1", "siteAccess", "Site access condition", ["Ready", "Restricted", "Not ready", "Unknown"]),
    formSelect("4.1", "riskLevel", "Site safety risk level", ["Low", "Medium", "High", "Critical"]),
    formSelect("4.1", "emergencyReadiness", "Emergency readiness", ["Complete", "Partial", "Not confirmed"]),
  ],
  "4.2": [
    formSelect("4.2", "deliveryState", "Delivery state", ["Scheduled", "Delivered", "Partially delivered", "Refused", "Cancelled"]),
    formSelect("4.2", "receiptCondition", "Received condition", ["Accepted", "Accepted with damage", "Missing items", "Rejected", "Pending inspection"]),
    formSelect("4.2", "damageResponsibility", "Damage responsibility", ["Carrier", "Site", "ProFab", "Unknown", "Shared", "Not applicable"]),
    formSelect("4.2", "unloadingState", "Unloading state", ["Not started", "In progress", "Complete", "Exception"]),
  ],
  "4.3": [
    formSelect("4.3", "instructionState", "Instruction state", ["Draft", "Issued for review", "Approved", "Superseded"]),
    formSelect("4.3", "assemblyMethod", "Assembly method", ["Standard", "Restricted", "Engineered sequence", "Other"]),
    formSelect("4.3", "holdPointState", "Hold-point state", ["Open", "Released", "Not applicable"]),
    formSelect("4.3", "acknowledgementState", "Installer acknowledgement", ["Pending", "Acknowledged", "Rejected", "Not required"]),
  ],
  "4.4": [
    formSelect("4.4", "installationState", "Installation state", ["Not started", "In progress", "Complete", "Incomplete", "Rework"]),
    formSelect("4.4", "checklistResult", "Checklist result", ["Pass", "Pass with action", "Hold", "Fail"]),
    formSelect("4.4", "holdPointState", "Hold-point state", ["Open", "Released", "Not applicable"]),
    formSelect("4.4", "incompleteDisposition", "Incomplete-work disposition", ["Assigned", "Scheduled", "Blocked", "Accepted with action", "Closed"]),
  ],
  "4.5": [
    formSelect("4.5", "inspectionResult", "Site inspection result", ["Pass", "Pass with action", "Hold", "Fail"]),
    formSelect("4.5", "interfaceState", "Interface state", ["Accepted", "Open", "Rework", "Not applicable"]),
    formSelect("4.5", "deficiencySeverity", "Deficiency severity", ["None", "Minor", "Major", "Critical"]),
    formSelect("4.5", "reinspectionState", "Reinspection state", ["Not required", "Required", "Scheduled", "Passed", "Failed"]),
  ],
  "4.6": [
    formSelect("4.6", "surveyState", "Survey state", ["Not started", "In progress", "Complete", "Accepted", "Rework"]),
    formSelect("4.6", "alignmentResult", "Alignment result", ["Within tolerance", "Out of tolerance", "Conditional acceptance", "Rework required"]),
    formSelect("4.6", "correctionState", "Correction state", ["Not required", "Open", "In progress", "Verified", "Rejected"]),
    formSelect("4.6", "acceptanceAuthority", "Acceptance authority", ["Surveyor", "Technical", "Site", "Client"]),
  ],
  "4.7": [
    formSelect("4.7", "sealResult", "Seal verification result", ["Pass", "Pass with action", "Fail", "Not tested"]),
    formSelect("4.7", "testMethod", "Test method", ["Visual inspection", "Water test", "Air test", "Manufacturer method", "Other"]),
    formSelect("4.7", "leakageResult", "Leakage result", ["None", "Minor", "Major", "Not determined"]),
    formSelect("4.7", "correctiveState", "Corrective-work state", ["Not required", "Open", "In progress", "Verified", "Escalated"]),
  ],
  "4.8": [
    formSelect("4.8", "utilityType", "Utility type", ["Water", "Electrical", "Gas", "Sewer", "HVAC", "Multiple", "Other"]),
    formSelect("4.8", "connectionState", "Connection state", ["Not started", "In progress", "Connected", "Tested", "Accepted", "Failed"]),
    formSelect("4.8", "testResult", "Utility test result", ["Pass", "Conditional", "Fail", "Pending"]),
    formSelect("4.8", "responsibility", "Connection responsibility", ["Client", "GC / site", "ProFab", "Utility authority", "Shared"]),
  ],
  "4.9": [
    formSelect("4.9", "damageCause", "Damage cause", ["Transport", "Lifting", "Installation", "Site condition", "Unknown"]),
    formSelect("4.9", "severity", "Damage severity", ["Minor", "Moderate", "Major", "Critical"]),
    formSelect("4.9", "responsibility", "Damage responsibility", ["Carrier", "GC / site", "ProFab", "Third party", "Shared", "TBD"]),
    formSelect("4.9", "repairState", "Repair state", ["Not required", "Open", "In progress", "Ready for verification", "Accepted", "Rejected"]),
  ],
  "4.10": [
    formSelect("4.10", "incidentType", "Incident type", ["Safety", "Quality", "Damage", "Environmental", "Schedule", "Security", "Other"]),
    formSelect("4.10", "severity", "Incident severity", ["Near miss", "Minor", "Serious", "Critical"]),
    formSelect("4.10", "immediateControl", "Immediate control state", ["Not required", "In progress", "Implemented", "Escalated"]),
    formSelect("4.10", "notificationState", "Notification state", ["Draft", "Reported", "Escalated", "Closed"]),
  ],
  "4.10.1": [
    formSelect("4.10.1", "incidentState", "Incident response state", ["Open", "Investigating", "Corrective action", "Monitoring", "Closed"]),
    formSelect("4.10.1", "responseOwner", "Response owner", ["Site", "Project Management", "Technical", "Quality", "Management"]),
    formSelect("4.10.1", "correctiveState", "Corrective-action state", ["Not assigned", "Assigned", "In progress", "Verified", "Rejected"]),
    formSelect("4.10.1", "closureState", "Closure state", ["Open", "Awaiting evidence", "Closed", "Escalated"]),
  ],
  "5.1": [
    formSelect("5.1", "discipline", "Delegated discipline", ["Architectural", "Structural", "Mechanical", "Electrical", "Civil", "Fire", "Geotechnical", "Other"]),
    formSelect("5.1", "delegatedParty", "Delegated party", ["Client consultant", "ProFab consultant", "Subcontractor", "Supplier", "Other"]),
    formSelect("5.1", "sealRequirement", "Seal requirement", ["Required", "Not required", "Authority to confirm"]),
    formSelect("5.1", "deliverableState", "Deliverable state", ["Not started", "In progress", "Submitted", "Accepted", "Returned"]),
  ],
  "5.2": [
    formSelect("5.2", "priority", "Support priority", ["Routine", "Urgent", "Critical"]),
    formSelect("5.2", "responsibilityBoundary", "Support responsibility boundary", ["ProFab", "Client / GC", "Installer", "Shared", "Out of scope"]),
    formSelect("5.2", "resolutionOutcome", "Resolution outcome", ["Advice issued", "Site attendance", "Repair required", "No fault found", "Closed"]),
    formSelect("5.2", "escalationState", "Escalation state", ["None", "Technical", "Management", "Commercial"]),
  ],
  "5.3": [
    formSelect("5.3", "deficiencyState", "Deficiency state", ["Open", "Assigned", "In progress", "Ready for verification", "Accepted", "Closed"]),
    formSelect("5.3", "severity", "Deficiency severity", ["Minor", "Major", "Critical"]),
    formSelect("5.3", "responsibility", "Deficiency responsibility", ["Client", "GC / site", "ProFab", "Supplier", "Shared", "TBD"]),
    formSelect("5.3", "verificationState", "Verification state", ["Not required", "Pending", "Scheduled", "Passed", "Failed"]),
  ],
  "5.4": [
    formSelect("5.4", "inspectionOutcome", "Final inspection outcome", ["Accepted", "Accepted with deficiencies", "Conditional handover", "Reinspection required", "Rejected"]),
    formSelect("5.4", "handoverReadiness", "Handover readiness", ["Not ready", "Ready with conditions", "Ready", "Hold"]),
    formSelect("5.4", "residualDeficiencies", "Residual deficiency state", ["None", "Open", "Controlled", "Accepted by client", "Unresolved"]),
    formSelect("5.4", "acceptanceAuthority", "Acceptance authority", ["Technical", "Site", "Client", "Consultants", "Management"]),
  ],
  "5.5": [
    formSelect("5.5", "warrantyBasis", "Warranty Day 0 basis", ["Factory completion", "Site completion", "Commissioning", "Contract-specific"]),
    formSelect("5.5", "maintenanceResponsibility", "Maintenance responsibility", ["Owner", "Client / GC", "ProFab", "Shared", "Contract-specific"]),
    formSelect("5.5", "followUpState", "30 / 60 / 90 follow-up state", ["Not scheduled", "Scheduled", "In progress", "Complete"]),
    formSelect("5.5", "claimServiceLevel", "Claim response service level", ["Contract-specific", "Routine", "Urgent", "Emergency"]),
  ],
  "5.6": [
    formSelect("5.6", "closeoutState", "Closeout state", ["Draft", "In review", "Accepted", "Closed", "Returned"]),
    formSelect("5.6", "completionBasis", "Completion basis", ["Handover", "Warranty complete", "Commercial close", "Other"]),
    formSelect("5.6", "obligationState", "Outstanding obligation state", ["None", "Open", "Transferred", "Accepted risk", "Closed"]),
    formSelect("5.6", "lessonsState", "Lessons learned state", ["Not started", "Captured", "Reviewed", "Closed"]),
  ],
  "5.7": [
    formSelect("5.7", "disciplineCompleteness", "Discipline completeness", ["Complete", "Partial", "Not started", "Not applicable"]),
    formSelect("5.7", "deviationState", "As-built deviation state", ["None", "Documented", "Open review", "Accepted", "Unresolved"]),
    formSelect("5.7", "clientAcceptance", "Client acceptance state", ["Pending", "Accepted", "Accepted with conditions", "Returned"]),
    formSelect("5.7", "deliveryState", "DWF delivery state", ["Compiling", "Issued for review", "Accepted", "Superseded", "Closed"]),
  ],
  "5.8": [
    formSelect("5.8", "satisfactionRating", "Client satisfaction", ["Very satisfied", "Satisfied", "Neutral", "Dissatisfied", "Very dissatisfied", "Not provided"]),
    formSelect("5.8", "handoverState", "Handover state", ["Pending", "Complete", "Conditional", "Refused"]),
    formSelect("5.8", "trainingState", "Training state", ["Not required", "Scheduled", "Delivered", "Accepted"]),
    formSelect("5.8", "reservationsState", "Reservations state", ["None", "Open", "Accepted", "Closed"]),
  ],
  "5.9": [
    formSelect("5.9", "consentState", "Consent state", ["Pending", "Granted", "Granted with restrictions", "Declined", "Expired"]),
    formSelect("5.9", "permittedMedia", "Permitted media", ["Website", "Social", "Portfolio", "Internal only", "None"]),
    formSelect("5.9", "restrictionState", "Restriction state", ["None", "Named assets only", "No faces", "No address", "Other restriction"]),
    formSelect("5.9", "expiryHandling", "Expiry handling", ["No expiry", "Review date recorded", "Auto-expire", "Contract-specific"]),
  ],
  "5.10": [
    formSelect("5.10", "concernType", "Concern type", ["Performance", "Schedule", "Quality", "Communication", "Safety", "Commercial", "Other"]),
    formSelect("5.10", "severity", "Concern severity", ["Low", "Medium", "High", "Critical"]),
    formSelect("5.10", "urgency", "Requested response urgency", ["Routine", "Urgent", "Immediate", "Emergency"]),
    formSelect("5.10", "resolutionState", "Resolution state", ["Open", "Acknowledged", "In progress", "Resolved", "Escalated"]),
  ],
  "5.11": [
    formSelect("5.11", "responsePosition", "Response position", ["Accepted", "Partially accepted", "Disputed", "Clarification required"]),
    formSelect("5.11", "responseState", "Response state", ["Draft", "Issued", "Acknowledged", "Resolved", "Escalated"]),
    formSelect("5.11", "correctiveState", "Corrective-action state", ["Not required", "Planned", "In progress", "Verified", "Rejected"]),
    formSelect("5.11", "closureEvidence", "Closure evidence state", ["Pending", "Submitted", "Accepted", "Not accepted"]),
  ],
};

type FormSeed = Omit<ProfabFormDefinition, "id" | "fields">;

const define = (seed: FormSeed): ProfabFormDefinition => ({
  ...seed,
  id: `profab-${seed.index.replace(/\./g, "-")}-${seed.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  fields: Array.from(
    [
      ...commonFields(seed.focusLabel),
      ...profileFields[seed.profile].map((definition) =>
        seed.profile === "agreement" && definition.id === "executionState"
          ? { ...definition, bindingPath: "commercial.agreementStatus" }
          : definition,
      ),
      ...(DETAILED_FORM_FIELDS[seed.index] || []),
      ...(FORM_OPERATIONAL_FIELDS[seed.index] || []),
      specific(
        `formSpecific${seed.index.replace(/\./g, "_")}`,
        FORM_SPECIFIC_CONTROL_LABELS[seed.index],
        "textarea",
      ),
      specific(
        `acceptanceCriterion${seed.index.replace(/\./g, "_")}`,
        `${seed.title} acceptance / release criterion`,
        "textarea",
      ),
    ].reduce((byId, definition) => byId.set(definition.id, definition), new Map<string, ProfabFormFieldDefinition>()).values(),
  ),
});

const included = (pages: string, version?: string) => ({
  sourceAvailability: "Included" as const,
  sourcePages: pages,
  sourceVersion: version,
});
const indexOnly = { sourceAvailability: "Index Only" as const };

/**
 * Controlled register reconstructed from the nine-page index in Combined
 * Forms.pdf. The supplemental SMO is also included because it is a real form
 * in the package even though the index omits it.
 */
export const PROFAB_FORMS: ProfabFormDefinition[] = [

  define({ executionId: "exec-csa", index: "2.1", code: "CSA", title: "Consultation Services Agreement", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction"], type: "Agreement", profile: "agreement", description: "Pre-construction consulting scope, meetings, deliverables, compensation, and responsibilities.", focusLabel: "Consultation deliverables and boundaries", responsibleRole: "Technical / Sales", approvalRoles: ["Sales", "Technical", "Client"], defaultApplicability: "Conditional", signatureRequired: true, ...included("10–17", "S2.1 v250528") }),
  define({ executionId: "exec-csa-meeting-1", index: "2.1.1", code: "—", title: "Meeting #1", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction"], type: "Evidence", profile: "meeting", description: "Initial project goals, requirements, expectations, decisions, and actions.", focusLabel: "Initial goals, requirements, and expectations", responsibleRole: "Technical / Sales", approvalRoles: ["Technical"], defaultApplicability: "Conditional", ...indexOnly }),
  define({ executionId: "exec-csa-meeting-2", index: "2.1.2", code: "—", title: "Meeting #2", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction"], type: "Evidence", profile: "meeting", description: "Progress review and refinement of the service scope.", focusLabel: "Progress reviewed and scope refinements", responsibleRole: "Technical / Sales", approvalRoles: ["Technical"], defaultApplicability: "Conditional", ...indexOnly }),
  define({ executionId: "exec-nda", index: "2.2", code: "NDA", title: "Non-Disclosure Agreement", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction"], type: "Agreement", profile: "agreement", description: "Protect sensitive project information shared between parties.", focusLabel: "Protected information and permitted disclosure", responsibleRole: "Management / Legal", approvalRoles: ["Management", "Client"], defaultApplicability: "Conditional", signatureRequired: true, ...indexOnly }),
  define({ executionId: "exec-loi", index: "2.3", code: "LOI", title: "Letter of Intent", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction"], type: "Agreement", profile: "agreement", description: "Non-binding intent to proceed under defined basic terms; it cannot bypass controlled paid paths or gates.", focusLabel: "Intent, limits, conversion trigger, and exclusions", responsibleRole: "Sales / Management", approvalRoles: ["Management", "Client"], defaultApplicability: "Conditional", signatureRequired: true, approvalRequired: true, ...included("18–21", "S2.3 v250508") }),
  define({ executionId: "exec-fs", index: "2.4", code: "FS", title: "Feasibility Study", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment"], type: "Document", profile: "analysis", description: "High-level site, regulatory, access, servicing, logistics, and overall project feasibility.", focusLabel: "Feasibility question and decision boundary", responsibleRole: "Technical", approvalRoles: ["Technical", "Management"], defaultApplicability: "Conditional", ...included("22–27", "S2.4 v250508") }),
  define({ executionId: "exec-sa", index: "2.5", code: "SA", title: "Sales Agreement", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["gate-g2-technical-commitment", "production-readiness"], type: "Agreement", profile: "agreement", description: "Legally binding project scope, pricing, and conditions.", focusLabel: "Contract scope, price basis, and key conditions", responsibleRole: "Sales / Management", approvalRoles: ["Management", "Client"], defaultApplicability: "Conditional", signatureRequired: true, approvalRequired: true, ...included("28–53", "S2.5 v250624") }),
  define({ executionId: "exec-edat", index: "2.6", code: "EDAT", title: "Electronic Document Authorization & Transfer", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "production-readiness"], type: "Approval", profile: "approval", description: "Authorize electronic document transfer and confirm controlled handling and receipt.", focusLabel: "Authorized electronic document set and transfer method", responsibleRole: "Document Control", approvalRoles: ["Technical", "Client"], defaultApplicability: "Conditional", approvalRequired: true, ...included("54–56", "S2.6 v250924") }),
  define({ executionId: "exec-pcs", index: "2.7", code: "PCS", title: "Pre-Construction Services", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment"], type: "Agreement", profile: "agreement", description: "Pre-construction project management, design coordination, estimating, feasibility, and risk services.", focusLabel: "Authorized services, deliverables, fee basis, and limits", responsibleRole: "Technical / Project Management", approvalRoles: ["Technical", "Management", "Client"], defaultApplicability: "Conditional", signatureRequired: true, approvalRequired: true, ...included("57–66", "S2.7 v250924") }),
  define({ executionId: "exec-precon-pdaf", index: "2.8", code: "PDAF", title: "Preliminary Design Approval Form", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment"], type: "Approval", profile: "approval", description: "Client approval of the preliminary design before design finalization and progression.", focusLabel: "Design package, revision, assumptions, and exceptions", responsibleRole: "Technical / Client", approvalRoles: ["Technical", "Client"], defaultApplicability: "Conditional", signatureRequired: true, approvalRequired: true, ...included("67–69", "S2.8 v250525") }),
  define({ executionId: "exec-precon-sdr", index: "2.9", code: "SDR", title: "Site Discovery Report", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment", "delivery-project-completion"], type: "Evidence", profile: "report", description: "Site conditions, measurements, topography, access, and potential challenges.", focusLabel: "Site observations, measurements, and constraints", responsibleRole: "Technical / Site", approvalRoles: ["Technical"], defaultApplicability: "Conditional", ...indexOnly }),
  define({ executionId: "exec-precon-cec", index: "2.10", code: "CEC", title: "Cost Estimate Classification: D, C, B, A", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment", "production-readiness"], type: "Document", profile: "analysis", description: "Controlled estimate classification, basis, assumptions, exclusions, risk, and maturity progression.", focusLabel: "Estimate class, amount, scope basis, and maturity", responsibleRole: "Estimating / Technical", approvalRoles: ["Technical", "Management"], defaultApplicability: "Required", approvalRequired: true, ...included("70–103", "S2.10 v251105") }),
  define({ executionId: "exec-precon-rfi", index: "2.11", code: "RFI", title: "Request for Information", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "production-readiness", "factory-production", "delivery-project-completion"], type: "Task", profile: "register", description: "Formal request to clarify project details or specifications, with owner and response control.", focusLabel: "Question, drawing/specification reference, and impact", responsibleRole: "Project Management / Technical", approvalRoles: ["Technical"], defaultApplicability: "Triggered", ...included("104–105", "S2.11 v250715") }),
  define({ executionId: "exec-precon-ser", index: "2.12", code: "SER", title: "Specification Exception Report", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "production-readiness", "factory-production"], type: "Evidence", profile: "report", description: "Identify deviations from standard specifications and document reasons, impacts, and disposition.", focusLabel: "Specification exception, reason, and affected scope", responsibleRole: "Technical / Quality", approvalRoles: ["Technical", "Client"], defaultApplicability: "Triggered", approvalRequired: true, ...included("106–108", "S2.12 v250829") }),
  define({ executionId: "exec-precon-sow", index: "2.13", code: "SOW", title: "Scope of Work", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment", "production-readiness", "delivery-project-completion"], type: "Document", profile: "package", description: "Detailed tasks, responsibilities, deliverables, inclusions, exclusions, and interfaces for all parties.", focusLabel: "Scope boundaries, interfaces, inclusions, and exclusions", responsibleRole: "Project Management / Technical", approvalRoles: ["Technical", "Management", "Client"], defaultApplicability: "Required", approvalRequired: true, sourceNote: "The included form header is numbered S2.12 while the controlled index assigns 2.13.", ...included("109–113", "S2.12 v250901") }),
  define({ executionId: "exec-precon-smo", index: "2.13.1", code: "SMO", title: "Scope & Modular Responsibility Overview", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment", "delivery-project-completion"], type: "Document", profile: "package", description: "High-level client-facing responsibility overview that supports alignment but does not replace the detailed RM.", focusLabel: "Delivery model, responsibility transfer, and interfaces", responsibleRole: "Technical / Project Management", approvalRoles: ["Technical", "Management"], defaultApplicability: "Supporting", sourceAvailability: "Supplemental", sourcePages: "114–116", sourceVersion: "S2.13.1 v260629", sourceNote: "Present in the source package but omitted from the nine-page controlled index." }),
  define({ executionId: "exec-precon-rm", index: "2.14", code: "RM", title: "Responsibility Matrix", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "gate-g2-technical-commitment", "production-readiness", "delivery-project-completion", "commissioning-warranty"], type: "Document", profile: "package", description: "High-level responsibility allocation across project tasks and deliverables; SOW carries detailed boundaries.", focusLabel: "Core parties, scope lines, and unassigned interfaces", responsibleRole: "Project Management", approvalRoles: ["Technical", "Management", "Client"], defaultApplicability: "Required", approvalRequired: true, ...included("117–149", "S2.14 v250623") }),
  define({ executionId: "exec-production-pso", index: "2.15", code: "PSO", title: "Product Signoff Form", stage: "Pre-Construction", linkedLayer2NodeId: "production-readiness", lifecycleTouchpoints: ["pre-construction", "production-readiness", "gate-g3-production-authorization"], type: "Approval", profile: "approval", description: "Client approval of selected products or materials before procurement and production.", focusLabel: "Products/materials, selections, substitutions, and revision", responsibleRole: "Technical / Client", approvalRoles: ["Technical", "Management", "Client"], defaultApplicability: "Required", signatureRequired: true, approvalRequired: true, sourceNote: "The included form header is numbered S2.2 while the controlled index assigns 2.15.", ...included("150–151", "S2.2 v250520") }),
  define({ executionId: "exec-precon-ps", index: "2.16", code: "PS", title: "Project Summary", stage: "Pre-Construction", linkedLayer2NodeId: "pre-construction", lifecycleTouchpoints: ["pre-construction", "production-readiness", "delivery-project-completion", "close-out"], type: "Document", profile: "package", description: "High-level project goals, timeline, stakeholders, delivery model, and deliverables.", focusLabel: "Project goals, success criteria, and current baseline", responsibleRole: "Project Management", approvalRoles: ["Management"], defaultApplicability: "Supporting", ...included("152–154", "S2.16 v250926") }),
  define({ executionId: "exec-production-dc", index: "2.17", code: "CD", title: "Change Directive", stage: "Pre-Construction", linkedLayer2NodeId: "production-readiness", lifecycleTouchpoints: ["pre-construction", "production-readiness", "factory-production", "delivery-project-completion"], type: "Approval", profile: "approval", description: "Instruction to proceed with a change before cost or schedule adjustments are fully agreed.", focusLabel: "Directed change, reason, affected scope, and interim authority", responsibleRole: "Project Management", approvalRoles: ["Management", "Client"], defaultApplicability: "Triggered", signatureRequired: true, approvalRequired: true, sourceNote: "The controlled index shows code DC; the included form header uses CD. CD is retained as the actual form code and the discrepancy is exposed.", ...included("155–157", "S2.17 v251113") }),
  define({ executionId: "exec-production-co", index: "2.18", code: "CO", title: "Change Order", stage: "Pre-Construction", linkedLayer2NodeId: "production-readiness", lifecycleTouchpoints: ["pre-construction", "production-readiness", "factory-production", "delivery-project-completion", "close-out"], type: "Agreement", profile: "agreement", description: "Formal contract change to scope, cost, or schedule after contract execution.", focusLabel: "Change description, price, schedule, and contract impact", responsibleRole: "Project Management / Commercial", approvalRoles: ["Management", "Client"], defaultApplicability: "Triggered", signatureRequired: true, approvalRequired: true, ...included("158–161", "S2.18 v2511.05") }),
  define({ executionId: "exec-production-ct", index: "2.18.1", code: "CT", title: "CD and CO Tracker", stage: "Pre-Construction", linkedLayer2NodeId: "production-readiness", lifecycleTouchpoints: ["pre-construction", "production-readiness", "factory-production", "delivery-project-completion", "close-out"], type: "Task", profile: "register", description: "Track change directives and change orders through authorization, pricing, schedule impact, implementation, and closure.", focusLabel: "Change reference, type, scope, cost, and schedule impact", responsibleRole: "Project Management / Process Coordinator", approvalRoles: ["Management"], defaultApplicability: "Triggered", ...included("162", "S2.18.1 v250907") }),
  define({ executionId: "exec-delivery-odn", index: "2.19", code: "ODN", title: "Occupancy Delay Notification", stage: "Pre-Construction", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["pre-construction", "production-readiness", "delivery-project-completion"], type: "Evidence", profile: "notice", description: "Formal notice of client-caused readiness or occupancy delays affecting delivery or completion.", focusLabel: "Delay cause, responsibility, evidence, and required cure", responsibleRole: "Project Management / Commercial", approvalRoles: ["Management", "Client"], defaultApplicability: "Triggered", approvalRequired: true, ...included("163–164", "S2.19 v250919") }),

  define({ executionId: "exec-production-mps", index: "3.1", code: "MPS", title: "Module Production Schedule", stage: "Factory", linkedLayer2NodeId: "production-readiness", lifecycleTouchpoints: ["production-readiness", "gate-g3-production-authorization", "factory-production", "gate-g4-factory-release"], type: "Document", profile: "schedule", description: "Detailed production and factory-completion timeline for each module.", focusLabel: "Module sequence, release dates, and production constraints", responsibleRole: "Factory Planning", approvalRoles: ["Factory", "Project Management"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-factory-mqc", index: "3.2", code: "MQC", title: "Module Quality Control", stage: "Factory", linkedLayer2NodeId: "factory-production", lifecycleTouchpoints: ["factory-production", "gate-g4-factory-release"], type: "Evidence", profile: "report", description: "Factory quality-control evidence demonstrating modules meet required standards.", focusLabel: "Quality checkpoint, acceptance criteria, and evidence", responsibleRole: "Factory Quality", approvalRoles: ["Factory", "Quality"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-factory-mir", index: "3.3", code: "MIR", title: "Module Inspection Report", stage: "Factory", linkedLayer2NodeId: "factory-production", lifecycleTouchpoints: ["factory-production", "gate-g4-factory-release"], type: "Evidence", profile: "report", description: "Inspection result for each module during or after production.", focusLabel: "Module ID, inspection scope, deficiencies, and evidence", responsibleRole: "Factory Quality", approvalRoles: ["Factory", "Quality"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-factory-trr", index: "3.4", code: "TRR", title: "Transport Readiness Report", stage: "Factory", linkedLayer2NodeId: "factory-production", lifecycleTouchpoints: ["factory-production", "gate-g4-factory-release", "delivery-project-completion"], type: "Evidence", profile: "report", description: "Confirm modules, dimensions, protection, lifting points, permits, route, and staging are ready for transport.", focusLabel: "Module IDs, route, permits, protection, and release constraints", responsibleRole: "Logistics / Factory", approvalRoles: ["Factory", "Project Management"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-factory-mso", index: "3.5", code: "MSO", title: "Module Sign-Off", stage: "Factory", linkedLayer2NodeId: "gate-g4-factory-release", lifecycleTouchpoints: ["factory-production", "gate-g4-factory-release", "delivery-project-completion"], type: "Approval", profile: "approval", description: "Confirmation that each module passed inspections and is approved for transport.", focusLabel: "Module ID, inspection references, open punch items, and release decision", responsibleRole: "Factory / Quality", approvalRoles: ["Factory", "Technical", "Client"], defaultApplicability: "Required", signatureRequired: true, approvalRequired: true, ...included("165–167", "S3.5 v250926") }),

  define({ executionId: "exec-delivery-ssp", index: "4.1", code: "SSP", title: "Site Safety Plan", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["gate-g4-factory-release", "delivery-project-completion"], type: "Document", profile: "package", description: "Safety protocols, access rules, emergency contacts, and site responsibilities.", focusLabel: "Site hazards, controls, access, and emergency arrangements", responsibleRole: "General Contractor / Site Safety", approvalRoles: ["Site", "Management"], defaultApplicability: "Conditional", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-mdr", index: "4.2", code: "MDR", title: "Module Delivery and Receipt Form", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["gate-g4-factory-release", "delivery-project-completion"], type: "Evidence", profile: "report", description: "Confirm modules were delivered, received, and checked for condition and completeness.", focusLabel: "Module IDs, carrier, delivery time, and received condition", responsibleRole: "Site / Logistics", approvalRoles: ["Site", "Project Management"], defaultApplicability: "Required", signatureRequired: true, approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-mai", index: "4.3", code: "MAI", title: "Module Assembly Instruction", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["gate-g4-factory-release", "delivery-project-completion"], type: "Document", profile: "instructions", description: "Controlled instructions for on-site module assembly.", focusLabel: "Module type, assembly limits, interfaces, and hold points", responsibleRole: "Technical / Site", approvalRoles: ["Technical"], defaultApplicability: "Supporting", ...indexOnly }),
  define({ executionId: "exec-delivery-mic", index: "4.4", code: "MIC", title: "Module Installation Checklist", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start"], type: "Evidence", profile: "report", description: "Verify required installation steps and evidence during module assembly.", focusLabel: "Module ID, installation sequence, hold points, and incomplete work", responsibleRole: "Site / Technical", approvalRoles: ["Site", "Technical"], defaultApplicability: "Conditional", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-msi", index: "4.5", code: "MSI", title: "Module Site Inspection Report", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start"], type: "Evidence", profile: "report", description: "Inspection of modules and interfaces after installation on site.", focusLabel: "Module/site area, inspection criteria, deficiencies, and photos", responsibleRole: "Technical / Site Quality", approvalRoles: ["Technical", "Site"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-malr", index: "4.6", code: "MALR", title: "Module Alignment & Leveling Report", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start"], type: "Evidence", profile: "report", description: "Confirm modules are aligned and level on the foundation within accepted tolerances.", focusLabel: "Module grid, survey readings, tolerances, and corrections", responsibleRole: "Site / Survey / Technical", approvalRoles: ["Technical", "Site"], defaultApplicability: "Conditional", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-wsvr", index: "4.7", code: "WSVR", title: "Weatherproofing & Seal Verification Report", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start", "commissioning-warranty"], type: "Evidence", profile: "report", description: "Verify weatherproofing and sealing protect the building from weather exposure.", focusLabel: "Joints/areas inspected, test method, leakage, and corrective work", responsibleRole: "Envelope / Site Quality", approvalRoles: ["Technical", "Site"], defaultApplicability: "Conditional", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-ucv", index: "4.8", code: "UCV", title: "Utility Connection Verification", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start", "commissioning-warranty"], type: "Evidence", profile: "report", description: "Verify contracted utilities are connected, tested, functional, and accepted.", focusLabel: "Utility system, test result, authority, and outstanding work", responsibleRole: "MEP / Site", approvalRoles: ["Technical", "Site", "Consultants"], defaultApplicability: "Conditional", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-mdar", index: "4.9", code: "MDAR", title: "Module Damage Assessment Report", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["gate-g4-factory-release", "delivery-project-completion", "commissioning-warranty"], type: "Evidence", profile: "report", description: "Assess module damage during transport or installation and control responsibility and repair.", focusLabel: "Module ID, damage location, cause, severity, and photos", responsibleRole: "Site / Quality / Logistics", approvalRoles: ["Technical", "Management"], defaultApplicability: "Triggered", approvalRequired: true, ...included("168–172", "S4.9 v251003") }),
  define({ executionId: "exec-delivery-irf", index: "4.10", code: "IRF", title: "Incident Report Form", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["factory-production", "delivery-project-completion", "commissioning-warranty"], type: "Evidence", profile: "notice", description: "Document safety, quality, damage, or other incidents and immediate controls.", focusLabel: "Incident facts, location, persons, evidence, and immediate action", responsibleRole: "Site Safety / Project Management", approvalRoles: ["Site", "Management"], defaultApplicability: "Triggered", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-delivery-irl", index: "4.10.1", code: "IRL", title: "Incident Response Log", stage: "On-Site", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["factory-production", "delivery-project-completion", "commissioning-warranty", "close-out"], type: "Task", profile: "register", description: "Track communications, evidence, engineering input, corrective actions, and closure after MDAR or IRF.", focusLabel: "Incident reference, response entry, evidence, and closure criterion", responsibleRole: "Project Management / Safety", approvalRoles: ["Management"], defaultApplicability: "Triggered", ...indexOnly }),

  define({ executionId: "exec-commissioning-ddss", index: "5.1", code: "DDSS", title: "Delegated Design Service Statement", stage: "Post-Construction", linkedLayer2NodeId: "commissioning-warranty", lifecycleTouchpoints: ["pre-construction", "production-readiness", "delivery-project-completion", "commissioning-warranty"], type: "Document", profile: "package", description: "Confirm design services delegated to consultants, trades, or subcontractors and their deliverables.", focusLabel: "Delegated discipline, party, scope, deliverable, and seal requirement", responsibleRole: "Technical / Consultants", approvalRoles: ["Technical", "Consultants"], defaultApplicability: "Conditional", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-commissioning-miss", index: "5.2", code: "MISS", title: "Module Installation Support Service", stage: "Post-Construction", linkedLayer2NodeId: "commissioning-warranty", lifecycleTouchpoints: ["delivery-project-completion", "commissioning-warranty"], type: "Task", profile: "service", description: "Control support requests and issues arising after module installation.", focusLabel: "Installation issue, requested support, urgency, and boundaries", responsibleRole: "Technical Service", approvalRoles: ["Technical", "Project Management"], defaultApplicability: "Conditional", ...indexOnly }),
  define({ executionId: "exec-delivery-dplr", index: "5.3", code: "DPLR", title: "Deficiency & Punch List Report", stage: "Post-Construction", linkedLayer2NodeId: "delivery-project-completion", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start", "commissioning-warranty", "close-out"], type: "Task", profile: "register", description: "Track outstanding deficiencies to ownership, due date, verification, and closure.", focusLabel: "Deficiency, location, responsibility, evidence, and acceptance criterion", responsibleRole: "Project Management / Site Quality", approvalRoles: ["Technical", "Client"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-commissioning-fir", index: "5.4", code: "FIR", title: "Final Inspection Report", stage: "Post-Construction", linkedLayer2NodeId: "commissioning-warranty", lifecycleTouchpoints: ["delivery-project-completion", "gate-g5-warranty-start", "commissioning-warranty"], type: "Evidence", profile: "report", description: "Final inspection before handover confirming work is complete and meets required standards.", focusLabel: "Inspection scope, authority, accepted work, and residual deficiencies", responsibleRole: "Technical / Site Quality", approvalRoles: ["Technical", "Client", "Consultants"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-commissioning-wma", index: "5.5", code: "WMA", title: "Warranty & Maintenance Agreement", stage: "Post-Construction", linkedLayer2NodeId: "commissioning-warranty", lifecycleTouchpoints: ["gate-g5-warranty-start", "commissioning-warranty", "close-out"], type: "Agreement", profile: "agreement", description: "Warranty scope, start, duration, exclusions, maintenance obligations, and service route.", focusLabel: "Warranty start, coverage, exclusions, maintenance, and claim route", responsibleRole: "Warranty / Management", approvalRoles: ["Management", "Client"], defaultApplicability: "Required", signatureRequired: true, approvalRequired: true, sourceNote: "The included form header is numbered S2.5 while the controlled index assigns 5.5.", ...included("173–178", "S2.5 v250625") }),
  define({ executionId: "exec-commissioning-pcr", index: "5.6", code: "PCR", title: "Project Closeout Report", stage: "Post-Construction", linkedLayer2NodeId: "close-out", lifecycleTouchpoints: ["commissioning-warranty", "close-out"], type: "Document", profile: "package", description: "Final closeout summary, accomplishments, lessons learned, final documents, and open-obligation reconciliation.", focusLabel: "Completion basis, lessons learned, and final unresolved obligations", responsibleRole: "Project Management", approvalRoles: ["Management", "Client"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-commissioning-abdp", index: "5.7", code: "ABDP", title: "As-Built Documentation Package", stage: "Post-Construction", linkedLayer2NodeId: "commissioning-warranty", lifecycleTouchpoints: ["delivery-project-completion", "commissioning-warranty", "close-out"], type: "Document", profile: "package", description: "Final as-built package reflecting approved changes and actual construction.", focusLabel: "As-built disciplines, revision status, deviations, and completeness", responsibleRole: "Document Control / Technical", approvalRoles: ["Technical", "Client", "Consultants"], defaultApplicability: "Required", approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-commissioning-cshf", index: "5.8", code: "CSHF", title: "Client Satisfaction & Handover Form", stage: "Post-Construction", linkedLayer2NodeId: "commissioning-warranty", lifecycleTouchpoints: ["gate-g5-warranty-start", "commissioning-warranty", "close-out"], type: "Approval", profile: "approval", description: "Client feedback, satisfaction, handover acknowledgement, and remaining commitments.", focusLabel: "Handover package, training, satisfaction, and reservations", responsibleRole: "Project Management / Client", approvalRoles: ["Management", "Client"], defaultApplicability: "Required", signatureRequired: true, approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-close-pmrf", index: "5.9", code: "PMRF", title: "Photography & Media Release Form", stage: "Post-Construction", linkedLayer2NodeId: "close-out", lifecycleTouchpoints: ["commissioning-warranty", "close-out"], type: "Approval", profile: "approval", description: "Authorize defined use of project photography and media for marketing or publicity.", focusLabel: "Media assets, permitted uses, restrictions, and expiry", responsibleRole: "Marketing / Client", approvalRoles: ["Management", "Client"], defaultApplicability: "Optional", signatureRequired: true, approvalRequired: true, ...indexOnly }),
  define({ executionId: "exec-close-noc", index: "5.10", code: "NOC", title: "Notice of Concern", stage: "Post-Construction", linkedLayer2NodeId: "close-out", lifecycleTouchpoints: ["pre-construction", "factory-production", "delivery-project-completion", "commissioning-warranty", "close-out"], type: "Task", profile: "notice", description: "Client notice of a formal performance, timeline, quality, or communication concern.", focusLabel: "Concern, facts, contract reference, requested remedy, and urgency", responsibleRole: "Client / Project Management", approvalRoles: ["Client"], defaultApplicability: "Triggered", ...indexOnly }),
  define({ executionId: "exec-close-rnoc", index: "5.11", code: "RNOC", title: "Response to Notice of Concern", stage: "Post-Construction", linkedLayer2NodeId: "close-out", lifecycleTouchpoints: ["pre-construction", "factory-production", "delivery-project-completion", "commissioning-warranty", "close-out"], type: "Task", profile: "notice", description: "Builder response, corrective action, ownership, timing, and resolution of a client NOC.", focusLabel: "NOC reference, response position, corrective plan, and closure evidence", responsibleRole: "Project Management / Management", approvalRoles: ["Management", "Client"], defaultApplicability: "Triggered", approvalRequired: true, ...indexOnly }),
];

export const PROFAB_FORM_BY_ID = new Map(PROFAB_FORMS.map((form) => [form.id, form]));

export const PROFAB_SOURCE_PACKAGE_ISSUES = [
  "Combined Forms.pdf pages 179–193 render embedded XLSX/DOCX binary data as page content and are not usable controlled forms.",
  "SMO (2.13.1) is present on pages 114–116 but omitted from the nine-page source index.",
  "The index uses DC for 2.17 while the included form uses CD; the system preserves CD and exposes the discrepancy.",
  "Included SOW, PSO, and WMA headers do not match their controlled index numbers; the index remains the lifecycle identifier.",
] as const;

function editableFieldFromDefinition(
  definition: ProfabFormFieldDefinition,
): EditableFormField {
  return {
    id: definition.id,
    label: definition.label,
    type: definition.type,
    required: definition.required,
    section: definition.section,
    ...(definition.placeholder ? { placeholder: definition.placeholder } : {}),
    ...(definition.help ? { help: definition.help } : {}),
    ...(definition.options?.length ? { options: [...definition.options] } : {}),
  };
}

type ProfabFormItem = Pick<ExecutionItem, "catalogId"> &
  Partial<Pick<ExecutionItem, "formOverrides" | "id" | "title" | "description">>;

/**
 * Resolve a controlled form and layer the execution item's local edits over
 * it. Catalog definitions remain immutable; edits belong to the workflow
 * item so every L3 record can be customized independently.
 */
export function getProfabForm(item: ProfabFormItem): ProfabFormDefinition | undefined {
  const catalog = item.catalogId ? PROFAB_FORM_BY_ID.get(item.catalogId) : undefined;
  if (!catalog && !item.formOverrides) return undefined;

  const base: ProfabFormDefinition = catalog || {
    id: `custom-form-${item.id || "item"}`,
    executionId: item.id || "custom-execution-item",
    index: "Custom",
    code: "CUSTOM",
    title: item.title || "Custom L3 form",
    stage: "Corporate",
    linkedLayer2NodeId: "",
    lifecycleTouchpoints: [],
    type: "Task",
    profile: "register",
    description: item.description || "Custom L3 execution requirements.",
    focusLabel: "Custom L3 requirements",
    responsibleRole: "",
    approvalRoles: [],
    defaultApplicability: "Required",
    sourceAvailability: "Supplemental",
    fields: [],
  };
  const overrides = item.formOverrides;
  if (!overrides) return base;

  const removed = new Set(overrides.removedFieldIds || []);
  const overrideById = new Map(
    (overrides.fields || []).map((definition) => [definition.id, definition]),
  );
  const baseIds = new Set(base.fields.map((definition) => definition.id));
  const fields = base.fields
    .filter((definition) => !removed.has(definition.id))
    .map((definition) => {
      const override = overrideById.get(definition.id);
      return override
        ? {
            ...definition,
            ...override,
            // Operational bindings and computed/read-only semantics remain
            // controlled by the catalog even when the label is editable.
            bindingPath: definition.bindingPath,
            bindingValueType: definition.bindingValueType,
            computed: definition.computed,
            readOnly: definition.readOnly,
            requiredWhen: definition.requiredWhen,
            visibleWhen: definition.visibleWhen,
            origin: definition.origin,
          }
        : definition;
    });
  const customFields: ProfabFormFieldDefinition[] = (overrides.fields || [])
    .filter((definition) => !baseIds.has(definition.id) && !removed.has(definition.id))
    .map((definition) => ({
      ...definition,
      section: definition.section || "Custom fields",
      origin: "specific" as const,
    }));

  return {
    ...base,
    title: overrides.title?.trim() || base.title,
    description: overrides.description?.trim() || base.description,
    fields: [...fields, ...customFields],
  };
}

export function profabFormRequiredFieldIds(form: ProfabFormDefinition) {
  return form.fields.filter((item) => item.required).map((item) => item.id);
}
