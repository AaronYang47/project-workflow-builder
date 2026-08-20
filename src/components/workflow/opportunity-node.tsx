"use client";

import { memo, useMemo, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck,
  FileText,
  HelpCircle,
  Landmark,
  MapPin,
  Maximize2,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityValidationConfig } from "@/types/workflow";
import { ComponentNoteButton } from "./component-note-button";

const DESIGN_STAGES = [
  "Level 0: No Plans",
  "Level 1: Concept",
  "Level 2: Preliminary",
  "Level 3: Permit Set",
  "Level 4: Permit Issued",
] as const;

const OWNER_TYPES = [
  {
    type: "Project-Ready",
    label: "Project-Ready",
    desc: "Land owned, mature design, secured budget. Fast-track.",
    color: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    type: "Design-Needed",
    label: "Design-Needed",
    desc: "Missing plans -> Coordinate design & modular optimization (CSA).",
    color: "text-blue-500 border-blue-500/30 bg-blue-500/10",
  },
  {
    type: "Site-Unresolved",
    label: "Site-Unresolved",
    desc: "Site selection or servicing unverified -> Site Feasibility.",
    color: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  },
  {
    type: "Concept-Stage",
    label: "Concept-Stage",
    desc: "Early vision -> Paid Feasibility / Development Consultation.",
    color: "text-purple-500 border-purple-500/30 bg-purple-500/10",
  },
  {
    type: "Permit-Ready",
    label: "Permit-Ready",
    desc: "Drawings approved -> Modular conversion & engineering review.",
    color: "text-cyan-500 border-cyan-500/30 bg-cyan-500/10",
  },
] as const;

const ENGAGEMENT_PATHS = [
  { id: "CSA", label: "CSA (Client Services Agreement)" },
  { id: "PCS", label: "PCS (Pre-Construction Services)" },
  { id: "LOI", label: "LOI (Letter of Intent + Deposit)" },
  { id: "Paid Feasibility", label: "Paid Feasibility Study" },
  { id: "Direct Technical Review", label: "Direct Technical Review" },
] as const;

type TabKey = "client" | "scale" | "site" | "budget" | "decision";

function OpportunityNodeComponent({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const [activeTab, setActiveTab] = useState<TabKey>("client");

  const opp: OpportunityValidationConfig = useMemo(
    () => ({
      companyName: "",
      contactPerson: "",
      leadSource: "Direct Inquiry",
      contactPhone: "",
      contactEmail: "",
      decisionMakerName: "",
      decisionMakerRole: "",
      decisionMakerConfirmed: false,
      decisionMakerNotes: "",
      projectIntent: "Multi-family Residential",
      projectLocation: "",
      storeys: 4,
      grossFloorArea: 24000,
      unitCount: 32,
      siteStatus: "Owned",
      siteAddress: "",
      siteConstraints: "Servicing & access verified",
      designStage: "Level 1: Concept",
      clientBudget: "8500000",
      budgetScope: "Turnkey Total",
      targetCostPerSqFt: "350",
      fundingSource: "Commercial Loan",
      fundingSecured: true,
      targetTimeline: "Target occupancy in 14 months",
      consultantsInfo: "Architect on board; modular engineering via ProFab",
      modularFitPassed: true,
      realityCheckStatus: "passed",
      ownerType: "Design-Needed",
      gapMitigationNotes:
        "Plans at concept stage -> proceed with CSA for design coordination & modular optimization",
      engagementPath: "CSA",
      engagementStatus: "Draft",
      decisionOutcome: "draft",
      ...(node.config.opportunity || {}),
    }),
    [node.config.opportunity],
  );

  const saveOpp = (patch: Partial<OpportunityValidationConfig>) => {
    updateNode(node.id, {
      config: {
        ...node.config,
        opportunity: { ...opp, ...patch },
      },
    });
  };

  // Live Class D Calculations
  const area = Number(opp.grossFloorArea) || 0;
  const costPerSqFt = Number(opp.targetCostPerSqFt) || 0;
  const benchmarkCost = area * costPerSqFt;
  const budgetNum = Number(opp.clientBudget?.replace(/\D/g, "")) || 0;
  const variance =
    budgetNum > 0 ? ((benchmarkCost - budgetNum) / budgetNum) * 100 : 0;
  const isFeasible =
    budgetNum > 0 ? variance <= 15 : Boolean(opp.modularFitPassed);

  // Validation Counter
  const validationChecks = [
    Boolean(opp.companyName || opp.contactPerson),
    Boolean(opp.decisionMakerConfirmed),
    Boolean(area > 0 && opp.projectIntent),
    Boolean(opp.siteStatus && opp.designStage),
    Boolean(opp.modularFitPassed),
    Boolean(opp.ownerType),
    Boolean(opp.engagementPath),
  ];
  const passedCount = validationChecks.filter(Boolean).length;

  const color = node.color || "#1f5fa7";
  const outcome = opp.decisionOutcome || "draft";

  return (
    <div className="relative h-full w-full overflow-visible">
      <div
        data-canvas-node
        className={cn(
          "workflow-node group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_6px_24px_rgba(15,23,42,0.12)] transition duration-200",
          selected && "ring-2 ring-primary/60 ring-offset-2",
        )}
        style={{ borderColor: `${color}60` }}
      >
        <NodeResizer
          minWidth={680}
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

        {/* --- Header --- */}
        <div
          data-node-header
          className="nowheel flex items-center justify-between border-b px-4 py-3 cursor-grab active:cursor-grabbing"
          style={{ backgroundColor: `${color}12` }}
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
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Opportunity Validation
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold border",
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
                        : "IN PROGRESS"}
                </span>
              </div>
              <h3 className="text-sm font-bold text-foreground">
                {node.title || "Opportunity Qualification & Commercial Baseline"}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg bg-background/80 px-2.5 py-1 text-xs font-semibold shadow-xs border">
              <Sparkles className="size-3.5 text-primary" />
              <span>
                {passedCount} / {validationChecks.length}
              </span>
              <span className="text-[10px] text-muted-foreground">Known</span>
            </div>
            <ComponentNoteButton
              nodeId={node.id}
              noteKey="main"
              label={node.title || "Opportunity Validation"}
            />
          </div>
        </div>

        {/* --- Navigation Tabs --- */}
        <div className="flex border-b bg-muted/30 px-2 text-xs font-medium">
          {[
            { id: "client", label: "1. Client & DM", icon: Users },
            { id: "scale", label: "2. Scale & Class D", icon: Scale },
            { id: "site", label: "3. Site & Design", icon: MapPin },
            { id: "budget", label: "4. Budget, Fit & Gaps", icon: Landmark },
            { id: "decision", label: "5. Gate 1 Decision", icon: CheckCircle2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabKey)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition nodrag",
                  active
                    ? "border-primary text-primary bg-background/60"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* --- Tab Content Area --- */}
        <div className="nodrag nowheel flex-1 overflow-y-auto p-4 space-y-4 text-xs scroll-thin">
          {/* Tab 1: Client & Decision Maker */}
          {activeTab === "client" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Company / Entity Name
                  </label>
                  <input
                    type="text"
                    value={opp.companyName || ""}
                    onChange={(e) => saveOpp({ companyName: e.target.value })}
                    placeholder="e.g. Apex Developments Ltd."
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Primary Contact Person
                  </label>
                  <input
                    type="text"
                    value={opp.contactPerson || ""}
                    onChange={(e) => saveOpp({ contactPerson: e.target.value })}
                    placeholder="e.g. John Doe, VP Development"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Lead / Referral Source
                  </label>
                  <input
                    type="text"
                    value={opp.leadSource || ""}
                    onChange={(e) => saveOpp({ leadSource: e.target.value })}
                    placeholder="e.g. Website, Architect Referral, Repeat"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Contact Phone / Email
                  </label>
                  <input
                    type="text"
                    value={opp.contactEmail || ""}
                    onChange={(e) => saveOpp({ contactEmail: e.target.value })}
                    placeholder="e.g. info@apexdev.ca / (555) 019-2834"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Decision Maker Callout */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-4 text-primary" />
                    <span className="font-bold text-foreground">
                      Decision Maker & Authority Confirmation
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-primary">
                    <input
                      type="checkbox"
                      checked={Boolean(opp.decisionMakerConfirmed)}
                      onChange={(e) =>
                        saveOpp({ decisionMakerConfirmed: e.target.checked })
                      }
                      className="size-4 rounded accent-primary"
                    />
                    <span>Authority Verified</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Authorized Signer / Budget Controller
                    </label>
                    <input
                      type="text"
                      value={opp.decisionMakerName || ""}
                      onChange={(e) =>
                        saveOpp({ decisionMakerName: e.target.value })
                      }
                      placeholder="Name & Title"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Decision Hierarchy & Approval Path
                    </label>
                    <input
                      type="text"
                      value={opp.decisionMakerRole || ""}
                      onChange={(e) =>
                        saveOpp({ decisionMakerRole: e.target.value })
                      }
                      placeholder="e.g. Board approval required over $10M"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Scale & Class D */}
          {activeTab === "scale" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Project Intent & Building Typology
                  </label>
                  <input
                    type="text"
                    value={opp.projectIntent || ""}
                    onChange={(e) => saveOpp({ projectIntent: e.target.value })}
                    placeholder="e.g. 4-Storey Multi-family Rental"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Project Location / Municipality
                  </label>
                  <input
                    type="text"
                    value={opp.projectLocation || ""}
                    onChange={(e) =>
                      saveOpp({ projectLocation: e.target.value })
                    }
                    placeholder="e.g. Kelowna, BC"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Storeys (层数)
                  </label>
                  <input
                    type="number"
                    value={opp.storeys || ""}
                    onChange={(e) =>
                      saveOpp({ storeys: Number(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Gross Floor Area (sq.ft.)
                  </label>
                  <input
                    type="number"
                    value={opp.grossFloorArea || ""}
                    onChange={(e) =>
                      saveOpp({ grossFloorArea: Number(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Units / Modules Count
                  </label>
                  <input
                    type="number"
                    value={opp.unitCount || ""}
                    onChange={(e) =>
                      saveOpp({ unitCount: Number(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Real-time Class D Reality Benchmark Card */}
              <div className="rounded-xl border bg-muted/40 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="size-4 text-primary" />
                    <span className="font-bold">
                      Class D Reality Calculation Benchmark
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Assumption: $/sq.ft.
                    </span>
                    <input
                      type="number"
                      value={opp.targetCostPerSqFt || "350"}
                      onChange={(e) =>
                        saveOpp({ targetCostPerSqFt: e.target.value })
                      }
                      className="w-20 rounded-md border bg-background px-2 py-0.5 text-xs font-semibold outline-none text-right"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div className="rounded-lg bg-background p-2.5 border">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase">
                      Class D Benchmark
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      ${benchmarkCost.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {area.toLocaleString()} sq.ft. @ ${costPerSqFt}/sq.ft.
                    </div>
                  </div>

                  <div className="rounded-lg bg-background p-2.5 border">
                    <div className="text-[10px] font-medium text-muted-foreground uppercase">
                      Client Target Budget
                    </div>
                    <div className="text-sm font-bold text-foreground mt-0.5">
                      ${budgetNum.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {opp.budgetScope || "Turnkey Total"}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "rounded-lg p-2.5 border flex flex-col justify-between",
                      isFeasible
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
                    )}
                  >
                    <div className="text-[10px] font-bold uppercase">
                      Reality Fit Status
                    </div>
                    <div className="text-xs font-bold mt-1">
                      {isFeasible ? "✓ Feasible & Aligned" : "⚠ Gap Identified"}
                    </div>
                    <div className="text-[10px] opacity-80">
                      Variance: {variance > 0 ? `+${variance.toFixed(1)}%` : `${variance.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Site & Design Maturity */}
          {activeTab === "site" && (
            <div className="space-y-4">
              <div className="rounded-xl border p-3.5 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-2">
                    <MapPin className="size-4 text-primary" />
                    Site & Land Status
                  </span>
                  <select
                    value={opp.siteStatus || "Owned"}
                    onChange={(e) =>
                      saveOpp({
                        siteStatus: e.target
                          .value as OpportunityValidationConfig["siteStatus"],
                      })
                    }
                    className="rounded-lg border bg-background px-3 py-1 text-xs font-semibold outline-none focus:border-primary"
                  >
                    <option value="Owned">Owned (已拿地)</option>
                    <option value="Under Option">
                      Under Option (购买意向期)
                    </option>
                    <option value="Searching">Searching (寻址中)</option>
                    <option value="Unresolved">Unresolved (待确认)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Site Address / Parcel PIN
                    </label>
                    <input
                      type="text"
                      value={opp.siteAddress || ""}
                      onChange={(e) =>
                        saveOpp({ siteAddress: e.target.value })
                      }
                      placeholder="e.g. 1045 Enterprise Way"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">
                      Site Constraints & Servicing
                    </label>
                    <input
                      type="text"
                      value={opp.siteConstraints || ""}
                      onChange={(e) =>
                        saveOpp({ siteConstraints: e.target.value })
                      }
                      placeholder="Access road, power, water/sewer, crane pad"
                      className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Design Maturity Level */}
              <div className="rounded-xl border p-3.5 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    Plans & Design Maturity Level
                  </span>
                  <span className="text-[11px] font-semibold text-primary">
                    {opp.designStage}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {DESIGN_STAGES.map((lvl) => {
                    const active = opp.designStage === lvl;
                    return (
                      <button
                        type="button"
                        key={lvl}
                        onClick={() => saveOpp({ designStage: lvl })}
                        className={cn(
                          "rounded-lg border p-2 text-left transition text-[11px]",
                          active
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                            : "border-border bg-background hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        <div className="text-[10px] font-mono opacity-60">
                          {lvl.split(":")[0]}
                        </div>
                        <div className="font-semibold mt-0.5 truncate">
                          {lvl.split(":")[1] || lvl}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Budget, Fit & Gaps */}
          {activeTab === "budget" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Client Budget Basis ($)
                  </label>
                  <input
                    type="text"
                    value={opp.clientBudget || ""}
                    onChange={(e) => saveOpp({ clientBudget: e.target.value })}
                    placeholder="e.g. 8,500,000"
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Budget Scope Coverage
                  </label>
                  <select
                    value={opp.budgetScope || "Turnkey Total"}
                    onChange={(e) =>
                      saveOpp({
                        budgetScope: e.target
                          .value as OpportunityValidationConfig["budgetScope"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  >
                    <option value="Turnkey Total">Turnkey Total (整体造价)</option>
                    <option value="Modular Scope Only">
                      Modular Scope Only (仅模块化制造)
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    Financing / Funding Structure
                  </label>
                  <select
                    value={opp.fundingSource || "Commercial Loan"}
                    onChange={(e) =>
                      saveOpp({
                        fundingSource: e.target
                          .value as OpportunityValidationConfig["fundingSource"],
                      })
                    }
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  >
                    <option value="Equity">Equity (自有资金)</option>
                    <option value="Commercial Loan">
                      Commercial Loan (银行开发贷)
                    </option>
                    <option value="Government Grant">
                      Government Grant (政策补贴)
                    </option>
                    <option value="Financing Program">
                      Financing Program (专项融资计划)
                    </option>
                    <option value="TBD">TBD (待定)</option>
                  </select>
                </div>
              </div>

              {/* Owner Type Classification */}
              <div className="rounded-xl border p-3.5 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-2">
                    <Tag className="size-4 text-primary" />
                    Assign Owner / Client Type
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Establishes the gap resolution path
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {OWNER_TYPES.map((ot) => {
                    const active = opp.ownerType === ot.type;
                    return (
                      <button
                        type="button"
                        key={ot.type}
                        onClick={() =>
                          saveOpp({
                            ownerType:
                              ot.type as OpportunityValidationConfig["ownerType"],
                          })
                        }
                        className={cn(
                          "rounded-lg border p-2 text-left transition flex flex-col justify-between",
                          active
                            ? `${ot.color} font-bold shadow-xs`
                            : "border-border bg-background text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        <div className="font-semibold text-xs">{ot.label}</div>
                        <div className="text-[9px] mt-1 opacity-80 line-clamp-2">
                          {ot.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gap Mitigation Strategy */}
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" />
                  Gap Mitigation Strategy (Known & Controlled Plan)
                </label>
                <textarea
                  rows={2}
                  value={opp.gapMitigationNotes || ""}
                  onChange={(e) =>
                    saveOpp({ gapMitigationNotes: e.target.value })
                  }
                  placeholder="Define how missing items are governed (e.g. missing drawings handled via CSA design coordination; site constraints handled via site feasibility study)..."
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
          )}

          {/* Tab 5: Engagement Path & Gate 1 Decision */}
          {activeTab === "decision" && (
            <div className="space-y-4">
              {/* Engagement Path Selection */}
              <div className="rounded-xl border p-3.5 space-y-3 bg-muted/20">
                <span className="font-bold flex items-center gap-2">
                  <FileCheck className="size-4 text-primary" />
                  Select Commercial Engagement Path
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {ENGAGEMENT_PATHS.map((path) => {
                    const active = opp.engagementPath === path.id;
                    return (
                      <button
                        type="button"
                        key={path.id}
                        onClick={() =>
                          saveOpp({
                            engagementPath:
                              path.id as OpportunityValidationConfig["engagementPath"],
                          })
                        }
                        className={cn(
                          "rounded-lg border p-2.5 text-left transition text-xs",
                          active
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                            : "border-border bg-background hover:border-primary/40 text-muted-foreground",
                        )}
                      >
                        {path.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gate 1 Final Outcome Selector */}
              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-foreground text-sm">
                      Gate 1 Opportunity Decision Routing
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Activate the appropriate outgoing handle based on validation maturity
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  {/* PASS */}
                  <button
                    type="button"
                    onClick={() => saveOpp({ decisionOutcome: "pass" })}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition",
                      outcome === "pass"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold shadow-md ring-2 ring-emerald-500/30"
                        : "border-border bg-background hover:border-emerald-500/40 text-muted-foreground",
                    )}
                  >
                    <CheckCircle2 className="size-5 mb-1" />
                    <span className="text-xs font-bold">GATE 1 PASS</span>
                    <span className="text-[10px] opacity-80 mt-0.5">
                      All Gaps Controlled → Proceed
                    </span>
                  </button>

                  {/* HOLD */}
                  <button
                    type="button"
                    onClick={() => saveOpp({ decisionOutcome: "hold" })}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition",
                      outcome === "hold"
                        ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold shadow-md ring-2 ring-amber-500/30"
                        : "border-border bg-background hover:border-amber-500/40 text-muted-foreground",
                    )}
                  >
                    <Clock className="size-5 mb-1" />
                    <span className="text-xs font-bold">HOLD · Rework</span>
                    <span className="text-[10px] opacity-80 mt-0.5">
                      Information Loop / Feasibility
                    </span>
                  </button>

                  {/* NO-GO */}
                  <button
                    type="button"
                    onClick={() => saveOpp({ decisionOutcome: "nogo" })}
                    className={cn(
                      "flex flex-col items-center justify-center rounded-xl border-2 p-3 text-center transition",
                      outcome === "nogo"
                        ? "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400 font-bold shadow-md ring-2 ring-red-500/30"
                        : "border-border bg-background hover:border-red-500/40 text-muted-foreground",
                    )}
                  >
                    <XCircle className="size-5 mb-1" />
                    <span className="text-xs font-bold">NO-GO</span>
                    <span className="text-[10px] opacity-80 mt-0.5">
                      Disqualified / Fatal Gap
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- Footer Status Bar --- */}
        <div className="border-t bg-muted/40 px-4 py-2 text-[11px] flex items-center justify-between text-muted-foreground">
          <span>
            Owner Type:{" "}
            <strong className="text-foreground">{opp.ownerType || "TBD"}</strong> · Path:{" "}
            <strong className="text-foreground">{opp.engagementPath || "TBD"}</strong>
          </span>
          <span className="font-semibold text-primary">
            {outcome === "pass"
              ? "✓ Ready to advance to Phase 1"
              : outcome === "hold"
                ? "⚠ Pending Gap Resolution"
                : outcome === "nogo"
                  ? "❌ Opportunity Closed"
                  : "Draft in Progress"}
          </span>
        </div>

        {/* --- Handles --- */}
        {/* Input from Project Start or Upstream */}
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className="!size-3.5 !border-2 !border-background !bg-primary transition hover:!scale-125"
        />

        {/* Output 1: PASS -> to Mainline / Phase 1 */}
        <Handle
          type="source"
          position={Position.Right}
          id="pass"
          style={{ top: "35%" }}
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "pass" ? "!bg-emerald-500 ring-2 ring-emerald-500/40" : "!bg-muted-foreground/40",
          )}
        />

        {/* Output 2: HOLD -> to Hold loop */}
        <Handle
          type="source"
          position={Position.Right}
          id="hold"
          style={{ top: "65%" }}
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "hold" ? "!bg-amber-500 ring-2 ring-amber-500/40" : "!bg-muted-foreground/40",
          )}
        />

        {/* Output 3: NO-GO -> to Archive */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="nogo"
          style={{ left: "30%" }}
          className={cn(
            "!size-3.5 !border-2 !border-background transition hover:!scale-125",
            outcome === "nogo" ? "!bg-red-500 ring-2 ring-red-500/40" : "!bg-muted-foreground/40",
          )}
        />
      </div>
    </div>
  );
}

export const OpportunityNode = memo(OpportunityNodeComponent);
