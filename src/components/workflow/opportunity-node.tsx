"use client";

import { useMemo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Compass,
  DollarSign,
  MapPin,
  Route,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { opportunityRouteLabels } from "@/lib/opportunity-routing";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityIntake } from "@/types/workflow";
import {
  DESIGN_MATURITY_LEVELS,
  FUNDING_STATUSES,
  MODULAR_COMPATIBILITY_STATES,
  SITE_7_STATES,
} from "./opportunity-inspector";

type CardTab = "overview" | "client" | "site" | "budget";

export function OpportunityNode({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const store = useWorkflowStore();
  const config = getOpportunityConfig(node);
  const evaluation = useMemo(() => evaluateOpportunity(node), [node]);
  const intake: OpportunityIntake = config.intake || {};

  const [activeTab, setActiveTab] = useState<CardTab>("overview");

  const updateIntake = (updater: (prev: OpportunityIntake) => OpportunityIntake) => {
    const nextIntake = updater(intake);
    store.updateNode(node.id, {
      config: {
        ...node.config,
        opportunity: {
          ...config,
          intake: nextIntake,
        },
      },
    });
  };

  // Preset Profiles
  const applyPreset = (type: "kelowna" | "permit" | "developer" | "vague") => {
    if (type === "kelowna") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "City of Kelowna",
          clientType: "Municipality",
          primaryContactName: "Sarah Jenkins",
          primaryContactRole: "Director of Civic Housing",
          decisionAuthorityStatus: "Confirmed",
          approvalPath: "City Council Resolution",
        },
        projectDefinition: {
          projectName: "Rutland Affordable Housing",
          projectType: "Multi-Family Residential",
          storeys: "4",
          grossFloorArea: "32000",
          unitsRoomsBeds: "48 units",
        },
        siteLand: {
          siteStatus: "Municipality Has Land but Not Assigned",
          municipality: "Kelowna",
          province: "BC",
        },
        design: {
          designMaturity: "No Design",
          modularCompatibilityStatus: "Compatible / Native Modular",
          reviewedBy: "Sales Preliminary",
        },
        budgetFundingTimeline: {
          clientBudgetAmount: "9600000",
          budgetBasis: "Municipal Capital Fund",
          fundingSecured: "Yes",
          fundingStatus: "Municipal Capital Fund",
        },
      }));
    } else if (type === "permit") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Apex Development Corp",
          clientType: "Private Developer",
          primaryContactName: "David Miller",
          primaryContactRole: "Development VP",
          decisionAuthorityStatus: "Confirmed",
          approvalPath: "Corporate Executive Board",
        },
        projectDefinition: {
          projectName: "Broadview Terraces",
          projectType: "Multi-Family Residential",
          storeys: "6",
          grossFloorArea: "54000",
          unitsRoomsBeds: "72 units",
        },
        siteLand: {
          siteStatus: "Confirmed Site",
          municipality: "Ottawa",
          province: "ON",
        },
        design: {
          designMaturity: "Permit Issued",
          modularCompatibilityStatus: "Technical Review Required",
          reviewedBy: "Sales Preliminary",
        },
        budgetFundingTimeline: {
          clientBudgetAmount: "18500000",
          budgetBasis: "Bank Loan Approved",
          fundingSecured: "Yes",
          fundingStatus: "Commercial Loan",
        },
      }));
    } else if (type === "developer") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Harbor Modular Living",
          clientType: "Private Developer",
          primaryContactName: "Mark Tremblay",
          primaryContactRole: "Managing Partner",
          decisionAuthorityStatus: "Confirmed",
          approvalPath: "Managing Partner Approval",
        },
        projectDefinition: {
          projectName: "Lakeside Workforce Suites",
          projectType: "Workforce Housing",
          storeys: "3",
          grossFloorArea: "24000",
          unitsRoomsBeds: "36 units",
        },
        siteLand: {
          siteStatus: "Confirmed Site",
          municipality: "Gatineau",
          province: "QC",
        },
        design: {
          designMaturity: "Preliminary Design",
          modularCompatibilityStatus: "Compatible / Native Modular",
          reviewedBy: "Technical",
        },
        budgetFundingTimeline: {
          clientBudgetAmount: "7200000",
          budgetBasis: "Private Equity Secured",
          fundingSecured: "Yes",
          fundingStatus: "Equity",
        },
      }));
    } else {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "General Inquirer",
          clientType: "Unknown",
          decisionAuthorityStatus: "Unknown",
        },
        projectDefinition: {
          projectName: "Prospective Concept",
          storeys: "",
          grossFloorArea: "",
        },
        siteLand: {
          siteStatus: "Unknown",
        },
        design: {
          designMaturity: "No Design",
        },
        budgetFundingTimeline: {
          clientBudgetAmount: "",
          fundingSecured: "Unknown",
        },
      }));
    }
  };

  const clientName = intake.clientAuthority?.clientName || "Client Unspecified";
  const storeys = intake.projectDefinition?.storeys;
  const gfa = intake.projectDefinition?.grossFloorArea;
  const scaleText =
    storeys || gfa
      ? `${storeys ? `${storeys} Storeys` : ""}${storeys && gfa ? " · " : ""}${gfa ? `${Number(gfa).toLocaleString()} sq ft` : ""}`
      : "Scale Not Defined";

  const landStatus = intake.siteLand?.siteStatus || "Site Unresolved";
  const designMaturity = intake.design?.designMaturity || "No Design";
  const modularStatus = intake.design?.modularCompatibilityStatus || "Compatible";

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
          "w-[480px] rounded-2xl border bg-card/95 p-4 shadow-md transition-all text-left nodrag nopan",
          selected
            ? "border-primary ring-2 ring-primary/20 shadow-lg"
            : "border-border hover:border-primary/50",
        )}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
              <Target className="size-4" />
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
                Gate 1 Pipeline · Interactive Screening Card
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[10px] font-bold text-foreground">
            Score: {evaluation.totalScore}/100 · {evaluation.scoreGrade}
          </span>
        </div>

        {/* 1-Click Presets Ribbon */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1 scroll-thin">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
            <Sparkles className="size-3 text-primary" />
            Presets:
          </span>
          <button
            type="button"
            onClick={() => applyPreset("kelowna")}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg border border-border/80 bg-background px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted shrink-0"
          >
            City Housing (CSA)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("permit")}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg border border-border/80 bg-background px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted shrink-0"
          >
            Permit Ready (Tech)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("developer")}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg border border-border/80 bg-background px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted shrink-0"
          >
            Developer (Direct PCS)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("vague")}
            onPointerDown={(e) => e.stopPropagation()}
            className="rounded-lg border border-border/80 bg-background px-2 py-1 text-[10px] font-semibold text-foreground transition-colors hover:bg-muted shrink-0"
          >
            Incomplete (Hold)
          </button>
        </div>

        {/* Navigation Tabs directly on card */}
        <div className="mt-2.5 flex items-center gap-1 rounded-xl border border-border/70 bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "flex-1 rounded-lg py-1 text-[11px] font-semibold transition-all text-center",
              activeTab === "overview"
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("client")}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "flex-1 rounded-lg py-1 text-[11px] font-semibold transition-all text-center",
              activeTab === "client"
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Client & Scale
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("site")}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "flex-1 rounded-lg py-1 text-[11px] font-semibold transition-all text-center",
              activeTab === "site"
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Site & Design
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("budget")}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "flex-1 rounded-lg py-1 text-[11px] font-semibold transition-all text-center",
              activeTab === "budget"
                ? "bg-card text-foreground shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Budget & Class D
          </button>
        </div>

        {/* Tab 1: Overview Dashboard */}
        {activeTab === "overview" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {/* Client & Scale Card */}
            <div
              onClick={() => setActiveTab("client")}
              className="cursor-pointer rounded-xl border border-border/80 bg-background/80 p-2.5 transition-colors hover:border-primary/50"
              title="Click to edit Client & Scale"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <Users className="size-3 text-primary" />
                Client & Authority
              </div>
              <p className="mt-1 truncate text-xs font-bold text-foreground">
                {clientName}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {intake.clientAuthority?.clientType || "Private Developer"} · {intake.clientAuthority?.decisionAuthorityStatus || "Confirmed"}
              </p>
            </div>

            {/* Project Scale Card */}
            <div
              onClick={() => setActiveTab("client")}
              className="cursor-pointer rounded-xl border border-border/80 bg-background/80 p-2.5 transition-colors hover:border-primary/50"
              title="Click to edit Scale"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <Building2 className="size-3 text-primary" />
                Project Scale
              </div>
              <p className="mt-1 truncate text-xs font-bold text-foreground">
                {scaleText}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {intake.projectDefinition?.projectName || "Concept Stage"}
              </p>
            </div>

            {/* Land Card */}
            <div
              onClick={() => setActiveTab("site")}
              className="cursor-pointer rounded-xl border border-border/80 bg-background/80 p-2.5 transition-colors hover:border-primary/50"
              title="Click to edit Land & Design"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <MapPin className="size-3 text-primary" />
                Site Status
              </div>
              <p className="mt-1 truncate text-xs font-bold text-foreground">
                {landStatus}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {intake.siteLand?.municipality ? `${intake.siteLand.municipality}, ` : ""}{intake.siteLand?.province || "Unspecified"}
              </p>
            </div>

            {/* Design & Modular Card */}
            <div
              onClick={() => setActiveTab("site")}
              className="cursor-pointer rounded-xl border border-border/80 bg-background/80 p-2.5 transition-colors hover:border-primary/50"
              title="Click to edit Land & Design"
            >
              <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                <Compass className="size-3 text-primary" />
                Design vs Modular
              </div>
              <p className="mt-1 truncate text-xs font-bold text-foreground">
                {designMaturity}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {modularStatus}
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Client & Scale Direct Inputs */}
        {activeTab === "client" && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/80 bg-background/80 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Client Name
                </label>
                <input
                  type="text"
                  value={intake.clientAuthority?.clientName || ""}
                  placeholder="e.g. City of Kelowna"
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      clientAuthority: {
                        ...prev.clientAuthority,
                        clientName: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Client Type
                </label>
                <select
                  value={intake.clientAuthority?.clientType || "Private Developer"}
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      clientAuthority: {
                        ...prev.clientAuthority,
                        clientType: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="Municipality">Municipality</option>
                  <option value="Private Developer">Private Developer</option>
                  <option value="Non-Profit Housing">Non-Profit Housing</option>
                  <option value="General Contractor">General Contractor</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Storeys
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={intake.projectDefinition?.storeys || ""}
                  placeholder="e.g. 4"
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      projectDefinition: {
                        ...prev.projectDefinition,
                        storeys: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Approx. GFA (sq ft)
                </label>
                <input
                  type="number"
                  step="500"
                  value={intake.projectDefinition?.grossFloorArea || ""}
                  placeholder="e.g. 32000"
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      projectDefinition: {
                        ...prev.projectDefinition,
                        grossFloorArea: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Site & Design Direct Inputs */}
        {activeTab === "site" && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/80 bg-background/80 p-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Site & Land Status (7-State Model)
              </label>
              <select
                value={intake.siteLand?.siteStatus || "Confirmed Site"}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    siteLand: {
                      ...prev.siteLand,
                      siteStatus: e.target.value,
                    },
                  }))
                }
                onPointerDown={(e) => e.stopPropagation()}
                className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              >
                {SITE_7_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Design Maturity
                </label>
                <select
                  value={intake.design?.designMaturity || "No Design"}
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      design: {
                        ...prev.design,
                        designMaturity: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                >
                  {DESIGN_MATURITY_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Modular Fit
                </label>
                <select
                  value={intake.design?.modularCompatibilityStatus || "Compatible / Native Modular"}
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      design: {
                        ...prev.design,
                        modularCompatibilityStatus: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                >
                  {MODULAR_COMPATIBILITY_STATES.map((mod) => (
                    <option key={mod} value={mod}>
                      {mod}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Budget & Class D Direct Inputs */}
        {activeTab === "budget" && (
          <div className="mt-3 space-y-2 rounded-xl border border-border/80 bg-background/80 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Target Budget ($)
                </label>
                <input
                  type="number"
                  value={intake.budgetFundingTimeline?.clientBudgetAmount || ""}
                  placeholder="e.g. 9600000"
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      budgetFundingTimeline: {
                        ...prev.budgetFundingTimeline,
                        clientBudgetAmount: e.target.value,
                      },
                    }))
                  }
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-1 h-7 w-full rounded-md border border-input bg-card px-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Class D Reality
                </label>
                <div className="mt-1 flex h-7 items-center justify-between rounded-md border border-border/60 bg-muted/30 px-2 text-xs font-semibold">
                  <span>${evaluation.budget.classD ? evaluation.budget.classD.toLocaleString() : "N/A"}</span>
                  {evaluation.budget.variance !== undefined && (
                    <span
                      className={cn(
                        "text-[10px] font-bold",
                        Math.abs(evaluation.budget.variance) <= 0.15
                          ? "text-emerald-600"
                          : "text-amber-600",
                      )}
                    >
                      {(evaluation.budget.variance * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Banner: Recommended Route Outcome */}
        <div
          className={cn(
            "mt-3 flex items-center justify-between rounded-xl border px-3 py-2 transition-colors",
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
          <div className="flex items-center gap-2 min-w-0">
            <Route className="size-4 shrink-0" />
            <div className="min-w-0">
              <span className="block truncate text-xs font-bold">
                👉 {routeLabel}
              </span>
              <span className="block truncate text-[10px] opacity-80">
                {evaluation.routeReason}
              </span>
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-current/20 bg-background/50 px-2 py-0.5 text-[9px] font-bold ml-2">
            {evaluation.overallStatus}
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
