import type {
  DomainNode,
  OpportunityBusinessRuleConfig,
  OpportunityEligibility,
  OpportunityEvaluationSnapshot,
  OpportunityIntake,
  OpportunityOverallStatus,
  OpportunityRoute,
  OpportunityRuleResult,
  OpportunityValidationConfig,
} from "@/types/workflow";
import {
  DEFAULT_OPPORTUNITY_BUSINESS_RULES,
  DESIGN_BASIS_LEVELS,
  OPPORTUNITY_RULE_DEFINITIONS,
  ROUTE_PRIORITY,
  SITE_NOT_FINAL,
  TECHNICAL_DESIGN_LEVELS,
} from "@/lib/opportunity-rules";

export interface OpportunityEvaluationResult {
  intake: OpportunityIntake;
  rules: OpportunityRuleResult[];
  eligibility: OpportunityEligibility[];
  recommendedRoute: OpportunityRoute;
  otherEligibleRoutes: OpportunityRoute[];
  routeReason: string;
  overallStatus: OpportunityOverallStatus;
  requiredActions: string[];
  riskFlags: string[];
  totalScore: number;
  scoreGrade: "Strong" | "Moderate" | "Weak" | "High Risk";
  scoreBreakdown: Record<string, number>;
  budget: {
    clientBudget?: number;
    classD?: number;
    variance?: number;
    alignment: string;
  };
  commercialEngagement: "Complete" | "Incomplete" | "Blocked";
  /** Canvas compatibility only. Its meaning is not a Gate result. */
  recommendedOutcome: NonNullable<
    OpportunityValidationConfig["decisionOutcome"]
  >;
  evaluatedAt: string;
}

const num = (value?: string | number) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};
const unique = (values: Array<string | undefined>) =>
  Array.from(
    new Set(values.filter((value): value is string => Boolean(value?.trim()))),
  );
const hasDesignBasis = (value?: string) =>
  Boolean(value && DESIGN_BASIS_LEVELS.has(value));

/** Safely maps legacy V1 questionnaire evidence; it never invents an answer. */
export function normalizeLegacyOpportunityConfig(
  config: OpportunityValidationConfig,
): OpportunityIntake {
  const existing = config.intake || {};
  const legacyDesign: Record<string, string> = {
    "Level 0: No Plans": "No Design",
    "Level 1: Concept": "Concept Plans",
    "Level 2: Preliminary": "Preliminary Design",
    "Level 3: Permit Set": "Permit Submission Set",
    "Level 4: Permit Issued": "Permit Issued",
  };
  const legacySite: Record<string, string> = {
    Owned: "Owned Site",
    "Under Option": "Option / Conditional Control",
    Searching: "Site Being Searched",
    Unresolved: "Unknown",
  };
  const client = existing.clientAuthority || {};
  const project = existing.projectDefinition || {};
  const site = existing.siteLand || {};
  const design = existing.design || {};
  const budget = existing.budgetFundingTimeline || {};
  const team = existing.teamCommitment || {};
  return {
    clientAuthority: {
      clientName: client.clientName ?? config.companyName,
      clientType: client.clientType,
      primaryContactName: client.primaryContactName ?? config.contactPerson,
      primaryContactRole: client.primaryContactRole,
      email: client.email ?? config.contactEmail,
      phone: client.phone ?? config.contactPhone,
      decisionAuthorityStatus:
        client.decisionAuthorityStatus ??
        (config.decisionMakerConfirmed
          ? "Confirmed"
          : config.decisionMakerName
            ? "Partially Confirmed"
            : "Unknown"),
      finalDecisionAuthorityIdentified:
        client.finalDecisionAuthorityIdentified ??
        (config.decisionMakerConfirmed ? "Yes" : "Unknown"),
      requiredDecisionPartiesIdentified:
        client.requiredDecisionPartiesIdentified ?? "Unknown",
      approvalPath: client.approvalPath ?? config.decisionMakerNotes,
      notes: client.notes,
      clientRelationship:
        client.clientRelationship ?? config.clientTierType ?? "Standard",
      // Keep one blank authority-evidence row visible in the UI so the first
      // decision maker can be captured without hunting for a secondary action.
      // This is an unanswered prompt, not invented client evidence.
      stakeholders: client.stakeholders?.length
        ? client.stakeholders
        : config.decisionMakerName
          ? [
              {
                id: "migrated-decision-maker",
                name: config.decisionMakerName,
                role: config.decisionMakerRole,
                decisionRole: "Final Decision Maker",
              },
            ]
          : [
              {
                id: "primary-decision-maker",
                decisionRole: "Final Decision Maker",
              },
            ],
    },
    projectDefinition: {
      projectName: project.projectName,
      projectType: project.projectType ?? config.projectIntent,
      buildingCount: project.buildingCount,
      storeys:
        project.storeys ??
        (config.storeys === undefined ? "" : String(config.storeys)),
      grossFloorArea:
        project.grossFloorArea ??
        (config.grossFloorArea === undefined
          ? ""
          : String(config.grossFloorArea)),
      unitsRoomsBeds:
        project.unitsRoomsBeds ??
        (config.unitCount === undefined ? "" : String(config.unitCount)),
      buildingDimensions: project.buildingDimensions,
      estimatedModuleCount: project.estimatedModuleCount,
    },
    siteLand: {
      ...site,
      siteStatus:
        site.siteStatus ??
        (config.siteStatus ? legacySite[config.siteStatus] : "Unknown"),
      siteAddress: site.siteAddress ?? config.siteAddress,
      siteControlNotes: site.siteControlNotes ?? config.siteConstraints,
    },
    design: {
      ...design,
      designMaturity:
        design.designMaturity ??
        (config.designStage ? legacyDesign[config.designStage] : "No Design"),
      modularCompatibilityStatus:
        design.modularCompatibilityStatus ??
        (config.modularFitPassed === true
          ? "Appears Compatible"
          : "Not Reviewed"),
      reviewedBy:
        design.reviewedBy ??
        (config.modularFitPassed === true
          ? "Sales Preliminary"
          : "Not Reviewed"),
    },
    budgetFundingTimeline: {
      ...budget,
      clientBudgetProvided:
        budget.clientBudgetProvided ??
        (config.clientBudget ? "Yes" : "Unknown"),
      clientBudgetAmount: budget.clientBudgetAmount ?? config.clientBudget,
      budgetBasis: budget.budgetBasis ?? config.budgetScope,
      fundingStatus:
        budget.fundingStatus ??
        (config.fundingSecured
          ? "Fully Secured"
          : config.fundingSource
            ? "Funding Strategy Identified"
            : "Unknown"),
      targetOccupancy: budget.targetOccupancy ?? config.targetTimeline,
      timelineStatus: budget.timelineStatus ?? "Unknown",
    },
    teamCommitment: {
      ...team,
      members: team.members ?? [],
      clientAcceptedPaidEarlyWork:
        team.clientAcceptedPaidEarlyWork ??
        (config.engagementStatus === "Executed" ? "Yes" : "Unknown"),
    },
  };
}

export function getOpportunityConfig(
  node: DomainNode,
): OpportunityValidationConfig {
  const config = node.config.opportunity || {};
  return { ...config, intake: normalizeLegacyOpportunityConfig(config) };
}

export function getOpportunityBusinessRules(
  config?: OpportunityBusinessRuleConfig,
) {
  const rawWeights = {
    ...DEFAULT_OPPORTUNITY_BUSINESS_RULES.scoreWeights,
    ...(config?.scoreWeights || {}),
  };
  const weightEntries = Object.entries(rawWeights).map(
    ([key, value]) => [key, Math.max(0, Number(value) || 0)] as const,
  );
  const weightTotal = weightEntries.reduce((sum, [, value]) => sum + value, 0);
  const scoreWeights = Object.fromEntries(
    weightEntries.map(([key, value]) => [
      key,
      weightTotal ? (value / weightTotal) * 100 : 0,
    ]),
  ) as typeof DEFAULT_OPPORTUNITY_BUSINESS_RULES.scoreWeights;
  const rawTolerance = Number(
    config?.budgetAlignmentTolerancePercent ??
      DEFAULT_OPPORTUNITY_BUSINESS_RULES.budgetAlignmentTolerancePercent,
  );
  const budgetAlignmentTolerancePercent =
    Number.isFinite(rawTolerance) && rawTolerance >= 0
      ? rawTolerance
      : DEFAULT_OPPORTUNITY_BUSINESS_RULES.budgetAlignmentTolerancePercent;
  return {
    ...DEFAULT_OPPORTUNITY_BUSINESS_RULES,
    ...config,
    budgetAlignmentTolerancePercent,
    scoreWeights,
    scoreGradeThresholds: {
      ...DEFAULT_OPPORTUNITY_BUSINESS_RULES.scoreGradeThresholds,
      ...(config?.scoreGradeThresholds || {}),
    },
  };
}

function outcomeForRoute(
  route: OpportunityRoute,
): NonNullable<OpportunityValidationConfig["decisionOutcome"]> {
  if (route === "NO_GO_ARCHIVE") return "nogo-disqualified";
  if (route === "HOLD_PREQUALIFICATION") return "site-feasibility";
  if (route === "TECHNICAL_REVIEW") return "technical-review";
  if (route === "GOVERNED_LOI") return "governed-loi";
  if (route === "CONSULTATION_CSA") return "consultation-csa";
  if (route === "PCS") return "pcs";
  return "class-d";
}

/** Canonical canvas outcome for the current recommended route. */
export function getOpportunityCanvasOutcome(route: OpportunityRoute) {
  return outcomeForRoute(route);
}

export function evaluateOpportunity(
  node: DomainNode,
): OpportunityEvaluationResult {
  const opp = getOpportunityConfig(node);
  const intake = opp.intake!;
  const settings = getOpportunityBusinessRules(opp.businessRules);
  const client = intake.clientAuthority || {};
  const project = intake.projectDefinition || {};
  const site = intake.siteLand || {};
  const design = intake.design || {};
  const budgetFunding = intake.budgetFundingTimeline || {};
  const team = intake.teamCommitment || {};
  const rules: OpportunityRuleResult[] = [];
  const actions: string[] = [];
  const risks: string[] = [];
  const addRule = (rule: OpportunityRuleResult) => {
    const definition = OPPORTUNITY_RULE_DEFINITIONS[rule.id];
    const normalized: OpportunityRuleResult = {
      ...rule,
      condition: rule.condition || definition?.condition || rule.name,
      enabled: rule.enabled !== false && definition?.enabled !== false,
    };
    rules.push(normalized);
    if (normalized.recommendedAction)
      actions.push(normalized.recommendedAction);
  };
  const addRisk = (name: string, action?: string) => {
    risks.push(name);
    addRule({
      id: `risk-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name,
      category: "RISK",
      severity: "WARNING",
      outcome: "RISK",
      message: name,
      recommendedAction: action,
    });
  };

  const storeys = num(project.storeys);
  const gfa = num(project.grossFloorArea);
  const designBasis = hasDesignBasis(design.designMaturity);
  const technicalDesign = Boolean(
    design.designMaturity && TECHNICAL_DESIGN_LEVELS.has(design.designMaturity),
  );
  const siteIsNotFinal = Boolean(
    site.siteStatus && SITE_NOT_FINAL.has(site.siteStatus),
  );
  const modularNotReviewed = [
    "Not Reviewed",
    "Requires Technical Review",
    "Unknown",
  ].includes(design.modularCompatibilityStatus || "");
  const budgetAmount = num(budgetFunding.clientBudgetAmount);
  // A historical amount must never create a synthetic variance once Class D is
  // marked unavailable, unknown, or not yet evaluated.
  const classDAmount =
    budgetFunding.classDAvailable === "Yes"
      ? num(budgetFunding.classDAmount)
      : undefined;
  const variance =
    budgetAmount && classDAmount
      ? ((budgetAmount - classDAmount) / classDAmount) * 100
      : undefined;
  const alignment = !budgetAmount
    ? "Client Budget Unknown"
    : !classDAmount
      ? "Not Evaluated"
      : Math.abs(variance!) <= settings.budgetAlignmentTolerancePercent
        ? "Within Expected Range"
        : Math.abs(variance!) <= settings.budgetAlignmentTolerancePercent * 2
          ? "Potential Gap"
          : "Major Gap";

  // HARD RULES — these take precedence over every score and route.
  if (client.decisionAuthorityStatus === "Unknown")
    addRule({
      id: "decision-authority-unknown",
      name: "Decision authority unknown",
      category: "HARD",
      severity: "HOLD",
      outcome: "HOLD",
      message: "Final decision authority has not been verified.",
      recommendedAction: "Confirm final decision authority.",
    });
  if (!storeys && !gfa)
    addRule({
      id: "project-scale-missing",
      name: "Project scale missing",
      category: "HARD",
      severity: "BLOCK",
      outcome: "BLOCK_CLASS_D",
      message:
        "Storeys and approximate GFA are both unknown; a Class D benchmark cannot be prepared.",
      recommendedAction:
        "Obtain approximate project scale, including Storeys and GFA.",
    });
  else {
    if (!storeys) actions.push("Confirm approximate number of storeys.");
    if (!gfa) actions.push("Obtain approximate GFA.");
  }
  if (design.modularCompatibilityStatus === "Not Compatible") {
    if (design.viableCorrectivePath === "No")
      addRule({
        id: "modular-incompatibility",
        name: "Confirmed modular incompatibility",
        category: "HARD",
        severity: "NO_GO",
        outcome: "NO_GO",
        message:
          "Technical assessment confirms the current design is not modular-compatible and no viable corrective path is recorded.",
        recommendedAction:
          "Archive as No-Go or document a viable technical corrective path.",
      });
    else
      addRule({
        id: "modular-incompatibility-review",
        name: "Modular incompatibility requires technical decision",
        category: "HARD",
        severity: "HOLD",
        outcome: "TECHNICAL_HOLD",
        message:
          "The current design is not modular-compatible; a viable corrective path must be confirmed before proceeding.",
        recommendedAction: "Confirm a viable corrective path with Technical.",
      });
  }
  if (
    ["Major Rework Likely", "Partially Compatible"].includes(
      design.modularCompatibilityStatus || "",
    )
  )
    addRule({
      id: "modular-rework-review",
      name: "Modular rework requires technical review",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "TECHNICAL_REVIEW_REQUIRED",
      message:
        "The design may require material modular rework before it can proceed.",
      recommendedAction:
        "Request modular compatibility review and document the rework path.",
    });
  if (site.fatalConstraintConfirmed) {
    if (site.fatalConstraintResolvable === "No")
      addRule({
        id: "fatal-site-constraint",
        name: "Fatal site or transport constraint",
        category: "HARD",
        severity: "NO_GO",
        outcome: "NO_GO",
        message:
          "A confirmed site or transport constraint has no viable resolution.",
        recommendedAction:
          "Archive as No-Go or change the site / transport solution.",
      });
    else
      addRule({
        id: "fatal-site-constraint-review",
        name: "Site constraint needs technical resolution",
        category: "HARD",
        severity: "HOLD",
        outcome: "TECHNICAL_HOLD",
        message:
          "A potentially fatal site or transport constraint needs an approved technical resolution.",
        recommendedAction:
          "Request technical feasibility review for the confirmed site constraint.",
      });
  }

  // CONDITIONAL RULES — they select an appropriate current route.
  if (design.designMaturity === "No Design")
    addRule({
      id: "no-design-consultation",
      name: "No design basis",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "CSA_ELIGIBLE",
      message:
        "No design is not a No-Go; early consultation can establish a modular design basis.",
      recommendedAction: "Obtain concept sketch or begin consultation.",
    });
  if (!designBasis && design.designMaturity !== "No Design")
    addRule({
      id: "insufficient-design-basis",
      name: "Insufficient design basis",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "PCS_NOT_YET_ELIGIBLE",
      message:
        "There is insufficient design basis to assess modular compatibility.",
      recommendedAction: "Obtain a sketch, layout, or basic design basis.",
    });
  if (modularNotReviewed && technicalDesign)
    addRule({
      id: "modular-review-required",
      name: "Modular review required",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "TECHNICAL_REVIEW_REQUIRED",
      message: "Design exists but modular compatibility has not been reviewed.",
      recommendedAction: "Request modular compatibility review.",
    });
  if (!budgetAmount)
    addRule({
      id: "client-budget-missing",
      name: "Client budget missing",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "BUDGET_ALIGNMENT_NOT_READY",
      message:
        "Budget alignment cannot be assessed without a client target budget.",
      recommendedAction: "Obtain client target budget.",
    });
  if (!classDAmount && (storeys || gfa))
    addRule({
      id: "class-d-missing",
      name: "Class D benchmark unavailable",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "CLASS_D_PENDING",
      message:
        "Project scale exists but a Class D benchmark has not been recorded.",
      recommendedAction:
        "Prepare Class D benchmark when sufficient project basis exists.",
    });
  if (["Potential Gap", "Major Gap"].includes(alignment))
    addRule({
      id: "budget-alignment-gap",
      name: "Budget alignment gap",
      category: "CONDITIONAL",
      severity: "ACTION",
      outcome: "COMMERCIAL_REVIEW_REQUIRED",
      message: `Budget variance is ${Math.abs(variance!).toFixed(1)}%, outside the configured ${settings.budgetAlignmentTolerancePercent}% tolerance.`,
      recommendedAction:
        "Review budget alignment and calibrate scope with Commercial.",
    });

  // RISK RULES — warnings only; never independent failure.
  if (
    ["Financing In Process", "Partially Secured", "Not Secured"].includes(
      budgetFunding.fundingStatus || "",
    )
  )
    addRisk("Funding in process", "Confirm funding strategy.");
  if (budgetFunding.fundingStatus === "Unknown")
    addRisk("Funding unknown", "Confirm funding strategy.");
  if (siteIsNotFinal)
    addRisk("Site not final", "Confirm candidate site / site allocation.");
  if (["Unknown", "No"].includes(site.transportationConstraintsKnown || ""))
    addRisk(
      "Transportation access unknown",
      "Confirm transportation constraints and access.",
    );
  if (modularNotReviewed && technicalDesign) addRisk("Modular review pending");
  if (budgetFunding.timelineStatus === "Aggressive")
    addRisk(
      "Aggressive timeline",
      "Review delivery milestones and timeline realism.",
    );
  if (
    (client.stakeholders || []).filter((person) =>
      [
        "Final Decision Maker",
        "Financial Approver",
        "Board / Committee",
      ].includes(person.decisionRole || ""),
    ).length > 1 ||
    client.requiredDecisionPartiesIdentified === "No"
  )
    addRisk(
      "Multiple decision makers",
      "Confirm all required decision parties and approval path.",
    );
  if (
    (team.members || []).filter((person) => person.status === "Engaged")
      .length === 0 &&
    designBasis
  )
    addRisk("Consultants incomplete", "Confirm required project consultants.");
  if (design.designMaturity === "Permit Issued" && modularNotReviewed)
    addRisk(
      "Permit-ready design not modular reviewed",
      "Request modular compatibility review.",
    );

  const hardNoGo = rules.some(
    (rule) => rule.category === "HARD" && rule.severity === "NO_GO",
  );
  const hardHold = rules.some(
    (rule) =>
      rule.category === "HARD" && ["HOLD", "BLOCK"].includes(rule.severity),
  );
  const needsTechnicalReview = rules.some((rule) =>
    [
      "modular-review-required",
      "modular-rework-review",
      "modular-incompatibility-review",
      "fatal-site-constraint-review",
    ].includes(rule.id),
  );
  const loiEligible =
    !hardNoGo &&
    !hardHold &&
    settings.governedLoiAllowed &&
    ["Strategic", "Returning", "Trusted"].includes(
      client.clientRelationship || "Standard",
    );
  const eligibility: OpportunityEligibility[] = [
    {
      key: "CLASS_D",
      label: "Class D",
      status:
        storeys && gfa && !hardNoGo && !hardHold
          ? "ELIGIBLE"
          : hardNoGo
            ? "NOT_ELIGIBLE"
            : "NOT_YET_ELIGIBLE",
      reasons: hardNoGo
        ? ["A fundamental blocker must be resolved before Class D can proceed."]
        : hardHold
          ? rules
              .filter((rule) => rule.category === "HARD")
              .map((rule) => rule.message)
          : storeys && gfa
            ? []
            : ["Approximate Storeys and GFA are required."],
    },
    {
      key: "CONSULTATION_CSA",
      label: "CSA / Consultation",
      status: hardNoGo
        ? "NOT_ELIGIBLE"
        : !designBasis || !storeys || !gfa || siteIsNotFinal
          ? "ELIGIBLE"
          : "CONDITIONALLY_ELIGIBLE",
      reasons: hardNoGo
        ? ["A fundamental blocker must be resolved first."]
        : designBasis
          ? [
              "Early consultation remains available where information or alignment needs work.",
            ]
          : ["Consultation can establish the project and design basis."],
    },
    {
      key: "PCS",
      label: "PCS",
      status: hardNoGo
        ? "NOT_ELIGIBLE"
        : designBasis && !hardHold
          ? "CONDITIONALLY_ELIGIBLE"
          : "NOT_YET_ELIGIBLE",
      reasons: designBasis
        ? needsTechnicalReview
          ? ["Technical modular review is required before PCS can proceed."]
          : []
        : ["Insufficient design basis to assess modular compatibility."],
    },
    {
      key: "GOVERNED_LOI",
      label: "Governed LOI",
      status: loiEligible ? "CONDITIONALLY_ELIGIBLE" : "NOT_YET_ELIGIBLE",
      reasons: loiEligible
        ? [
            "Eligible only because the configured business rule permits this client relationship.",
          ]
        : [
            "LOI is not a default route and requires an enabled business rule plus an approved client relationship.",
          ],
    },
    {
      key: "TECHNICAL_REVIEW",
      label: "Technical Review",
      status: hardNoGo
        ? "NOT_ELIGIBLE"
        : needsTechnicalReview
          ? "CONDITIONALLY_ELIGIBLE"
          : "NOT_YET_ELIGIBLE",
      reasons: hardNoGo
        ? [
            "A fundamental blocker must be resolved before technical review can proceed.",
          ]
        : needsTechnicalReview
          ? [
              "Technical review is required before the affected route can proceed.",
            ]
          : ["No technical review is currently required."],
    },
    {
      key: "TECHNICAL_HANDOFF",
      label: "Technical Handoff",
      status:
        design.modularCompatibilityStatus === "Appears Compatible" &&
        design.reviewedBy !== "Sales Preliminary"
          ? "ELIGIBLE"
          : "NOT_YET_ELIGIBLE",
      reasons: [],
    },
    {
      key: "PRE_CONSTRUCTION",
      label: "Pre-Construction",
      status:
        designBasis &&
        design.modularCompatibilityStatus === "Appears Compatible" &&
        Boolean(storeys && gfa) &&
        !hardHold &&
        !hardNoGo
          ? "CONDITIONALLY_ELIGIBLE"
          : "NOT_YET_ELIGIBLE",
      reasons: [
        "Requires design basis, scale, modular compatibility and normal commercial authorization outside L2.",
      ],
    },
    {
      key: "HOLD",
      label: "Hold",
      status: hardHold ? "CONDITIONALLY_ELIGIBLE" : "NOT_YET_ELIGIBLE",
      reasons: hardHold
        ? rules
            .filter(
              (rule) => rule.category === "HARD" && rule.severity !== "NO_GO",
            )
            .map((rule) => rule.message)
        : [],
    },
  ];
  const availableRoutes: OpportunityRoute[] = [];
  if (hardNoGo) availableRoutes.push("NO_GO_ARCHIVE");
  if (hardHold) availableRoutes.push("HOLD_PREQUALIFICATION");
  if (needsTechnicalReview) availableRoutes.push("TECHNICAL_REVIEW");
  if (
    eligibility.find((item) => item.key === "CONSULTATION_CSA")?.status ===
    "ELIGIBLE"
  )
    availableRoutes.push("CONSULTATION_CSA");
  if (
    eligibility.find((item) => item.key === "PCS")?.status ===
    "CONDITIONALLY_ELIGIBLE"
  )
    availableRoutes.push("PCS");
  if (loiEligible) availableRoutes.push("GOVERNED_LOI");
  if (eligibility.find((item) => item.key === "CLASS_D")?.status === "ELIGIBLE")
    availableRoutes.push("CLASS_D");
  const recommendedRoute =
    ROUTE_PRIORITY.find((route) => availableRoutes.includes(route)) ||
    "HOLD_PREQUALIFICATION";
  const otherEligibleRoutes = availableRoutes.filter(
    (route) => route !== recommendedRoute,
  );

  const scoreSource: Record<string, number> = {
    authority:
      client.decisionAuthorityStatus === "Confirmed"
        ? 1
        : client.decisionAuthorityStatus === "Partially Confirmed"
          ? 0.5
          : 0,
    project: storeys && gfa ? 1 : storeys || gfa ? 0.5 : 0,
    site: [
      "Confirmed Site / Address",
      "Owned Site",
      "Controlled / Under Agreement",
    ].includes(site.siteStatus || "")
      ? 1
      : site.siteStatus
        ? 0.5
        : 0,
    design: designBasis ? 1 : design.designMaturity === "No Design" ? 0.25 : 0,
    modular:
      design.modularCompatibilityStatus === "Appears Compatible"
        ? 1
        : [
              "Partially Compatible",
              "Requires Technical Review",
              "Not Reviewed",
            ].includes(design.modularCompatibilityStatus || "")
          ? 0.5
          : 0,
    budget:
      alignment === "Within Expected Range"
        ? 1
        : alignment === "Potential Gap"
          ? 0.5
          : 0,
    fundingTimeline:
      budgetFunding.fundingStatus === "Fully Secured" &&
      budgetFunding.timelineStatus === "Realistic"
        ? 1
        : budgetFunding.fundingStatus || budgetFunding.timelineStatus
          ? 0.5
          : 0,
    teamCommitment:
      Object.values(team).filter((value) => value === "Yes").length >= 4
        ? 1
        : Object.values(team).some((value) => value === "Yes")
          ? 0.5
          : 0,
  };
  const scoreBreakdown = Object.fromEntries(
    Object.entries(scoreSource).map(([key, proportion]) => [
      key,
      Math.round(
        (settings.scoreWeights[key as keyof typeof settings.scoreWeights] ||
          0) * proportion,
      ),
    ]),
  );
  const totalScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0),
      ),
    ),
  );
  const thresholds = settings.scoreGradeThresholds;
  const scoreGrade = hardNoGo
    ? "High Risk"
    : totalScore >= (thresholds.strong ?? 75)
      ? "Strong"
      : totalScore >= (thresholds.moderate ?? 50)
        ? "Moderate"
        : totalScore >= (thresholds.weak ?? 25)
          ? "Weak"
          : "High Risk";
  const overallStatus: OpportunityOverallStatus = hardNoGo
    ? "NO-GO"
    : hardHold
      ? rules.some((rule) => rule.severity === "BLOCK")
        ? "BLOCKED"
        : "HOLD"
      : needsTechnicalReview
        ? "TECHNICAL REVIEW REQUIRED"
        : rules.some(
              (rule) =>
                rule.category === "CONDITIONAL" && rule.severity === "ACTION",
            ) || risks.length
          ? "ACTION REQUIRED"
          : "READY";
  const routeReason =
    recommendedRoute === "NO_GO_ARCHIVE"
      ? "A confirmed fundamental blocker has no viable resolution."
      : recommendedRoute === "HOLD_PREQUALIFICATION"
        ? "A hard rule requires verified evidence before the opportunity can proceed."
        : recommendedRoute === "TECHNICAL_REVIEW"
          ? "Design information exists, but modular compatibility requires technical review."
          : recommendedRoute === "CONSULTATION_CSA"
            ? "Early consultation can establish the required project and design basis."
            : recommendedRoute === "PCS"
              ? "A design basis exists and the opportunity can enter deeper pre-construction assessment."
              : recommendedRoute === "GOVERNED_LOI"
                ? "The configured business rule permits a governed LOI for this relationship."
                : "Approximate Storeys and GFA are available for Class D preparation.";
  return {
    intake,
    rules,
    eligibility,
    recommendedRoute,
    otherEligibleRoutes,
    routeReason,
    overallStatus,
    requiredActions: unique(actions),
    riskFlags: unique(risks),
    totalScore,
    scoreGrade,
    scoreBreakdown,
    budget: {
      clientBudget: budgetAmount,
      classD: classDAmount,
      variance,
      alignment,
    },
    commercialEngagement: settings.commercialEngagement,
    recommendedOutcome: outcomeForRoute(recommendedRoute),
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluationSnapshot(
  result: OpportunityEvaluationResult,
): OpportunityEvaluationSnapshot {
  return {
    rules: result.rules,
    eligibility: result.eligibility,
    recommendedRoute: result.recommendedRoute,
    otherEligibleRoutes: result.otherEligibleRoutes,
    score: {
      value: result.totalScore,
      grade: result.scoreGrade,
      breakdown: result.scoreBreakdown,
    },
    overallStatus: result.overallStatus,
    requiredActions: result.requiredActions,
    riskFlags: result.riskFlags,
    evaluatedAt: result.evaluatedAt,
  };
}
