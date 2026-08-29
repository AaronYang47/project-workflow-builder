"use client";

import { useMemo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Building2, Compass, MapPin, Route, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { opportunityRouteLabels } from "@/lib/opportunity-routing";
import type { DomainNode } from "@/types/workflow";

export function OpportunityNode({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const config = getOpportunityConfig(node);
  const evaluation = useMemo(() => evaluateOpportunity(node), [node]);
  const intake = config.intake || {};

  const clientName = intake.clientAuthority?.clientName || "Client Unspecified";
  const storeys = intake.projectDefinition?.storeys;
  const gfa = intake.projectDefinition?.grossFloorArea;
  const scaleText =
    storeys || gfa
      ? `${storeys ? `${storeys} Storeys` : ""}${storeys && gfa ? " · " : ""}${gfa ? `${Number(gfa).toLocaleString()} sq ft` : ""}`
      : "Scale Not Defined";

  const landStatus = intake.siteLand?.siteStatus || "Site Unresolved";
  const designMaturity = intake.design?.designMaturity || "No Design";

  const routeLabel =
    opportunityRouteLabels[evaluation.recommendedRoute] || evaluation.recommendedRoute;
  const isPcs =
    evaluation.recommendedRoute === "PCS" || evaluation.recommendedRoute === "CLASS_D";
  const isCsa = evaluation.recommendedRoute === "CONSULTATION_CSA";
  const isReview = evaluation.recommendedRoute === "TECHNICAL_REVIEW";
  const isHold = evaluation.recommendedRoute === "HOLD_PREQUALIFICATION";

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
          "w-[320px] rounded-2xl border bg-card/95 p-4 shadow-sm transition-all text-left",
          selected
            ? "border-primary ring-2 ring-primary/20 shadow-md"
            : "border-border hover:border-primary/50",
        )}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="size-3.5" />
            </span>
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Opportunity & Intake
            </span>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[9px] font-bold text-foreground">
            {evaluation.totalScore}/100
          </span>
        </div>

        {/* Node Title & Client */}
        <div className="mt-2.5">
          <h3 className="truncate text-sm font-bold text-foreground leading-tight">
            {node.title || "Opportunity & Qualification"}
          </h3>
          <p className="truncate text-xs text-muted-foreground mt-0.5 font-medium">
            {clientName}
          </p>
        </div>

        {/* Fact Badges */}
        <div className="mt-3 space-y-1.5 border-t border-border/40 pt-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-foreground/90">
            <Building2 className="size-3 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">{scaleText}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-foreground/90">
            <MapPin className="size-3 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">{landStatus}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-foreground/90">
            <Compass className="size-3 text-muted-foreground shrink-0" />
            <span className="truncate font-medium">{designMaturity}</span>
          </div>
        </div>

        {/* Recommended Route Pill / Footer */}
        <div
          className={cn(
            "mt-3.5 flex items-center justify-between rounded-xl border px-2.5 py-1.5 transition-colors",
            isPcs
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : isCsa
                ? "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300"
                : isReview
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-800 dark:text-purple-300"
                  : isHold
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Route className="size-3.5 shrink-0" />
            <span className="truncate text-xs font-bold">
              {routeLabel}
            </span>
          </div>
          <span className="text-[9px] font-semibold opacity-75 shrink-0 ml-1">
            {evaluation.scoreGrade}
          </span>
        </div>
      </div>

      {/* Output Handles for Bounded Dynamic Routes */}
      {/* 1. Direct PCS / G1 Pass */}
      <Handle
        type="source"
        position={Position.Right}
        id="pass-p1-p2"
        style={{ top: "30%" }}
        className="!size-2.5 !border-2 !border-background !bg-emerald-600"
        title="Direct PCS / Gate 1"
      />
      {/* 2. Consultation / CSA */}
      <Handle
        type="source"
        position={Position.Right}
        id="csa-pcs"
        style={{ top: "50%" }}
        className="!size-2.5 !border-2 !border-background !bg-sky-600"
        title="Consultation / CSA"
      />
      {/* 3. Technical Review / Feasibility */}
      <Handle
        type="source"
        position={Position.Right}
        id="site-feasibility"
        style={{ top: "70%" }}
        className="!size-2.5 !border-2 !border-background !bg-purple-600"
        title="Technical Review"
      />
      {/* 4. No-Go Disqualified */}
      <Handle
        type="source"
        position={Position.Right}
        id="nogo-disqualified"
        style={{ top: "90%" }}
        className="!size-2.5 !border-2 !border-background !bg-rose-600"
        title="No-Go / Archive"
      />
    </div>
  );
}

export default OpportunityNode;
