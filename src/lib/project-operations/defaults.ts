import type {
  ConvergenceTask,
  PaymentMilestone,
  ProjectOperations,
  SecondaryGate,
} from "@/types/project-operations";
import { text } from "./shared";

/** Project identity, default operations data and normalization of saved data. */
export function yearSuffix(now: Date) {
  return String(now.getUTCFullYear()).slice(-2);
}

export function canonicalProjectNumber(value: unknown) {
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
    {
      id: "convergence-d-c",
      fromClass: "D",
      toClass: "C",
      status: "Not Started",
      evidence: "",
      owner: "",
    },
    {
      id: "convergence-c-b",
      fromClass: "C",
      toClass: "B",
      status: "Not Started",
      evidence: "",
      owner: "",
    },
    {
      id: "convergence-b-a",
      fromClass: "B",
      toClass: "A",
      status: "Not Started",
      evidence: "",
      owner: "",
    },
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

/** A JSON object read from a saved file, or {} for anything else. */
const record = (input: unknown): Record<string, unknown> =>
  input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

export function normalizeProjectOperations(
  raw: ProjectOperations | undefined,
  name = "",
  legacyJobNumber = "",
): ProjectOperations {
  // Saved files can contain older partial shapes. Treat this boundary as
  // untrusted JSON and rebuild every controlled branch from the defaults.
  const value = record(raw);
  const defaults = createDefaultProjectOperations(name, legacyJobNumber);
  const rawIdentity = record(value.identity);
  const projectNumber =
    text(rawIdentity.projectNumber) ||
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
        : /^\d{5}$/.test(legacyJobNumber)
          ? legacyJobNumber
          : ""),
    lifecycleState: text(rawIdentity.lifecycleState) || (projectNumber ? "Project" : "Client"),
  };
  const rawClientPath = record(value.clientPath);
  const rawCommercial = record(value.commercial);
  const rawPaymentRelease = record(rawCommercial.paymentRelease);
  const rawEstimating = record(value.estimating);
  const rawWarranty = record(value.warranty);
  const rawProduction = record(value.production);
  const rawTimeBudget = record(value.timeBudget);
  const rawBim = record(value.bim);
  const rawApprovals = record(value.approvals);
  const rawSiteReadiness = record(value.siteReadiness);

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
        reasons: Array.isArray(rawPaymentRelease.reasons) ? rawPaymentRelease.reasons : [],
      },
    },
    approvals: {
      ...(defaults.approvals || {}),
      ...rawApprovals,
      requests: Array.isArray(rawApprovals.requests) ? rawApprovals.requests : [],
    },
    designBoundary: {
      ...defaults.designBoundary,
      ...record(value.designBoundary),
    },
    siteReadiness: {
      ...(defaults.siteReadiness || {}),
      ...rawSiteReadiness,
      gates: Array.isArray(rawSiteReadiness.gates)
        ? rawSiteReadiness.gates
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
      factoryWeeklyCapacityHours: rawProduction.factoryWeeklyCapacityHours ?? 0,
      committedWeeklyCapacityHours: rawProduction.committedWeeklyCapacityHours ?? 0,
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
    spec: record(value.spec),
    audit: Array.isArray(value.audit) ? value.audit : [],
    // Rebuilt from untrusted saved JSON: every controlled branch above has its
    // shape restored; list items are kept as saved.
  } as unknown as ProjectOperations;
}
