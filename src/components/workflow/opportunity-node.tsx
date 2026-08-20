"use client";

import { memo, useMemo, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  AlertOctagon,
  AlertTriangle,
  Award,
  BadgeCheck,
  Building,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  FileCheck2,
  FileText,
  HelpCircle,
  Info,
  Landmark,
  Layers,
  MapPin,
  Maximize2,
  Percent,
  RefreshCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
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
  // Q2: Scale
  scaleLevel: "defined" | "rough" | "none";
  // Q3: Site
  siteLevel: "owned" | "option" | "searching";
  // Q4: Design
  designLevel: "lvl4" | "lvl3" | "lvl2" | "lvl1" | "lvl0";
  // Q5: Budget
  budgetLevel: "aligned" | "manageable" | "disconnect";
  // Q6: Funding
  fundingLevel: "secured" | "progressing" | "speculative";
  // Q7: Modular Fit
  fitLevel: "high" | "moderate" | "blocker";
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
      gapMitigationNotes: "Drawings currently at concept level -> Execute CSA to coordinate architectural modularization and preliminary MEP engineering.",
      engagementPath: "CSA",
      engagementStatus: "Draft",
      decisionOutcome: "draft",
      ...(node.config.opportunity || {}),
    }),
    [node.config.opportunity],
  );

  // Questionnaire structured answers derived or defaulted from config
  const customFields = node.customFields || {};
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
      budgetLevel:
        (customFields.q_budget as QuestionnaireAnswers["budgetLevel"]) ||
        "aligned",
      fundingLevel:
        (customFields.q_funding as QuestionnaireAnswers["fundingLevel"]) ||
        (opp.fundingSecured ? "secured" : "progressing"),
      fitLevel:
        (customFields.q_fit as QuestionnaireAnswers["fitLevel"]) ||
        (opp.modularFitPassed ? "high" : "moderate"),
    }),
    [customFields, opp],
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
      if (answerPatch.fitLevel) nextCustom.q_fit = answerPatch.fitLevel;
    }
    updateNode(node.id, {
      customFields: nextCustom,
      config: {
        ...node.config,
        opportunity: nextOpp,
      },
    });
  };

  // --- Live Class D Calculations ---
  const area = Number(opp.grossFloorArea) || 0;
  const costPerSqFt = Number(opp.targetCostPerSqFt) || 350;
  const benchmarkCost = area * costPerSqFt;
  const budgetNum = Number(opp.clientBudget?.toString().replace(/\D/g, "")) || 0;
  const variance =
    budgetNum > 0 ? ((benchmarkCost - budgetNum) / budgetNum) * 100 : 0;

  // --- AUTOMATED SCORING & RATING ENGINE ---
  const scoreBreakdown = useMemo(() => {
    let score = 0;
    const gaps: { label: string; action: string; severity: "warning" | "error" | "info" }[] = [];
    let hasFatalRedFlag = false;

    // 1. Decision Maker (max 20 pts)
    if (answers.dmLevel === "direct") score += 20;
    else if (answers.dmLevel === "influencer") {
      score += 10;
      gaps.push({
        label: "Decision Maker Access",
        action: "Schedule direct alignment with authorized signing officer",
        severity: "warning",
      });
    } else {
      score += 0;
      hasFatalRedFlag = true;
      gaps.push({
        label: "No Decision Authority",
        action: "Client contact lacks commercial decision power",
        severity: "error",
      });
    }

    // 2. Scale & Intent (max 15 pts)
    if (answers.scaleLevel === "defined") score += 15;
    else if (answers.scaleLevel === "rough") {
      score += 8;
      gaps.push({
        label: "Approximate Dimensions",
        action: "Gather floor plan area breakdown for Class D precision",
        severity: "info",
      });
    } else {
      score += 0;
      gaps.push({
        label: "Missing Scale",
        action: "Establish target gross floor area and unit mix",
        severity: "warning",
      });
    }

    // 3. Site Status (max 15 pts)
    if (answers.siteLevel === "owned") score += 15;
    else if (answers.siteLevel === "option") {
      score += 10;
      gaps.push({
        label: "Land Under Option",
        action: "Confirm closing date and zoning feasibility contingencies",
        severity: "info",
      });
    } else {
      score += 2;
      gaps.push({
        label: "Site Unresolved",
        action: "Commission Site Discovery & Feasibility Study",
        severity: "warning",
      });
    }

    // 4. Design Maturity (max 15 pts)
    if (answers.designLevel === "lvl4") score += 15;
    else if (answers.designLevel === "lvl3") score += 13;
    else if (answers.designLevel === "lvl2") score += 9;
    else if (answers.designLevel === "lvl1") {
      score += 6;
      gaps.push({
        label: "Concept-Only Drawings",
        action: "Execute CSA for architectural modularization & design coordination",
        severity: "info",
      });
    } else {
      score += 1;
      gaps.push({
        label: "No Drawings Available",
        action: "Engage ProFab Pre-Construction & Architectural Design Services",
        severity: "warning",
      });
    }

    // 5. Budget Reality (max 15 pts)
    if (answers.budgetLevel === "aligned") score += 15;
    else if (answers.budgetLevel === "manageable") {
      score += 8;
      gaps.push({
        label: "Budget Variance (10-25%)",
        action: "Value engineering & scope calibration during CSA/PCS",
        severity: "warning",
      });
    } else {
      score -= 15;
      hasFatalRedFlag = true;
      gaps.push({
        label: "Severe Budget Disconnect",
        action: "Client budget cannot support project scope; calibrate or HOLD",
        severity: "error",
      });
    }

    // 6. Funding Status (max 10 pts)
    if (answers.fundingLevel === "secured") score += 10;
    else if (answers.fundingLevel === "progressing") {
      score += 6;
      gaps.push({
        label: "Financing Pending Approval",
        action: "Incorporate financing approval milestones in agreement",
        severity: "info",
      });
    } else {
      score += 1;
      gaps.push({
        label: "Speculative Funding",
        action: "Establish proof of funds before engineering commitment",
        severity: "warning",
      });
    }

    // 7. Modular Fit (max 10 pts)
    if (answers.fitLevel === "high") score += 10;
    else if (answers.fitLevel === "moderate") {
      score += 5;
      gaps.push({
        label: "Modular Adjustments Required",
        action: "Perform transport clearance & crane logistics review",
        severity: "info",
      });
    } else {
      score -= 20;
      hasFatalRedFlag = true;
      gaps.push({
        label: "Non-Modular Fit / Fatal Red Flag",
        action: "Project geometry or transport limits are fundamentally unfeasible",
        severity: "error",
      });
    }

    const totalScore = Math.max(0, Math.min(100, score));

    // Automated Tier Rating
    let tier: "A" | "B" | "C" | "D" = "B";
    let tierLabel = "Tier B · Qualified Opportunity";
    let tierDesc = "High viability with clear, manageable gaps.";
    let tierColor = "text-blue-500 bg-blue-500/10 border-blue-500/30";

    if (hasFatalRedFlag || totalScore < 35) {
      tier = "D";
      tierLabel = "Tier D · High Risk / Disqualified";
      tierDesc = "Severe budget disconnect, fatal site/fit blocker, or no decision authority.";
      tierColor = "text-red-500 bg-red-500/10 border-red-500/30";
    } else if (totalScore >= 80) {
      tier = "A";
      tierLabel = "Tier A · Validated (Fast-Track)";
      tierDesc = "All core criteria fully validated. Ready for immediate Phase 1 entry.";
      tierColor = "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
    } else if (totalScore < 55) {
      tier = "C";
      tierLabel = "Tier C · Early Stage / High Gaps";
      tierDesc = "Promising intent but multiple missing pillars. Requires Paid Feasibility.";
      tierColor = "text-amber-500 bg-amber-500/10 border-amber-500/30";
    }

    // Automated Owner Type Recommendation
    let autoOwnerType: OpportunityValidationConfig["ownerType"] = "Project-Ready";
    if (answers.designLevel === "lvl0") autoOwnerType = "Concept-Stage";
    else if (answers.designLevel === "lvl1" || answers.designLevel === "lvl2") autoOwnerType = "Design-Needed";
    else if (answers.siteLevel === "searching") autoOwnerType = "Site-Unresolved";
    else if (answers.designLevel === "lvl3" || answers.designLevel === "lvl4") autoOwnerType = "Permit-Ready";
    else if (totalScore >= 80) autoOwnerType = "Project-Ready";

    // Automated Engagement Path Recommendation
    let autoPath: OpportunityValidationConfig["engagementPath"] = "CSA";
    if (tier === "A") autoPath = autoOwnerType === "Permit-Ready" ? "Direct Technical Review" : "PCS";
    else if (tier === "B") autoPath = autoOwnerType === "Design-Needed" ? "CSA" : "PCS";
    else if (tier === "C") autoPath = "Paid Feasibility";
    else autoPath = "CSA";

    // Recommended Gate 1 Outcome
    let recommendedOutcome: "pass" | "hold" | "nogo" = "pass";
    if (tier === "D" || hasFatalRedFlag) recommendedOutcome = "nogo";
    else if (tier === "C" || (tier === "B" && gaps.some((g) => g.severity === "error"))) recommendedOutcome = "hold";
    else recommendedOutcome = "pass";

    return {
      totalScore,
      tier,
      tierLabel,
      tierDesc,
      tierColor,
      autoOwnerType,
      autoPath,
      recommendedOutcome,
      gaps,
      hasFatalRedFlag,
    };
  }, [answers]);

  const color = node.color || "#1f5fa7";
  const outcome = opp.decisionOutcome || "draft";

  // Quick apply system recommendation
  const applyRecommendation = () => {
    savePatch({
      ownerType: scoreBreakdown.autoOwnerType,
      engagementPath: scoreBreakdown.autoPath,
      decisionOutcome: scoreBreakdown.recommendedOutcome,
      gapMitigationNotes: scoreBreakdown.gaps.map((g) => `${g.label}: ${g.action}`).join("; "),
    });
  };

  const questions = [
    {
      id: "dm",
      title: "1. Decision Maker & Client Profile",
      subtitle: "Verify direct access to the budget controller and signing authority",
      icon: Users,
    },
    {
      id: "scale",
      title: "2. Project Intent & Class D Scale",
      subtitle: "Capture building use, location, storeys, area, and units for rough benchmarking",
      icon: Scale,
    },
    {
      id: "site",
      title: "3. Site & Land Readiness",
      subtitle: "Confirm property ownership status, municipal servicing, and access constraints",
      icon: MapPin,
    },
    {
      id: "design",
      title: "4. Plans & Design Maturity Level",
      subtitle: "Classify architectural design maturity from Level 0 (idea) to Level 4 (permit issued)",
      icon: FileText,
    },
    {
      id: "budget",
      title: "5. Class D Budget Reality Check",
      subtitle: "Benchmark Cost (Area × $/sq.ft.) vs Client Target Budget comparison",
      icon: Landmark,
    },
    {
      id: "funding",
      title: "6. Financing & Target Timeline",
      subtitle: "Funding structure (equity/loan/grant) and target occupancy schedule",
      icon: Clock,
    },
    {
      id: "fit",
      title: "7. Modular Feasibility Fit Check",
      subtitle: "Screen for transport clearances, grid modularity, and structural red flags",
      icon: Layers,
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
          minWidth={800}
          minHeight={720}
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
          className="nowheel flex items-center justify-between border-b px-4 py-3 cursor-grab active:cursor-grabbing bg-gradient-to-r from-primary/10 via-primary/5 to-transparent"
        >
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 items-center justify-center rounded-xl text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              <Compass className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Opportunity Validation Assessment
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
                    outcome === "pass"
                      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                      : outcome === "hold"
                        ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
                        : outcome === "nogo"
                          ? "bg-red-500/15 text-red-600 border-red-500/30 dark:text-red-400"
                          : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {outcome === "pass"
                    ? "GATE 1 PASS ✅"
                    : outcome === "hold"
                      ? "HOLD · GAPS ⚠️"
                      : outcome === "nogo"
                        ? "NO-GO ❌"
                        : "EVALUATION IN PROGRESS"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground">
                {opp.companyName ? `${opp.companyName} · ` : ""}
                {node.title || "Opportunity Qualification & Commercial Baseline"}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLogicGuide((v) => !v)}
              className="flex items-center gap-1 rounded-lg border bg-background/80 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
              title="View Scoring & Classification Logic Rules"
            >
              <Info className="size-3.5 text-primary" />
              <span>Logic Rules</span>
            </button>
            <div className="flex items-center gap-1.5 rounded-lg bg-background/90 px-3 py-1 text-xs font-bold shadow-xs border">
              <Sparkles className="size-3.5 text-primary" />
              <span>Score: {scoreBreakdown.totalScore}/100</span>
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
              {/* Q1: Decision Maker */}
              {activeSection === 0 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Users className="size-4 text-primary" />
                      Q1. Client Profile & Decision Maker Authority
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Verify client background and confirm commercial decision-making authority
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Company / Organization</label>
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
                      <label className="text-[10px] font-semibold text-muted-foreground">Lead / Referral Source</label>
                      <input
                        type="text"
                        value={opp.leadSource || ""}
                        onChange={(e) => savePatch({ leadSource: e.target.value })}
                        placeholder="e.g. Architect Referral, Website"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Contact Details (Email / Phone)</label>
                      <input
                        type="text"
                        value={opp.contactEmail || ""}
                        onChange={(e) => savePatch({ contactEmail: e.target.value })}
                        placeholder="Email / Phone"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Question Choice Cards */}
                  <div className="space-y-2 pt-1">
                    <label className="text-[11px] font-bold text-foreground">
                      Decision Authority Assessment:
                    </label>
                    <div className="space-y-1.5">
                      {[
                        {
                          val: "direct",
                          title: "Direct Decision Maker (Signing & Budget Authority)",
                          desc: "Direct access to authorized officer who can sign agreements and allocate budget (+20 pts)",
                          badge: "High Confidence",
                        },
                        {
                          val: "influencer",
                          title: "Project Representative / Manager (DM Known)",
                          desc: "Decision maker is identified but approval goes through an internal chain (+10 pts)",
                          badge: "Follow-up Required",
                        },
                        {
                          val: "unclear",
                          title: "Unclear Authority / No Access to Decision Maker",
                          desc: "Contact lacks decision authority, or decision process is opaque (0 pts, Risk Flag)",
                          badge: "Risk Flag",
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

              {/* Q2: Scale */}
              {activeSection === 1 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Scale className="size-4 text-primary" />
                      Q2. Project Intent & Class D Scale Parameters
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Establish building typology, storeys, area, and units for rough benchmarking
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Project Intent / Typology</label>
                      <input
                        type="text"
                        value={opp.projectIntent || ""}
                        onChange={(e) => savePatch({ projectIntent: e.target.value })}
                        placeholder="e.g. 4-Storey Multi-Family Rental"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Project Location / City</label>
                      <input
                        type="text"
                        value={opp.projectLocation || ""}
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
                        type="number"
                        value={opp.storeys || ""}
                        onChange={(e) => savePatch({ storeys: Number(e.target.value) || 0 })}
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Gross Floor Area (sq.ft.)</label>
                      <input
                        type="number"
                        value={opp.grossFloorArea || ""}
                        onChange={(e) => savePatch({ grossFloorArea: Number(e.target.value) || 0 })}
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Units / Modules Count</label>
                      <input
                        type="number"
                        value={opp.unitCount || ""}
                        onChange={(e) => savePatch({ unitCount: Number(e.target.value) || 0 })}
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
                          desc: "Storeys, gross floor area, and unit count are captured (+15 pts)",
                        },
                        {
                          val: "rough",
                          title: "Approximate Concept Scale Only",
                          desc: "Approximate footprint or rough unit count only; requires refinement (+8 pts)",
                        },
                        {
                          val: "none",
                          title: "Scale Unknown / Undefined",
                          desc: "No dimensions available; economic benchmarking cannot be run (0 pts)",
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

              {/* Q3: Site */}
              {activeSection === 2 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <MapPin className="size-4 text-primary" />
                      Q3. Site & Land Readiness Status
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Confirm property title, municipal servicing, and road access
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
                          title: "Owned Land (Project-Ready)",
                          desc: "Property is owned or fully controlled; servicing & zoning verified (+15 pts)",
                        },
                        {
                          val: "option",
                          title: "Under Option / Purchase Contract",
                          desc: "Under binding purchase agreement with closing contingencies (+10 pts)",
                        },
                        {
                          val: "searching",
                          title: "Searching for Site / Unresolved",
                          desc: "Site selection in progress; requires Site Feasibility Study (+2 pts)",
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

              {/* Q4: Design */}
              {activeSection === 3 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <FileText className="size-4 text-primary" />
                      Q4. Plans & Architectural Design Maturity Level
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Classify drawings across Levels 0 to 4 to establish design coordination scope
                    </p>
                  </div>

                  <div className="space-y-2">
                    {[
                      {
                        val: "lvl4",
                        title: "Level 4: Permit Issued (Drawings Approved)",
                        desc: "Official building permit issued; ready for modular fabrication review (+15 pts)",
                      },
                      {
                        val: "lvl3",
                        title: "Level 3: Permit Set Submitted",
                        desc: "Complete architectural & engineering drawings submitted for municipal review (+13 pts)",
                      },
                      {
                        val: "lvl2",
                        title: "Level 2: Preliminary Architectural Scheme",
                        desc: "Floor plans, elevations, and sections available; requires modular grid split (+9 pts)",
                      },
                      {
                        val: "lvl1",
                        title: "Level 1: Concept / Sketches Only",
                        desc: "Concept sketches only; requires CSA for architectural modularization (+6 pts, Design-Needed)",
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

              {/* Q5: Budget & Reality Check */}
              {activeSection === 4 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Landmark className="size-4 text-primary" />
                      Q5. Budget Basis & Class D Reality Check
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Benchmark estimated cost against client target budget to verify economic feasibility
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Client Target Budget ($)</label>
                      <input
                        type="text"
                        value={opp.clientBudget || ""}
                        onChange={(e) => savePatch({ clientBudget: e.target.value })}
                        placeholder="e.g. 9,800,000"
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground">Target Cost Baseline ($/sq.ft.)</label>
                      <input
                        type="number"
                        value={opp.targetCostPerSqFt || "350"}
                        onChange={(e) => savePatch({ targetCostPerSqFt: e.target.value })}
                        className="mt-1 w-full rounded-md border bg-card px-2.5 py-1.5 text-xs outline-none focus:border-primary"
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
                        variance <= 15 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-red-500/10 border-red-500/30 text-red-600"
                      )}>
                        <div className="text-[10px] font-bold">Variance</div>
                        <div className="text-sm font-bold mt-0.5">{variance > 0 ? `+${variance.toFixed(1)}%` : `${variance.toFixed(1)}%`}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {[
                      {
                        val: "aligned",
                        title: "Realistic Budget Fit (Within ±10%)",
                        desc: "Client budget aligns with Class D cost benchmark; commercial model is sound (+15 pts)",
                      },
                      {
                        val: "manageable",
                        title: "Manageable Variance (10% to 25% Gap)",
                        desc: "Client open to value engineering and spec calibration during pre-construction (+8 pts)",
                      },
                      {
                        val: "disconnect",
                        title: "Severe Budget Disconnect (>25% Gap)",
                        desc: "Budget is disconnected from market reality and client rejects calibration (-15 pts, NO-GO)",
                      },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.val}
                        onClick={() =>
                          savePatch(
                            {},
                            { budgetLevel: opt.val as QuestionnaireAnswers["budgetLevel"] },
                          )
                        }
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                          answers.budgetLevel === opt.val
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {answers.budgetLevel === opt.val ? (
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

              {/* Q6: Funding & Timeline */}
              {activeSection === 5 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Clock className="size-4 text-primary" />
                      Q6. Financing Structure & Target Timeline
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Confirm funding commitment and target delivery schedule
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
                    {[
                      {
                        val: "secured",
                        title: "Funding Secured / Approved Credit Facility",
                        desc: "Equity confirmed or bank credit approved; ready to proceed (+10 pts)",
                      },
                      {
                        val: "progressing",
                        title: "Financing In Progress (Clear Criteria)",
                        desc: "Underwriting in progress with clear approval milestones (+6 pts)",
                      },
                      {
                        val: "speculative",
                        title: "Speculative / Unsecured Funding",
                        desc: "Highly contingent on speculative financing; requires proof of funds milestone (+1 pt)",
                      },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.val}
                        onClick={() =>
                          savePatch(
                            { fundingSecured: opt.val === "secured" },
                            { fundingLevel: opt.val as QuestionnaireAnswers["fundingLevel"] },
                          )
                        }
                        className={cn(
                          "w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5",
                          answers.fundingLevel === opt.val
                            ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                            : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {answers.fundingLevel === opt.val ? (
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

              {/* Q7: Modular Fit */}
              {activeSection === 6 && (
                <div className="space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Layers className="size-4 text-primary" />
                      Q7. Modular Feasibility Fit Check
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Verify highway transport clearances, crane staging, and modular grid repeatability
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {[
                      {
                        val: "high",
                        title: "High Modular Suitability",
                        desc: "Regular grid, standard module transport envelopes, clear site crane access (+10 pts)",
                      },
                      {
                        val: "moderate",
                        title: "Moderate Suitability (Minor Adjustments)",
                        desc: "Custom non-standard modules or unique crane rigging required (+5 pts)",
                      },
                      {
                        val: "blocker",
                        title: "Fatal Modular Blocker",
                        desc: "Site road inaccessible for wide loads, or building geometry cannot be modularized (-20 pts, NO-GO)",
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

              {/* Logic Guide Modal/Drawer (When Open) */}
              {showLogicGuide && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 space-y-3 mt-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary flex items-center gap-1.5">
                      <ShieldCheck className="size-4" />
                      Automated Scoring & Classification Logic Rules
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
                      <strong>1. Score Formula (0-100 pts):</strong> Q1 Decision Maker (20) + Q2 Scale (15) + Q3 Site (15) + Q4 Design (15) + Q5 Budget (15) + Q6 Funding (10) + Q7 Modular Fit (10).
                    </p>
                    <p>
                      <strong>2. Tier Thresholds:</strong> Tier A (80-100 pts) · Tier B (55-79 pts) · Tier C (35-54 pts) · Tier D (&lt;35 pts or Fatal Red Flag).
                    </p>
                    <p>
                      <strong>3. Owner Type Rules:</strong> If Level 0 Plans &rarr; <em>Concept-Stage</em>; if Level 1/2 Plans &rarr; <em>Design-Needed</em>; if Searching Site &rarr; <em>Site-Unresolved</em>; if Level 3/4 Plans &rarr; <em>Permit-Ready</em>; if Score &ge; 80 &rarr; <em>Project-Ready</em>.
                    </p>
                    <p>
                      <strong>4. Gate 1 Verdict:</strong> Pass (Tier A / Tier B with controlled gaps), Hold (Tier C / unresolved gaps), NO-GO (Fatal Red Flag / Tier D).
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

          {/* RIGHT: AI Rating & Recommendation Dashboard (320px with proper padding & text wrap) */}
          <div className="w-[320px] shrink-0 flex flex-col bg-muted/15 p-3.5 space-y-3 overflow-y-auto scroll-thin pb-8">
            {/* Health Score Circular Banner */}
            <div className="rounded-xl border bg-card p-3 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Rating Model
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">Known & Controlled</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                  <span className="text-lg font-extrabold">{scoreBreakdown.totalScore}</span>
                  <span className="absolute -bottom-1 text-[7px] font-bold uppercase">Score</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[11px] font-bold rounded-md px-2 py-1 border block text-left leading-tight whitespace-normal break-words", scoreBreakdown.tierColor)}>
                    {scoreBreakdown.tierLabel}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight line-clamp-2">
                    {scoreBreakdown.tierDesc}
                  </p>
                </div>
              </div>
            </div>

            {/* Auto-Assigned Owner Type */}
            <div className="rounded-xl border bg-card p-3 space-y-1 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Assigned Owner Type</span>
                <Tag className="size-3 text-primary" />
              </div>
              <div className="font-bold text-xs text-foreground">
                {scoreBreakdown.autoOwnerType}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                Current: <strong className="text-foreground">{opp.ownerType || "TBD"}</strong>
              </div>
            </div>

            {/* Identified Gaps & Controlled Mitigation Plan */}
            <div className="rounded-xl border bg-card p-3 space-y-1.5 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Known Gaps & Actions</span>
                <ShieldCheck className="size-3 text-primary" />
              </div>
              {scoreBreakdown.gaps.length === 0 ? (
                <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1.5 py-1">
                  <BadgeCheck className="size-4 shrink-0" />
                  All core pillars ready & verified
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
            <div className="rounded-xl border bg-card p-3 space-y-1 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Recommended Engagement</span>
                <FileCheck2 className="size-3 text-primary" />
              </div>
              <div className="text-xs font-bold text-primary">
                {scoreBreakdown.autoPath}
              </div>
            </div>

            {/* One-Click Apply Recommendation */}
            <button
              type="button"
              onClick={applyRecommendation}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <Zap className="size-3.5" />
              Apply System Rating
            </button>

            {/* Gate 1 Direct Decision Trigger */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                Gate 1 Decision Routing:
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => savePatch({ decisionOutcome: "pass" })}
                  className={cn(
                    "rounded-lg p-1.5 text-[10px] font-bold border transition text-center",
                    outcome === "pass"
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-sm"
                      : "bg-background text-muted-foreground hover:border-emerald-500",
                  )}
                >
                  PASS ✅
                </button>
                <button
                  type="button"
                  onClick={() => savePatch({ decisionOutcome: "hold" })}
                  className={cn(
                    "rounded-lg p-1.5 text-[10px] font-bold border transition text-center",
                    outcome === "hold"
                      ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                      : "bg-background text-muted-foreground hover:border-amber-500",
                  )}
                >
                  HOLD ⚠️
                </button>
                <button
                  type="button"
                  onClick={() => savePatch({ decisionOutcome: "nogo" })}
                  className={cn(
                    "rounded-lg p-1.5 text-[10px] font-bold border transition text-center",
                    outcome === "nogo"
                      ? "bg-red-500 text-white border-red-600 shadow-sm"
                      : "bg-background text-muted-foreground hover:border-red-500",
                  )}
                >
                  NO-GO ❌
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* --- Card Footer Status Bar --- */}
        <div className="border-t bg-muted/40 px-4 py-2 text-[11px] flex items-center justify-between text-muted-foreground">
          <span>
            Rating: <strong className="text-foreground">{scoreBreakdown.tierLabel.split("·")[0]}</strong> · Owner:{" "}
            <strong className="text-foreground">{opp.ownerType || scoreBreakdown.autoOwnerType}</strong> · Path:{" "}
            <strong className="text-foreground">{opp.engagementPath || scoreBreakdown.autoPath}</strong>
          </span>
          <span className="font-semibold text-primary">
            {outcome === "pass"
              ? "✓ Gate 1 Approved (Advancing to Phase 1)"
              : outcome === "hold"
                ? "⚠ Opportunity on HOLD (Rework Loop)"
                : outcome === "nogo"
                  ? "❌ Opportunity Closed / Disqualified"
                  : "Assessment in Progress"}
          </span>
        </div>

        {/* --- Handles --- */}
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!size-3.5 !border-2 !border-background !bg-primary transition hover:!scale-125"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="pass"
          style={{ top: "35%" }}
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "pass"
              ? "!bg-emerald-500 ring-2 ring-emerald-500/40"
              : "!bg-muted-foreground/40",
          )}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="hold"
          style={{ top: "65%" }}
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "hold"
              ? "!bg-amber-500 ring-2 ring-amber-500/40"
              : "!bg-muted-foreground/40",
          )}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="nogo"
          style={{ left: "30%" }}
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "nogo"
              ? "!bg-red-500 ring-2 ring-red-500/40"
              : "!bg-muted-foreground/40",
          )}
        />
      </div>
    </div>
  );
}

export const OpportunityNode = memo(OpportunityNodeComponent);
