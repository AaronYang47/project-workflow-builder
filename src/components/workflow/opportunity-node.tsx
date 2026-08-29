"use client";

import { useMemo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Compass,
  DollarSign,
  MapPin,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  evaluateOpportunity,
  evaluationSnapshot,
  getOpportunityConfig,
} from "@/lib/opportunity-evaluation";
import { opportunityRouteLabels } from "@/lib/opportunity-routing";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, OpportunityIntake } from "@/types/workflow";
import { ComponentNoteButton } from "./component-note-button";

const CLIENT_ENTITIES = [
  "Municipality",
  "Corporation",
  "Developer",
  "Government Agency",
  "Non-Profit / Housing Society",
  "Partnership / JV",
  "Individual",
  "Institutional",
  "Other",
];

const SITE_STATUSES = [
  "Confirmed Site",
  "Candidate Site",
  "Multiple Candidate Sites",
  "Municipality / Client Has Available Land but Site Not Assigned",
  "Site Being Searched",
  "No Site Identified",
  "Unknown",
];

const DESIGN_MATURITY_LEVELS = [
  "No Design",
  "Sketch / Massing",
  "Concept Plans",
  "Preliminary Design",
  "Developed Design",
  "Permit Submission Set",
  "Permit Issued",
  "Construction Documents",
  "IFC / Construction Ready",
];

const MODULAR_COMPATIBILITY = [
  "Not Reviewed",
  "Appears Compatible",
  "Technical Review Required",
  "Major Rework Likely",
  "Not Compatible",
];

const FUNDING_STATUSES = [
  "Fully Secured",
  "Commercial Loan In Process",
  "Government Funding / Grant Pending",
  "Mixed Funding",
  "Speculative / Pre-Financing",
  "Unknown",
];

const INTAKE_PRESETS: Array<{
  id: string;
  name: string;
  badge: string;
  intake: OpportunityIntake;
}> = [
  {
    id: "municipality-no-design",
    name: "Municipality (Land Available, No Design)",
    badge: "CSA Eligible",
    intake: {
      clientAuthority: {
        clientName: "City of Kelowna Housing Authority",
        clientType: "Municipality",
        primaryContactName: "Sarah Jenkins",
        primaryContactRole: "Director of Community Development",
        approvalPath: "City Council approval required for land allocation and contracts over $1M",
        decisionAuthorityStatus: "Partially Confirmed",
        finalDecisionAuthorityIdentified: "Yes",
        requiredDecisionPartiesIdentified: "Yes",
        clientRelationship: "Standard",
        stakeholders: [],
      },
      projectDefinition: {
        projectName: "Civic Affordable Housing",
        projectType: "Multi-Family Residential",
        storeys: "4",
        grossFloorArea: "32000",
        unitsRoomsBeds: "40 units",
      },
      siteLand: {
        siteStatus: "Municipality / Client Has Available Land but Site Not Assigned",
        siteAddress: "Multiple municipal parcels under evaluation",
        municipality: "Kelowna",
        candidateSiteCount: "3",
      },
      design: {
        designMaturity: "No Design",
        modularCompatibilityStatus: "Appears Compatible",
        reviewedBy: "Sales Preliminary",
      },
      budgetFundingTimeline: {
        clientBudgetProvided: "Yes",
        clientBudgetAmount: "8800000",
        classDAvailable: "No",
        fundingStatus: "Government Funding / Grant Pending",
        timelineStatus: "Realistic",
      },
      teamCommitment: {
        members: [{ id: "m1", role: "Project Manager", status: "Engaged" }],
      },
    },
  },
  {
    id: "permit-incompatible",
    name: "Permit Issued (Incompatible Grid)",
    badge: "Tech Review Required",
    intake: {
      clientAuthority: {
        clientName: "Pinnacle Urban Properties",
        clientType: "Corporation",
        primaryContactName: "David Vance",
        primaryContactRole: "Managing Partner",
        approvalPath: "David Vance has sole signing authority",
        decisionAuthorityStatus: "Confirmed",
        finalDecisionAuthorityIdentified: "Yes",
        requiredDecisionPartiesIdentified: "Yes",
        clientRelationship: "Returning",
        stakeholders: [],
      },
      projectDefinition: {
        projectName: "The Landmark Residences",
        projectType: "Multi-Family Residential",
        storeys: "5",
        grossFloorArea: "45000",
        unitsRoomsBeds: "52 units",
      },
      siteLand: {
        siteStatus: "Confirmed Site",
        siteAddress: "1250 Water Street, Kelowna",
      },
      design: {
        designMaturity: "Permit Issued",
        modularCompatibilityStatus: "Major Rework Likely",
        reviewedBy: "Engineering",
        viableCorrectivePath: "Unknown",
        designNotes: "Permit approved for cast-in-place post-tension slab. Long spans require major rework.",
      },
      budgetFundingTimeline: {
        clientBudgetProvided: "Yes",
        clientBudgetAmount: "14500000",
        classDAvailable: "No",
        fundingStatus: "Commercial Loan In Process",
        timelineStatus: "Aggressive",
      },
      teamCommitment: {
        members: [{ id: "m1", role: "Architect", status: "Engaged" }],
      },
    },
  },
  {
    id: "developer-pcs-ready",
    name: "Developer (PCS / Class D Ready)",
    badge: "PCS Ready",
    intake: {
      clientAuthority: {
        clientName: "Highline Development Corp",
        clientType: "Developer",
        primaryContactName: "Elena Rostova",
        primaryContactRole: "VP Development",
        approvalPath: "Investment Committee approved; Elena Rostova signs",
        decisionAuthorityStatus: "Confirmed",
        finalDecisionAuthorityIdentified: "Yes",
        requiredDecisionPartiesIdentified: "Yes",
        clientRelationship: "Strategic",
        stakeholders: [],
      },
      projectDefinition: {
        projectName: "Highline Commons",
        projectType: "Multi-Family Residential",
        storeys: "4",
        grossFloorArea: "28000",
        unitsRoomsBeds: "36 units",
      },
      siteLand: {
        siteStatus: "Confirmed Site",
        siteAddress: "880 Industrial Way",
      },
      design: {
        designMaturity: "Preliminary Design",
        modularCompatibilityStatus: "Appears Compatible",
        reviewedBy: "Technical",
      },
      budgetFundingTimeline: {
        clientBudgetProvided: "Yes",
        clientBudgetAmount: "9500000",
        classDAvailable: "Yes",
        classDAmount: "9200000",
        fundingStatus: "Fully Secured",
        timelineStatus: "Realistic",
      },
      teamCommitment: {
        members: [
          { id: "m1", role: "Architect", status: "Engaged" },
          { id: "m2", role: "Structural Engineer", status: "Engaged" },
        ],
      },
    },
  },
];

const BLANK_INTAKE: OpportunityIntake = {
  clientAuthority: {
    clientName: "",
    clientType: "Developer",
    primaryContactName: "",
    primaryContactRole: "",
    approvalPath: "",
    decisionAuthorityStatus: "Unknown",
    finalDecisionAuthorityIdentified: "Unknown",
    requiredDecisionPartiesIdentified: "Unknown",
    clientRelationship: "Standard",
    stakeholders: [],
  },
  projectDefinition: {
    projectName: "",
    projectType: "Multi-Family Residential",
    storeys: "",
    grossFloorArea: "",
  },
  siteLand: {
    siteStatus: "Unknown",
    siteAddress: "",
  },
  design: {
    designMaturity: "No Design",
    modularCompatibilityStatus: "Not Reviewed",
    reviewedBy: "Not Reviewed",
  },
  budgetFundingTimeline: {
    clientBudgetProvided: "Unknown",
    clientBudgetAmount: "",
    classDAvailable: "Unknown",
    fundingStatus: "Unknown",
    timelineStatus: "Realistic",
  },
  teamCommitment: { members: [] },
};

export function OpportunityNode({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const opp = useMemo(() => getOpportunityConfig(node), [node]);
  const result = useMemo(() => evaluateOpportunity(node), [node]);
  const intake = opp.intake || BLANK_INTAKE;

  const [activeTab, setActiveTab] = useState<"intake" | "presets">("intake");

  const client = intake.clientAuthority || {};
  const project = intake.projectDefinition || {};
  const site = intake.siteLand || {};
  const design = intake.design || {};
  const budget = intake.budgetFundingTimeline || {};

  const updateIntake = (mutate: (current: OpportunityIntake) => OpportunityIntake) => {
    const nextIntake = mutate(intake);
    const candidate = {
      ...node,
      config: { ...node.config, opportunity: { ...opp, intake: nextIntake } },
    };
    const evaluation = evaluateOpportunity(candidate);
    updateNode(node.id, {
      config: {
        ...node.config,
        opportunity: {
          ...opp,
          intake: nextIntake,
          evaluation: evaluationSnapshot(evaluation),
        },
      },
    });
  };

  const patch = (section: keyof OpportunityIntake, values: Record<string, unknown>) => {
    updateIntake((current) => ({
      ...current,
      [section]: { ...(current[section] || {}), ...values },
    }));
  };

  const routeColor =
    result.recommendedRoute === "PCS"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
      : result.recommendedRoute === "CONSULTATION_CSA"
        ? "bg-cyan-500/10 text-cyan-700 border-cyan-500/30"
        : result.recommendedRoute === "TECHNICAL_REVIEW"
          ? "bg-violet-500/10 text-violet-700 border-violet-500/30"
          : result.recommendedRoute === "CLASS_D"
            ? "bg-blue-500/10 text-blue-700 border-blue-500/30"
            : result.recommendedRoute === "NO_GO_ARCHIVE"
              ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
              : "bg-amber-500/10 text-amber-700 border-amber-500/30";

  return (
    <div className="relative h-full w-full select-text">
      {/* Target Handle: Input from Project Start */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3.5 !border-2 !border-background !bg-primary transition-transform hover:scale-125"
      />

      <div
        className={cn(
          "flex h-full w-[440px] flex-col rounded-2xl border bg-card text-card-foreground shadow-lg transition-all",
          selected ? "ring-2 ring-primary border-primary/60" : "hover:border-primary/40",
        )}
      >
        {/* Node Header */}
        <header className="flex items-center justify-between border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Target className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                L2 Opportunity Gate 0
              </p>
              <h3 className="truncate text-xs font-bold text-foreground">
                {client.clientName || "Opportunity Evidence Intake"}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === "presets" ? "intake" : "presets")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors",
                activeTab === "presets"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              <Sparkles className="size-3" />
              Presets
            </button>
            <ComponentNoteButton nodeId={node.id} noteKey="main" label="Evidence Intake" />
          </div>
        </header>

        {/* Presets Bar (Quick Scenarios) */}
        {activeTab === "presets" && (
          <div className="border-b bg-muted/30 p-3 animate-in fade-in duration-200">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                JF Reference Scenarios
              </span>
              <button
                type="button"
                onClick={() => {
                  updateIntake(() => BLANK_INTAKE);
                  setActiveTab("intake");
                }}
                className="text-[10px] text-rose-600 hover:underline font-medium"
              >
                Reset to Blank
              </button>
            </div>
            <div className="grid gap-1.5">
              {INTAKE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    updateIntake(() => preset.intake);
                    setActiveTab("intake");
                  }}
                  className="flex items-center justify-between rounded-lg border bg-background px-2.5 py-1.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="font-semibold text-foreground">{preset.name}</span>
                  <span className="rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                    {preset.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact Form Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-3.5 scroll-thin max-h-[600px]">
          {/* Section 1: Client & Decision Authority */}
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Users className="size-3.5 text-primary" />
                1. Client & Decision Authority
              </span>
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wide",
                  client.decisionAuthorityStatus === "Confirmed"
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                    : client.decisionAuthorityStatus === "Partially Confirmed"
                      ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                      : "bg-rose-500/10 text-rose-700 border-rose-500/30",
                )}
              >
                {client.decisionAuthorityStatus || "Unknown"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Client Entity Type
                </span>
                <select
                  value={client.clientType || "Developer"}
                  onChange={(e) => patch("clientAuthority", { clientType: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                >
                  {CLIENT_ENTITIES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Organization / Client Name
                </span>
                <input
                  type="text"
                  value={client.clientName || ""}
                  onChange={(e) => patch("clientAuthority", { clientName: e.target.value })}
                  placeholder="e.g. City of Kelowna / Apex Dev"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Decision Maker Name & Role
                </span>
                <input
                  type="text"
                  value={client.primaryContactName || ""}
                  onChange={(e) =>
                    patch("clientAuthority", {
                      primaryContactName: e.target.value,
                      decisionAuthorityStatus: e.target.value ? "Confirmed" : "Unknown",
                    })
                  }
                  placeholder="e.g. Marcus Vance, VP Development"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Approval Path / Authority
                </span>
                <input
                  type="text"
                  value={client.approvalPath || ""}
                  onChange={(e) => patch("clientAuthority", { approvalPath: e.target.value })}
                  placeholder="e.g. Board approval over $5M"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          {/* Section 2: Project Definition & Scale */}
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Building2 className="size-3.5 text-primary" />
              2. Project Definition (Class D Base)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Storeys
                </span>
                <input
                  type="number"
                  value={project.storeys || ""}
                  onChange={(e) => patch("projectDefinition", { storeys: e.target.value })}
                  placeholder="e.g. 4"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Approx. GFA (sq ft)
                </span>
                <input
                  type="text"
                  value={project.grossFloorArea || ""}
                  onChange={(e) => patch("projectDefinition", { grossFloorArea: e.target.value })}
                  placeholder="e.g. 32,000"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Units (Optional)
                </span>
                <input
                  type="text"
                  value={project.unitsRoomsBeds || ""}
                  onChange={(e) => patch("projectDefinition", { unitsRoomsBeds: e.target.value })}
                  placeholder="e.g. 36 units"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
            </div>
          </div>

          {/* Section 3: Site / Land (JF 7-State) */}
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <MapPin className="size-3.5 text-primary" />
              3. Site & Land Status
            </span>
            <select
              value={site.siteStatus || "Unknown"}
              onChange={(e) => patch("siteLand", { siteStatus: e.target.value })}
              className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            >
              {SITE_STATUSES.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Section 4: Design Maturity vs Modular Fit (Decoupled) */}
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <Compass className="size-3.5 text-primary" />
                4. Design vs Modular Compatibility
              </span>
              <span className="text-[9px] text-muted-foreground font-medium">Decoupled</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Design Maturity
                </span>
                <select
                  value={design.designMaturity || "No Design"}
                  onChange={(e) => patch("design", { designMaturity: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                >
                  {DESIGN_MATURITY_LEVELS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Modular Compatibility
                </span>
                <select
                  value={design.modularCompatibilityStatus || "Not Reviewed"}
                  onChange={(e) => patch("design", { modularCompatibilityStatus: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                >
                  {MODULAR_COMPATIBILITY.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Section 5: Budget & Reality Check */}
          <div className="rounded-xl border bg-muted/20 p-2.5 space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <DollarSign className="size-3.5 text-primary" />
              5. Budget, Funding & Class D Reality Check
            </span>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Client Budget ($)
                </span>
                <input
                  type="text"
                  value={budget.clientBudgetAmount || ""}
                  onChange={(e) =>
                    patch("budgetFundingTimeline", {
                      clientBudgetAmount: e.target.value,
                      clientBudgetProvided: e.target.value ? "Yes" : "No",
                    })
                  }
                  placeholder="e.g. 9,500,000"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Class D Benchmark ($)
                </span>
                <input
                  type="text"
                  value={budget.classDAmount || ""}
                  onChange={(e) =>
                    patch("budgetFundingTimeline", {
                      classDAmount: e.target.value,
                      classDAvailable: e.target.value ? "Yes" : "No",
                    })
                  }
                  placeholder="e.g. 9,200,000"
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  Funding Status
                </span>
                <select
                  value={budget.fundingStatus || "Unknown"}
                  onChange={(e) => patch("budgetFundingTimeline", { fundingStatus: e.target.value })}
                  className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                >
                  {FUNDING_STATUSES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>

        {/* Lightweight Result Footer */}
        <footer className="border-t bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Next Route:
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide truncate",
                  routeColor,
                )}
              >
                {opportunityRouteLabels[result.recommendedRoute]}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0 font-semibold">
              Quality Score:{" "}
              <strong className="text-foreground">{result.totalScore}/100</strong>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            {result.overallStatus === "READY" ? (
              <CheckCircle2 className="size-3 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="size-3 text-amber-600 shrink-0" />
            )}
            <span>
              {result.routeReason ||
                result.requiredActions[0] ||
                "Evidence review complete; proceeds according to rules."}
            </span>
          </p>
        </footer>
      </div>

      {/* Source Handle: Success route forward to Gate 1 */}
      <Handle
        type="source"
        position={Position.Right}
        id="pass-p1-p2"
        className="!size-3.5 !border-2 !border-background !bg-emerald-600 transition-transform hover:scale-125"
      />
    </div>
  );
}

export default OpportunityNode;
