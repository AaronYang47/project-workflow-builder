export const DECISION_AUTHORITY = [
  "Confirmed",
  "Partially Confirmed",
  "Unknown",
  "No",
] as const;

export const SITE_STATUS = [
  "Confirmed Site",
  "Candidate Site",
  "Multiple Sites",
  "Municipal Land Not Assigned",
  "No Site",
  "Fatal Issue — Resolvable",
  "Fatal Issue — Not Resolvable",
] as const;

export const DESIGN_STAGE = [
  "No Design",
  "Concept / Schematic",
  "Design Development",
  "Permit Issued",
  "IFC / Construction Ready",
  "Controlled Class D Recorded",
] as const;

export const MODULAR_COMPATIBILITY = [
  "Compatible",
  "Partially Compatible",
  "Not Reviewed",
  "Major Rework Likely",
  "Not Compatible — Corrective Path Exists",
  "Not Compatible — No Corrective Path",
] as const;

export const PROJECT_DEFINITION = [
  "Well Defined",
  "Partially Defined",
  "Undefined / Early",
] as const;

export const BUDGET_STATUS = [
  "Confirmed",
  "Indicative",
  "Missing",
  "Major Gap",
] as const;

export const FUNDING_STATUS = [
  "Secured",
  "In Process",
  "Not Secured",
  "Unknown",
] as const;

export const CUSTOMER_RELATIONSHIP = [
  "Strategic / Returning",
  "Standard",
  "New",
] as const;

export const COMMERCIAL_COMMITMENT = [
  "None",
  "CSA",
  "PCS",
  "Governed LOI Requested",
] as const;

export const QUALIFICATION_DROPDOWNS = [
  { key: "decisionAuthority", label: "Decision Authority", options: DECISION_AUTHORITY },
  { key: "siteStatus", label: "Site Status", options: SITE_STATUS },
  { key: "designStage", label: "Design Stage", options: DESIGN_STAGE },
  { key: "modularCompatibility", label: "Modular Compatibility", options: MODULAR_COMPATIBILITY },
  { key: "projectDefinition", label: "Project Definition", options: PROJECT_DEFINITION },
  { key: "budgetStatus", label: "Budget Status", options: BUDGET_STATUS },
  { key: "fundingStatus", label: "Funding Status", options: FUNDING_STATUS },
  { key: "customerRelationship", label: "Customer Relationship", options: CUSTOMER_RELATIONSHIP },
  { key: "commercialCommitment", label: "Commercial Commitment", options: COMMERCIAL_COMMITMENT },
] as const;

export type QualificationDropdownKey = (typeof QUALIFICATION_DROPDOWNS)[number]["key"];

export type RecommendedService =
  | "PCS"
  | "CSA"
  | "Governed LOI"
  | "Site Feasibility"
  | "Hold"
  | "No-Go";

export type QualificationStatus =
  | "Incomplete"
  | "Qualified"
  | "Qualified with Risk"
  | "Hold"
  | "No-Go";

export type SalesQualificationAnswers = {
  decisionAuthority: string;
  siteStatus: string;
  designStage: string;
  modularCompatibility: string;
  projectDefinition: string;
  budgetStatus: string;
  fundingStatus: string;
  customerRelationship: string;
  commercialCommitment: string;
  decisionMakerName: string;
  siteMunicipality: string;
  approxGfaStoreys: string;
  budgetAmount: string;
};

export type SalesQualificationResult = {
  recommendedService: RecommendedService;
  qualificationStatus: QualificationStatus;
  missingInformation: string[];
  readinessScore: number;
  hardRuleApplied: boolean;
  reasons: string[];
  risks: string[];
};

export const emptySalesQualificationAnswers = (): SalesQualificationAnswers => ({
  decisionAuthority: "",
  siteStatus: "",
  designStage: "",
  modularCompatibility: "",
  projectDefinition: "",
  budgetStatus: "",
  fundingStatus: "",
  customerRelationship: "",
  commercialCommitment: "",
  decisionMakerName: "",
  siteMunicipality: "",
  approxGfaStoreys: "",
  budgetAmount: "",
});

export function normalizeSalesQualificationAnswers(
  raw?: Partial<SalesQualificationAnswers> & {
    contactName?: string;
    siteLocation?: string;
  } | null,
): SalesQualificationAnswers {
  const empty = emptySalesQualificationAnswers();
  if (!raw) return empty;
  return {
    ...empty,
    decisionAuthority: raw.decisionAuthority || "",
    siteStatus: raw.siteStatus || "",
    designStage: raw.designStage || "",
    modularCompatibility: raw.modularCompatibility || "",
    projectDefinition: raw.projectDefinition || "",
    budgetStatus: raw.budgetStatus || "",
    fundingStatus: raw.fundingStatus || "",
    customerRelationship: raw.customerRelationship || "",
    commercialCommitment: raw.commercialCommitment || "",
    decisionMakerName: raw.decisionMakerName || raw.contactName || "",
    siteMunicipality: raw.siteMunicipality || raw.siteLocation || "",
    approxGfaStoreys: raw.approxGfaStoreys || "",
    budgetAmount: raw.budgetAmount || "",
  };
}

export function requiredConditionalFields(answers: SalesQualificationAnswers) {
  const required: Array<{ key: keyof SalesQualificationAnswers; label: string }> = [];
  if (
    answers.decisionAuthority === "Confirmed" ||
    answers.decisionAuthority === "Partially Confirmed"
  ) {
    required.push({ key: "decisionMakerName", label: "Decision Maker Name" });
  }
  if (
    answers.siteStatus === "Confirmed Site" ||
    answers.siteStatus === "Candidate Site" ||
    answers.siteStatus === "Multiple Sites" ||
    answers.siteStatus === "Municipal Land Not Assigned"
  ) {
    required.push({ key: "siteMunicipality", label: "Site / Municipality" });
  }
  if (answers.designStage && answers.designStage !== "No Design") {
    required.push({ key: "approxGfaStoreys", label: "Approx. GFA + Storeys" });
  }
  if (
    answers.budgetStatus === "Confirmed" ||
    answers.budgetStatus === "Indicative" ||
    answers.budgetStatus === "Major Gap"
  ) {
    required.push({ key: "budgetAmount", label: "Budget Amount" });
  }
  return required;
}

function filled(value: string) {
  return Boolean(value.trim());
}

function missingDropdowns(answers: SalesQualificationAnswers) {
  return QUALIFICATION_DROPDOWNS.filter((field) => !filled(answers[field.key])).map(
    (field) => field.label,
  );
}

function missingConditionals(answers: SalesQualificationAnswers) {
  return requiredConditionalFields(answers)
    .filter((field) => !filled(answers[field.key]))
    .map((field) => field.label);
}

function isSiteDiscovery(status: string) {
  return (
    status === "Candidate Site" ||
    status === "Multiple Sites" ||
    status === "Municipal Land Not Assigned" ||
    status === "No Site"
  );
}

function needsTechnicalHold(answers: SalesQualificationAnswers) {
  const design = answers.designStage;
  const modular = answers.modularCompatibility;
  const mature =
    design === "Permit Issued" || design === "IFC / Construction Ready";
  return (
    modular === "Partially Compatible" ||
    modular === "Major Rework Likely" ||
    (mature && modular === "Not Reviewed")
  );
}

function isHardNoGo(answers: SalesQualificationAnswers) {
  if (answers.siteStatus === "Fatal Issue — Not Resolvable") {
    return "Fatal site / logistics issue is not resolvable.";
  }
  const mature =
    answers.designStage === "Permit Issued" ||
    answers.designStage === "IFC / Construction Ready";
  if (mature && answers.modularCompatibility === "Not Compatible — No Corrective Path") {
    return "Design maturity cannot override modular incompatibility with no corrective path.";
  }
  return null;
}

function isHardHold(answers: SalesQualificationAnswers) {
  if (
    answers.decisionAuthority === "Unknown" ||
    answers.decisionAuthority === "Partially Confirmed" ||
    answers.decisionAuthority === "No"
  ) {
    return "Decision authority is not fully confirmed.";
  }
  if (answers.decisionAuthority === "Confirmed" && !filled(answers.decisionMakerName)) {
    return "Confirmed authority still needs a named decision maker.";
  }
  if (answers.siteStatus === "Fatal Issue — Resolvable") {
    return "Fatal site issue is pending an approved resolution.";
  }
  if (answers.modularCompatibility === "Not Compatible — Corrective Path Exists") {
    return "Modular incompatibility needs a technical decision before a paid path.";
  }
  if (needsTechnicalHold(answers)) {
    return "Modular compatibility still requires technical review.";
  }
  if (
    answers.commercialCommitment === "Governed LOI Requested" &&
    answers.customerRelationship !== "Strategic / Returning"
  ) {
    return "Governed LOI is unavailable for Standard / New relationships.";
  }
  if (
    answers.commercialCommitment === "Governed LOI Requested" &&
    answers.designStage !== "Controlled Class D Recorded"
  ) {
    return "Governed LOI cannot shortcut Class D evidence.";
  }
  return null;
}

function routeService(answers: SalesQualificationAnswers): RecommendedService {
  if (isSiteDiscovery(answers.siteStatus)) return "Site Feasibility";
  if (answers.designStage === "No Design") return "CSA";
  if (answers.designStage === "Controlled Class D Recorded") {
    if (
      answers.commercialCommitment === "Governed LOI Requested" &&
      answers.customerRelationship === "Strategic / Returning"
    ) {
      return "Governed LOI";
    }
    return "PCS";
  }
  return "CSA";
}

function computeReadinessScore(answers: SalesQualificationAnswers) {
  const points: Array<[string, number]> = [
    [
      answers.decisionAuthority,
      answers.decisionAuthority === "Confirmed"
        ? 14
        : answers.decisionAuthority === "Partially Confirmed"
          ? 6
          : 0,
    ],
    [
      answers.siteStatus,
      answers.siteStatus === "Confirmed Site"
        ? 12
        : isSiteDiscovery(answers.siteStatus)
          ? 5
          : 0,
    ],
    [
      answers.designStage,
      answers.designStage === "Controlled Class D Recorded"
        ? 14
        : answers.designStage === "IFC / Construction Ready" ||
            answers.designStage === "Permit Issued"
          ? 10
          : answers.designStage === "Design Development"
            ? 8
            : answers.designStage === "Concept / Schematic"
              ? 6
              : answers.designStage === "No Design"
                ? 4
                : 0,
    ],
    [
      answers.modularCompatibility,
      answers.modularCompatibility === "Compatible"
        ? 12
        : answers.modularCompatibility === "Partially Compatible"
          ? 6
          : answers.modularCompatibility === "Not Reviewed"
            ? 3
            : 0,
    ],
    [
      answers.projectDefinition,
      answers.projectDefinition === "Well Defined"
        ? 10
        : answers.projectDefinition === "Partially Defined"
          ? 5
          : 2,
    ],
    [
      answers.budgetStatus,
      answers.budgetStatus === "Confirmed"
        ? 10
        : answers.budgetStatus === "Indicative"
          ? 6
          : answers.budgetStatus === "Major Gap"
            ? 3
            : 0,
    ],
    [
      answers.fundingStatus,
      answers.fundingStatus === "Secured"
        ? 10
        : answers.fundingStatus === "In Process"
          ? 5
          : 2,
    ],
    [
      answers.customerRelationship,
      answers.customerRelationship === "Strategic / Returning"
        ? 8
        : answers.customerRelationship === "Standard"
          ? 5
          : 3,
    ],
    [
      answers.commercialCommitment,
      answers.commercialCommitment === "PCS"
        ? 10
        : answers.commercialCommitment === "CSA"
          ? 7
          : answers.commercialCommitment === "Governed LOI Requested"
            ? 4
            : 2,
    ],
  ];

  let score = 0;
  for (const [value, amount] of points) {
    if (filled(value)) score += amount;
  }
  if (filled(answers.decisionMakerName)) score += 2;
  if (filled(answers.siteMunicipality)) score += 2;
  if (filled(answers.approxGfaStoreys)) score += 3;
  if (filled(answers.budgetAmount)) score += 3;
  return Math.max(0, Math.min(100, score));
}

export function evaluateSalesQualification(
  answers: SalesQualificationAnswers,
): SalesQualificationResult {
  const missingInformation = [
    ...missingDropdowns(answers),
    ...missingConditionals(answers),
  ];
  const risks: string[] = [];
  if (answers.fundingStatus === "In Process") {
    risks.push("Funding is still in process.");
  } else if (answers.fundingStatus === "Not Secured") {
    risks.push("Funding is not secured.");
  } else if (answers.fundingStatus === "Unknown") {
    risks.push("Funding status is unknown.");
  }
  if (answers.budgetStatus === "Missing") {
    risks.push("Client budget is missing; no synthetic price is created.");
  } else if (answers.budgetStatus === "Major Gap") {
    risks.push("Budget shows a major gap and needs commercial review.");
  }

  const readinessScore = computeReadinessScore(answers);
  const noGo = isHardNoGo(answers);
  if (noGo) {
    return {
      recommendedService: "No-Go",
      qualificationStatus: "No-Go",
      missingInformation,
      readinessScore,
      hardRuleApplied: true,
      reasons: [noGo, "Hard Rules take priority over the readiness score."],
      risks,
    };
  }

  const hold = isHardHold(answers);
  if (hold) {
    return {
      recommendedService: "Hold",
      qualificationStatus: "Hold",
      missingInformation,
      readinessScore,
      hardRuleApplied: true,
      reasons: [hold, "Hard Rules take priority over the readiness score."],
      risks,
    };
  }

  if (missingInformation.length) {
    return {
      recommendedService: "Hold",
      qualificationStatus: "Incomplete",
      missingInformation,
      readinessScore,
      hardRuleApplied: false,
      reasons: ["Fill the remaining Sales fields before a paid path is assigned."],
      risks,
    };
  }

  const recommendedService = routeService(answers);
  const qualificationStatus = risks.length ? "Qualified with Risk" : "Qualified";
  const reasons = [
    recommendedService === "Site Feasibility"
      ? "Site is not yet confirmed, so the bounded next step is Site Feasibility."
      : recommendedService === "CSA"
        ? "Project is eligible for a bounded CSA before Class D / PCS."
        : recommendedService === "PCS"
          ? "Controlled Class D evidence supports Pre-Construction Services."
          : "Strategic returning client with Class D evidence can use a governed LOI.",
    "Readiness score is a management indicator only and does not change this route.",
  ];

  return {
    recommendedService,
    qualificationStatus,
    missingInformation: [],
    readinessScore,
    hardRuleApplied: false,
    reasons,
    risks,
  };
}

export function salesQualificationIsComplete(
  hasCompany: boolean,
  answers: SalesQualificationAnswers | null | undefined,
) {
  if (!hasCompany) return false;
  const normalized = normalizeSalesQualificationAnswers(answers);
  return (
    missingDropdowns(normalized).length === 0 &&
    missingConditionals(normalized).length === 0
  );
}
