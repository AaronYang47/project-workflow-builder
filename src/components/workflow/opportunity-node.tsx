"use client";

import { Handle, Position } from "@xyflow/react";
import {
  ChevronRight,
  ClipboardList,
  Lock,
  Rocket,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

export function OpportunityNode({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const store = useWorkflowStore();
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
  const step4Active = step3Resolved;

  return (
    <div className="relative h-full w-full select-none">
      {/* Target Handle: Input from Project Start */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-primary"
      />

      <div
        className={cn(
          "w-[640px] rounded-2xl border bg-card/95 p-4 shadow-md transition-all text-left",
          selected
            ? "border-primary ring-2 ring-primary/20 shadow-lg"
            : "border-border hover:border-primary/50",
        )}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <Target className="size-4.5" />
            </span>
            <div className="min-w-0">
              <input
                type="text"
                value={node.title || "Opportunity & Qualification"}
                onChange={(e) => store.updateNode(node.id, { title: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                className="truncate text-sm font-bold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none w-full"
                title="Click to edit node title"
              />
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Gate 1 Pipeline · High-Level Qualification Flow
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[10px] font-bold text-foreground">
            {step1Complete
              ? `Score: ${evaluation.totalScore}/100 · ${evaluation.scoreGrade}`
              : "Score: Pending Intake"}
          </span>
        </div>

        {/* 4-Step Stepped Pipeline Flow */}
        <div className="mt-3.5 flex items-center justify-between gap-2">
          {/* STEP 1: INTAKE */}
          <div
            className={cn(
              "flex-1 min-w-0 rounded-xl border p-2.5 transition-all",
              step1Complete
                ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
                : "border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30",
            )}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>STEP 1</span>
              <ClipboardList className="size-3.5 text-primary shrink-0" />
            </div>
            <div className="mt-1 text-xs font-bold text-foreground truncate">
              Intake
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              Objective Evidence
            </div>
            <div className="mt-2.5">
              <span
                className={cn(
                  "inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                  step1Complete
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/20 text-amber-700 dark:text-amber-300 animate-pulse",
                )}
              >
                {step1Complete ? "Complete" : "Incomplete"}
              </span>
            </div>
          </div>

          <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />

          {/* STEP 2: BLOCKERS */}
          <div
            className={cn(
              "flex-1 min-w-0 rounded-xl border p-2.5 transition-all",
              !step1Complete
                ? "border-border/40 bg-muted/20 opacity-60"
                : step2Passed
                  ? "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20"
                  : "border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/30",
            )}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>STEP 2</span>
              {!step1Complete ? (
                <Lock className="size-3.5 text-muted-foreground shrink-0" />
              ) : step2Passed ? (
                <ShieldCheck className="size-3.5 text-emerald-600 shrink-0" />
              ) : (
                <ShieldAlert className="size-3.5 text-rose-600 shrink-0" />
              )}
            </div>
            <div className="mt-1 text-xs font-bold text-foreground truncate">
              Blockers
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              Hard & Eligibility
            </div>
            <div className="mt-2.5">
              <span
                className={cn(
                  "inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
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
          </div>

          <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />

          {/* STEP 3: REALITY */}
          <div
            className={cn(
              "flex-1 min-w-0 rounded-xl border p-2.5 transition-all",
              !step2Passed
                ? "border-border/40 bg-muted/20 opacity-60"
                : "border-sky-500/30 bg-sky-500/5 dark:bg-sky-950/20",
            )}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>STEP 3</span>
              {!step2Passed ? (
                <Lock className="size-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Scale className="size-3.5 text-sky-600 shrink-0" />
              )}
            </div>
            <div className="mt-1 text-xs font-bold text-foreground truncate">
              Reality
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              Class D & Route
            </div>
            <div className="mt-2.5">
              <span
                className={cn(
                  "inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                  !step2Passed
                    ? "bg-muted text-muted-foreground"
                    : "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                )}
              >
                {!step2Passed ? "Pending" : "Resolved"}
              </span>
            </div>
          </div>

          <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />

          {/* STEP 4: ACTIVATION */}
          <div
            className={cn(
              "flex-1 min-w-0 rounded-xl border p-2.5 transition-all",
              !step3Resolved
                ? "border-border/40 bg-muted/20 opacity-60"
                : isLoi
                  ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20"
                  : "border-purple-500/30 bg-purple-500/5 dark:bg-purple-950/20",
            )}
          >
            <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>STEP 4</span>
              {!step3Resolved ? (
                <Lock className="size-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Rocket className="size-3.5 text-purple-600 shrink-0" />
              )}
            </div>
            <div className="mt-1 text-xs font-bold text-foreground truncate">
              Activation
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              {isLoi ? "Governed LOI" : "Commercial Path"}
            </div>
            <div className="mt-2.5">
              <span
                className={cn(
                  "inline-block rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase",
                  !step3Resolved
                    ? "bg-muted text-muted-foreground"
                    : "bg-purple-500/15 text-purple-700 dark:text-purple-300",
                )}
              >
                {!step3Resolved ? "Locked" : "Active"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Source Handle: Forward to Gate 1 */}
      <Handle
        type="source"
        position={Position.Right}
        id="pass-p1-p2"
        className="!size-3 !border-2 !border-background !bg-emerald-600"
      />
    </div>
  );
}

export default OpportunityNode;
