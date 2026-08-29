"use client";

import { useMemo } from "react";
import {
  Building2,
  CheckCircle2,
  CircleAlert,
  Compass,
  DollarSign,
  FileCheck2,
  Lock,
  MapPin,
  Rocket,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityIntake } from "@/types/workflow";
import { cn } from "@/lib/utils";

export const SITE_7_STATES = [
  "Confirmed Site - Full Control",
  "Site Under Option / In Negotiation",
  "Municipality Has Land but Not Assigned",
  "Site Search / Site Selection",
  "Rezoning / Variance Required",
  "Fatal Site / Logistics Constraints Confirmed",
  "Site Unknown / Unspecified",
];

export const DESIGN_MATURITY_LEVELS = [
  "0: No Design / Early Concept",
  "1: Concept Sketches",
  "2: Preliminary Drawings",
  "3: Detailed Pre-Permit Package",
  "4: Permit Issued / Tender Ready",
];

export const MODULAR_COMPATIBILITY_STATES = [
  "Native Modular Design",
  "Technical Review Required",
  "Major Conversion Required",
  "Incompatible with Modular",
  "Not Assessed",
];

export const CLIENT_RELATIONSHIPS = [
  "Standard",
  "Returning",
  "Trusted",
  "Strategic",
];

export function OpportunityInspector({ node }: { node: DomainNode }) {
  const store = useWorkflowStore();
  const config = getOpportunityConfig(node);
  const evaluation = useMemo(() => evaluateOpportunity(node), [node]);
  const intake = config.intake || {};

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

  const applyPreset = (preset: "developer" | "kelowna" | "loi" | "hold") => {
    if (preset === "developer") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Apex Urban Developments",
          clientType: "Private Developer",
          decisionAuthorityStatus: "Confirmed",
          clientRelationship: "Trusted",
        },
        projectDefinition: {
          projectName: "Downtown Workforce Housing",
          projectType: "Multi-Family Residential",
          storeys: "4",
          grossFloorArea: "32000",
        },
        siteLand: {
          siteStatus: "Confirmed Site - Full Control",
          municipality: "Kelowna",
          province: "BC",
        },
        design: {
          designMaturity: "2: Preliminary Drawings",
          modularCompatibilityStatus: "Native Modular Design",
        },
        budgetFundingTimeline: {
          clientBudgetProvided: "Yes",
          clientBudgetAmount: "9500000",
          classDAmount: "9200000",
          fundingStatus: "Committed / Available",
        },
      }));
    } else if (preset === "kelowna") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "City of Kelowna",
          clientType: "Municipality",
          decisionAuthorityStatus: "Confirmed",
          clientRelationship: "Strategic",
        },
        projectDefinition: {
          projectName: "Rutland Civic Affordable Housing",
          projectType: "Affordable Housing",
          storeys: "3",
          grossFloorArea: "24000",
        },
        siteLand: {
          siteStatus: "Municipality Has Land but Not Assigned",
          municipality: "Kelowna",
          province: "BC",
        },
        design: {
          designMaturity: "0: No Design / Early Concept",
          modularCompatibilityStatus: "Technical Review Required",
        },
        budgetFundingTimeline: {
          clientBudgetProvided: "Yes",
          clientBudgetAmount: "7200000",
          fundingStatus: "Grant Pending / Municipal Budget",
        },
      }));
    } else if (preset === "loi") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Summit Living Partners",
          clientType: "Repeat Private Developer",
          decisionAuthorityStatus: "Confirmed",
          clientRelationship: "Returning",
        },
        projectDefinition: {
          projectName: "Okanagan Terrace Suites",
          projectType: "Multi-Family Modular",
          storeys: "4",
          grossFloorArea: "28000",
        },
        siteLand: {
          siteStatus: "Confirmed Site - Full Control",
          municipality: "Vernon",
          province: "BC",
        },
        design: {
          designMaturity: "1: Concept Sketches",
          modularCompatibilityStatus: "Native Modular Design",
        },
        budgetFundingTimeline: {
          clientBudgetProvided: "Yes",
          clientBudgetAmount: "8400000",
          fundingStatus: "Committed / Available",
        },
      }));
    } else if (preset === "hold") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Prospective Buyer",
          decisionAuthorityStatus: "Unknown",
          clientRelationship: "Standard",
        },
        projectDefinition: {
          projectName: "Unspecified Project",
          storeys: "",
          grossFloorArea: "",
        },
        siteLand: {
          siteStatus: "Site Unknown / Unspecified",
        },
        design: {
          designMaturity: "0: No Design / Early Concept",
        },
        budgetFundingTimeline: {
          clientBudgetProvided: "No",
        },
      }));
    }
  };

  // Step calculations
  const step1Complete = Boolean(
    intake.clientAuthority?.clientName?.trim() &&
      intake.clientAuthority?.decisionAuthorityStatus &&
      intake.projectDefinition?.storeys &&
      intake.projectDefinition?.grossFloorArea &&
      intake.siteLand?.siteStatus &&
      intake.design?.designMaturity,
  );

  const isBlocked =
    evaluation.overallStatus === "BLOCKED" ||
    evaluation.overallStatus === "NO-GO" ||
    evaluation.overallStatus === "HOLD";
  const step2Passed = step1Complete && !isBlocked;
  const step3Resolved = step2Passed && Boolean(evaluation.recommendedRoute);

  const isLoi =
    intake.clientAuthority?.clientRelationship === "Returning" ||
    intake.clientAuthority?.clientRelationship === "Trusted" ||
    intake.clientAuthority?.clientRelationship === "Strategic";

  return (
    <div className="space-y-4 p-3 text-xs">
      {/* 1-Click Scenario Ribbon */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground mb-2">
          <Sparkles className="size-3.5 text-primary" />
          <span>Quick Scenario Presets</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => applyPreset("developer")}
            className="rounded-lg border border-border/70 bg-background px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted text-left transition-colors truncate"
          >
            🏢 Mature Developer (PCS)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("kelowna")}
            className="rounded-lg border border-border/70 bg-background px-2 py-1 text-[10px] font-semibold text-foreground hover:bg-muted text-left transition-colors truncate"
          >
            🏛️ Municipality (CSA)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("loi")}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 text-left transition-colors truncate"
          >
            🤝 Returning Client (LOI)
          </button>
          <button
            type="button"
            onClick={() => applyPreset("hold")}
            className="rounded-lg border border-border/70 bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted text-left transition-colors truncate"
          >
            🛑 Incomplete (Hold)
          </button>
        </div>
      </div>

      {/* Pipeline Status Summary Card */}
      <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <Target className="size-4 text-primary" />
            <span>High-Level Pipeline Status</span>
          </div>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            Score: {step1Complete ? `${evaluation.totalScore}/100` : "--"}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-muted-foreground block text-[10px]">Step 1 (Intake)</span>
            <span
              className={cn(
                "font-bold",
                step1Complete ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
              )}
            >
              {step1Complete ? "✓ Complete" : "⚠️ Incomplete"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px]">Step 2 (Blockers)</span>
            <span
              className={cn(
                "font-bold",
                !step1Complete
                  ? "text-muted-foreground"
                  : step2Passed
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
              )}
            >
              {!step1Complete ? "Pending" : step2Passed ? "✓ Passed" : "🛑 Blocked"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px]">Step 3 (Reality)</span>
            <span className="font-bold text-foreground truncate block">
              {!step2Passed ? "Pending" : evaluation.recommendedRoute || "Direct PCS"}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[10px]">Step 4 (Activation)</span>
            <span
              className={cn(
                "font-bold",
                !step3Resolved
                  ? "text-muted-foreground"
                  : isLoi
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-purple-600 dark:text-purple-400",
              )}
            >
              {!step3Resolved ? "Locked" : isLoi ? "Governed LOI" : "Active"}
            </span>
          </div>
        </div>
      </div>

      {/* STEP 1: INTAKE CONTROLS */}
      <div className="rounded-xl border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between border-b border-border/50 pb-2">
          <span className="font-bold uppercase tracking-wider text-[11px] text-foreground">
            Step 1 · Objective Evidence
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
              step1Complete
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/20 text-amber-700 dark:text-amber-300",
            )}
          >
            {step1Complete ? "Complete" : "Incomplete"}
          </span>
        </div>

        {/* Client Name & Relationship */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Client Organization
          </label>
          <input
            type="text"
            value={intake.clientAuthority?.clientName || ""}
            onChange={(e) =>
              updateIntake((prev) => ({
                ...prev,
                clientAuthority: {
                  ...prev.clientAuthority,
                  clientName: e.target.value,
                },
              }))
            }
            placeholder="e.g. Apex Urban Developments"
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Client Relationship
            </label>
            <select
              value={intake.clientAuthority?.clientRelationship || "Standard"}
              onChange={(e) =>
                updateIntake((prev) => ({
                  ...prev,
                  clientAuthority: {
                    ...prev.clientAuthority,
                    clientRelationship: e.target.value as "Standard" | "Returning" | "Trusted" | "Strategic",
                  },
                }))
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              {CLIENT_RELATIONSHIPS.map((rel) => (
                <option key={rel} value={rel}>
                  {rel} {rel === "Returning" ? "(LOI Eligible)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Decision Authority
            </label>
            <select
              value={intake.clientAuthority?.decisionAuthorityStatus || "Unknown"}
              onChange={(e) =>
                updateIntake((prev) => ({
                  ...prev,
                  clientAuthority: {
                    ...prev.clientAuthority,
                    decisionAuthorityStatus: e.target.value as "Confirmed" | "Partially Confirmed" | "Unknown",
                  },
                }))
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              <option value="Confirmed">Confirmed</option>
              <option value="Partially Confirmed">Partially Confirmed</option>
              <option value="Unknown">Unknown (Blocker)</option>
            </select>
          </div>
        </div>

        {/* Project Scale */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              Storeys (Levels)
            </label>
            <input
              type="number"
              value={intake.projectDefinition?.storeys || ""}
              onChange={(e) =>
                updateIntake((prev) => ({
                  ...prev,
                  projectDefinition: {
                    ...prev.projectDefinition,
                    storeys: e.target.value,
                  },
                }))
              }
              placeholder="e.g. 4"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">
              GFA (sq ft)
            </label>
            <input
              type="number"
              value={intake.projectDefinition?.grossFloorArea || ""}
              onChange={(e) =>
                updateIntake((prev) => ({
                  ...prev,
                  projectDefinition: {
                    ...prev.projectDefinition,
                    grossFloorArea: e.target.value,
                  },
                }))
              }
              placeholder="e.g. 32000"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* 7-State Site */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Site & Land Status (7-State Model)
          </label>
          <select
            value={intake.siteLand?.siteStatus || SITE_7_STATES[0]}
            onChange={(e) =>
              updateIntake((prev) => ({
                ...prev,
                siteLand: {
                  ...prev.siteLand,
                  siteStatus: e.target.value,
                },
              }))
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {SITE_7_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Design Maturity */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase text-muted-foreground">
            Design Maturity (Decoupled)
          </label>
          <select
            value={intake.design?.designMaturity || DESIGN_MATURITY_LEVELS[0]}
            onChange={(e) =>
              updateIntake((prev) => ({
                ...prev,
                design: {
                  ...prev.design,
                  designMaturity: e.target.value,
                },
              }))
            }
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            {DESIGN_MATURITY_LEVELS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* STEP 4: GOVERNED LOI / COMMERCIAL PATH PANEL */}
      {isLoi && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
            <span className="font-bold text-[11px] text-amber-800 dark:text-amber-300">
              🤝 Governed LOI (Complimentary)
            </span>
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-300">
              $0.00 Trust-Based
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md border border-border bg-background p-2">
              <span className="text-muted-foreground block">Max Duration Cap</span>
              <span className="font-bold text-foreground">45 Days</span>
            </div>
            <div className="rounded-md border border-border bg-background p-2">
              <span className="text-muted-foreground block">Max Eng Hours Cap</span>
              <span className="font-bold text-foreground">60 Hours</span>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px]">
            <span className="font-medium text-foreground">🔒 CEO Sign-Off Required</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              Approved
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default OpportunityInspector;
