"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Compass,
  DollarSign,
  FileCheck2,
  Landmark,
  MapPin,
  Route,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { opportunityRouteLabels } from "@/lib/opportunity-routing";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityIntake } from "@/types/workflow";
import { cn } from "@/lib/utils";

export const SITE_7_STATES = [
  "Confirmed Site",
  "Candidate Site (1 lot identified)",
  "Multiple Candidate Sites",
  "Municipality Has Land but Not Assigned",
  "Site Search in Progress",
  "No Site Identified",
  "Unknown",
] as const;

export const DESIGN_MATURITY_LEVELS = [
  "No Design",
  "Concept Plans",
  "Preliminary Design",
  "Permit Submission Set",
  "Permit Issued",
  "Issue for Construction (IFC)",
] as const;

export const MODULAR_COMPATIBILITY_STATES = [
  "Compatible / Native Modular",
  "Technical Review Required",
  "Incompatible (Heavy In-Situ)",
] as const;

export const FUNDING_STATUSES = [
  "Secured Equity / Financing",
  "Government Grant Pending",
  "Bank Financing in Progress",
  "Unfunded / Early Inception",
] as const;

export function OpportunityInspector({ node }: { node: DomainNode }) {
  const store = useWorkflowStore();
  const evaluation = useMemo(() => evaluateOpportunity(node), [node]);
  const config = getOpportunityConfig(node);
  const intake: OpportunityIntake = config.intake || {};

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    evaluation: true,
    presets: true,
    client: true,
    scale: true,
    site: false,
    design: false,
    budget: false,
    funding: false,
  });

  const toggle = (sec: string) =>
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));

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

  // Presets based on JF's Master Requirements
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

  const routeLabel = opportunityRouteLabels[evaluation.recommendedRoute] || evaluation.recommendedRoute;
  const isPcs = evaluation.recommendedRoute === "PCS" || evaluation.recommendedRoute === "CLASS_D";
  const isCsa = evaluation.recommendedRoute === "CONSULTATION_CSA";
  const isReview = evaluation.recommendedRoute === "TECHNICAL_REVIEW";
  const isHold = evaluation.recommendedRoute === "HOLD_PREQUALIFICATION";

  return (
    <div className="space-y-4 pb-8">
      {/* Route & Quality Score Banner */}
      <div
        className={cn(
          "rounded-2xl border p-4 shadow-sm transition-all",
          isPcs
            ? "border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20"
            : isCsa
              ? "border-sky-500/30 bg-sky-500/10 dark:bg-sky-950/20"
              : isReview
                ? "border-purple-500/30 bg-purple-500/10 dark:bg-purple-950/20"
                : isHold
                  ? "border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20"
                  : "border-rose-500/30 bg-rose-500/10 dark:bg-rose-950/20",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-primary shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Recommended Route
            </span>
          </div>
          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-bold">
            Score: {evaluation.totalScore}/100 · {evaluation.scoreGrade}
          </span>
        </div>

        <h3 className="mt-2 text-sm font-bold text-foreground">
          {routeLabel}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {evaluation.routeReason}
        </p>

        {evaluation.riskFlags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {evaluation.riskFlags.map((risk, i) => (
              <span
                key={i}
                className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300"
              >
                ⚠️ {risk}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Preset Profiles */}
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="size-3.5 text-primary" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            1-Click Preset Profiles
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset("kelowna")}
            className="rounded-lg border bg-card px-2 py-1.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            City Housing (CSA)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("permit")}
            className="rounded-lg border bg-card px-2 py-1.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Permit Ready (Tech)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("developer")}
            className="rounded-lg border bg-card px-2 py-1.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Developer (Direct PCS)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("vague")}
            className="rounded-lg border bg-card px-2 py-1.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Incomplete (Hold)
          </button>
        </div>
      </div>

      {/* 1. Client & Authority */}
      <div className="rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => toggle("client")}
          className="flex w-full items-center justify-between p-3.5 text-left font-semibold text-xs text-foreground hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <Users className="size-3.5 text-primary" />
            1. Client & Authority
          </span>
          {openSections.client ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>

        {openSections.client && (
          <div className="border-t p-3.5 space-y-3">
            <div>
              <Label className="text-[11px]">Client / Organization Name</Label>
              <Input
                value={intake.clientAuthority?.clientName || ""}
                placeholder="e.g. City of Kelowna / Apex Development"
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    clientAuthority: {
                      ...prev.clientAuthority,
                      clientName: e.target.value,
                    },
                  }))
                }
                className="mt-1 h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Client Type</Label>
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
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="Municipality">Municipality</option>
                  <option value="Private Developer">Private Developer</option>
                  <option value="Non-Profit Housing">Non-Profit Housing</option>
                  <option value="General Contractor">General Contractor</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>

              <div>
                <Label className="text-[11px]">Authority Status</Label>
                <select
                  value={intake.clientAuthority?.decisionAuthorityStatus || "Confirmed"}
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      clientAuthority: {
                        ...prev.clientAuthority,
                        decisionAuthorityStatus: e.target.value as any,
                      },
                    }))
                  }
                  className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="Partially Confirmed">Partially Confirmed</option>
                  <option value="Unknown">Unknown (Hold Trigger)</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-[11px]">Approval Path / Resolution</Label>
              <Input
                value={intake.clientAuthority?.approvalPath || ""}
                placeholder="e.g. City Council Resolution, Board Signing Authority"
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    clientAuthority: {
                      ...prev.clientAuthority,
                      approvalPath: e.target.value,
                    },
                  }))
                }
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Project Definition & Scale */}
      <div className="rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => toggle("scale")}
          className="flex w-full items-center justify-between p-3.5 text-left font-semibold text-xs text-foreground hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <Building2 className="size-3.5 text-primary" />
            2. Project Definition & Scale
          </span>
          {openSections.scale ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>

        {openSections.scale && (
          <div className="border-t p-3.5 space-y-3">
            <div>
              <Label className="text-[11px]">Project Title</Label>
              <Input
                value={intake.projectDefinition?.projectName || ""}
                placeholder="e.g. Rutland Civic Housing"
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    projectDefinition: {
                      ...prev.projectDefinition,
                      projectName: e.target.value,
                    },
                  }))
                }
                className="mt-1 h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Number of Storeys</Label>
                <Input
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
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div>
                <Label className="text-[11px]">Approx. GFA (sq ft)</Label>
                <Input
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
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              * Storeys and GFA provide the minimal required input for Class D validation.
            </p>
          </div>
        )}
      </div>

      {/* 3. Site & Land Status (7-State Model) */}
      <div className="rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => toggle("site")}
          className="flex w-full items-center justify-between p-3.5 text-left font-semibold text-xs text-foreground hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <MapPin className="size-3.5 text-primary" />
            3. Site & Land (7-State Model)
          </span>
          {openSections.site ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>

        {openSections.site && (
          <div className="border-t p-3.5 space-y-3">
            <div>
              <Label className="text-[11px]">Land Real Status</Label>
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
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium"
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
                <Label className="text-[11px]">Municipality</Label>
                <Input
                  value={intake.siteLand?.municipality || ""}
                  placeholder="e.g. Kelowna"
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      siteLand: {
                        ...prev.siteLand,
                        municipality: e.target.value,
                      },
                    }))
                  }
                  className="mt-1 h-8 text-xs"
                />
              </div>

              <div>
                <Label className="text-[11px]">Province</Label>
                <Input
                  value={intake.siteLand?.province || ""}
                  placeholder="e.g. BC / ON / QC"
                  onChange={(e) =>
                    updateIntake((prev) => ({
                      ...prev,
                      siteLand: {
                        ...prev.siteLand,
                        province: e.target.value,
                      },
                    }))
                  }
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Design Maturity vs Modular Compatibility */}
      <div className="rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => toggle("design")}
          className="flex w-full items-center justify-between p-3.5 text-left font-semibold text-xs text-foreground hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <Compass className="size-3.5 text-primary" />
            4. Design vs Modular Compatibility
          </span>
          {openSections.design ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>

        {openSections.design && (
          <div className="border-t p-3.5 space-y-3">
            <div>
              <Label className="text-[11px]">Design Maturity</Label>
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
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {DESIGN_MATURITY_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px]">Modular Compatibility</Label>
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
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium"
              >
                {MODULAR_COMPATIBILITY_STATES.map((mod) => (
                  <option key={mod} value={mod}>
                    {mod}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                * Permit Issued with traditional layout requires Technical Review.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 5. Budget & Class D Reality Check */}
      <div className="rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => toggle("budget")}
          className="flex w-full items-center justify-between p-3.5 text-left font-semibold text-xs text-foreground hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <DollarSign className="size-3.5 text-primary" />
            5. Budget & Class D Reality Check
          </span>
          {openSections.budget ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>

        {openSections.budget && (
          <div className="border-t p-3.5 space-y-3">
            <div>
              <Label className="text-[11px]">Client Target Budget ($)</Label>
              <Input
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
                className="mt-1 h-8 text-xs"
              />
            </div>

            {evaluation.budget.classD ? (
              <div className="rounded-lg border bg-muted/40 p-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Class D Benchmark:</span>
                  <span className="font-semibold">
                    ${evaluation.budget.classD.toLocaleString()}
                  </span>
                </div>
                {evaluation.budget.variance !== undefined && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Budget Variance:</span>
                    <span
                      className={cn(
                        "font-semibold",
                        Math.abs(evaluation.budget.variance) <= 0.15
                          ? "text-emerald-600"
                          : "text-amber-600",
                      )}
                    >
                      {(evaluation.budget.variance * 100).toFixed(1)}% ({evaluation.budget.alignment})
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* 6. Funding & Commercial Engagement */}
      <div className="rounded-xl border bg-card shadow-xs">
        <button
          type="button"
          onClick={() => toggle("funding")}
          className="flex w-full items-center justify-between p-3.5 text-left font-semibold text-xs text-foreground hover:bg-muted/30"
        >
          <span className="flex items-center gap-2">
            <Landmark className="size-3.5 text-primary" />
            6. Funding & Commercial Status
          </span>
          {openSections.funding ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>

        {openSections.funding && (
          <div className="border-t p-3.5 space-y-3">
            <div>
              <Label className="text-[11px]">Funding Status</Label>
              <select
                value={intake.budgetFundingTimeline?.fundingStatus || "Equity"}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    budgetFundingTimeline: {
                      ...prev.budgetFundingTimeline,
                      fundingStatus: e.target.value as any,
                    },
                  }))
                }
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                {FUNDING_STATUSES.map((fnd) => (
                  <option key={fnd} value={fnd}>
                    {fnd}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
