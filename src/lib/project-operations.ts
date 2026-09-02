import type {
  ApprovalRole,
  ApprovalRequest,
  BimObjectResponsibility,
  CommercialInvoice,
  CommercialReceipt,
  ConvergenceTask,
  EstimateAssembly,
  EstimateClass,
  EstimateVersion,
  PaymentMilestone,
  ProjectOperations,
  ProductionActivity,
  SecondaryGate,
  TimeEntry,
  WarrantyFollowUp,
} from "@/types/project-operations";

type GateCheck = { id: string; label: string; passed: boolean; reason: string };
type GateStatus = { ready: boolean; blockers: string[] };

const ESTIMATE_ORDER: EstimateClass[] = ["D", "C", "B", "A"];
const ESTIMATE_METADATA: Record<
  EstimateClass,
  {
    basis: string;
    low: number;
    high: number;
    contingency: number;
  }
> = {
  D: { basis: "Concept", low: -30, high: 50, contingency: 20 },
  C: { basis: "Preliminary", low: -20, high: 30, contingency: 15 },
  B: { basis: "Permit", low: -10, high: 15, contingency: 10 },
  A: { basis: "IFC", low: -5, high: 10, contingency: 5 },
};

const APPROVAL_RANK: Record<ApprovalRole, number> = {
  Coordinator: 1,
  "Project Manager": 2,
  Estimator: 2,
  Engineering: 2,
  Finance: 3,
  CRO: 4,
  CEO: 5,
  Client: 1,
};

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function dateOnly(value: string | Date) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function parseDate(value: string | Date) {
  if (value instanceof Date) return new Date(value.getTime());
  const normalized = dateOnly(value);
  return normalized ? new Date(`${normalized}T00:00:00Z`) : new Date("invalid");
}

function addDays(value: string | Date, days: number) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string | Date, months: number) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Math.max(0, Math.floor(months)));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}

function yearSuffix(now: Date) {
  return String(now.getUTCFullYear()).slice(-2);
}

function canonicalProjectNumber(value: unknown) {
  return /^([LP])-\d{2}-\d{3}$/.test(text(value));
}

function sequenceFrom(value: string, fallback = "001") {
  const canonical = value.match(/^[LP]-\d{2}-(\d{3})$/);
  if (canonical) return canonical[1];
  const digits = value.replace(/\D/g, "");
  return digits.length >= 3 ? digits.slice(-3) : fallback;
}

function makeIdentity(name: string, legacyJobNumber: string, now: Date) {
  const supplied = text(legacyJobNumber);
  const canonical = canonicalProjectNumber(supplied) ? supplied : "";
  const yy = canonical ? canonical.slice(2, 4) : yearSuffix(now);
  const sequence = sequenceFrom(supplied);
  const legacy = canonical
    ? `${canonical.slice(2, 4)}${canonical.slice(-3)}`
    : /^\d{5}$/.test(supplied)
      ? supplied
      : "";
  const suffix = sequence.padStart(4, "0").slice(-4);
  const clientId = `CL-${yy}-${suffix}`;
  const leadId = `LD-${yy}-${suffix}`;
  const lifecycleState = canonical ? "Project" : "Client";
  return {
    clientId,
    leadId,
    projectNumber: canonical,
    legacyJobNumber: legacy,
    lifecycleState,
    numberHistory: [
      {
        level: "Client",
        number: clientId,
        assignedAt: now.toISOString(),
        assignedBy: "System",
      },
      ...(canonical
        ? [
            {
              level: "Project",
              number: canonical,
              assignedAt: now.toISOString(),
              assignedBy: "System",
            },
          ]
        : []),
    ],
  };
}

function qualificationQuestions(): ProjectOperations["qualification"] {
  const prompts = [
    "Is the client identity and decision authority confirmed?",
    "Is the project intent and modular opportunity defined?",
    "Is the site owned, controlled, or credibly identified?",
    "Is the design information available at its current maturity?",
    "Is modular compatibility plausible for the stated scope?",
    "Is budget or funding credible for the proposed work?",
    "Is the requested timeline realistic?",
    "Are responsibilities, interfaces, and approvals understood?",
    "Is a bounded paid or commercial engagement route identified?",
    "Are known risks, evidence, and next actions documented?",
  ];
  return prompts.map((prompt, index) => ({
    id: `qualification-${index + 1}`,
    order: index + 1,
    prompt,
    answer: "",
    evidence: "",
    gateRequired: true,
  }));
}

function paymentPlan(): PaymentMilestone[] {
  return [
    {
      id: "deposit-25",
      label: "Agreement signing / Gate 1 release",
      percent: 25,
      status: "Pending",
      invoiceId: "",
    },
    {
      id: "production-25",
      label: "Production / material purchasing",
      percent: 25,
      status: "Pending",
      invoiceId: "",
    },
    {
      id: "factory-25",
      label: "Module completion / FOB yard",
      percent: 25,
      status: "Pending",
      invoiceId: "",
    },
    {
      id: "final-25",
      label: "Site reception / commissioning / holdback",
      percent: 25,
      status: "Pending",
      invoiceId: "",
    },
  ];
}

function siteGates(): SecondaryGate[] {
  const gates: Array<[string, string, string]> = [
    ["civil", "Civil design and site works readiness", "Technical / Civil"],
    ["foundation", "Foundation readiness", "Client / Civil"],
    ["utilities", "Utility responsibility and connection readiness", "Client / Utilities"],
    ["site-access", "Site access, crane, laydown, and safety readiness", "Site / Logistics"],
    ["pre-delivery", "Pre-delivery site check", "Project Management / Site"],
  ];
  return gates.map(([id, label, ownerParty]) => ({
    id,
    label,
    ownerParty,
    responsiblePerson: "",
    requiredEvidence: ["Signed readiness checklist"],
    evidenceReferences: [],
    targetDate: "",
    status: "Blocked",
    approvedBy: "",
    approvedAt: "",
    naReason: "",
  }));
}

function defaultConvergenceTasks(): ConvergenceTask[] {
  return [
    { id: "convergence-d-c", fromClass: "D", toClass: "C", status: "Not Started", evidence: "", owner: "" },
    { id: "convergence-c-b", fromClass: "C", toClass: "B", status: "Not Started", evidence: "", owner: "" },
    { id: "convergence-b-a", fromClass: "B", toClass: "A", status: "Not Started", evidence: "", owner: "" },
  ];
}

export function createDefaultProjectOperations(
  name = "",
  legacyJobNumber = "",
  now = new Date(),
): ProjectOperations {
  const identity = makeIdentity(name, legacyJobNumber, now);
  return {
    updatedAt: now.toISOString(),
    identity,
    qualification: qualificationQuestions(),
    clientPath: {
      clientType: "Unclassified",
      selectedSubGates: [],
      classificationReason: name
        ? `Awaiting controlled qualification and path classification for ${name}.`
        : "Awaiting controlled qualification and path classification.",
      relationship: "",
      designMaturity: "",
      siteMaturity: "",
      fundingMaturity: "",
      classifiedAt: "",
      classifiedBy: "",
    },
    commercial: {
      currency: "CAD",
      contractValue: 0,
      engagementType: "",
      agreementStatus: "Draft",
      agreementReference: "",
      executedDate: "",
      paymentPlan: paymentPlan(),
      invoices: [],
      receipts: [],
      paymentRelease: {
        id: "payment-release",
        status: "Pending",
        evidence: "",
        releasedAt: "",
        releasedBy: "",
        approverRole: "",
        reasons: [],
      },
    },
    approvals: { requests: [] },
    designBoundary: {
      deliveryModel: "Unselected",
      architectOfRecord: "",
      profabScope: "",
      clientConsultantScope: "",
      exclusions: "",
      boundaryAccepted: false,
      acceptedByClient: "",
      acceptedAt: "",
      agreementReference: "",
    },
    siteReadiness: { gates: siteGates() },
    estimating: {
      inputs: {},
      assemblies: [],
      calculatedClassDAmount: 0,
      versions: [],
      convergenceTasks: defaultConvergenceTasks(),
    },
    warranty: {
      dayZeroDate: "",
      durationMonths: 0,
      expiryDate: "",
      owner: "",
      triggerEvidence: "",
      followUps: [],
    },
    production: {
      factoryWeeklyCapacityHours: 0,
      committedWeeklyCapacityHours: 0,
      procurementUnlocked: false,
      productionStartAuthorized: false,
      activities: [],
    },
    timeBudget: {
      budgetHours: 0,
      warningThresholdPercent: 80,
      criticalThresholdPercent: 100,
      entries: [],
    },
    bim: {
      gpfPattern: "^[A-Z]+-\\d{4}-[A-Z0-9]+$",
      objects: [],
    },
    spec: {},
    audit: [],
  };
}

export function normalizeProjectOperations(
  raw: ProjectOperations | undefined,
  name = "",
  legacyJobNumber = "",
): ProjectOperations {
  // Saved files can contain older partial shapes. Treat this boundary as
  // untrusted JSON and rebuild every controlled branch from the defaults.
  const value = (raw || {}) as any;
  const defaults = createDefaultProjectOperations(name, legacyJobNumber);
  const rawIdentity = value.identity || {};
  const projectNumber = text(rawIdentity.projectNumber) ||
    (canonicalProjectNumber(legacyJobNumber) ? text(legacyJobNumber) : "");
  const defaultIdentity = defaults.identity;
  const identity = {
    ...defaultIdentity,
    ...rawIdentity,
    clientId: text(rawIdentity.clientId) || defaultIdentity.clientId,
    leadId: text(rawIdentity.leadId) || defaultIdentity.leadId,
    projectNumber,
    legacyJobNumber:
      text(rawIdentity.legacyJobNumber) ||
      (canonicalProjectNumber(projectNumber)
        ? `${projectNumber.slice(2, 4)}${projectNumber.slice(-3)}`
        : /^\d{5}$/.test(legacyJobNumber) ? legacyJobNumber : ""),
    lifecycleState:
      text(rawIdentity.lifecycleState) || (projectNumber ? "Project" : "Client"),
  };
  const rawClientPath = value.clientPath || {};
  const rawCommercial = value.commercial || {};
  const rawPaymentRelease = rawCommercial.paymentRelease || {};
  const rawEstimating = value.estimating || {};
  const rawWarranty = value.warranty || {};
  const rawProduction = value.production || {};
  const rawTimeBudget = value.timeBudget || {};
  const rawBim = value.bim || {};

  return {
    ...defaults,
    ...value,
    updatedAt: text(value.updatedAt) || defaults.updatedAt,
    identity,
    qualification: Array.isArray(value.qualification)
      ? value.qualification
      : defaults.qualification,
    clientPath: {
      ...defaults.clientPath,
      ...rawClientPath,
      clientType: text(rawClientPath.clientType) || defaults.clientPath.clientType,
      selectedSubGates: Array.isArray(rawClientPath.selectedSubGates)
        ? rawClientPath.selectedSubGates
        : [],
      classificationReason:
        text(rawClientPath.classificationReason) || defaults.clientPath.classificationReason,
    },
    commercial: {
      ...defaults.commercial,
      ...rawCommercial,
      currency: text(rawCommercial.currency) || defaults.commercial.currency,
      contractValue: rawCommercial.contractValue ?? defaults.commercial.contractValue,
      paymentPlan: Array.isArray(rawCommercial.paymentPlan)
        ? rawCommercial.paymentPlan
        : defaults.commercial.paymentPlan,
      invoices: Array.isArray(rawCommercial.invoices) ? rawCommercial.invoices : [],
      receipts: Array.isArray(rawCommercial.receipts) ? rawCommercial.receipts : [],
      paymentRelease: {
        ...defaults.commercial.paymentRelease,
        ...rawPaymentRelease,
        evidence:
          rawPaymentRelease.evidence === undefined
            ? defaults.commercial.paymentRelease.evidence
            : rawPaymentRelease.evidence,
        reasons: Array.isArray(rawPaymentRelease.reasons)
          ? rawPaymentRelease.reasons
          : [],
      },
    },
    approvals: {
      ...(defaults.approvals || {}),
      ...(value.approvals || {}),
      requests: Array.isArray(value.approvals?.requests)
        ? value.approvals.requests
        : [],
    },
    designBoundary: {
      ...defaults.designBoundary,
      ...(value.designBoundary || {}),
    },
    siteReadiness: {
      ...(defaults.siteReadiness || {}),
      ...(value.siteReadiness || {}),
      gates: Array.isArray(value.siteReadiness?.gates)
        ? value.siteReadiness.gates
        : defaults.siteReadiness.gates,
    },
    estimating: {
      ...defaults.estimating,
      ...rawEstimating,
      inputs: rawEstimating.inputs || {},
      assemblies: Array.isArray(rawEstimating.assemblies) ? rawEstimating.assemblies : [],
      calculatedClassDAmount:
        rawEstimating.calculatedClassDAmount ?? defaults.estimating.calculatedClassDAmount,
      versions: Array.isArray(rawEstimating.versions) ? rawEstimating.versions : [],
      convergenceTasks: Array.isArray(rawEstimating.convergenceTasks)
        ? rawEstimating.convergenceTasks
        : defaults.estimating.convergenceTasks,
    },
    warranty: {
      ...defaults.warranty,
      ...rawWarranty,
      durationMonths: rawWarranty.durationMonths ?? 0,
      followUps: Array.isArray(rawWarranty.followUps) ? rawWarranty.followUps : [],
    },
    production: {
      ...defaults.production,
      ...rawProduction,
      factoryWeeklyCapacityHours:
        rawProduction.factoryWeeklyCapacityHours ?? 0,
      committedWeeklyCapacityHours:
        rawProduction.committedWeeklyCapacityHours ?? 0,
      procurementUnlocked: Boolean(rawProduction.procurementUnlocked),
      productionStartAuthorized: Boolean(rawProduction.productionStartAuthorized),
      activities: Array.isArray(rawProduction.activities) ? rawProduction.activities : [],
    },
    timeBudget: {
      ...defaults.timeBudget,
      ...rawTimeBudget,
      budgetHours: rawTimeBudget.budgetHours ?? defaults.timeBudget.budgetHours,
      warningThresholdPercent:
        rawTimeBudget.warningThresholdPercent ?? defaults.timeBudget.warningThresholdPercent,
      criticalThresholdPercent:
        rawTimeBudget.criticalThresholdPercent ?? defaults.timeBudget.criticalThresholdPercent,
      entries: Array.isArray(rawTimeBudget.entries) ? rawTimeBudget.entries : [],
    },
    bim: {
      ...defaults.bim,
      ...rawBim,
      objects: Array.isArray(rawBim.objects) ? rawBim.objects : [],
    },
    spec: value.spec || {},
    audit: Array.isArray(value.audit) ? value.audit : [],
  } as ProjectOperations;
}

export function paymentMilestoneAmount(
  operations: ProjectOperations,
  milestone: PaymentMilestone,
) {
  return round2(number(operations.commercial.contractValue) * number(milestone.percent) / 100);
}

export function invoicePaidAmount(operations: ProjectOperations, invoiceId: string) {
  return round2(
    (operations.commercial.receipts || [])
      .filter((receipt) => text(receipt.invoiceId) === text(invoiceId))
      .reduce((sum, receipt) => sum + number(receipt.amount), 0),
  );
}

export function calculateClassD(operations: ProjectOperations) {
  const inputs = operations.estimating?.inputs || {};
  const direct = number(inputs.total || inputs.baseCost || inputs.classD);
  if (direct > 0) return round2(direct);

  const area = number(inputs.grossSquareFeet ?? inputs.grossFloorArea ?? inputs.area);
  const fixedFactor = number(
    inputs.fixedFactorPerSquareFoot ?? inputs.costPerSqFt ?? inputs.rate,
  );
  const windowCost = number(inputs.windowCount) * number(inputs.windowUnitRate);
  const doorCost = number(inputs.exteriorDoorCount ?? inputs.doorCount) *
    number(inputs.exteriorDoorUnitRate ?? inputs.doorUnitRate);
  const roofCost = number(inputs.roofSquareFeet) * number(inputs.roofRate);
  const assemblies = (operations.estimating.assemblies || [])
    .filter((assembly) => assembly.included !== false)
    .reduce(
      (sum, assembly) =>
        sum +
        number(assembly.quantity) *
          number(assembly.rate) *
          (1 + number(assembly.wastePercent) / 100),
      0,
    );
  const base = area * fixedFactor + windowCost + doorCost + roofCost + assemblies;
  if (base <= 0) return 0;
  return round2(
    base * number(inputs.complexityFactor || 1) * number(inputs.locationFactor || 1),
  );
}

export function requiredApprovalRole(
  _operations: ProjectOperations,
  input: Pick<ApprovalRequest, "kind" | "amount" | "contractPercent" | "cumulativeCreditAmount">,
): ApprovalRole {
  const kind = text(input.kind).toLowerCase();
  const amount = number(input.amount);
  const percent = number(input.contractPercent);
  const cumulativeCredit = number(input.cumulativeCreditAmount);

  if (kind === "loi") return "CRO";
  if (kind === "payment release" || kind === "paymentrelease") return "Finance";
  if (kind === "credit") {
    if (amount >= 25_000 || cumulativeCredit >= 20_000) return "CEO";
    if (amount >= 5_000 || cumulativeCredit >= 5_000) return "CRO";
    return "Finance";
  }
  if (kind === "change") {
    if (amount >= 100_000 || percent >= 10) return "CEO";
    if (amount >= 25_000 || percent >= 5) return "CRO";
    return "Project Manager";
  }
  if (amount >= 100_000 || percent >= 10) return "CEO";
  if (amount >= 25_000 || percent >= 5) return "CRO";
  return "Project Manager";
}

export function appendOperationsAudit(
  operations: ProjectOperations,
  entry: Record<string, unknown>,
) {
  return {
    ...operations,
    audit: [
      ...(operations.audit || []),
      { id: newId("audit"), createdAt: new Date().toISOString(), ...entry },
    ],
  };
}

export function classifyClientPath(operations: ProjectOperations) {
  const path = operations.clientPath || ({} as ProjectOperations["clientPath"]);
  const design = text(path.designMaturity).toLowerCase();
  const site = text(path.siteMaturity).toLowerCase();
  const funding = text(path.fundingMaturity).toLowerCase();
  const special =
    text(path.clientType).toLowerCase() === "special loi" ||
    text(path.relationship).toLowerCase() === "strategic";

  if (special) {
    return {
      type: "Special LOI",
      subGates: ["Executive LOI approval", "Controlled scope boundary", "Gate 1 decision"],
      reason: "Strategic or expressly governed LOI route requires executive approval and a bounded scope before Gate 1.",
    };
  }
  if (design === "ifc" && site === "ready" && funding === "secured") {
    return {
      type: "P1",
      subGates: ["Production capacity reservation", "IFC package validation", "Gate 1 release"],
      reason: "IFC design, ready site, and secured funding support the shortest controlled path to production capacity.",
    };
  }
  if (design === "permit" && site === "controlled" && (funding === "in process" || funding === "secured")) {
    return {
      type: "P2",
      subGates: ["Responsibility matrix", "Permit/interface validation", "Commercial release"],
      reason: "Permit-level design and a controlled site support a defined responsibility and commercial pathway.",
    };
  }
  if (design === "preliminary" && site === "controlled") {
    return {
      type: "P3",
      subGates: ["D to C convergence", "Responsibility matrix", "Feasibility closure"],
      reason: "Preliminary design with a controlled site requires structured D-to-C convergence before technical commitment.",
    };
  }
  if (design === "concept" && site === "candidate") {
    return {
      type: "P4",
      subGates: ["Consultation scope", "Site feasibility", "Client funding plan"],
      reason: "Concept design and a candidate site call for bounded consultation and feasibility work before commitment.",
    };
  }
  return {
    type: "P5",
    subGates: ["Client pre-qualification", "Site and design discovery", "Funding evidence"],
    reason: "The available evidence is not yet mature enough for a faster pathway, so pre-qualification remains the controlled route.",
  };
}

function evidencePresent(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => text(item));
  return Boolean(text(value));
}

export function evaluatePaymentRelease(operations: ProjectOperations) {
  const commercial = operations.commercial;
  const reasons: string[] = [];
  const plan = commercial.paymentPlan || [];
  const totalPercent = plan.reduce((sum, milestone) => sum + number(milestone.percent), 0);
  if (Math.abs(totalPercent - 100) > 0.001) {
    reasons.push("Payment milestone percentages must total 100%.");
  }

  const deposit = plan.find((milestone) => milestone.id === "deposit-25") || plan[0];
  const invoiceId = text(deposit?.invoiceId);
  const invoice = (commercial.invoices || []).find((item) => item.id === invoiceId);
  if (!deposit || !invoiceId || !invoice) {
    reasons.push("A released deposit invoice is required.");
  } else {
    if (!evidencePresent(invoice.evidenceReference)) {
      reasons.push("Controlled deposit invoice evidence is missing.");
    }
    if (!["Paid", "Partially Paid", "Settled"].includes(text(invoice.status))) {
      reasons.push("The deposit invoice must be marked Paid before release.");
    }
    const expected = paymentMilestoneAmount(operations, deposit);
    const paid = invoicePaidAmount(operations, invoice.id);
    if (paid + 0.005 < expected) {
      reasons.push(`Verified deposit receipt is short by ${round2(expected - paid)} ${commercial.currency || "CAD"}.`);
    }
    const matchingReceipts = (commercial.receipts || []).filter(
      (receipt) => text(receipt.invoiceId) === invoice.id,
    );
    if (!matchingReceipts.length || matchingReceipts.some((receipt) => !evidencePresent(receipt.evidenceReference))) {
      reasons.push("Verified deposit receipt evidence is missing.");
    }
    if (!matchingReceipts.length || matchingReceipts.some((receipt) => !text(receipt.verifiedBy))) {
      reasons.push("Verified deposit receipt evidence is missing.");
    }
  }
  const release = commercial.paymentRelease || ({} as ProjectOperations["commercial"]["paymentRelease"]);
  if (text(release.status).toLowerCase() === "released") {
    if (!evidencePresent(release.evidence)) reasons.push("Payment release evidence is required.");
    if (!text(release.releasedBy)) reasons.push("Payment release approver is required.");
    if (!text(release.approverRole)) reasons.push("Payment release authority is required.");
  }
  return { ready: reasons.length === 0, reasons };
}

function loiApprovalReady(operations: ProjectOperations) {
  if (
    text(operations.clientPath.clientType).toLowerCase() !== "special loi" &&
    text(operations.commercial.engagementType).toLowerCase() !== "loi"
  ) {
    return true;
  }
  return (operations.approvals.requests || []).some(
    (request) =>
      text(request.kind).toLowerCase() === "loi" &&
      request.status === "Approved" &&
      Boolean(request.decidedByRole) &&
      roleCanApprove(request.decidedByRole as ApprovalRole, "CRO", "LOI"),
  );
}

export function evaluateGateOne(operations: ProjectOperations) {
  const qualification = operations.qualification || [];
  const qualificationPassed =
    qualification.length === 10 &&
    qualification.every(
      (question) => question.gateRequired === false ||
        (question.answer === "Yes" && Boolean(text(question.evidence))),
    );
  const classification = operations.clientPath || ({} as ProjectOperations["clientPath"]);
  const classificationPassed =
    Boolean(text(classification.clientType)) &&
    text(classification.clientType).toLowerCase() !== "unclassified" &&
    (classification.selectedSubGates || []).some((gate) => text(gate));
  const commercial = operations.commercial;
  const commercialPassed =
    text(commercial.engagementType) !== "" &&
    text(commercial.agreementStatus).toLowerCase() === "executed" &&
    Boolean(text(commercial.agreementReference)) &&
    Boolean(text(commercial.executedDate));
  const payment = evaluatePaymentRelease(operations);
  const paymentPassed = payment.ready && text(commercial.paymentRelease.status).toLowerCase() === "released";
  const checks: GateCheck[] = [
    {
      id: "qualification",
      label: "Ten controlled qualification questions are answered Yes with evidence",
      passed: qualificationPassed,
      reason: qualificationPassed
        ? "All ten qualification questions are complete."
        : `Gate 1 requires all 10 qualification questions to be answered Yes with evidence. ${qualification.length}/10 are present.`,
    },
    {
      id: "classification",
      label: "Client pathway and sub-gates are classified",
      passed: classificationPassed,
      reason: classificationPassed
        ? "A controlled client pathway is assigned."
        : "Assign a controlled P1–P5 or Special LOI pathway and at least one sub-gate.",
    },
    {
      id: "commercial-engagement",
      label: "Bounded commercial engagement is executed",
      passed: commercialPassed,
      reason: commercialPassed
        ? "The commercial instrument is executed and referenced."
        : "Record an executed agreement or paid engagement with reference and date.",
    },
    {
      id: "payment-release",
      label: "Deposit invoice, verified receipt, and payment release are controlled",
      passed: paymentPassed,
      reason: paymentPassed
        ? "Deposit evidence and the explicit Payment Release decision are complete."
        : payment.reasons.join(" ") || "Payment Release must be explicitly released.",
    },
    {
      id: "loi-approval",
      label: "Special LOI route has CRO/CEO approval",
      passed: loiApprovalReady(operations),
      reason: loiApprovalReady(operations)
        ? "LOI approval is not required or has been authorized."
        : "Special LOI requires an approved request decided by CRO or CEO.",
    },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export function roleCanApprove(role: ApprovalRole, required: ApprovalRole, kind: string) {
  if (text(kind).toLowerCase() === "loi") return role === "CRO" || role === "CEO";
  if (required === "CEO") return role === "CEO";
  if (required === "CRO") return role === "CRO" || role === "CEO";
  return APPROVAL_RANK[role] >= APPROVAL_RANK[required];
}

export function convertClientToProject(
  operations: ProjectOperations,
  sequence: number,
  actor: string,
  gateDecisionId: string,
  buildingCount = 1,
  modulesPerBuilding = 0,
  now = new Date(),
) {
  if (canonicalProjectNumber(operations.identity.projectNumber)) {
    throw new Error("Client already has an active project number.");
  }
  if (!evaluateGateOne(operations).passed) {
    throw new Error("Gate 1 is not released; complete qualification, commercial, payment, and approval evidence first.");
  }
  const yy = yearSuffix(now);
  const normalizedSequence = Math.max(1, Math.min(999, Math.floor(number(sequence) || 0)));
  const sequenceText = String(normalizedSequence).padStart(3, "0");
  const projectNumber = `P-${yy}-${sequenceText}`;
  const developmentNumber = `D-${yy}-${sequenceText}`;
  const legacyJobNumber = `${yy}${sequenceText}`;
  const safeBuildingCount = Math.max(1, Math.floor(number(buildingCount) || 1));
  const safeModulesPerBuilding = Math.max(0, Math.floor(number(modulesPerBuilding) || 0));
  const buildings = Array.from({ length: safeBuildingCount }, (_, buildingIndex) => {
    const buildingNumber = `${projectNumber}-B${String(buildingIndex + 1).padStart(2, "0")}`;
    return {
      buildingNumber,
      modules: Array.from({ length: safeModulesPerBuilding }, (_, moduleIndex) => ({
        moduleNumber: `${buildingNumber}-M${String(moduleIndex + 1).padStart(3, "0")}`,
        status: "Planned",
      })),
    };
  });
  const history = Array.isArray(operations.identity.numberHistory)
    ? clone(operations.identity.numberHistory)
    : [];
  history.push(
    { level: "Development", number: developmentNumber, assignedAt: now.toISOString(), assignedBy: actor },
    { level: "Project", number: projectNumber, assignedAt: now.toISOString(), assignedBy: actor },
    ...buildings.map((building) => ({
      level: "Building",
      number: building.buildingNumber,
      assignedAt: now.toISOString(),
      assignedBy: actor,
    })),
    ...buildings.flatMap((building) =>
      building.modules.map((module: { moduleNumber: string }) => ({
        level: "Module",
        number: module.moduleNumber,
        assignedAt: now.toISOString(),
        assignedBy: actor,
      })),
    ),
  );
  return appendOperationsAudit(
    {
      ...clone(operations),
      identity: {
        ...operations.identity,
        projectNumber,
        developmentNumber,
        legacyJobNumber,
        lifecycleState: "Project",
        convertedBy: actor,
        conversionGateDecisionId: gateDecisionId,
        buildings,
        numberHistory: history,
      },
    },
    {
      actor,
      action: "CONVERT_CLIENT_TO_PROJECT",
      entityType: "ProjectIdentity",
      entityId: projectNumber,
      summary: `Client ${operations.identity.clientId} converted through Gate 1 to ${projectNumber}.`,
      gateDecisionId,
    },
  );
}

export function createEstimateVersion(
  operations: ProjectOperations,
  estimateClass: string,
  amount: number,
  actor: string,
  sourceRevision: string,
  now = new Date(),
): EstimateVersion {
  const normalizedClass = text(estimateClass).toUpperCase() as EstimateClass;
  const metadata = ESTIMATE_METADATA[normalizedClass] || ESTIMATE_METADATA.D;
  const version =
    (operations.estimating.versions || [])
      .filter((item) => text(item.estimateClass).toUpperCase() === normalizedClass)
      .reduce((max, item) => Math.max(max, number(item.version)), 0) + 1;
  return {
    id: newId(`estimate-${normalizedClass.toLowerCase()}`),
    version,
    estimateClass: normalizedClass,
    amount: round2(amount),
    status: "Draft",
    createdBy: actor,
    sourceRevision,
    createdAt: now.toISOString(),
    basisStage: metadata.basis,
    accuracyRangeLowPercent: metadata.low,
    accuracyRangeHighPercent: metadata.high,
    contingencyPercent: metadata.contingency,
    assumptions: [],
  };
}

export function estimateMaturityReady(operations: ProjectOperations, estimateClass: EstimateClass) {
  const target = text(estimateClass).toUpperCase() as EstimateClass;
  const targetIndex = ESTIMATE_ORDER.indexOf(target);
  const missing: string[] = [];
  if (targetIndex < 0) return { ready: false, missing: [`Unknown estimate class ${estimateClass}.`] };
  for (const [index, currentClass] of ESTIMATE_ORDER.slice(0, targetIndex + 1).entries()) {
    const approved = (operations.estimating.versions || []).some(
      (version) =>
        text(version.estimateClass).toUpperCase() === currentClass &&
        version.status === "Approved",
    );
    if (!approved) missing.push(`Approved Class ${currentClass} version`);
    if (index > 0) {
      const prior = ESTIMATE_ORDER[index - 1];
      const task = (operations.estimating.convergenceTasks || []).find(
        (item) => item.fromClass === prior && item.toClass === currentClass,
      );
      if (!task || task.status !== "Complete" || !text(task.evidence)) {
        missing.push(`${prior}→${currentClass} convergence evidence`);
      }
    }
  }
  return { ready: missing.length === 0, missing };
}

export function designBoundaryReady(operations: ProjectOperations) {
  const boundary = operations.designBoundary;
  return Boolean(
    boundary &&
      boundary.boundaryAccepted &&
      text(boundary.deliveryModel) !== "Unselected" &&
      text(boundary.architectOfRecord) &&
      text(boundary.profabScope) &&
      text(boundary.clientConsultantScope) &&
      text(boundary.exclusions) &&
      text(boundary.acceptedByClient) &&
      text(boundary.acceptedAt) &&
      text(boundary.agreementReference),
  );
}

export function secondaryGateReady(gate: SecondaryGate) {
  if (gate.status === "Not Applicable") {
    return Boolean(text(gate.naReason) && text(gate.approvedBy));
  }
  if (!["Passed", "Ready"].includes(gate.status)) return false;
  if (!text(gate.approvedBy)) return false;
  const requiredEvidence = gate.requiredEvidence || [];
  const evidence = gate.evidenceReferences || [];
  return requiredEvidence.every((_, index) => Boolean(text(evidence[index])));
}

export function procurementUnlockReady(operations: ProjectOperations): GateStatus {
  const blockers: string[] = [];
  if (!estimateMaturityReady(operations, "C").ready) blockers.push("Approved Class C estimate and convergence evidence");
  if (!designBoundaryReady(operations)) blockers.push("Accepted design and responsibility boundary");
  if (text(operations.commercial.paymentRelease.status).toLowerCase() !== "released") blockers.push("Payment release");
  return { ready: blockers.length === 0, blockers };
}

export function productionReadiness(operations: ProjectOperations): GateStatus {
  const blockers: string[] = [];
  if (!estimateMaturityReady(operations, "B").ready) blockers.push("Approved Class B estimate and convergence evidence");
  if (!designBoundaryReady(operations)) blockers.push("Accepted design and responsibility boundary");
  const capacity = number(operations.production.factoryWeeklyCapacityHours);
  const committed = number(operations.production.committedWeeklyCapacityHours);
  if (capacity > 0 && committed > capacity) blockers.push("Committed factory hours exceed weekly capacity.");
  const activities = operations.production.activities || [];
  const activityIds = new Set(activities.map((activity) => activity.id));
  for (const activity of activities) {
    if (number(activity.capacityHours) > 0 && number(activity.requiredHours) > number(activity.capacityHours)) {
      blockers.push(`${activity.name} exceeds assigned capacity.`);
    }
    if ((activity.predecessorIds || []).some((predecessorId) => !activityIds.has(predecessorId))) {
      blockers.push(`${activity.name} has an unknown predecessor.`);
    }
  }
  return { ready: blockers.length === 0, blockers };
}

function allSiteGatesReady(operations: ProjectOperations) {
  const blockers: string[] = [];
  for (const gate of operations.siteReadiness.gates || []) {
    if (!secondaryGateReady(gate)) blockers.push(gate.label);
  }
  return blockers;
}

function completionReadiness(operations: ProjectOperations) {
  const blockers = allSiteGatesReady(operations);
  if (!text(operations.warranty.dayZeroDate) || !text(operations.warranty.triggerEvidence)) {
    blockers.push("Warranty Day 0 trigger evidence");
  }
  return { ready: blockers.length === 0, blockers };
}

export function operationsGateStatus(gateId: string, operations: ProjectOperations): GateStatus {
  const id = text(gateId).toLowerCase();
  if (["gate-1", "gate-g1-qualified", "gate1", "qualification"].includes(id)) {
    const evaluation = evaluateGateOne(operations);
    return { ready: evaluation.passed, blockers: evaluation.checks.filter((check) => !check.passed).map((check) => check.reason) };
  }
  if (["payment-release", "commercial"].includes(id)) {
    const evaluation = evaluatePaymentRelease(operations);
    const blockers = evaluation.reasons.slice();
    if (text(operations.commercial.paymentRelease.status).toLowerCase() !== "released") blockers.push("Payment release decision is not released.");
    return { ready: blockers.length === 0, blockers };
  }
  if (["gate-g2-technical-commitment", "gate-g2", "technical-commitment"].includes(id)) {
    const blockers: string[] = [];
    if (!estimateMaturityReady(operations, "C").ready) blockers.push("Class C technical basis");
    if (!designBoundaryReady(operations)) blockers.push("Accepted design and responsibility boundary");
    return { ready: blockers.length === 0, blockers };
  }
  if (["procurement", "procurement-unlock"].includes(id)) return procurementUnlockReady(operations);
  if (id === "production-readiness") return productionReadiness(operations);
  if (["gate-g3-production-authorization", "gate-g3", "production-authorization"].includes(id)) {
    const blockers = productionReadiness(operations).blockers.slice();
    if (!operations.production.procurementUnlocked) blockers.push("Procurement is not unlocked.");
    if (!operations.production.productionStartAuthorized) blockers.push("Production start authorization is missing.");
    return { ready: blockers.length === 0, blockers };
  }
  if (["gate-g4-factory-release", "gate-g4", "factory-release"].includes(id)) {
    const blockers: string[] = [];
    const activityBlockers = (operations.production.activities || [])
      .filter((activity) => number(activity.percentComplete) < 100 || !["Complete", "Released"].includes(text(activity.status)))
      .map((activity) => `${activity.name} factory completion`);
    blockers.push(...activityBlockers);
    if (!text(operations.production.factoryReleaseEvidence)) blockers.push("Factory completion and release evidence");
    return { ready: blockers.length === 0, blockers };
  }
  if (["delivery-project-completion", "delivery-completion", "site-readiness"].includes(id)) {
    return completionReadiness(operations);
  }
  if (["gate-g5-warranty-start", "gate-g5", "warranty-start"].includes(id)) {
    const completion = completionReadiness(operations);
    const blockers = completion.blockers.slice();
    if (!text(operations.warranty.owner)) blockers.push("Warranty owner");
    if (!(number(operations.warranty.durationMonths) > 0)) blockers.push("Warranty duration");
    return { ready: blockers.length === 0, blockers };
  }
  if (["commissioning-warranty", "commissioning"].includes(id)) {
    const blockers: string[] = [];
    if (!text(operations.warranty.dayZeroDate) || !text(operations.warranty.triggerEvidence)) blockers.push("Warranty Day 0 trigger evidence");
    const incomplete = (operations.warranty.followUps || []).filter((followUp) => followUp.status !== "Complete");
    if (incomplete.length) blockers.push("Warranty 30/60/90 follow-ups");
    return { ready: blockers.length === 0, blockers };
  }
  if (["close-out", "closeout", "final-close"].includes(id)) {
    const blockers: string[] = [];
    if ((operations.warranty.followUps || []).some((followUp) => followUp.status !== "Complete")) blockers.push("Warranty follow-ups");
    if (operations.identity.lifecycleState !== "Closed") blockers.push("Project closeout status");
    if (operations.spec && Array.isArray(operations.spec.openObligations) && operations.spec.openObligations.length) blockers.push("Outstanding project obligations");
    return { ready: blockers.length === 0, blockers };
  }
  return { ready: false, blockers: [`Unknown operations gate: ${gateId}.`] };
}

export function scheduleWarranty(
  operations: ProjectOperations,
  dayZeroDate: string,
  durationMonths: number,
  owner: string,
  triggerEvidence: string,
) {
  const start = dateOnly(dayZeroDate);
  if (!start) throw new Error("A valid warranty Day 0 date is required.");
  if (number(durationMonths) <= 0) throw new Error("Warranty duration must be greater than zero.");
  if (!text(owner)) throw new Error("A warranty owner is required.");
  if (!text(triggerEvidence)) throw new Error("Warranty Day 0 trigger evidence is required.");
  const followUps: WarrantyFollowUp[] = [30, 60, 90].map((offsetDays) => ({
    id: newId(`warranty-${offsetDays}`),
    offsetDays,
    dueDate: addDays(start, offsetDays),
    owner,
    escalationOwner: "Project Manager",
    status: "Scheduled",
  }));
  return {
    ...clone(operations),
    identity: { ...operations.identity, lifecycleState: "Warranty" },
    warranty: {
      ...operations.warranty,
      dayZeroDate: start,
      durationMonths: Math.floor(number(durationMonths)),
      owner,
      triggerEvidence,
      expiryDate: addMonths(start, durationMonths),
      followUps,
    },
  };
}

export function warrantyFollowUpStatus(
  dueDate: string,
  completedAt = "",
  now = new Date(),
): WarrantyFollowUp["status"] {
  if (text(completedAt)) return "Complete";
  const due = parseDate(dueDate);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(due.getTime()) || Number.isNaN(current.getTime())) return "Scheduled";
  const daysUntilDue = Math.ceil((due.getTime() - current.getTime()) / 86_400_000);
  if (daysUntilDue > 7) return "Scheduled";
  if (daysUntilDue >= 0) return "Due";
  return "Overdue";
}

function parseIcsDate(value: string) {
  const normalized = text(value).replace(/^.*:/, "");
  const match = normalized.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) {
    const day = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
    return day ? `${day[1]}-${day[2]}-${day[3]}T00:00:00Z` : "";
  }
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}

function icsDurationHours(start: string, end: string) {
  const startDate = new Date(parseIcsDate(start));
  const endDate = new Date(parseIcsDate(end));
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return round2(Math.max(0, endDate.getTime() - startDate.getTime()) / 3_600_000);
}

function icsField(lines: string[], name: string) {
  const line = lines.find((item) => item.startsWith(`${name}:`) || item.startsWith(`${name};`));
  return line ? line.slice(line.indexOf(":") + 1) : "";
}

export function parseIcsTimeEntries(
  ics: string,
  user: string,
  projectNumber: string,
  sourceReference: string,
): TimeEntry[] {
  const unfolded = text(ics).replace(/\r?\n[ \t]/g, "");
  const entries: TimeEntry[] = [];
  for (const block of unfolded.split(/BEGIN:VEVENT/i).slice(1)) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    if (!lines.some((line) => /^END:VEVENT$/i.test(line))) continue;
    const start = icsField(lines, "DTSTART");
    const end = icsField(lines, "DTEND");
    const hours = icsDurationHours(start, end);
    if (!start || !end || hours <= 0) continue;
    const date = parseIcsDate(start).slice(0, 10);
    const uid = icsField(lines, "UID") || `${date}-${entries.length + 1}`;
    entries.push({
      id: `time-ics-${uid}`,
      user,
      date,
      projectNumber,
      activity: icsField(lines, "SUMMARY") || "Calendar activity",
      hours,
      billable: true,
      source: "ICS",
      sourceReference,
      notes: icsField(lines, "DESCRIPTION"),
    });
  }
  return entries;
}

export function timeBudgetStatus(operations: ProjectOperations) {
  const usedHours = round2((operations.timeBudget.entries || []).reduce((sum, entry) => sum + number(entry.hours), 0));
  const budgetHours = number(operations.timeBudget.budgetHours);
  const percent = budgetHours > 0 ? round2((usedHours / budgetHours) * 100) : 0;
  const critical = number(operations.timeBudget.criticalThresholdPercent);
  const warning = number(operations.timeBudget.warningThresholdPercent);
  const level = budgetHours > 0 && percent >= critical
    ? "Critical"
    : budgetHours > 0 && percent >= warning
      ? "Warning"
      : "On Track";
  return { usedHours, percent, level };
}

export function buildWeeklyReport(operations: ProjectOperations, weekEnding: string) {
  const end = dateOnly(weekEnding);
  const endDate = parseDate(end);
  if (!end || Number.isNaN(endDate.getTime())) return "Weekly report unavailable: invalid week ending date.";
  const startDate = new Date(endDate.getTime());
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const entries = (operations.timeBudget.entries || []).filter((entry) => {
    const date = parseDate(entry.date);
    return !Number.isNaN(date.getTime()) && date >= startDate && date <= endDate;
  });
  const total = round2(entries.reduce((sum, entry) => sum + number(entry.hours), 0));
  const byUser = new Map<string, number>();
  for (const entry of entries) byUser.set(entry.user, round2((byUser.get(entry.user) || 0) + number(entry.hours)));
  const users = [...byUser.entries()].map(([user, hours]) => `${user}: ${hours}h`).join(", ");
  return `Weekly report ending ${end}: Recorded time: ${total}h${users ? ` (${users})` : ""}.`;
}

export function validateGpfName(operations: ProjectOperations, value: string) {
  const candidate = text(value);
  if (!candidate) return false;
  try {
    return new RegExp(operations.bim.gpfPattern || "").test(candidate);
  } catch {
    return false;
  }
}

export function buildStitchList(objects: BimObjectResponsibility[]) {
  return objects
    .slice()
    .sort((left, right) =>
      text(left.masterFormatCode).localeCompare(text(right.masterFormatCode)) ||
      text(left.gpfName).localeCompare(text(right.gpfName)),
    )
    .map((object, index) => ({
      sequence: index + 1,
      gpfName: object.gpfName,
      masterFormatCode: object.masterFormatCode,
      cnmsCode: object.cnmsCode,
      modelReference: object.modelReference,
      navisworksSet: object.navisworksSet,
      owner: object.productionOwner,
      object,
    }));
}
