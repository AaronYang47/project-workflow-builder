"use client";

import {
  ClipboardList,
  Lock,
  Rocket,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import type { DomainNode } from "@/types/workflow";
import { cn } from "@/lib/utils";

export function OpportunityInspector({ node }: { node: DomainNode }) {
  const config = getOpportunityConfig(node);
  const evaluation = evaluateOpportunity(node);
  const intake = config.intake || {};

  // Step 1 check: Minimum required objective facts
  const step1Complete = Boolean(
    intake.clientAuthority?.clientName?.trim() &&
      intake.clientAuthority?.decisionAuthorityStatus &&
      intake.projectDefinition?.storeys &&
      intake.projectDefinition?.grossFloorArea &&
      intake.siteLand?.siteStatus &&
      intake.design?.designMaturity,
  );

  // Step 2 check: Hard blockers
  const isBlocked =
    evaluation.overallStatus === "BLOCKED" ||
    evaluation.overallStatus === "NO-GO" ||
    evaluation.overallStatus === "HOLD";
  const step2Passed = step1Complete && !isBlocked;

  // Step 3 check: Routing resolved
  const step3Resolved = step2Passed && Boolean(evaluation.recommendedRoute);

  // Step 4 check: Commercial path active
  const isLoi = evaluation.recommendedRoute === "GOVERNED_LOI";

  return (
    <div className="space-y-3.5 p-3 text-xs">
      {/* High-Level Header Card */}
      <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="size-4" />
            </span>
            <div>
              <h4 className="text-xs font-bold text-foreground leading-tight">
                Opportunity Qualification
              </h4>
              <p className="text-[10px] text-muted-foreground">
                High-Level 4-Phase Architecture
              </p>
            </div>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary shrink-0">
            {step1Complete ? `Score: ${evaluation.totalScore}/100` : "Score: --"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Sequential 4-phase qualification pipeline establishing objective project viability before formal estimating and engineering engagement.
        </p>
      </div>

      {/* 4 High-Level Pipeline Phase Cards */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block px-0.5">
          Pipeline Phases Overview
        </span>

        {/* Phase 1 Card */}
        <div
          className={cn(
            "rounded-xl border p-2.5 transition-all",
            step1Complete
              ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
              : "border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
              <ClipboardList className="size-3.5 text-primary" />
              <span>Phase 1 · Intake & Evidence</span>
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                step1Complete
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/20 text-amber-700 dark:text-amber-300 animate-pulse",
              )}
            >
              {step1Complete ? "Complete" : "Incomplete"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Baseline objective facts collection (Client, Authority, Scale, Land, Design). Must be complete before unlocking downstream phases.
          </p>
        </div>

        {/* Phase 2 Card */}
        <div
          className={cn(
            "rounded-xl border p-2.5 transition-all",
            !step1Complete
              ? "border-border/40 bg-muted/20 opacity-60"
              : step2Passed
                ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
                : "border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/30",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
              {!step1Complete ? (
                <Lock className="size-3.5 text-muted-foreground" />
              ) : step2Passed ? (
                <ShieldCheck className="size-3.5 text-emerald-600" />
              ) : (
                <ShieldAlert className="size-3.5 text-rose-600" />
              )}
              <span>Phase 2 · Hard Blockers</span>
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                !step1Complete
                  ? "bg-muted text-muted-foreground"
                  : step2Passed
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/20 text-rose-700 dark:text-rose-300",
              )}
            >
              {!step1Complete ? "Pending" : step2Passed ? "Passed" : "Blocked"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Screening for fatal site constraints, authority status, and hard commercial blockers. Hard blockers trigger immediate Hold.
          </p>
        </div>

        {/* Phase 3 Card */}
        <div
          className={cn(
            "rounded-xl border p-2.5 transition-all",
            !step2Passed
              ? "border-border/40 bg-muted/20 opacity-60"
              : "border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
              {!step2Passed ? (
                <Lock className="size-3.5 text-muted-foreground" />
              ) : (
                <Scale className="size-3.5 text-sky-600" />
              )}
              <span>Phase 3 · Reality & Routing</span>
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                !step2Passed
                  ? "bg-muted text-muted-foreground"
                  : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
              )}
            >
              {!step2Passed ? "Pending" : "Resolved"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Sales reality check comparing target budget against Class D cost benchmarks (±15% tolerance) and bounded route determination.
          </p>
        </div>

        {/* Phase 4 Card */}
        <div
          className={cn(
            "rounded-xl border p-2.5 transition-all",
            !step3Resolved
              ? "border-border/40 bg-muted/20 opacity-60"
              : isLoi
                ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20"
                : "border-purple-500/30 bg-purple-500/5 dark:bg-purple-950/20",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
              {!step3Resolved ? (
                <Lock className="size-3.5 text-muted-foreground" />
              ) : (
                <Rocket className="size-3.5 text-purple-600" />
              )}
              <span>Phase 4 · Commercial Activation</span>
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                !step3Resolved
                  ? "bg-muted text-muted-foreground"
                  : isLoi
                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                    : "bg-purple-500/15 text-purple-700 dark:text-purple-300",
              )}
            >
              {!step3Resolved ? "Locked" : isLoi ? "Governed LOI" : "Active"}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Formal commercial agreement activation: Governed LOI (Complimentary with CEO Sign-off + Scope Caps), Direct PCS, or Paid CSA.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OpportunityInspector;
