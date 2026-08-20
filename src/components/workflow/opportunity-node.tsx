"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  BadgeCheck,
  Building,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  DollarSign,
  FileCheck,
  FileCheck2,
  FileText,
  HelpCircle,
  Hourglass,
  Info,
  Landmark,
  Layers,
  Lock,
  MapPin,
  Maximize2,
  Percent,
  RefreshCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityValidationConfig } from "@/types/workflow";
import { ComponentNoteButton } from "./component-note-button";

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

function OpportunityNodeComponent({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const [activeSection, setActiveSection] = useState<number>(0);
  const [showLogicGuide, setShowLogicGuide] = useState<boolean>(false);
  const [showLoiDrawer, setShowLoiDrawer] = useState<boolean>(false);

  const opp: OpportunityValidationConfig = useMemo(
    () => ({
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
    }),
    [node.config.opportunity],
  );

  // Questionnaire structured answers derived or defaulted from config
  const customFields = node.customFields || {};

  // --- Live Class D Calculations ---
  const area = Number(opp.grossFloorArea) || 0;
  const costPerSqFt = Number(opp.targetCostPerSqFt) || 0;
  const benchmarkCost = area * costPerSqFt;
  const budgetNum = Number(opp.clientBudget?.toString().replace(/\D/g, "")) || 0;
  const variance =
    budgetNum > 0 && benchmarkCost > 0
      ? ((benchmarkCost - budgetNum) / budgetNum) * 100
      : 0;

  // Automated Budget Reality Level from Real Numbers
  const autoBudgetLevel: "aligned" | "manageable" | "disconnect" = useMemo(() => {
    if (budgetNum <= 0 || area <= 0 || costPerSqFt <= 0) return "aligned";
    if (variance <= 10) return "aligned"; // within 10% or budget is higher than benchmark
    if (variance <= 25) return "manageable"; // 10% to 25% gap
    return "disconnect"; // > 25% disconnect
  }, [budgetNum, area, costPerSqFt, variance]);

  const answers: QuestionnaireAnswers = useMemo(
    () => ({
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
        (opp.consultantsInfo ? "engaged" : "in_progress"),
      fitLevel:
        (customFields.q_fit as QuestionnaireAnswers["fitLevel"]) ||
        (opp.modularFitPassed ? "high" : "moderate"),
      clientTier:
        (customFields.q_client_tier as QuestionnaireAnswers["clientTier"]) ||
        (opp.clientTierType || "Standard"),
      commitmentLevel:
        (customFields.q_commitment as QuestionnaireAnswers["commitmentLevel"]) ||
        (opp.engagementPath === "LOI"
          ? "loi_governed"
          : opp.engagementPath === "CSA" || opp.engagementPath === "PCS"
            ? "paid_contract"
            : "verbal_interest"),
    }),
    [customFields, opp, autoBudgetLevel],
  );

  const savePatch = (
    oppPatch: Partial<OpportunityValidationConfig>,
    answerPatch?: Partial<QuestionnaireAnswers>,
  ) => {
    const nextOpp = { ...opp, ...oppPatch };
    const nextCustom = { ...customFields };
    if (answerPatch) {
      if (answerPatch.dmLevel) nextCustom.q_dm = answerPatch.dmLevel;
      if (answerPatch.scaleLevel) nextCustom.q_scale = answerPatch.scaleLevel;
      if (answerPatch.siteLevel) nextCustom.q_site = answerPatch.siteLevel;
      if (answerPatch.designLevel) nextCustom.q_design = answerPatch.designLevel;
      if (answerPatch.budgetLevel) nextCustom.q_budget = answerPatch.budgetLevel;
      if (answerPatch.fundingLevel) nextCustom.q_funding = answerPatch.fundingLevel;
      if (answerPatch.timelineLevel) nextCustom.q_timeline = answerPatch.timelineLevel;
      if (answerPatch.consultantLevel) nextCustom.q_consultants = answerPatch.consultantLevel;
      if (answerPatch.fitLevel) nextCustom.q_fit = answerPatch.fitLevel;
      if (answerPatch.clientTier) nextCustom.q_client_tier = answerPatch.clientTier;
      if (answerPatch.commitmentLevel) nextCustom.q_commitment = answerPatch.commitmentLevel;
    }
    updateNode(node.id, {
      customFields: nextCustom,
      config: {
        ...node.config,
        opportunity: nextOpp,
      },
    });
  };

  // --- AUTOMATED SCORING & P1-P5 GRADING ENGINE ---
  const scoreBreakdown = useMemo(() => {
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
      missingInfo.push("Direct Decision Maker sign-off");
    } else {
      score += 0;
      hasFatalRedFlag = true;
      mandatoryPassed = false;
      gaps.push({
        label: "No Decision Authority",
        action: "Lead contact lacks commercial signing & budget allocation authority",
        severity: "error",
      });
      missingInfo.push("Decision Maker Authority confirmation");
    }

    // 2. Project Definition & Scale (max 14 pts) [Mandatory for Class D]
    if (answers.scaleLevel === "defined") {
      score += 14;
    } else if (answers.scaleLevel === "rough") {
      score += 7;
      gaps.push({
        label: "Approximate Dimensions",
        action: "Gather floor plan area breakdown and unit mix for Class D baseline precision",
        severity: "info",
      });
      missingInfo.push("Detailed Total Gross Floor Area & Unit breakdown");
    } else {
      score += 0;
      mandatoryPassed = false;
      gaps.push({
        label: "Missing Scale Parameters",
        action: "Establish target total gross floor area, storeys, and unit count",
        severity: "warning",
      });
      missingInfo.push("Basic project scale & storeys");
    }

    // 3. Site Readiness (max 14 pts)
    if (answers.siteLevel === "owned") {
      score += 14;
    } else if (answers.siteLevel === "option") {
      score += 9;
      gaps.push({
        label: "Land Under Option",
        action: "Confirm closing date and zoning feasibility contingencies",
        severity: "info",
      });
    } else {
      score += 2;
      gaps.push({
        label: "Site Unresolved",
        action: "Commission Site Discovery & Feasibility Study to confirm municipal servicing and road access",
        severity: "warning",
      });
      missingInfo.push("Site acquisition / Parcel confirmation");
    }

    // 4. Design Readiness (max 14 pts)
    if (answers.designLevel === "lvl4") score += 14;
    else if (answers.designLevel === "lvl3") score += 12;
    else if (answers.designLevel === "lvl2") score += 8;
    else if (answers.designLevel === "lvl1") {
      score += 5;
      gaps.push({
        label: "Concept-Only Drawings",
        action: "Execute CSA for architectural modularization & engineering design coordination",
        severity: "info",
      });
      missingInfo.push("Architectural modular drawings");
    } else {
      score += 1;
      gaps.push({
        label: "No Drawings Available",
        action: "Engage ProFab Pre-Construction & Architectural Design Services",
        severity: "warning",
      });
      missingInfo.push("Architectural concept drawings");
    }

    // 5. Budget & Reality Check (max 15 pts) [Mandatory]
    if (answers.budgetLevel === "aligned") {
      score += 15;
    } else if (answers.budgetLevel === "manageable") {
      score += 8;
      gaps.push({
        label: "Budget Variance (10-25%)",
        action: "Value engineering & scope calibration during CSA / PCS",
        severity: "warning",
      });
    } else {
      score -= 15;
      hasFatalRedFlag = true;
      mandatoryPassed = false;
      gaps.push({
        label: "Severe Budget Disconnect",
        action: "Client budget cannot support project scope; calibrate scope or HOLD",
        severity: "error",
      });
      missingInfo.push("Calibrated budget ceiling matching Class D benchmark");
    }

    // 6. Financing & Timeline (max 10 pts)
    if (answers.fundingLevel === "secured") score += 6;
    else if (answers.fundingLevel === "progressing") score += 4;
    else {
      score += 1;
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

    // Automated P1 - P5 Opportunity Grade Assignment
    let grade: "P1" | "P2" | "P3" | "P4" | "P5" = "P3";
    let gradeLabel = "P3 · Developing Opportunity";
    let gradeDesc = "Viable opportunity with moderate gaps; requires CSA / Paid Feasibility.";
    let gradeColor = "text-blue-500 bg-blue-500/10 border-blue-500/30";

    if (hasFatalRedFlag || totalScore < 40) {
      grade = "P5";
      gradeLabel = "P5 · Disqualified / Fatal Red Flag";
      gradeDesc = "Severe budget disconnect, fatal site/fit blocker, or no decision authority.";
      gradeColor = "text-red-500 bg-red-500/10 border-red-500/30";
    } else if (totalScore >= 90) {
      grade = "P1";
      gradeLabel = "P1 · Premier Validated (Fast-Track)";
      gradeDesc = "High certainty across all pillars. Full commitment and zero blocking gaps.";
      gradeColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
    } else if (totalScore >= 75) {
      grade = "P2";
      gradeLabel = "P2 · Strong Qualified (Minor Gaps)";
      gradeDesc = "Strong commercial fundamentals with clearly defined, controlled mitigation actions.";
      gradeColor = "text-teal-500 bg-teal-500/10 border-teal-500/30";
    } else if (totalScore >= 60) {
      grade = "P3";
      gradeLabel = "P3 · Developing Opportunity";
      gradeDesc = "Promising project requiring structured CSA / PCS pre-construction engagement.";
      gradeColor = "text-blue-500 bg-blue-500/10 border-blue-500/30";
    } else {
      grade = "P4";
      gradeLabel = "P4 · Early Stage / High Gaps";
      gradeDesc = "High gap density. Requires Paid Feasibility Study or scope recalibration.";
      gradeColor = "text-amber-500 bg-amber-500/10 border-amber-500/30";
    }

    // Automated Owner Type Recommendation
    let autoOwnerType: OpportunityValidationConfig["ownerType"] = "Project-Ready";
    if (answers.designLevel === "lvl0") autoOwnerType = "Concept-Stage";
    else if (answers.designLevel === "lvl1" || answers.designLevel === "lvl2") autoOwnerType = "Design-Needed";
    else if (answers.siteLevel === "searching") autoOwnerType = "Site-Unresolved";
    else if (answers.designLevel === "lvl3" || answers.designLevel === "lvl4") autoOwnerType = "Permit-Ready";
    else if (totalScore >= 75) autoOwnerType = "Project-Ready";

    // Automated Engagement Path Recommendation (With Strategic LOI path check)
    let autoPath: OpportunityValidationConfig["engagementPath"] = "CSA";
    let isLoiAllowed = isStrategicOrTrusted && totalScore >= 60 && !hasFatalRedFlag;

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
    };
  }, [answers, variance]);

  const color = node.color || "#1f5fa7";
  const outcome = scoreBreakdown.recommendedOutcome;

  // Score color scheme based on points and fatal flags
  const scoreStyle = useMemo(() => {
    const s = scoreBreakdown.totalScore;
    if (scoreBreakdown.hasFatalRedFlag || s < 40) {
      return {
        text: "text-red-600 dark:text-red-400",
        bg: "bg-red-500/15 dark:bg-red-500/25",
        border: "border-red-500/40",
        badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
        solid: "bg-red-600 text-white",
      };
    }
    if (s >= 85) {
      return {
        text: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-500/15 dark:bg-emerald-500/25",
        border: "border-emerald-500/40",
        badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
        solid: "bg-emerald-600 text-white",
      };
    }
    if (s >= 60) {
      return {
        text: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-500/15 dark:bg-blue-500/25",
        border: "border-blue-500/40",
        badge: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
        solid: "bg-blue-600 text-white",
      };
    }
    return {
      text: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/15 dark:bg-amber-500/25",
      border: "border-amber-500/40",
      badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
      solid: "bg-amber-600 text-white",
    };
  }, [scoreBreakdown.totalScore, scoreBreakdown.hasFatalRedFlag]);

  // Purely automated route & rating sync: automatically updates store when evaluation changes
  useEffect(() => {
    if (
      opp.decisionOutcome !== scoreBreakdown.recommendedOutcome ||
      opp.opportunityScore !== scoreBreakdown.totalScore ||
      opp.opportunityGrade !== scoreBreakdown.grade ||
      opp.ownerType !== scoreBreakdown.autoOwnerType ||
      opp.engagementPath !== scoreBreakdown.autoPath
    ) {
      savePatch({
        opportunityScore: scoreBreakdown.totalScore,
        opportunityGrade: scoreBreakdown.grade,
        ownerType: scoreBreakdown.autoOwnerType,
        engagementPath: scoreBreakdown.autoPath,
        decisionOutcome: scoreBreakdown.recommendedOutcome,
        riskTags: scoreBreakdown.dynamicRiskTags,
        gapMitigationNotes: scoreBreakdown.gaps
          .map((g) => `${g.label}: ${g.action}`)
          .join("; "),
      });
    }
  }, [
    opp.decisionOutcome,
    opp.opportunityScore,
    opp.opportunityGrade,
    opp.ownerType,
    opp.engagementPath,
    scoreBreakdown,
  ]);

  const questions = [
    {
      id: "dm",
      title: "1. Decision Maker & Client Profile",
      subtitle: "Verify budget authority, signing power, and client relationship tier",
      icon: Users,
    },
    {
      id: "scale",
      title: "2. Project Definition & Scale",
      subtitle: "Establish typology, location, storeys, area (sq.ft.), and unit mix",
      icon: Scale,
    },
    {
      id: "site",
      title: "3. Site & Land Readiness",
      subtitle: "Verify property ownership, municipal servicing, and access constraints",
      icon: MapPin,
    },
    {
      id: "design",
      title: "4. Design & Plans Maturity",
      subtitle: "Classify architectural design maturity from Level 0 (idea) to Level 4 (permit issued)",
      icon: FileText,
    },
    {
      id: "budget",
      title: "5. Budget & Class D Reality Check",
      subtitle: "Benchmark Cost (Area × $/sq.ft.) vs Client Target Budget comparison",
      icon: Landmark,
    },
    {
      id: "financing",
      title: "6. Financing & Target Timeline",
      subtitle: "Funding structure (equity/loan/grant) and target occupancy schedule",
      icon: Clock,
    },
    {
      id: "fit",
      title: "7. Consultants & Modular Fit",
      subtitle: "Highway transport clearances, crane staging, and modular grid repeatability",
      icon: Layers,
    },
    {
      id: "commitment",
      title: "8. Client Commitment & LOI Governance",
      subtitle: "Governed LOI scope, time caps, review points, and conversion triggers",
      icon: FileCheck,
    },
  ];

  return (
    <div className="relative h-full w-full overflow-visible">
      <div
        data-canvas-node
        className={cn(
          "workflow-node group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_8px_30px_rgba(15,23,42,0.14)] transition duration-200",
          selected && "ring-2 ring-primary/70 ring-offset-2",
        )}
        style={{ borderColor: `${color}65` }}
      >
        <NodeResizer
          minWidth={900}
          minHeight={780}
          isVisible={selected}
          onResizeEnd={(_, params) =>
            useWorkflowStore
              .getState()
              .updateLayout(
                node.id,
                { width: params.width, height: params.height },
                true,
              )
          }
          lineClassName="!border-primary"
          handleClassName="!size-2.5 !rounded-sm !border-primary !bg-background"
        />

        {/* --- Card Header --- */}
        <div
          data-node-header
          className="nowheel flex items-center justify-between border-b px-4 py-3 cursor-grab active:cursor-grabbing bg-gradient-to-r from-primary/10 via-primary/5 to-transparent gap-3"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              <Compass className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Opportunity Validation & Client Scoring Engine
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
                    outcome === "pass-p1-p2"
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                      : outcome === "csa-pcs"
                        ? "bg-blue-500/15 text-blue-600 border-blue-500/30 dark:text-blue-400"
                        : outcome === "loi-governed"
                          ? "bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400"
                          : outcome === "site-feasibility"
                            ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
                            : outcome === "hold-rework"
                              ? "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400"
                              : "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400",
                  )}
                >
                  {outcome === "pass-p1-p2"
                    ? "GATE 1 PASSED (P1/P2)"
                    : outcome === "csa-pcs"
                      ? "PROCEED TO CSA / PCS"
                      : outcome === "loi-governed"
                        ? "STRATEGIC LOI (CAPPED)"
                        : outcome === "site-feasibility"
                          ? "SITE FEASIBILITY LOOP"
                          : outcome === "hold-rework"
                            ? "HOLD · REWORK LOOP"
                            : "NO-GO DISQUALIFIED"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground truncate">
                {opp.companyName ? `${opp.companyName} · ` : ""}
                {node.title || "Opportunity Qualification & Commercial Baseline"}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowLogicGuide((v) => !v)}
              className="flex items-center gap-1 rounded-lg border bg-background/80 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="View Scoring & Classification Logic Rules"
            >
              <Info className="size-3.5 text-primary" />
              <span>Logic Rules</span>
            </button>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold shadow-xs border transition-colors",
                scoreStyle.badge,
              )}
            >
              <Sparkles className={cn("size-3.5", scoreStyle.text)} />
              <span>
                {scoreBreakdown.grade} · {scoreBreakdown.totalScore}/100
              </span>
            </div>
            <ComponentNoteButton
              nodeId={node.id}
              noteKey="main"
              label={node.title || "Opportunity Validation"}
            />
          </div>
        </div>

        {/* --- Main Body: 2-Column Split (Left Questionnaire / Right AI Rating Dashboard) --- */}
        <div className="nodrag nowheel flex flex-1 min-h-0 overflow-hidden divide-x divide-border/60">
          {/* LEFT: Assessment Questionnaire */}
          <div className="flex-1 flex flex-col min-w-0 bg-background">
            {/* Step Navigation Bar */}
            <div className="flex items-center gap-1 border-b bg-muted/30 px-3 py-1.5 overflow-x-auto scroll-thin">
              {questions.map((q, idx) => {
                const Icon = q.icon;
                const isActive = activeSection === idx;
                return (
                  <button
                    type="button"
                    key={q.id}
                    onClick={() => setActiveSection(idx)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition shrink-0",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3" />
                    <span>Q{idx + 1}</span>
                  </button>
                );
              })}
            </div>

            {/* Question Content Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs scroll-thin">
              {/* Q1: Decision Maker & Client Tier */}
              {activeSection === 0 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Users className="size-4 text-primary" />
                      Q1. Client Profile, Decision Maker & Client Relationship Tier
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Verify commercial signing authority and classify whether client qualifies for Strategic LOI fast-tracking.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Company Name</label>
                      <input
                        type="text"
                        value={opp.companyName || ""}
                        onChange={(e) => savePatch({ companyName: e.target.value })}
                        placeholder="e.g. Apex Developments Ltd."
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Primary Contact & Title</label>
                      <input
                        type="text"
                        value={opp.contactPerson || ""}
                        onChange={(e) => savePatch({ contactPerson: e.target.value })}
                        placeholder="e.g. Marcus Vance, VP Development"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Client Relationship Tier</label>
                      <select
                        value={answers.clientTier}
                        onChange={(e) =>
                          savePatch(
                            {
                              clientTierType: e.target
                                .value as OpportunityValidationConfig["clientTierType"],
                            },
                            { clientTier: e.target.value as QuestionnaireAnswers["clientTier"] },
                          )
                        }
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary font-semibold text-primary"
                      >
                        <option value="Standard">Standard Lead (Requires Paid CSA/PCS)</option>
                        <option value="Returning">Returning Client (LOI Allowed)</option>
                        <option value="Trusted">Trusted Partner (LOI Allowed)</option>
                        <option value="Strategic">Strategic Account (LOI Allowed)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Contact Email / Phone</label>
                      <input
                        type="text"
                        value={opp.contactEmail || ""}
                        onChange={(e) => savePatch({ contactEmail: e.target.value })}
                        placeholder="Email / Phone"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Decision Authority Choice Cards */}
                  <div className="space-y-2 pt-1">
                    <label className="text-[11px] font-bold text-foreground">
                      Decision Authority Assessment (Mandatory Hard Requirement):
                    </label>
                    <div className="space-y-1.5">
                      {[
                        {
                          val: "direct",
                          title: "Direct Decision Maker (Authorized Signing Officer)",
                          desc: "Direct access to officer with autonomous budget signing and agreement authority (+18 pts)",
                          badge: "Mandatory Passed",
                        },
                        {
                          val: "influencer",
                          title: "Project Representative / Manager (DM Known)",
                          desc: "Decision maker identified but review must proceed via internal management chain (+9 pts)",
                          badge: "Conditional Follow-up",
                        },
                        {
                          val: "unclear",
                          title: "Unclear Authority / No Access to Decision Maker",
                          desc: "Contact lacks decision authority or commercial mandate (0 pts, Fatal Red Flag)",
                          badge: "Hard Blocker",
                        },
                      ].map((opt) => (
                        <button
                          type="button"
                          key={opt.val}
                          onClick={() =>
                            savePatch(
                              { decisionMakerConfirmed: opt.val === "direct" },
                              { dmLevel: opt.val as QuestionnaireAnswers["dmLevel"] },
                            )
                          }
                          className={cn(
                            "w-full rounded-xl border p-2.5 text-left transition flex items-start justify-between gap-3",
                            answers.dmLevel === opt.val
                              ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                              : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                              {answers.dmLevel === opt.val ? (
                                <CheckCircle2 className="size-3.5 text-primary" />
                              ) : (
                                <div className="size-3.5 rounded-full border border-muted-foreground/40" />
                              )}
                              {opt.title}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 pl-5">
                              {opt.desc}
                            </p>
                          </div>
                          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-background border shrink-0">
                            {opt.badge}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Q2: Project Definition & Scale */}
              {activeSection === 1 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Scale className="size-4 text-primary" />
                      Q2. Project Definition & Geometric Scale
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Capture building typology, storeys, area, and unit mix to calculate Class D rough cost baseline.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Project Typology / Intent</label>
                      <input
                        type="text"
                        value={opp.projectIntent ?? ""}
                        onChange={(e) => savePatch({ projectIntent: e.target.value })}
                        placeholder="e.g. 4-Storey Multi-Family Rental"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Project Location / City</label>
                      <input
                        type="text"
                        value={opp.projectLocation ?? ""}
                        onChange={(e) => savePatch({ projectLocation: e.target.value })}
                        placeholder="e.g. Kelowna, BC"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Storeys</label>
                      <input
                        type="text"
                        value={opp.storeys ?? ""}
                        onChange={(e) => savePatch({ storeys: e.target.value })}
                        placeholder="e.g. 4"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Total Gross Floor Area (sq.ft.)</label>
                      <input
                        type="text"
                        value={opp.grossFloorArea ?? ""}
                        onChange={(e) => savePatch({ grossFloorArea: e.target.value })}
                        placeholder="e.g. 28000"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Unit / Module Count</label>
                      <input
                        type="text"
                        value={opp.unitCount ?? ""}
                        onChange={(e) => savePatch({ unitCount: e.target.value })}
                        placeholder="e.g. 36"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="text-[11px] font-bold text-foreground">
                      Scale Definition Maturity:
                    </label>
                    <div className="space-y-1.5">
                      {[
                        {
                          val: "defined",
                          title: "Full Scale Defined (Ready for Class D Benchmark)",
                          desc: "Storeys, gross floor area, and unit count are confirmed (+14 pts)",
                        },
                        {
                          val: "rough",
                          title: "Approximate Concept Scale Only",
                          desc: "Approximate footprint or rough unit mix only; requires refinement (+7 pts)",
                        },
                        {
                          val: "none",
                          title: "Scale Unknown / Undefined",
                          desc: "No dimensions available; cannot run financial benchmarking (0 pts)",
                        },
                      ].map((opt) => (
                        <button
                          type="button"
                          key={opt.val}
                          onClick={() =>
                            savePatch(
                              {},
                              { scaleLevel: opt.val as QuestionnaireAnswers["scaleLevel"] },
                            )
                          }
                          className={cn(
                            "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                            answers.scaleLevel === opt.val
                              ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                              : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                          )}
                        >
                          {answers.scaleLevel === opt.val ? (
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                          ) : (
                            <div className="size-4 rounded-full border border-muted-foreground/40 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-bold text-xs text-foreground">{opt.title}</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Q3: Site Readiness */}
              {activeSection === 2 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <MapPin className="size-4 text-primary" />
                      Q3. Site & Land Readiness Status
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Confirm property title, municipal servicing, and road access.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Site Address / Parcel PIN</label>
                      <input
                        type="text"
                        value={opp.siteAddress || ""}
                        onChange={(e) => savePatch({ siteAddress: e.target.value })}
                        placeholder="e.g. 1080 Enterprise Way"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Servicing & Access Constraints</label>
                      <input
                        type="text"
                        value={opp.siteConstraints || ""}
                        onChange={(e) => savePatch({ siteConstraints: e.target.value })}
                        placeholder="e.g. Municipal water at lot line, crane pad ready"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="text-[11px] font-bold text-foreground">Property Ownership & Readiness:</label>
                    <div className="space-y-1.5">
                      {[
                        {
                          val: "owned",
                          title: "Owned Land (Project-Ready / Clear Servicing)",
                          desc: "Property is owned or fully controlled; municipal servicing & zoning verified (+14 pts)",
                        },
                        {
                          val: "option",
                          title: "Under Option / Binding Purchase Contract",
                          desc: "Under binding purchase agreement with closing contingencies (+9 pts)",
                        },
                        {
                          val: "searching",
                          title: "Searching for Site / Unresolved (Routes to Site Feasibility)",
                          desc: "Site selection in progress; routes to dedicated Site Feasibility Loop (+2 pts)",
                        },
                      ].map((opt) => (
                        <button
                          type="button"
                          key={opt.val}
                          onClick={() =>
                            savePatch(
                              {
                                siteStatus:
                                  opt.val === "owned"
                                    ? "Owned"
                                    : opt.val === "option"
                                      ? "Under Option"
                                      : "Searching",
                              },
                              { siteLevel: opt.val as QuestionnaireAnswers["siteLevel"] },
                            )
                          }
                          className={cn(
                            "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                            answers.siteLevel === opt.val
                              ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                              : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                          )}
                        >
                          {answers.siteLevel === opt.val ? (
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                          ) : (
                            <div className="size-4 rounded-full border border-muted-foreground/40 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-bold text-xs text-foreground">{opt.title}</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Q4: Design Readiness */}
              {activeSection === 3 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <FileText className="size-4 text-primary" />
                      Q4. Design & Plans Maturity Level
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Classify architectural drawings across Levels 0 to 4 to establish scope and Owner Type.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        val: "lvl4",
                        title: "Level 4: Permit Issued (Drawings Approved)",
                        desc: "Official building permit issued; ready for modular fabrication review (+14 pts, Permit-Ready)",
                      },
                      {
                        val: "lvl3",
                        title: "Level 3: Permit Set Submitted",
                        desc: "Complete architectural & engineering drawings submitted for municipal review (+12 pts)",
                      },
                      {
                        val: "lvl2",
                        title: "Level 2: Preliminary Architectural Scheme",
                        desc: "Floor plans and elevations available; requires modular grid split (+8 pts, Design-Needed)",
                      },
                      {
                        val: "lvl1",
                        title: "Level 1: Concept / Sketches Only",
                        desc: "Concept sketches only; requires CSA for architectural modularization (+5 pts, Design-Needed)",
                      },
                      {
                        val: "lvl0",
                        title: "Level 0: No Plans (Idea Only)",
                        desc: "No drawings; requires full architectural design & pre-construction package (+1 pt, Concept-Stage)",
                      },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.val}
                        onClick={() => {
                          const mapStage: Record<string, OpportunityValidationConfig["designStage"]> = {
                            lvl4: "Level 4: Permit Issued",
                            lvl3: "Level 3: Permit Set",
                            lvl2: "Level 2: Preliminary",
                            lvl1: "Level 1: Concept",
                            lvl0: "Level 0: No Plans",
                          };
                          savePatch(
                            { designStage: mapStage[opt.val] },
                            { designLevel: opt.val as QuestionnaireAnswers["designLevel"] },
                          );
                        }}
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                          answers.designLevel === opt.val
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {answers.designLevel === opt.val ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <div className="size-4 rounded-full border border-muted-foreground/40 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-xs text-foreground">{opt.title}</div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Q5: Budget & Class D Reality Check */}
              {activeSection === 4 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Landmark className="size-4 text-primary" />
                      Q5. Budget Basis & Class D Reality Check
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Benchmark estimated cost against client target budget to verify economic feasibility.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Client Target Budget ($)</label>
                      <input
                        type="text"
                        value={opp.clientBudget ?? ""}
                        onChange={(e) => savePatch({ clientBudget: e.target.value })}
                        placeholder="e.g. 9800000"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Target Cost Baseline ($/sq.ft.)</label>
                      <input
                        type="text"
                        value={opp.targetCostPerSqFt ?? ""}
                        onChange={(e) => savePatch({ targetCostPerSqFt: e.target.value })}
                        placeholder="e.g. 350"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary font-mono"
                      />
                    </div>
                  </div>

                  {/* Live Benchmark Calculator Card */}
                  <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>Class D Reality Benchmark Comparison</span>
                      <span className="text-[11px] text-muted-foreground">
                        {area.toLocaleString()} sq.ft. @ ${costPerSqFt}/sq.ft.
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-background p-2 border">
                        <div className="text-[10px] text-muted-foreground">Estimated Benchmark</div>
                        <div className="text-sm font-bold mt-0.5">${benchmarkCost.toLocaleString()}</div>
                      </div>
                      <div className="rounded-lg bg-background p-2 border">
                        <div className="text-[10px] text-muted-foreground">Client Target Budget</div>
                        <div className="text-sm font-bold mt-0.5">${budgetNum.toLocaleString()}</div>
                      </div>
                      <div className={cn(
                        "rounded-lg p-2 border",
                        variance <= 10
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : variance <= 25
                            ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                            : "bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300"
                      )}>
                        <div className="text-[10px] font-bold">Variance</div>
                        <div className="text-sm font-bold mt-0.5">{variance > 0 ? `+${variance.toFixed(1)}%` : `${variance.toFixed(1)}%`}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-foreground">
                        Budget Reality Fit Evaluation:
                      </label>
                      <span className="text-[10px] font-semibold text-primary">
                        Auto-Evaluated from Inputs
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {[
                        {
                          val: "aligned",
                          title: "Realistic Budget Fit (Within ±10%)",
                          desc: "Client budget aligns with Class D cost benchmark; commercial model is sound (+15 pts)",
                          activeClass:
                            "border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 ring-2 ring-emerald-500/40 shadow-xs",
                          icon: CheckCircle2,
                          iconColor: "text-emerald-600 dark:text-emerald-400",
                          badge: "Auto: Aligned",
                          badgeClass:
                            "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
                        },
                        {
                          val: "manageable",
                          title: "Manageable Variance (10% to 25% Gap)",
                          desc: "Client open to value engineering and spec calibration during pre-construction (+8 pts)",
                          activeClass:
                            "border-amber-500 bg-amber-500/15 text-amber-950 dark:text-amber-100 ring-2 ring-amber-500/40 shadow-xs",
                          icon: AlertTriangle,
                          iconColor: "text-amber-600 dark:text-amber-400",
                          badge: "Auto: 10-25% Gap",
                          badgeClass:
                            "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40",
                        },
                        {
                          val: "disconnect",
                          title: "Severe Budget Disconnect (>25% Gap)",
                          desc: "Budget is disconnected from market reality and client rejects calibration (-15 pts, Hard Blocker)",
                          activeClass:
                            "border-red-500 bg-red-500/15 text-red-950 dark:text-red-100 ring-2 ring-red-500/40 shadow-xs",
                          icon: AlertOctagon,
                          iconColor: "text-red-600 dark:text-red-400",
                          badge: "Auto: Fatal Blocker",
                          badgeClass:
                            "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40",
                        },
                      ].map((opt) => {
                        const isSelected = autoBudgetLevel === opt.val;
                        const Icon = opt.icon;
                        return (
                          <div
                            key={opt.val}
                            className={cn(
                              "w-full rounded-xl border p-2.5 text-left transition-all duration-200 flex items-start justify-between gap-3 cursor-default select-none",
                              isSelected
                                ? opt.activeClass
                                : "border-border/60 bg-card/40 text-muted-foreground/60 opacity-45",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-xs flex items-center gap-1.5">
                                <Icon
                                  className={cn(
                                    "size-4 shrink-0",
                                    isSelected ? opt.iconColor : "text-muted-foreground/40",
                                  )}
                                />
                                <span className={isSelected ? "text-foreground font-bold" : ""}>
                                  {opt.title}
                                </span>
                              </div>
                              <p className="text-[11px] mt-0.5 pl-5 opacity-90 leading-snug">
                                {opt.desc}
                              </p>
                            </div>
                            {isSelected && (
                              <span
                                className={cn(
                                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider animate-in fade-in",
                                  opt.badgeClass,
                                )}
                              >
                                {opt.badge}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Q6: Financing & Timeline */}
              {activeSection === 5 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Clock className="size-4 text-primary" />
                      Q6. Financing Structure & Target Timeline
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Confirm funding commitment and verify whether schedule requires accelerated fast-track processing.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Funding Source</label>
                      <select
                        value={opp.fundingSource || "Commercial Loan"}
                        onChange={(e) =>
                          savePatch({
                            fundingSource: e.target
                              .value as OpportunityValidationConfig["fundingSource"],
                          })
                        }
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      >
                        <option value="Equity">Equity (Private / Developer)</option>
                        <option value="Commercial Loan">Commercial Development Loan</option>
                        <option value="Government Grant">Government Grant / Program</option>
                        <option value="Financing Program">Financing Facility</option>
                        <option value="TBD">TBD (Pending)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Target Occupancy Timeline</label>
                      <input
                        type="text"
                        value={opp.targetTimeline || ""}
                        onChange={(e) => savePatch({ targetTimeline: e.target.value })}
                        placeholder="e.g. 14-16 months to occupancy"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-foreground">Timeline Feasibility:</label>
                    {[
                      {
                        val: "realistic",
                        title: "Standard Realistic Schedule (>12 Months)",
                        desc: "Adequate window for design, municipal permitting, and plant production (+4 pts)",
                      },
                      {
                        val: "accelerated",
                        title: "Accelerated Schedule (<10 Months) [Risk Tag]",
                        desc: "Requires fast-track engineering parallelization and pre-reserved manufacturing slot (+2 pts)",
                      },
                      {
                        val: "unfeasible",
                        title: "Physically Unfeasible (<5 Months)",
                        desc: "Occupancy deadline is impossible under standard municipal and factory lead times (-10 pts, Blocker)",
                      },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.val}
                        onClick={() =>
                          savePatch(
                            {},
                            { timelineLevel: opt.val as QuestionnaireAnswers["timelineLevel"] },
                          )
                        }
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                          answers.timelineLevel === opt.val
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {answers.timelineLevel === opt.val ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <div className="size-4 rounded-full border border-muted-foreground/40 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-xs text-foreground">{opt.title}</div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Q7: Consultants & Modular Fit */}
              {activeSection === 6 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Layers className="size-4 text-primary" />
                      Q7. External Consultants & Modular Feasibility Fit
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Verify architectural/engineering consultants and screen for volumetric transportation limits.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {[
                      {
                        val: "high",
                        title: "High Modular Suitability (Clear Logistics)",
                        desc: "Regular grid, standard module transport envelopes, clear site crane access (+6 pts)",
                      },
                      {
                        val: "moderate",
                        title: "Moderate Suitability (Minor Adjustments Required)",
                        desc: "Custom non-standard modules or unique crane rigging required (+3 pts)",
                      },
                      {
                        val: "blocker",
                        title: "Fatal Modular Blocker (Site/Geometry Incompatible)",
                        desc: "Site road inaccessible for wide loads, or building geometry cannot be modularized (-20 pts, Hard Blocker)",
                      },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.val}
                        onClick={() =>
                          savePatch(
                            { modularFitPassed: opt.val !== "blocker" },
                            { fitLevel: opt.val as QuestionnaireAnswers["fitLevel"] },
                          )
                        }
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                          answers.fitLevel === opt.val
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {answers.fitLevel === opt.val ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <div className="size-4 rounded-full border border-muted-foreground/40 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-xs text-foreground">{opt.title}</div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Q8: Client Commitment & Governed LOI Path */}
              {activeSection === 7 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <FileCheck className="size-4 text-primary" />
                      Q8. Client Commitment & Governed LOI Controls
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Define the commercial instrument. LOI is restricted to Strategic/Trusted clients with strict scope & hour caps.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        val: "paid_contract",
                        title: "Executed Paid Agreement (CSA / PCS / Fee Paid)",
                        desc: "Standard commercial contract executed with pre-construction retainer (+5 pts)",
                      },
                      {
                        val: "loi_governed",
                        title: "Governed LOI (Strategic / Returning Client Path Only)",
                        desc: "Letter of Interest for early validation. Capped at 21 days / 20 engineering hours with mandatory conversion trigger (+4 pts)",
                      },
                      {
                        val: "verbal_interest",
                        title: "Verbal Interest / Exploration Phase",
                        desc: "Early dialogue; requires conversion to paid CSA/PCS prior to detailed engineering (+1 pt)",
                      },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.val}
                        onClick={() =>
                          savePatch(
                            {},
                            { commitmentLevel: opt.val as QuestionnaireAnswers["commitmentLevel"] },
                          )
                        }
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                          answers.commitmentLevel === opt.val
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {answers.commitmentLevel === opt.val ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <div className="size-4 rounded-full border border-muted-foreground/40 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-xs text-foreground">{opt.title}</div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* LOI Governance Specific Rules Card */}
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-700 dark:text-purple-300">
                      <span className="flex items-center gap-1.5">
                        <Timer className="size-4" />
                        Strict LOI Governance & Anti-Free-Work Controls
                      </span>
                      <span className="text-[10px] bg-purple-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                        Customizable Cap
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-background p-2 border border-purple-200 dark:border-purple-900/50">
                        <label className="text-[10px] font-semibold text-muted-foreground">Time Limit (Calendar Days)</label>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="text"
                            value={opp.loiConfig?.maxDays ?? "21"}
                            onChange={(e) =>
                              savePatch({
                                loiConfig: {
                                  ...(opp.loiConfig || {}),
                                  maxDays: Number(e.target.value) || 0,
                                },
                              })
                            }
                            placeholder="21"
                            className="w-full rounded-md border bg-card px-2 py-1 text-xs font-bold text-foreground outline-none focus:border-purple-500 font-mono"
                          />
                          <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Days</span>
                        </div>
                      </div>
                      <div className="rounded-lg bg-background p-2 border border-purple-200 dark:border-purple-900/50">
                        <label className="text-[10px] font-semibold text-muted-foreground">Engineering Hour Cap (Max)</label>
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="text"
                            value={opp.loiConfig?.maxHours ?? "20"}
                            onChange={(e) =>
                              savePatch({
                                loiConfig: {
                                  ...(opp.loiConfig || {}),
                                  maxHours: Number(e.target.value) || 0,
                                },
                              })
                            }
                            placeholder="20"
                            className="w-full rounded-md border bg-card px-2 py-1 text-xs font-bold text-foreground outline-none focus:border-purple-500 font-mono"
                          />
                          <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Hours</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground">Review Milestone Date</label>
                        <input
                          type="date"
                          value={opp.loiConfig?.reviewDate ?? ""}
                          onChange={(e) =>
                            savePatch({
                              loiConfig: {
                                ...(opp.loiConfig || {}),
                                reviewDate: e.target.value,
                              },
                            })
                          }
                          className="mt-1 w-full rounded-md border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground">Governed Scope Boundary</label>
                        <input
                          type="text"
                          value={
                            opp.loiConfig?.scopeSummary ??
                            "Limited geometry fit check & Class D benchmarking only"
                          }
                          onChange={(e) =>
                            savePatch({
                              loiConfig: {
                                ...(opp.loiConfig || {}),
                                scopeSummary: e.target.value,
                              },
                            })
                          }
                          placeholder="e.g. Fit check & Class D benchmarking only"
                          className="mt-1 w-full rounded-md border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Mandatory Conversion Trigger to Paid CSA / PCS</label>
                      <input
                        type="text"
                        value={
                          opp.loiConfig?.conversionTrigger ??
                          "Delivery of Class D cost model or expiration of day cap -> Mandatory convert to paid CSA ($15k–$35k) or PCS ($50k+)"
                        }
                        onChange={(e) =>
                          savePatch({
                            loiConfig: {
                              ...(opp.loiConfig || {}),
                              conversionTrigger: e.target.value,
                            },
                          })
                        }
                        placeholder="Conversion trigger description"
                        className="mt-1 w-full rounded-md border bg-card px-2 py-1 text-xs text-foreground outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Logic Guide Modal/Drawer */}
              {showLogicGuide && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 space-y-3 mt-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary flex items-center gap-1.5">
                      <ShieldCheck className="size-4" />
                      Automated Scoring, P1-P5 Grading & Routing Logic
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLogicGuide(false)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-semibold"
                    >
                      Close ✕
                    </button>
                  </div>
                  <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
                    <p>
                      <strong>1. Score Formula (0-100 pts):</strong> Q1 Decision Maker (18) + Q2 Scale (14) + Q3 Site (14) + Q4 Design (14) + Q5 Budget (15) + Q6 Financing/Timeline (10) + Q7 Fit (10) + Q8 Commitment (5).
                    </p>
                    <p>
                      <strong>2. P1–P5 Grades:</strong> P1 (90-100 pts) · P2 (75-89 pts) · P3 (60-74 pts) · P4 (40-59 pts) · P5 (&lt;40 pts or Fatal Hard Blocker).
                    </p>
                    <p>
                      <strong>3. LOI Rule:</strong> Only allowed for Returning / Trusted / Strategic clients (P2/P3 grade). Must have a 21-day / 20-hour cap with mandatory conversion trigger to CSA/PCS.
                    </p>
                    <p>
                      <strong>4. Mandatory Hard Gate:</strong> If any Mandatory requirement fails (No DM, Budget disconnect &gt;25%, Non-modular geometry, Unfeasible timeline), system forces <em>HOLD</em> or <em>NO-GO</em>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Stepper Control */}
            <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2.5">
              <button
                type="button"
                disabled={activeSection === 0}
                onClick={() => setActiveSection((s) => Math.max(0, s - 1))}
                className="px-3 py-1 text-xs font-semibold rounded-md border bg-background hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-[11px] text-muted-foreground font-medium">
                Question {activeSection + 1} of {questions.length}
              </span>
              <button
                type="button"
                disabled={activeSection === questions.length - 1}
                onClick={() => setActiveSection((s) => Math.min(questions.length - 1, s + 1))}
                className="px-3 py-1 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                Next Step
              </button>
            </div>
          </div>

          {/* RIGHT: AI Rating & Recommendation Dashboard */}
          <div className="w-[340px] shrink-0 flex flex-col bg-muted/15 p-3.5 space-y-3 overflow-y-auto scroll-thin pb-8">
            {/* Score & P1-P5 Grade Circular Banner */}
            <div className="rounded-xl border bg-card p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Opportunity Grade
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">0–100 Engine</span>
              </div>

              <div className="flex items-start gap-2.5">
                <div
                  className={cn(
                    "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl border transition-colors",
                    scoreStyle.bg,
                    scoreStyle.border,
                    scoreStyle.text,
                  )}
                >
                  <span className="text-base font-extrabold leading-none">{scoreBreakdown.totalScore}</span>
                  <span className="text-[7px] font-bold uppercase leading-none mt-0.5">Score</span>
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className={cn("text-[11px] font-bold rounded-md px-2 py-0.5 border block text-left leading-tight break-words", scoreBreakdown.gradeColor)}>
                    {scoreBreakdown.gradeLabel}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug break-words">
                    {scoreBreakdown.gradeDesc}
                  </p>
                </div>
              </div>
            </div>

            {/* Risk Tags Bar */}
            {scoreBreakdown.dynamicRiskTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {scoreBreakdown.dynamicRiskTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle className="size-2.5" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Auto-Assigned Owner Type */}
            <div className="rounded-xl border bg-card p-2.5 space-y-1 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Identified Owner Type</span>
                <Tag className="size-3 text-primary" />
              </div>
              <div className="font-bold text-xs text-foreground">
                {scoreBreakdown.autoOwnerType}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Client Tier: <strong className="text-foreground">{answers.clientTier}</strong>
              </div>
            </div>

            {/* Governed LOI Status Pill (If Strategic) */}
            {scoreBreakdown.isStrategicOrTrusted && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5 space-y-1">
                <div className="text-[10px] font-bold text-purple-700 dark:text-purple-300 flex items-center justify-between">
                  <span>Governed LOI Eligible</span>
                  <Timer className="size-3" />
                </div>
                <div className="text-[10px] text-purple-800 dark:text-purple-200">
                  Cap: <strong>21 Days / 20 Hours</strong> &rarr; Convert to CSA/PCS
                </div>
              </div>
            )}

            {/* Missing Info & Actionable Next Steps */}
            <div className="rounded-xl border bg-card p-2.5 space-y-1.5 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Gaps & Next Actions</span>
                <ShieldCheck className="size-3 text-primary" />
              </div>
              {scoreBreakdown.gaps.length === 0 ? (
                <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1.5 py-1">
                  <BadgeCheck className="size-4 shrink-0" />
                  All core pillars validated & controlled
                </div>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto scroll-thin pr-1">
                  {scoreBreakdown.gaps.map((g, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg p-2 text-[10px] border leading-tight",
                        g.severity === "error"
                          ? "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
                          : g.severity === "warning"
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                            : "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300",
                      )}
                    >
                      <div className="font-bold flex items-center gap-1">
                        {g.severity === "error" ? (
                          <AlertOctagon className="size-3 shrink-0" />
                        ) : (
                          <AlertTriangle className="size-3 shrink-0" />
                        )}
                        {g.label}
                      </div>
                      <div className="mt-0.5 opacity-90 pl-3.5 leading-snug">{g.action}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recommended Engagement Path */}
            <div className="rounded-xl border bg-card p-2.5 space-y-1 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Recommended Path</span>
                <FileCheck2 className="size-3 text-primary" />
              </div>
              <div className="text-xs font-bold text-primary">
                {scoreBreakdown.autoPath}
              </div>
            </div>

            {/* Automated Dynamic Output Route Indicator */}
            <div className="rounded-xl border bg-card p-3 space-y-2 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Active Output Route</span>
                <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                  <Zap className="size-3" /> Auto-Selected
                </span>
              </div>
              <div
                className={cn(
                  "rounded-lg p-2.5 text-xs font-bold border flex items-center justify-between shadow-xs transition-colors",
                  outcome === "pass-p1-p2"
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                    : outcome === "csa-pcs"
                      ? "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300"
                      : outcome === "loi-governed"
                        ? "bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300"
                        : outcome === "site-feasibility"
                          ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300"
                          : outcome === "hold-rework"
                            ? "bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-300"
                            : "bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-300",
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 rounded-full animate-pulse",
                      outcome === "pass-p1-p2"
                        ? "bg-emerald-500"
                        : outcome === "csa-pcs"
                          ? "bg-blue-500"
                          : outcome === "loi-governed"
                            ? "bg-purple-500"
                            : outcome === "site-feasibility"
                              ? "bg-amber-500"
                              : outcome === "hold-rework"
                                ? "bg-orange-500"
                                : "bg-red-500",
                    )}
                  />
                  <span>
                    {outcome === "pass-p1-p2"
                      ? "GATE 1 PASSED (P1/P2)"
                      : outcome === "csa-pcs"
                        ? "PROCEED TO CSA / PCS"
                        : outcome === "loi-governed"
                          ? "STRATEGIC GOVERNED LOI"
                          : outcome === "site-feasibility"
                            ? "SITE FEASIBILITY LOOP"
                            : outcome === "hold-rework"
                              ? "HOLD · REWORK LOOP"
                              : "NO-GO · DISQUALIFIED"}
                  </span>
                </div>
                <span className="text-[10px] font-mono opacity-80 uppercase">
                  {outcome}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug">
                {outcome === "pass-p1-p2"
                  ? "Direct fast-track release into Stage 1 & Gate 1."
                  : outcome === "csa-pcs"
                    ? "Directs workflow into Pre-Construction Paid Design Assist."
                    : outcome === "loi-governed"
                      ? "Directs workflow into capped 21-day / 20-hour Strategic LOI corridor."
                      : outcome === "site-feasibility"
                        ? "Routes to municipal servicing & zoning due diligence."
                        : outcome === "hold-rework"
                          ? "Holds workflow and loops back for commercial strategy recalibration."
                          : "Terminates flow and directs project to disqualification archive."}
              </div>
            </div>
          </div>
        </div>

        {/* --- Card Footer Status Bar --- */}
        <div className="border-t bg-muted/40 px-4 py-2 text-[11px] flex items-center justify-between text-muted-foreground">
          <span>
            Grade: <strong className={cn("font-bold", scoreStyle.text)}>{scoreBreakdown.grade} ({scoreBreakdown.totalScore}/100)</strong> · Owner:{" "}
            <strong className="text-foreground">{opp.ownerType || scoreBreakdown.autoOwnerType}</strong> · Path:{" "}
            <strong className="text-foreground">{opp.engagementPath || scoreBreakdown.autoPath}</strong>
          </span>
          <span className="font-semibold text-primary">
            {outcome === "pass-p1-p2"
              ? "Gate 1 Passed — Validated Opportunity"
              : outcome === "csa-pcs"
                ? "Route to Paid Consultation (CSA/PCS)"
                : outcome === "loi-governed"
                  ? "Route to Strategic Governed LOI"
                  : outcome === "site-feasibility"
                    ? "Route to Site Discovery Loop"
                    : outcome === "hold-rework"
                      ? "Opportunity on HOLD (Rework Loop)"
                      : "Opportunity Disqualified / Closed"}
          </span>
        </div>

        {/* Top Input Handle for Rework Loop */}
        <Handle
          type="target"
          position={Position.Top}
          id="in-rework"
          style={{ left: "50%" }}
          title="HOLD - Rework Return Input"
          className="!size-3.5 !border-2 !border-background !bg-amber-500 transition hover:!scale-125"
        />

        {/* Left Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!size-3.5 !border-2 !border-background !bg-primary transition hover:!scale-125"
        />

        {/* 1. Gate 1 Passed (P1/P2 Fast-Track) */}
        <Handle
          type="source"
          position={Position.Right}
          id="pass-p1-p2"
          style={{ top: "16%" }}
          title="Gate 1 Passed — Validated Opportunity (P1/P2 Fast-Track)"
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "pass-p1-p2"
              ? "!bg-emerald-500 ring-2 ring-emerald-500/40"
              : "!bg-muted-foreground/40",
          )}
        />

        {/* 2. Paid CSA / PCS Workstream */}
        <Handle
          type="source"
          position={Position.Right}
          id="csa-pcs"
          style={{ top: "32%" }}
          title="Paid CSA / PCS Pre-Construction Consultation"
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "csa-pcs"
              ? "!bg-blue-500 ring-2 ring-blue-500/40"
              : "!bg-muted-foreground/40",
          )}
        />

        {/* 3. Strategic Governed LOI Path */}
        <Handle
          type="source"
          position={Position.Right}
          id="loi-governed"
          style={{ top: "48%" }}
          title="Strategic Governed LOI (Capped 21 Days)"
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "loi-governed"
              ? "!bg-purple-500 ring-2 ring-purple-500/40"
              : "!bg-muted-foreground/40",
          )}
        />

        {/* 4. Site Feasibility & Due Diligence Loop */}
        <Handle
          type="source"
          position={Position.Right}
          id="site-feasibility"
          style={{ top: "64%" }}
          title="Site Feasibility & Due Diligence Loop"
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "site-feasibility"
              ? "!bg-amber-500 ring-2 ring-amber-500/40"
              : "!bg-muted-foreground/40",
          )}
        />

        {/* 5. HOLD · Rework / Gap Resolution Loop */}
        <Handle
          type="source"
          position={Position.Right}
          id="hold-rework"
          style={{ top: "80%" }}
          title="HOLD · Rework / Gap Resolution Loop"
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "hold-rework"
              ? "!bg-orange-500 ring-2 ring-orange-500/40"
              : "!bg-muted-foreground/40",
          )}
        />

        {/* 6. NO-GO Disqualified Archive */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="nogo-disqualified"
          style={{ left: "30%" }}
          title="NO-GO · Disqualified Archive"
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "nogo-disqualified"
              ? "!bg-red-500 ring-2 ring-red-500/40"
              : "!bg-muted-foreground/40",
          )}
        />
      </div>
    </div>
  );
}

export const OpportunityNode = memo(OpportunityNodeComponent);
