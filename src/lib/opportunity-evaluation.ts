import type { DomainNode, OpportunityValidationConfig } from "@/types/workflow";

export interface QuestionnaireAnswers {
  // Q1: Decision Maker
  dmLevel: "direct" | "influencer" | "unclear";
  // Q2: Project Definition & Scale
  scaleLevel: "defined" | "rough" | "none";
  // Q3: Site Readiness
  siteLevel: "owned" | "option" | "searching";
  // Q4: Design Readiness
  designLevel: "lvl4" | "lvl3" | "lvl2" | "lvl1" | "lvl0";
  // Q5: Budget & Reality Check
  budgetLevel: "aligned" | "manageable" | "disconnect";
  // Q6: Financing & Timeline
  fundingLevel: "secured" | "progressing" | "speculative";
  timelineLevel: "realistic" | "accelerated" | "unfeasible";
  // Q7: Consultants & Modular Fit
  consultantLevel: "engaged" | "in_progress" | "none";
  fitLevel: "high" | "moderate" | "blocker";
  // Q8: Client Commitment & Type
  clientTier: "Standard" | "Returning" | "Trusted" | "Strategic";
  commitmentLevel: "paid_contract" | "loi_governed" | "verbal_interest" | "uncommitted";
}

export interface OpportunityEvaluationResult {
  totalScore: number;
  grade: "P1" | "P2" | "P3" | "P4" | "P5";
  gradeLabel: string;
  gradeDesc: string;
  gradeColor: string;
  autoOwnerType: OpportunityValidationConfig["ownerType"];
  autoPath: OpportunityValidationConfig["engagementPath"];
  recommendedOutcome: NonNullable<OpportunityValidationConfig["decisionOutcome"]>;
  gaps: { label: string; action: string; severity: "warning" | "error" | "info" }[];
  missingInfo: string[];
  hasFatalRedFlag: boolean;
  mandatoryPassed: boolean;
  dynamicRiskTags: Array<
    | "Financing-Dependent"
    | "Accelerated-Schedule"
    | "Non-Standard-Grid"
    | "Zoning-Unconfirmed"
    | "High-Cost-Variance"
  >;
  isStrategicOrTrusted: boolean;
  isLoiAllowed: boolean;
  answers: QuestionnaireAnswers;
  variance: number;
  benchmarkCost: number;
  budgetNum: number;
  area: number;
  costPerSqFt: number;
}

export function getOpportunityConfig(node: DomainNode): OpportunityValidationConfig {
  return {
    companyName: "Apex Urban Developments",
    contactPerson: "Marcus Vance, VP Development",
    leadSource: "Direct Architect Referral",
    contactPhone: "(250) 555-0192",
    contactEmail: "marcus@apexdev.ca",
    decisionMakerName: "Marcus Vance",
    decisionMakerRole: "Managing Partner & Signing Officer",
    decisionMakerConfirmed: true,
    decisionMakerNotes: "Controls acquisition budget; board sign-off threshold is $15M.",
    clientTierType: "Strategic",
    projectIntent: "4-Storey Multi-Family Rental",
    projectLocation: "Kelowna, BC",
    storeys: 4,
    grossFloorArea: 28000,
    unitCount: 36,
    siteStatus: "Owned",
    siteAddress: "1080 Enterprise Way, Kelowna BC",
    siteConstraints: "Municipal water/sewer at lot line; crane pad feasible on South frontage.",
    designStage: "Level 1: Concept",
    clientBudget: "9800000",
    budgetScope: "Turnkey Total",
    targetCostPerSqFt: "350",
    fundingSource: "Commercial Loan",
    fundingSecured: true,
    targetTimeline: "Target occupancy in 15 months",
    consultantsInfo: "Kasian Architecture (Concept sketches); structural via ProFab engineering.",
    modularFitPassed: true,
    realityCheckStatus: "passed",
    ownerType: "Design-Needed",
    gapMitigationNotes: "Drawings currently at concept level -> Execute CSA to coordinate architectural modularization.",
    engagementPath: "CSA",
    engagementStatus: "Draft",
    decisionOutcome: "pass-p1-p2",
    loiConfig: {
      scopeSummary: "Limited modular geometry fit check & Class D benchmarking",
      maxDays: 21,
      maxHours: 20,
      reviewDate: "2026-09-15",
      conversionTrigger: "Class D variance confirmation & preliminary MEP scheme review",
      isConvertedToPaid: false,
    },
    riskTags: ["Financing-Dependent"],
    hardGateOverride: false,
    ...(node.config.opportunity || {}),
  };
}

export function evaluateOpportunity(node: DomainNode): OpportunityEvaluationResult {
  const opp = getOpportunityConfig(node);
  const customFields = node.customFields || {};

  const area = Number(opp.grossFloorArea) || 0;
  const costPerSqFt = Number(opp.targetCostPerSqFt) || 0;
  const benchmarkCost = area * costPerSqFt;
  const budgetNum = Number(opp.clientBudget?.toString().replace(/\D/g, "")) || 0;
  const variance =
    budgetNum > 0 && benchmarkCost > 0
      ? ((benchmarkCost - budgetNum) / budgetNum) * 100
      : 0;

  const autoBudgetLevel: "aligned" | "manageable" | "disconnect" =
    budgetNum <= 0 || area <= 0 || costPerSqFt <= 0
      ? "aligned"
      : variance <= 10
        ? "aligned"
        : variance <= 25
          ? "manageable"
          : "disconnect";

  const answers: QuestionnaireAnswers = {
    dmLevel:
      (customFields.q_dm as QuestionnaireAnswers["dmLevel"]) ||
      (opp.decisionMakerConfirmed ? "direct" : "influencer"),
    scaleLevel:
      (customFields.q_scale as QuestionnaireAnswers["scaleLevel"]) ||
      (Number(opp.grossFloorArea) > 0 ? "defined" : "rough"),
    siteLevel:
      (customFields.q_site as QuestionnaireAnswers["siteLevel"]) ||
      (opp.siteStatus === "Owned"
        ? "owned"
        : opp.siteStatus === "Under Option"
          ? "option"
          : "searching"),
    designLevel:
      (customFields.q_design as QuestionnaireAnswers["designLevel"]) ||
      (opp.designStage?.startsWith("Level 4")
        ? "lvl4"
        : opp.designStage?.startsWith("Level 3")
          ? "lvl3"
          : opp.designStage?.startsWith("Level 2")
            ? "lvl2"
            : opp.designStage?.startsWith("Level 1")
              ? "lvl1"
              : "lvl0"),
    budgetLevel: autoBudgetLevel,
    fundingLevel:
      (customFields.q_funding as QuestionnaireAnswers["fundingLevel"]) ||
      (opp.fundingSecured ? "secured" : "progressing"),
    timelineLevel:
      (customFields.q_timeline as QuestionnaireAnswers["timelineLevel"]) ||
      "realistic",
    consultantLevel:
      (customFields.q_consultants as QuestionnaireAnswers["consultantLevel"]) ||
      "engaged",
    fitLevel:
      (customFields.q_fit as QuestionnaireAnswers["fitLevel"]) ||
      (opp.modularFitPassed ? "high" : "moderate"),
    clientTier:
      (customFields.q_client_tier as QuestionnaireAnswers["clientTier"]) ||
      opp.clientTierType ||
      "Strategic",
    commitmentLevel:
      (customFields.q_commitment as QuestionnaireAnswers["commitmentLevel"]) ||
      (opp.engagementStatus === "Executed"
        ? "paid_contract"
        : opp.engagementPath === "LOI"
          ? "loi_governed"
          : opp.engagementPath === "CSA" || opp.engagementPath === "PCS"
            ? "paid_contract"
            : "verbal_interest"),
  };

  let score = 0;
  const gaps: { label: string; action: string; severity: "warning" | "error" | "info" }[] = [];
  const missingInfo: string[] = [];
  let hasFatalRedFlag = false;
  let mandatoryPassed = true;

  // 1. Decision Maker (max 18 pts) [Mandatory]
  if (answers.dmLevel === "direct") {
    score += 18;
  } else if (answers.dmLevel === "influencer") {
    score += 9;
    gaps.push({
      label: "Decision Maker Access",
      action: "Schedule direct alignment with authorized signing officer before engineering commitment",
      severity: "warning",
    });
    missingInfo.push("Authorized decision maker verification");
  } else {
    score -= 10;
    hasFatalRedFlag = true;
    mandatoryPassed = false;
    gaps.push({
      label: "No Decision Authority",
      action: "Lead contact lacks commercial signing & budget allocation authority",
      severity: "error",
    });
    missingInfo.push("Board / C-suite commercial mandate confirmation");
  }

  // 2. Project Definition & Scale (max 12 pts)
  if (answers.scaleLevel === "defined") {
    score += 12;
  } else if (answers.scaleLevel === "rough") {
    score += 6;
    gaps.push({
      label: "Approximate Dimensions",
      action: "Gather floor plan area breakdown and unit program",
      severity: "info",
    });
  } else {
    score += 1;
    gaps.push({
      label: "Missing Scale Parameters",
      action: "Establish target total gross floor area, storeys, and unit count",
      severity: "warning",
    });
    missingInfo.push("Gross Floor Area (sq.ft.) & Storey confirmation");
  }

  // 3. Site & Land Readiness (max 15 pts) [Mandatory]
  if (answers.siteLevel === "owned") {
    score += 15;
  } else if (answers.siteLevel === "option") {
    score += 10;
    gaps.push({
      label: "Conditional Land Control",
      action: "Track option expiration and municipal servicing due diligence window",
      severity: "warning",
    });
    missingInfo.push("Land purchase agreement / Option expiry terms");
  } else {
    // Early site search is standard for P4 exploratory projects requiring Site Feasibility
    score += 3;
    gaps.push({
      label: "Site Under Evaluation",
      action: "Identify target parcel and execute Paid Site & Logistics Feasibility Study",
      severity: "warning",
    });
    missingInfo.push("Target property parcel zoning & crane access evaluation");
  }

  // 4. Design Readiness (max 15 pts)
  if (answers.designLevel === "lvl4" || answers.designLevel === "lvl3") {
    score += 15;
  } else if (answers.designLevel === "lvl2") {
    score += 10;
  } else if (answers.designLevel === "lvl1") {
    score += 6;
    gaps.push({
      label: "Concept Drawings Only",
      action: "Execute Paid CSA for modular architectural coordination",
      severity: "info",
    });
  } else {
    score += 3;
    gaps.push({
      label: "No Architectural Drawings (Concept Phase)",
      action: "Execute Paid Feasibility to generate volumetric modular layout massing",
      severity: "warning",
    });
    missingInfo.push("Architectural concept massing / floor layouts");
  }

  // 5. Budget & Class D Reality Check (max 15 pts) [Mandatory Reality Check]
  if (answers.budgetLevel === "aligned") {
    score += 15;
  } else if (answers.budgetLevel === "manageable") {
    score += 8;
    gaps.push({
      label: "Budget Variance (10–25%)",
      action: "Perform value engineering & modular spec calibration during pre-construction",
      severity: "warning",
    });
    missingInfo.push("Value engineering target breakdown");
  } else {
    // Over 25% gap: If extreme (>35%), fatal red flag; if 25-35%, early recalibration gap
    if (variance > 35) {
      score -= 15;
      hasFatalRedFlag = true;
      mandatoryPassed = false;
      gaps.push({
        label: "Extreme Budget Disconnect (>35% Gap)",
        action: "Client budget cannot construct target square footage; recalibrate scope or decline",
        severity: "error",
      });
      missingInfo.push("Class D target budget alignment agreement");
    } else {
      score += 2;
      gaps.push({
        label: "High Budget Gap (25–35%)",
        action: "Perform comprehensive Class D cost model benchmarking during Paid Feasibility",
        severity: "warning",
      });
      missingInfo.push("Scope & finishes calibration");
    }
  }

  // 6. Financing & Timeline (max 10 pts)
  if (answers.fundingLevel === "secured") score += 6;
  else if (answers.fundingLevel === "progressing") score += 4;
  else {
    score += 2;
    gaps.push({
      label: "Speculative Funding",
      action: "Establish proof of funds milestone prior to detailed engineering release",
      severity: "warning",
    });
    missingInfo.push("Proof of funds / Bank financing commitment");
  }

  if (answers.timelineLevel === "realistic") score += 4;
  else if (answers.timelineLevel === "accelerated") {
    score += 2;
    gaps.push({
      label: "Accelerated Schedule",
      action: "Implement fast-track engineering and pre-reserve factory manufacturing slot",
      severity: "info",
    });
  } else {
    score -= 10;
    hasFatalRedFlag = true;
    mandatoryPassed = false;
    gaps.push({
      label: "Impossible Timeline",
      action: "Occupancy deadline is physically unachievable under standard manufacturing & permit lead times",
      severity: "error",
    });
  }

  // 7. Consultants & Modular Fit (max 10 pts) [Mandatory Fit]
  if (answers.consultantLevel === "engaged") score += 4;
  else if (answers.consultantLevel === "in_progress") score += 2;
  else score += 1;

  if (answers.fitLevel === "high") score += 6;
  else if (answers.fitLevel === "moderate") {
    score += 3;
    gaps.push({
      label: "Modular Adjustments Required",
      action: "Perform transport clearance & crane logistics review",
      severity: "info",
    });
  } else {
    score -= 20;
    hasFatalRedFlag = true;
    mandatoryPassed = false;
    gaps.push({
      label: "Non-Modular Fit / Fatal Red Flag",
      action: "Project geometry or transport limits are fundamentally unfeasible for volumetric modularization",
      severity: "error",
    });
    missingInfo.push("Volumetric modular logistics clearance");
  }

  // 8. Client Commitment & Strategic Status (max 5 pts)
  const isStrategicOrTrusted =
    answers.clientTier === "Strategic" ||
    answers.clientTier === "Trusted" ||
    answers.clientTier === "Returning";

  if (answers.commitmentLevel === "paid_contract") score += 5;
  else if (answers.commitmentLevel === "loi_governed") score += isStrategicOrTrusted ? 4 : 2;
  else if (answers.commitmentLevel === "verbal_interest") score += 1;

  const totalScore = Math.max(0, Math.min(100, score));

  // Dynamic Risk Tags Calculation
  const dynamicRiskTags: Array<
    | "Financing-Dependent"
    | "Accelerated-Schedule"
    | "Non-Standard-Grid"
    | "Zoning-Unconfirmed"
    | "High-Cost-Variance"
  > = [];
  if (answers.fundingLevel === "progressing" || answers.fundingLevel === "speculative") {
    dynamicRiskTags.push("Financing-Dependent");
  }
  if (answers.timelineLevel === "accelerated") {
    dynamicRiskTags.push("Accelerated-Schedule");
  }
  if (answers.fitLevel === "moderate") {
    dynamicRiskTags.push("Non-Standard-Grid");
  }
  if (answers.siteLevel === "searching" || answers.siteLevel === "option") {
    dynamicRiskTags.push("Zoning-Unconfirmed");
  }
  if (variance > 15) {
    dynamicRiskTags.push("High-Cost-Variance");
  }

  // Automated P1 - P5 Opportunity Grade Assignment (Industry Calibrated)
  let grade: "P1" | "P2" | "P3" | "P4" | "P5" = "P3";
  let gradeLabel = "P3 · Developing Opportunity";
  let gradeDesc = "Viable opportunity with moderate gaps; requires CSA / Paid Feasibility.";
  let gradeColor = "text-blue-700 bg-blue-500/15 border-blue-500/30 dark:text-blue-300";

  if (hasFatalRedFlag || totalScore < 35) {
    grade = "P5";
    gradeLabel = "P5 · Disqualified / Fatal Red Flag";
    gradeDesc = "Severe budget disconnect (>35%), fatal transport/fit blocker, or no decision authority.";
    gradeColor = "text-red-700 bg-red-500/15 border-red-500/30 dark:text-red-300";
  } else if (totalScore >= 85) {
    grade = "P1";
    gradeLabel = "P1 · Premier Validated (Fast-Track)";
    gradeDesc = "High certainty across all pillars. Full commitment and zero blocking gaps.";
    gradeColor = "text-emerald-700 bg-emerald-500/15 border-emerald-500/30 dark:text-emerald-300";
  } else if (totalScore >= 70) {
    grade = "P2";
    gradeLabel = "P2 · Strong Qualified (Minor Gaps)";
    gradeDesc = "Strong commercial fundamentals with clearly defined, controlled mitigation actions.";
    gradeColor = "text-blue-700 bg-blue-500/15 border-blue-500/30 dark:text-blue-300";
  } else if (totalScore >= 55) {
    grade = "P3";
    gradeLabel = "P3 · Developing Opportunity";
    gradeDesc = "Promising project requiring structured CSA / PCS pre-construction engagement.";
    gradeColor = "text-blue-700 bg-blue-500/15 border-blue-500/30 dark:text-blue-300";
  } else {
    grade = "P4";
    gradeLabel = "P4 · Early Stage / Concept Scoping";
    gradeDesc = "Early exploration phase. Execute Paid Feasibility Study to validate site & geometry.";
    gradeColor = "text-amber-700 bg-amber-500/15 border-amber-500/30 dark:text-amber-300";
  }

  // Automated Owner Type Recommendation
  let autoOwnerType: OpportunityValidationConfig["ownerType"] = "Project-Ready";
  if (answers.designLevel === "lvl0") autoOwnerType = "Concept-Stage";
  else if (answers.siteLevel === "searching") autoOwnerType = "Site-Unresolved";
  else if (answers.designLevel === "lvl1" || answers.designLevel === "lvl2") autoOwnerType = "Design-Needed";
  else if (answers.designLevel === "lvl3" || answers.designLevel === "lvl4") autoOwnerType = "Permit-Ready";
  else if (totalScore >= 75) autoOwnerType = "Project-Ready";

  // Automated Engagement Path Recommendation (With Strategic LOI path check)
  let autoPath: OpportunityValidationConfig["engagementPath"] = "CSA";
  const isLoiAllowed = isStrategicOrTrusted && totalScore >= 60 && !hasFatalRedFlag;

  if (grade === "P1") {
    autoPath = autoOwnerType === "Permit-Ready" ? "Direct Technical Review" : "PCS";
  } else if (grade === "P2") {
    autoPath = isLoiAllowed ? "LOI" : autoOwnerType === "Design-Needed" ? "CSA" : "PCS";
  } else if (grade === "P3") {
    autoPath = isLoiAllowed ? "LOI" : "CSA";
  } else if (grade === "P4") {
    autoPath = "Paid Feasibility";
  } else {
    autoPath = "CSA";
  }

  // Recommended Multi-Handle Outcome
  let recommendedOutcome: OpportunityValidationConfig["decisionOutcome"] = "pass-p1-p2";
  if (grade === "P5" || hasFatalRedFlag) {
    recommendedOutcome = "nogo-disqualified";
  } else if (autoOwnerType === "Site-Unresolved") {
    recommendedOutcome = "site-feasibility";
  } else if (autoPath === "LOI" && isLoiAllowed) {
    recommendedOutcome = "loi-governed";
  } else if (grade === "P1" || (grade === "P2" && mandatoryPassed)) {
    recommendedOutcome = "pass-p1-p2";
  } else if (autoOwnerType === "Design-Needed" || autoOwnerType === "Concept-Stage") {
    recommendedOutcome = "csa-pcs";
  } else {
    recommendedOutcome = "hold-rework";
  }

  return {
    totalScore,
    grade,
    gradeLabel,
    gradeDesc,
    gradeColor,
    autoOwnerType,
    autoPath,
    recommendedOutcome,
    gaps,
    missingInfo,
    hasFatalRedFlag,
    mandatoryPassed,
    dynamicRiskTags,
    isStrategicOrTrusted,
    isLoiAllowed,
    answers,
    variance,
    benchmarkCost,
    budgetNum,
    area,
    costPerSqFt,
  };
}
