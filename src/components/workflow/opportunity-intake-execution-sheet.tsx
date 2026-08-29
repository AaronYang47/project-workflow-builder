"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  CircleAlert,
  Compass,
  FileCheck2,
  FileText,
  FolderKanban,
  HelpCircle,
  MapPin,
  Plus,
  Rocket,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityIntake } from "@/types/workflow";
import { ProjectIdBadge } from "./project-id-badge";

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

export function OpportunityIntakeExecutionSheet({
  node,
  onBack,
}: {
  node: DomainNode;
  onBack: () => void;
}) {
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

  // Mandatory facts checklist
  const mandatoryChecks = [
    {
      id: "clientName",
      label: "Client Organization",
      complete: Boolean(intake.clientAuthority?.clientName?.trim()),
    },
    {
      id: "clientRelationship",
      label: "Relationship Tier",
      complete: Boolean(intake.clientAuthority?.clientRelationship),
    },
    {
      id: "authority",
      label: "Decision Authority",
      complete: Boolean(
        intake.clientAuthority?.decisionAuthorityStatus &&
          intake.clientAuthority.decisionAuthorityStatus !== "Unknown",
      ),
    },
    {
      id: "storeys",
      label: "Storeys (Levels)",
      complete: Boolean(
        intake.projectDefinition?.storeys &&
          Number(intake.projectDefinition.storeys) > 0,
      ),
    },
    {
      id: "gfa",
      label: "Gross Floor Area (GFA)",
      complete: Boolean(
        intake.projectDefinition?.grossFloorArea &&
          Number(intake.projectDefinition.grossFloorArea) > 0,
      ),
    },
    {
      id: "site",
      label: "7-State Land Status",
      complete: Boolean(intake.siteLand?.siteStatus),
    },
    {
      id: "design",
      label: "Design Maturity",
      complete: Boolean(intake.design?.designMaturity),
    },
  ];

  const completedCount = mandatoryChecks.filter((c) => c.complete).length;
  const isStep1Complete = completedCount === mandatoryChecks.length;
  const missingItems = mandatoryChecks.filter((c) => !c.complete);

  // Quick Presets
  const applyPreset = (preset: "developer" | "kelowna" | "loi" | "hold") => {
    if (preset === "developer") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Apex Urban Developments",
          clientType: "Private Developer",
          decisionAuthorityStatus: "Confirmed",
          clientRelationship: "Trusted",
          primaryContactName: "Ben Miller",
          primaryContactRole: "Development Director",
          email: "bmiller@apexurban.com",
        },
        projectDefinition: {
          projectName: "Downtown Workforce Housing",
          projectType: "Multi-Family Residential",
          storeys: "4",
          grossFloorArea: "32000",
          unitsRoomsBeds: "48 Units",
        },
        siteLand: {
          siteStatus: "Confirmed Site - Full Control",
          siteAddress: "450 Queensway Ave",
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
          targetOccupancy: "2027-Q2",
        },
      }));
    } else if (preset === "kelowna") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "City of Kelowna",
          clientType: "Municipality",
          decisionAuthorityStatus: "Confirmed",
          clientRelationship: "Strategic",
          primaryContactName: "Sarah Jenkins",
          primaryContactRole: "Civic Housing Planner",
          email: "sjenkins@kelowna.ca",
        },
        projectDefinition: {
          projectName: "Rutland Civic Affordable Housing",
          projectType: "Affordable Housing",
          storeys: "3",
          grossFloorArea: "24000",
          unitsRoomsBeds: "36 Units",
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
          targetOccupancy: "2027-Q4",
        },
      }));
    } else if (preset === "loi") {
      updateIntake(() => ({
        clientAuthority: {
          clientName: "Summit Living Partners",
          clientType: "Repeat Private Developer",
          decisionAuthorityStatus: "Confirmed",
          clientRelationship: "Returning",
          primaryContactName: "David Vance",
          primaryContactRole: "Managing Partner",
          email: "david@summitliving.ca",
        },
        projectDefinition: {
          projectName: "Okanagan Terrace Suites",
          projectType: "Multi-Family Modular",
          storeys: "4",
          grossFloorArea: "28000",
          unitsRoomsBeds: "40 Units",
        },
        siteLand: {
          siteStatus: "Confirmed Site - Full Control",
          siteAddress: "2800 30th St",
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
          targetOccupancy: "2027-Q3",
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

  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Top Dossier Readiness & Score Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Target className="size-5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                Step 1 · Objective Intake & Evidence Dossier
              </h2>
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                L3 Execution Sheet
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Direct factual intake establishing Gate 1 project eligibility
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold shadow-xs",
              isStep1Complete
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {isStep1Complete ? (
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            ) : (
              <CircleAlert className="size-3.5 text-amber-600" />
            )}
            <span>
              {completedCount} of {mandatoryChecks.length} Mandatory Complete
            </span>
          </div>

          <div className="rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-bold text-foreground shadow-xs">
            Score: {isStep1Complete ? `${evaluation.totalScore}/100 · ${evaluation.scoreGrade}` : "Pending"}
          </div>
        </div>
      </div>
        {/* Quick Scenario Ribbon */}
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary shrink-0" />
            <div>
              <p className="text-xs font-bold text-foreground">
                Load Typical Project Profile Presets
              </p>
              <p className="text-[11px] text-muted-foreground">
                Instantly populate objective facts to test downstream rule derivation and routing.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset("developer")}
              className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-xs"
            >
              🏢 Mature Developer (PCS)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("kelowna")}
              className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors shadow-xs"
            >
              🏛️ Municipality (CSA)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("loi")}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors shadow-xs"
            >
              🤝 Returning Client (LOI)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("hold")}
              className="rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors shadow-xs"
            >
              🛑 Incomplete (Hold)
            </button>
          </div>
        </div>

        {/* Missing Mandatory Callout (if incomplete) */}
        {!isStep1Complete && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <CircleAlert className="size-4 text-amber-600" />
              <span>Step 1 Incomplete: Missing Mandatory Baseline Facts</span>
            </div>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              The following required fields must be provided before Step 1 can be completed and downstream qualification unlocked:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {missingItems.map((item) => (
                <span
                  key={item.id}
                  className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-100"
                >
                  • {item.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* SECTION A: MANDATORY FACT BASELINE */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 text-xs font-bold">
                A
              </span>
              <h3 className="text-sm font-bold text-foreground">
                Mandatory Fact Baseline (6 Core Pillars)
              </h3>
            </div>
            <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-400">
              Required for Completion
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Pillar 1: Client Organization */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>1. Client Organization Name</span>
                <span className="text-rose-500">*</span>
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Legal commercial client entity or municipal public partner.
              </p>
            </div>

            {/* Pillar 2: Client Relationship Tier */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>2. Client Relationship Tier</span>
                <span className="text-rose-500">*</span>
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              >
                {CLIENT_RELATIONSHIPS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel} {rel === "Returning" || rel === "Trusted" || rel === "Strategic" ? "(Eligible for Free Governed LOI)" : "(Standard Commercial)"}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Returning/Trusted partners can unlock complimentary Governed LOI with CEO sign-off.
              </p>
            </div>

            {/* Pillar 3: Decision Authority Status */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>3. Decision Authority Status</span>
                <span className="text-rose-500">*</span>
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              >
                <option value="Confirmed">Confirmed (Executive / Decision Maker Identified)</option>
                <option value="Partially Confirmed">Partially Confirmed (Middle Management Lead)</option>
                <option value="Unknown">Unknown (Triggers Immediate Step 2 Blocker / Hold)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                JF Core Rule: Never commit design resources without knowing who signs the contract.
              </p>
            </div>

            {/* Pillar 4 & 5: Scale (Storeys & GFA) */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>4 & 5. Project Scale (Storeys + GFA)</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
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
                    placeholder="Storeys (e.g. 4)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
                  />
                </div>
                <div>
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
                    placeholder="GFA sq ft (e.g. 32000)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Class D Reality Check minimal input. Avoids forcing early module count guesses.
              </p>
            </div>

            {/* Pillar 6: Site & Land 7-State Model */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>6. Site & Land Status (7-State Model)</span>
                <span className="text-rose-500">*</span>
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              >
                {SITE_7_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Distinguishes direct build, consulting (CSA for unassigned municipal land), or fatal flaws.
              </p>
            </div>

            {/* Pillar 7: Design Maturity */}
            <div className="space-y-1.5">
              <label className="font-bold text-foreground flex items-center gap-1">
                <span>7. Design Maturity (Decoupled)</span>
                <span className="text-rose-500">*</span>
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
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              >
                {DESIGN_MATURITY_LEVELS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Drawing package stage. Permit issued drawings still require modular conversion review.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION B: OPTIONAL CONTEXT & QUALITY BOOSTERS */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 text-xs font-bold">
                B
              </span>
              <h3 className="text-sm font-bold text-foreground">
                Additional Project Context (Optional Boosters)
              </h3>
            </div>
            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-400">
              Contributes to Quality Score (+15 pts)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">
                Primary Contact Person
              </label>
              <input
                type="text"
                value={intake.clientAuthority?.primaryContactName || ""}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    clientAuthority: {
                      ...prev.clientAuthority,
                      primaryContactName: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. Ben Miller"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">
                Contact Email Address
              </label>
              <input
                type="email"
                value={intake.clientAuthority?.email || ""}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    clientAuthority: {
                      ...prev.clientAuthority,
                      email: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. bmiller@apex.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">
                Specific Site Address / City
              </label>
              <input
                type="text"
                value={intake.siteLand?.siteAddress || ""}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    siteLand: {
                      ...prev.siteLand,
                      siteAddress: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. 450 Queensway Ave, Kelowna"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">
                Target Budget Amount ($)
              </label>
              <input
                type="text"
                value={intake.budgetFundingTimeline?.clientBudgetAmount || ""}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    budgetFundingTimeline: {
                      ...prev.budgetFundingTimeline,
                      clientBudgetAmount: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. 9500000"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">
                Modular Compatibility Assessment
              </label>
              <select
                value={intake.design?.modularCompatibilityStatus || MODULAR_COMPATIBILITY_STATES[0]}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    design: {
                      ...prev.design,
                      modularCompatibilityStatus: e.target.value,
                    },
                  }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              >
                {MODULAR_COMPATIBILITY_STATES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">
                Target Occupancy Date
              </label>
              <input
                type="text"
                value={intake.budgetFundingTimeline?.targetOccupancy || ""}
                onChange={(e) =>
                  updateIntake((prev) => ({
                    ...prev,
                    budgetFundingTimeline: {
                      ...prev.budgetFundingTimeline,
                      targetOccupancy: e.target.value,
                    },
                  }))
                }
                placeholder="e.g. 2027-Q2"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none shadow-xs"
              />
            </div>
          </div>
        </section>

        {/* SECTION C: ATTACHMENTS & ARTIFACTS DOSSIER */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-purple-500/10 text-purple-600 text-xs font-bold">
                C
              </span>
              <h3 className="text-sm font-bold text-foreground">
                Evidence Artifacts & Supporting Documents
              </h3>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">
              Direct source for Step 6 Gate 1 Dossier
            </span>
          </div>

          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center">
            <FileCheck2 className="size-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs font-semibold text-foreground">
              Attach intake meeting minutes, site parcels, or conceptual packages
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Files linked here will be bundled into the final Gate 1 Dossier package during Step 6.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                <Plus className="size-3.5" />
                Upload Document (PDF / DWG)
              </Button>
            </div>
          </div>
        </section>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between border-t border-border pt-4 pb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel & Exit
          </Button>

          <Button
            variant={isStep1Complete ? "default" : "secondary"}
            size="sm"
            onClick={onBack}
            className="h-9 px-5 text-xs font-bold gap-2"
          >
            <CheckCircle2 className="size-4" />
            <span>Save & Return to Workflow</span>
          </Button>
        </div>
      </div>
  );
}

export default OpportunityIntakeExecutionSheet;
