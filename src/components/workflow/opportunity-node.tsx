"use client";

import { memo, useMemo, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileSearch,
  Landmark,
  MapPin,
  Plus,
  RefreshCcw,
  Route,
  Target,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  evaluateOpportunity,
  evaluationSnapshot,
  getOpportunityConfig,
} from "@/lib/opportunity-evaluation";
import {
  opportunityHandleIsActive,
  opportunityRouteLabels,
} from "@/lib/opportunity-routing";
import { useWorkflowStore } from "@/store/workflow-store";
import type {
  DomainNode,
  OpportunityIntake,
  OpportunityTeamMember,
  OpportunityValidationConfig,
} from "@/types/workflow";
import { ComponentNoteButton } from "./component-note-button";

const clientTypes = [
  "Individual",
  "Corporation",
  "Partnership",
  "Joint Venture",
  "Developer",
  "General Contractor",
  "Municipality",
  "Government",
  "Government Agency",
  "Institution",
  "Non-Profit",
  "Committee / Board",
  "Other",
];
const decisionRoles = [
  "Final Decision Maker",
  "Financial Approver",
  "Technical Approver",
  "Project Lead",
  "Owner / Partner",
  "Board / Committee",
  "Consultant",
  "Influencer",
  "Other",
];
const siteStatuses = [
  "Confirmed Site / Address",
  "Owned Site",
  "Controlled / Under Agreement",
  "Option / Conditional Control",
  "Candidate Site Identified",
  "Multiple Candidate Sites",
  "Municipality / Client Has Available Land but Site Not Assigned",
  "Site Being Searched",
  "No Site Identified",
  "Unknown",
];
const designMaturity = [
  "No Design",
  "Verbal Concept",
  "Sketch / Massing",
  "Concept Plans",
  "Preliminary Design",
  "Developed Design",
  "Permit Submission Set",
  "Permit Issued",
  "Construction Documents",
  "IFC / Construction Ready",
  "Other",
];
const modularStatuses = [
  "Not Reviewed",
  "Appears Compatible",
  "Requires Technical Review",
  "Partially Compatible",
  "Major Rework Likely",
  "Not Compatible",
  "Unknown",
];
const teamRoles = [
  "Architect",
  "Structural Engineer",
  "Mechanical Engineer",
  "Electrical Engineer",
  "Civil Engineer",
  "Geotechnical",
  "General Contractor",
  "Construction Manager",
  "Project Manager",
  "Quantity Surveyor",
  "Municipality",
  "Owner Representative",
  "Financing Contact",
  "Other",
];
const yesNoUnknown = ["Yes", "No", "Unknown"];
const projectTypes = [
  "Multi-Family Residential",
  "Hospitality / Hotel",
  "Student Housing",
  "Seniors Housing",
  "Workforce Housing",
  "Institutional",
  "Commercial",
  "Mixed-Use",
  "Other",
];
const routeLabels = opportunityRouteLabels;
const handleIsActive = opportunityHandleIsActive;
const screeningSteps = [
  { key: "client", label: "Client", title: "Client & Decision Authority" },
  { key: "project", label: "Project", title: "Project Definition" },
  { key: "site", label: "Site", title: "Site & Land" },
  { key: "design", label: "Design", title: "Design & Modular Compatibility" },
  { key: "budget", label: "Commercial", title: "Budget / Funding / Timeline" },
  { key: "team", label: "Team", title: "Team & Commitment" },
];
const opportunitySectionNodes = [
  {
    key: "client",
    title: "Client & Authority",
    description: "Confirm the client and approval path.",
    color: "#2563a9",
    iconKey: "person",
  },
  {
    key: "project",
    title: "Project Definition",
    description: "Capture project type and scale.",
    color: "#397d91",
    iconKey: "building",
  },
  {
    key: "site",
    title: "Site & Land",
    description: "Record site status and control.",
    color: "#177a77",
    iconKey: "flag",
  },
  {
    key: "design",
    title: "Design & Modular",
    description: "Assess design maturity and compatibility.",
    color: "#7657b5",
    iconKey: "document",
  },
  {
    key: "commercial",
    title: "Commercial Fit",
    description: "Compare budget, funding and timing.",
    color: "#9a5c24",
    iconKey: "activity",
  },
  {
    key: "team",
    title: "Team & Commitment",
    description: "Confirm client engagement signals.",
    color: "#52734d",
    iconKey: "users",
  },
] as const;

const INTAKE_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  intake: OpportunityIntake;
}> = [
  {
    id: "municipality-land-no-design",
    name: "Municipality (Land Available, No Design)",
    description: "City has land inventory, needs consultation to establish design basis. Route: Consultation / CSA.",
    intake: {
      clientAuthority: {
        clientName: "City of Kelowna Housing Authority",
        clientType: "Municipality",
        primaryContactName: "Sarah Jenkins",
        primaryContactRole: "Director of Community Development",
        decisionAuthorityStatus: "Partially Confirmed",
        finalDecisionAuthorityIdentified: "Yes",
        requiredDecisionPartiesIdentified: "Yes",
        approvalPath: "City Council approval required for land allocation and contracts over $1M",
        clientRelationship: "Standard",
        stakeholders: [
          {
            id: "s-1",
            name: "Sarah Jenkins",
            role: "Director of Community Development",
            organization: "City of Kelowna",
            email: "sjenkins@kelowna.ca",
            decisionRole: "Project Lead",
          },
          {
            id: "s-2",
            name: "Mayor & City Council",
            role: "Municipal Governance",
            organization: "City of Kelowna",
            decisionRole: "Board / Committee",
          },
        ],
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
        municipality: "Kelowna",
        province: "BC",
        candidateSiteCount: "3",
        siteControlNotes: "City owns 3 candidate parcels; allocation pending council review.",
        zoningKnown: "Unknown",
        servicingKnown: "Yes",
        accessKnown: "Yes",
      },
      design: {
        designMaturity: "No Design",
        modularCompatibilityStatus: "Appears Compatible",
        reviewedBy: "Sales Preliminary",
      },
      budgetFundingTimeline: {
        clientBudgetProvided: "Yes",
        clientBudgetAmount: "8800000",
        budgetBasis: "Total Project Target",
        classDAvailable: "No",
        fundingStatus: "Government Funding / Grant Pending",
        timelineStatus: "Realistic",
      },
      teamCommitment: {
        members: [
          {
            id: "m-1",
            name: "Sarah Jenkins",
            company: "City of Kelowna",
            role: "Project Manager",
            status: "Engaged",
          },
        ],
      },
    },
  },
  {
    id: "permit-issued-incompatible",
    name: "Permit Issued (Incompatible Modular Grid)",
    description: "Conventional design with permit issued, but structural grid and cantilevers fail modular review. Demonstrates Design Maturity vs Modular Fit separation.",
    intake: {
      clientAuthority: {
        clientName: "Pinnacle Urban Properties",
        clientType: "Corporation",
        primaryContactName: "David Vance",
        primaryContactRole: "Managing Partner",
        decisionAuthorityStatus: "Confirmed",
        finalDecisionAuthorityIdentified: "Yes",
        requiredDecisionPartiesIdentified: "Yes",
        approvalPath: "David Vance has sole signing authority",
        clientRelationship: "Returning",
        stakeholders: [
          {
            id: "s-1",
            name: "David Vance",
            role: "Managing Partner",
            organization: "Pinnacle Urban Properties",
            email: "dvance@pinnacle.com",
            decisionRole: "Final Decision Maker",
          },
        ],
      },
      projectDefinition: {
        projectName: "The Landmark Residences",
        projectType: "Multi-Family Residential",
        storeys: "5",
        grossFloorArea: "45000",
        unitsRoomsBeds: "52 units",
      },
      siteLand: {
        siteStatus: "Confirmed Site / Address",
        siteAddress: "1250 Water Street",
        municipality: "Kelowna",
        province: "BC",
        zoningKnown: "Yes",
        servicingKnown: "Yes",
        accessKnown: "Yes",
      },
      design: {
        designMaturity: "Permit Issued",
        drawingPackageAvailable: "Yes",
        architectIdentified: "Yes",
        modularCompatibilityStatus: "Major Rework Likely",
        reviewedBy: "Engineering",
        geometryModularFriendly: "No",
        transportableGeometryLikelyFeasible: "No",
        structuralConceptCompatible: "No",
        majorDesignConversionLikely: "Yes",
        viableCorrectivePath: "Unknown",
        designNotes: "Permit approved for cast-in-place post-tension slab. Long spans and corner cantilevers require substantial conversion effort.",
      },
      budgetFundingTimeline: {
        clientBudgetProvided: "Yes",
        clientBudgetAmount: "14500000",
        classDAvailable: "No",
        fundingStatus: "Commercial Loan In Process",
        timelineStatus: "Aggressive",
      },
      teamCommitment: {
        members: [
          {
            id: "m-1",
            name: "Studio Nine Architects",
            company: "Studio Nine",
            role: "Architect",
            status: "Engaged",
          },
        ],
      },
    },
  },
  {
    id: "developer-pcs-ready",
    name: "Strategic Developer (PCS / Class D Ready)",
    description: "Confirmed decision maker, preliminary modular design, confirmed site, ready for PCS / Class D reality check.",
    intake: {
      clientAuthority: {
        clientName: "Highline Development Corp",
        clientType: "Corporation",
        primaryContactName: "Elena Rostova",
        primaryContactRole: "VP Development",
        decisionAuthorityStatus: "Confirmed",
        finalDecisionAuthorityIdentified: "Yes",
        requiredDecisionPartiesIdentified: "Yes",
        approvalPath: "Investment Committee approved; Elena Rostova executes agreements",
        clientRelationship: "Strategic",
        stakeholders: [
          {
            id: "s-1",
            name: "Elena Rostova",
            role: "VP Development",
            organization: "Highline Development Corp",
            email: "elena@highline.ca",
            decisionRole: "Final Decision Maker",
          },
        ],
      },
      projectDefinition: {
        projectName: "Highline Commons",
        projectType: "Multi-Family Residential",
        storeys: "4",
        grossFloorArea: "28000",
        unitsRoomsBeds: "36 units",
      },
      siteLand: {
        siteStatus: "Confirmed Site / Address",
        siteAddress: "880 Industrial Way",
        municipality: "Kelowna",
        province: "BC",
        zoningKnown: "Yes",
        servicingKnown: "Yes",
        accessKnown: "Yes",
      },
      design: {
        designMaturity: "Preliminary Design",
        drawingPackageAvailable: "Yes",
        modularCompatibilityStatus: "Appears Compatible",
        reviewedBy: "Technical",
        geometryModularFriendly: "Yes",
        transportableGeometryLikelyFeasible: "Yes",
        structuralConceptCompatible: "Yes",
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
          {
            id: "m-1",
            name: "Kasian Architecture",
            company: "Kasian",
            role: "Architect",
            status: "Engaged",
          },
          {
            id: "m-2",
            name: "Equilibrium Engineering",
            company: "Equilibrium",
            role: "Structural Engineer",
            status: "Engaged",
          },
        ],
      },
    },
  },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  if (label === "Project Type") {
    const options =
      value && !projectTypes.includes(value)
        ? [value, ...projectTypes]
        : projectTypes;
    return (
      <SelectField
        label={label}
        value={value}
        options={options}
        onChange={onChange}
      />
    );
  }
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold text-muted-foreground">
        {label}
      </span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const style =
    normalized.includes("NO-GO") ||
    normalized === "BLOCKED" ||
    normalized === "NOT_ELIGIBLE"
      ? "bg-red-500/10 text-red-700 border-red-500/30"
      : normalized.includes("HOLD") ||
          normalized.includes("ACTION") ||
          normalized.includes("PARTIAL") ||
          normalized.includes("CONDITIONALLY")
        ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
        : normalized.includes("READY") ||
            normalized === "ELIGIBLE" ||
            normalized === "COMPLETE"
          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
          : normalized.includes("NOT_YET")
            ? "bg-slate-500/10 text-slate-600 border-slate-400/30"
            : "bg-slate-500/10 text-slate-700 border-slate-500/30";
  const fullLabel = status.replaceAll("_", " ");
  const label =
    status === "NOT_YET_ELIGIBLE"
      ? "NOT YET"
      : status === "CONDITIONALLY_ELIGIBLE"
        ? "CONDITIONAL"
        : status === "TECHNICAL REVIEW REQUIRED"
          ? "TECH REVIEW"
          : status === "ACTION REQUIRED"
            ? "ACTION"
            : fullLabel;
  return (
    <span
      title={fullLabel}
      className={cn(
        "inline-flex max-w-[122px] shrink-0 items-center justify-center rounded-full border px-1.5 py-0.5 text-center text-[8px] font-bold uppercase leading-tight tracking-wide",
        style,
      )}
    >
      {label}
    </span>
  );
}
function Section({
  title,
  subtitle,
  icon: Icon,
  status,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Users;
  status: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      data-opportunity-section={title}
      className="scroll-mt-3 overflow-hidden rounded-xl border bg-card"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-xs font-bold text-foreground">{title}</span>
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            · {subtitle}
          </span>
        </span>
        <StatusBadge status={status} />
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-3 py-3">{children}</div>}
    </section>
  );
}

function OpportunityNodeComponent({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const [open, setOpen] = useState<Record<string, boolean>>({
    client: true,
    project: true,
  });
  // Keep the complete evidence model visible by default. Optional values remain
  // optional, but users should not have to discover hidden prompts before they
  // can review or complete an Opportunity screen.
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({
    project: true,
    site: true,
    design: true,
    budget: true,
  });
  const opp = useMemo(() => getOpportunityConfig(node), [node]);
  const result = useMemo(() => evaluateOpportunity(node), [node]);
  const intake = opp.intake!;
  const updateIntake = (
    mutate: (current: OpportunityIntake) => OpportunityIntake,
  ) => {
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
  const splitIntoEvidenceNodes = () => {
    const store = useWorkflowStore.getState();
    const existingChildren = store.file.graph.nodes.filter(
      (item) =>
        item.config.opportunityParentId === node.id &&
        item.config.opportunitySection,
    );
    // Keep the action idempotent when a previous split was interrupted or a
    // persisted workflow already contains the section nodes.
    if (existingChildren.length >= opportunitySectionNodes.length) {
      const firstSectionId = opportunitySectionNodes
        .map(
          (section) =>
            existingChildren.find(
              (item) => item.config.opportunitySection === section.key,
            )?.id,
        )
        .find(Boolean);
      if (firstSectionId) {
        const incomingIds = new Set(
          store.file.graph.edges
            .filter(
              (edge) => edge.target === node.id && edge.source !== node.id,
            )
            .map((edge) => edge.id),
        );
        store.commit((file) => ({
          ...file,
          graph: {
            ...file.graph,
            edges: file.graph.edges.map((edge) =>
              incomingIds.has(edge.id)
                ? { ...edge, target: firstSectionId, targetHandle: "in" }
                : edge,
            ),
          },
        }));
      }
      store.updateNode(node.id, {
        config: {
          ...node.config,
          opportunityRole: "decisionHub",
          opportunitySectionNodeIds: existingChildren.map((item) => item.id),
        },
      });
      return;
    }
    const incomingEdges = store.file.graph.edges.filter(
      (edge) => edge.target === node.id,
    );
    const incomingEdgeIds = new Set(incomingEdges.map((edge) => edge.id));
    const sectionIds: string[] = [];
    opportunitySectionNodes.forEach((section, index) => {
      const id = store.addNode("general", {
        x: 420 + (index % 3) * 420,
        y: 180 + Math.floor(index / 3) * 320,
      });
      sectionIds.push(id);
      store.updateNode(id, {
        title: section.title,
        description: section.description,
        color: section.color,
        config: {
          stage: section.title,
          iconKey: section.iconKey,
          opportunitySection: section.key,
          opportunityParentId: node.id,
        },
      });
      // Detailed evidence nodes need enough room to expose the same fields as
      // the integrated Opportunity card; their inner pane remains scrollable.
      store.updateLayout(id, { width: 420, height: 460 }, false);
    });
    // Preserve the workflow entry point: every edge that previously entered
    // Opportunity now enters the first evidence section, while the final
    // section continues into the Decision Hub.
    // Rewire all pre-existing inputs in one commit. Doing this atomically
    // prevents rapid successive store updates from restoring the old direct
    // Project Start → Opportunity connection during Auto Arrange.
    store.commit((file) => ({
      ...file,
      graph: {
        ...file.graph,
        edges: file.graph.edges.map((edge) =>
          incomingEdgeIds.has(edge.id)
            ? { ...edge, target: sectionIds[0], targetHandle: "in" }
            : edge,
        ),
      },
    }));
    sectionIds.forEach((source, index) => {
      const target =
        index === sectionIds.length - 1 ? node.id : sectionIds[index + 1];
      store.addEdge({
        id: `opportunity-section-${crypto.randomUUID().slice(0, 8)}`,
        type: "normal",
        source,
        target,
        sourceHandle: "out",
        targetHandle: "in",
        lineStyle: "solid",
        arrowStyle: "arrow",
        customFields: {},
        label:
          index === sectionIds.length - 1 ? "Evidence complete" : undefined,
      });
    });
    store.updateNode(node.id, {
      config: {
        ...node.config,
        opportunityRole: "decisionHub",
        opportunitySectionNodeIds: sectionIds,
      },
    });
  };
  const patch = (
    section: keyof OpportunityIntake,
    values: Record<string, unknown>,
  ) =>
    updateIntake(
      (current) =>
        ({
          ...current,
          [section]: { ...(current[section] || {}), ...values },
        }) as OpportunityIntake,
    );
  const toggle = (key: string) =>
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  const focusSection = (key: string, title: string) => {
    setOpen((current) => ({ ...current, [key]: true }));
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-opportunity-section="${title}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  const client = intake.clientAuthority || {};
  const project = intake.projectDefinition || {};
  const site = intake.siteLand || {};
  const design = intake.design || {};
  const budget = intake.budgetFundingTimeline || {};
  const team = intake.teamCommitment || {};
  const sectionStatus = (section: string) => {
    if (
      section === "client" &&
      result.rules.some((rule) => rule.id === "decision-authority-unknown")
    )
      return "Blocked";
    if (
      section === "design" &&
      result.eligibility.find((item) => item.key === "TECHNICAL_REVIEW")
        ?.status === "CONDITIONALLY_ELIGIBLE"
    )
      return "Technical Review Required";
    if (
      section === "project" &&
      result.rules.some((rule) => rule.id === "project-scale-missing")
    )
      return "Action Required";
    if (
      section === "budget" &&
      result.rules.some(
        (rule) =>
          rule.category === "CONDITIONAL" &&
          ["client-budget-missing", "budget-alignment-gap"].includes(rule.id),
      )
    )
      return "Action Required";
    if (section === "client")
      return client.decisionAuthorityStatus === "Confirmed" &&
        client.requiredDecisionPartiesIdentified === "Yes" &&
        Boolean(client.clientName && client.primaryContactName)
        ? "Complete"
        : "Partial";
    if (section === "project")
      return project.storeys && project.grossFloorArea ? "Complete" : "Partial";
    if (section === "site")
      return [
        "Owned Site",
        "Confirmed Site / Address",
        "Controlled / Under Agreement",
      ].includes(site.siteStatus || "")
        ? "Complete"
        : ["No Site Identified", "Site Being Searched", "Unknown"].includes(
              site.siteStatus || "",
            )
          ? "Action Required"
          : "Partial";
    if (section === "design")
      return design.designMaturity === "No Design"
        ? "Partial"
        : design.modularCompatibilityStatus === "Appears Compatible" &&
            Boolean(design.designMaturity)
          ? "Complete"
          : "Partial";
    if (section === "budget")
      return result.budget.alignment === "Within Expected Range" &&
        Boolean(budget.fundingStatus) &&
        budget.timelineStatus === "Realistic"
        ? "Complete"
        : "Partial";
    if (section === "team")
      return (team.members || []).some(
        (person) => person.status === "Engaged",
      ) && Object.values(team).filter((value) => value === "Yes").length >= 4
        ? "Complete"
        : "Partial";
    return "Partial";
  };
  const readySectionCount = screeningSteps.filter(
    (step) => sectionStatus(step.key) === "Complete",
  ).length;
  const actionSectionCount = screeningSteps.filter((step) =>
    ["Blocked", "Action Required", "Technical Review Required"].includes(
      sectionStatus(step.key),
    ),
  ).length;
  const formattedTime = opp.evaluation?.evaluatedAt
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(opp.evaluation.evaluatedAt))
    : "Auto-evaluates on every update";
  const addStakeholder = () =>
    updateIntake((current) => ({
      ...current,
      clientAuthority: {
        ...(current.clientAuthority || {}),
        stakeholders: [
          ...(current.clientAuthority?.stakeholders || []),
          { id: crypto.randomUUID(), decisionRole: "Influencer" },
        ],
      },
    }));
  const updateStakeholder = (id: string, values: Record<string, unknown>) =>
    updateIntake((current) => ({
      ...current,
      clientAuthority: {
        ...(current.clientAuthority || {}),
        stakeholders: (current.clientAuthority?.stakeholders || []).map(
          (person) => (person.id === id ? { ...person, ...values } : person),
        ),
      },
    }));
  const deleteStakeholder = (id: string) =>
    updateIntake((current) => ({
      ...current,
      clientAuthority: {
        ...(current.clientAuthority || {}),
        stakeholders: (current.clientAuthority?.stakeholders || []).filter(
          (person) => person.id !== id,
        ),
      },
    }));
  const addMember = () =>
    updateIntake((current) => ({
      ...current,
      teamCommitment: {
        ...(current.teamCommitment || {}),
        members: [
          ...(current.teamCommitment?.members || []),
          { id: crypto.randomUUID(), status: "TBD" },
        ],
      },
    }));
  const updateMember = (id: string, values: Partial<OpportunityTeamMember>) =>
    updateIntake((current) => ({
      ...current,
      teamCommitment: {
        ...(current.teamCommitment || {}),
        members: (current.teamCommitment?.members || []).map((person) =>
          person.id === id ? { ...person, ...values } : person,
        ),
      },
    }));
  const deleteMember = (id: string) =>
    updateIntake((current) => ({
      ...current,
      teamCommitment: {
        ...(current.teamCommitment || {}),
        members: (current.teamCommitment?.members || []).filter(
          (person) => person.id !== id,
        ),
      },
    }));
  const handleScrollableWheel = (event: React.WheelEvent<HTMLElement>) => {
    const element = event.currentTarget;
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.deltaY === 0 ||
      element.scrollHeight <= element.clientHeight
    )
      return;
    // Keep the wheel inside the scroll container even at its edges. Otherwise
    // React Flow receives the leftover wheel event and starts moving/zooming
    // the canvas when the user simply meant to keep scrolling this column.
    event.stopPropagation();
  };

  return (
    <div className="relative h-full w-full overflow-visible">
      <div
        data-canvas-node
        className={cn(
          "workflow-node flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_8px_30px_rgba(15,23,42,0.14)]",
          selected && "ring-2 ring-primary/80",
        )}
      >
        <NodeResizer
          minWidth={980}
          minHeight={820}
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
        <header
          data-node-header
          className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 cursor-grab active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Target className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Opportunity Evidence Intake
              </p>
              <h3 className="truncate text-sm font-bold">
                {client.clientName ||
                  client.primaryContactName ||
                  node.title ||
                  "New opportunity"}
                {project.projectName ? ` · ${project.projectName}` : ""}
              </h3>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-2 text-[10px] text-muted-foreground xl:flex">
              <span>
                Route{" "}
                <strong className="text-foreground">
                  {routeLabels[result.recommendedRoute]}
                </strong>
              </span>
              <span>
                Score{" "}
                <strong className="text-foreground">
                  {result.totalScore}/100
                </strong>
              </span>
              <span>
                Updated{" "}
                <strong className="text-foreground">
                  {opp.evaluation?.evaluatedAt
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(opp.evaluation.evaluatedAt))
                    : "Now"}
                </strong>
              </span>
            </div>
            <StatusBadge status={result.overallStatus} />
            <ComponentNoteButton
              nodeId={node.id}
              noteKey="main"
              label={node.title || "Opportunity Evidence Intake"}
            />
          </div>
        </header>
        <div
          data-opportunity-score
          className="flex shrink-0 items-center justify-between gap-3 border-b bg-muted/25 px-4 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Management Quality Indicator
            </span>
            <strong className="text-xl leading-none">
              {result.totalScore}
              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                / 100
              </span>
            </strong>
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
              {result.scoreGrade}
            </span>
            <span className="hidden text-[10px] text-muted-foreground lg:inline">
              (Hard Rules & Eligibility dictate Route)
            </span>
          </div>
          <div className="hidden min-w-0 truncate text-[9px] text-muted-foreground md:block">
            Authority {result.scoreBreakdown.authority} · Scale{" "}
            {result.scoreBreakdown.project} · Site {result.scoreBreakdown.site}{" "}
            · Design {result.scoreBreakdown.design} · Modular{" "}
            {result.scoreBreakdown.modular} · Budget{" "}
            {result.scoreBreakdown.budget} · Funding{" "}
            {result.scoreBreakdown.fundingTimeline} · Team{" "}
            {result.scoreBreakdown.teamCommitment}
          </div>
        </div>
        {!node.config.opportunityRole && (
          <button
            type="button"
            onClick={splitIntoEvidenceNodes}
            className="mx-3 mb-2 inline-flex items-center gap-1 self-start rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
          >
            Split into 6 nodes
          </button>
        )}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_330px] divide-x overflow-hidden">
          <main
            onWheelCapture={handleScrollableWheel}
            className="nodrag min-h-0 min-w-0 overflow-y-auto overscroll-contain bg-background p-3 scroll-thin"
          >
            <div className="mb-3 rounded-xl border bg-muted/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    Sales Quick Intake{" "}
                    <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                      · Evidence first. All prompts are available for review;
                      conditional fields appear when relevant.
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {readySectionCount}/6 evidence areas complete
                    {actionSectionCount > 0
                      ? ` · ${actionSectionCount} need attention`
                      : " · No immediate gaps"}{" "}
                    · Changes re-evaluate automatically
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const evaluation = evaluateOpportunity(node);
                    updateNode(node.id, {
                      config: {
                        ...node.config,
                        opportunity: {
                          ...opp,
                          evaluation: evaluationSnapshot(evaluation),
                        },
                      },
                    });
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                >
                  <RefreshCcw className="size-3" />
                  Re-evaluate
                </button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((readySectionCount / screeningSteps.length) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/50 pt-2">
                <span className="text-[10px] font-semibold text-muted-foreground mr-1">
                  JF Presets:
                </span>
                {INTAKE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateIntake(() => preset.intake)}
                    title={preset.description}
                    className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <span>{preset.name}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateIntake(() => ({
                      clientAuthority: {
                        decisionAuthorityStatus: "Unknown",
                        clientRelationship: "Standard",
                        stakeholders: [],
                      },
                      projectDefinition: {},
                      siteLand: { siteStatus: "Unknown" },
                      design: {
                        designMaturity: "No Design",
                        modularCompatibilityStatus: "Not Reviewed",
                        reviewedBy: "Not Reviewed",
                      },
                      budgetFundingTimeline: {
                        clientBudgetProvided: "Unknown",
                        classDAvailable: "Unknown",
                        fundingStatus: "Unknown",
                        timelineStatus: "Unknown",
                      },
                      teamCommitment: { members: [] },
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded border border-dashed bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <span>Reset to Blank</span>
                </button>
              </div>
            </div>
            <div className="space-y-2.5">
              <div
                data-screening-nav
                className="mb-3 flex items-center gap-1 overflow-x-auto rounded-xl border bg-card/70 p-1.5 scroll-thin"
              >
                {screeningSteps.map((step, index) => {
                  const status = sectionStatus(step.key);
                  const tone =
                    status === "Complete"
                      ? "bg-emerald-500"
                      : status.includes("Blocked") || status.includes("Action")
                        ? "bg-rose-500"
                        : status.includes("Technical")
                          ? "bg-violet-500"
                          : "bg-amber-500";
                  return (
                    <button
                      key={step.key}
                      type="button"
                      onClick={() => focusSection(step.key, step.title)}
                      aria-label={`Open ${step.label} screening section`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full text-[9px] font-bold text-white",
                          tone,
                        )}
                      >
                        {index + 1}
                      </span>
                      <span>{step.label}</span>
                    </button>
                  );
                })}
              </div>
              <Section
                title="Client & Decision Authority"
                subtitle="Verifiable identity, contact and approval evidence"
                icon={Users}
                status={sectionStatus("client")}
                open={Boolean(open.client)}
                onToggle={() => toggle("client")}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <Field
                    label="Client / Organization Name"
                    value={client.clientName}
                    onChange={(value) =>
                      patch("clientAuthority", { clientName: value })
                    }
                  />
                  <SelectField
                    label="Client Type"
                    value={client.clientType}
                    options={clientTypes}
                    onChange={(value) =>
                      patch("clientAuthority", { clientType: value })
                    }
                  />
                  <Field
                    label="Primary Contact Name"
                    value={client.primaryContactName}
                    onChange={(value) =>
                      patch("clientAuthority", { primaryContactName: value })
                    }
                  />
                  <Field
                    label="Primary Contact Role"
                    value={client.primaryContactRole}
                    onChange={(value) =>
                      patch("clientAuthority", { primaryContactRole: value })
                    }
                  />
                  <Field
                    label="Email"
                    value={client.email}
                    onChange={(value) =>
                      patch("clientAuthority", { email: value })
                    }
                    type="email"
                  />
                  <Field
                    label="Phone"
                    value={client.phone}
                    onChange={(value) =>
                      patch("clientAuthority", { phone: value })
                    }
                  />
                  <SelectField
                    label="Decision Authority Status"
                    value={client.decisionAuthorityStatus}
                    options={["Confirmed", "Partially Confirmed", "Unknown"]}
                    onChange={(value) =>
                      patch("clientAuthority", {
                        decisionAuthorityStatus: value,
                      })
                    }
                  />
                  <SelectField
                    label="Client Relationship"
                    value={client.clientRelationship}
                    options={["Standard", "Returning", "Trusted", "Strategic"]}
                    onChange={(value) =>
                      patch("clientAuthority", { clientRelationship: value })
                    }
                  />
                </div>
                <div className="mt-3 rounded-lg bg-muted/45 p-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <SelectField
                      label="Final decision authority identified?"
                      value={client.finalDecisionAuthorityIdentified}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        patch("clientAuthority", {
                          finalDecisionAuthorityIdentified: value,
                        })
                      }
                    />
                    <SelectField
                      label="All required parties identified?"
                      value={client.requiredDecisionPartiesIdentified}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        patch("clientAuthority", {
                          requiredDecisionPartiesIdentified: value,
                        })
                      }
                    />
                    <Field
                      label="Authority / Approval Path"
                      value={client.approvalPath}
                      onChange={(value) =>
                        patch("clientAuthority", { approvalPath: value })
                      }
                      placeholder="e.g. Partner approval then board"
                    />
                    <Field
                      label="Notes"
                      value={client.notes}
                      onChange={(value) =>
                        patch("clientAuthority", { notes: value })
                      }
                      placeholder="Verifiable facts only"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Stakeholders
                    </p>
                    <button
                      type="button"
                      onClick={addStakeholder}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-primary"
                    >
                      <Plus className="size-3" />
                      Add Stakeholder
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(client.stakeholders || []).map((person) => (
                      <div
                        key={person.id}
                        className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 rounded-lg border p-2"
                      >
                        <Field
                          label="Name"
                          value={person.name}
                          onChange={(value) =>
                            updateStakeholder(person.id, { name: value })
                          }
                        />
                        <Field
                          label="Role / Title"
                          value={person.role}
                          onChange={(value) =>
                            updateStakeholder(person.id, { role: value })
                          }
                        />
                        <Field
                          label="Organization"
                          value={person.organization}
                          onChange={(value) =>
                            updateStakeholder(person.id, {
                              organization: value,
                            })
                          }
                        />
                        <SelectField
                          label="Decision Role"
                          value={person.decisionRole}
                          options={decisionRoles}
                          onChange={(value) =>
                            updateStakeholder(person.id, {
                              decisionRole: value,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => deleteStakeholder(person.id)}
                          className="mt-5 rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                          aria-label="Delete stakeholder"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                        <div className="col-span-2">
                          <Field
                            label="Email"
                            value={person.email}
                            onChange={(value) =>
                              updateStakeholder(person.id, { email: value })
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <Field
                            label="Phone"
                            value={person.phone}
                            onChange={(value) =>
                              updateStakeholder(person.id, { phone: value })
                            }
                          />
                        </div>
                      </div>
                    ))}
                    {!(client.stakeholders || []).length && (
                      <div className="rounded-lg border border-dashed bg-muted/25 p-2.5 text-[10px] leading-relaxed text-muted-foreground">
                        No additional stakeholders recorded. Add the final
                        decision maker, financial approver, technical approver,
                        board, or other required party so each person’s role and
                        contact evidence is explicit.
                      </div>
                    )}
                  </div>
                </div>
              </Section>
              <Section
                title="Project Definition"
                subtitle="Early Class D needs Storeys and approximate GFA"
                icon={Building2}
                status={sectionStatus("project")}
                open={Boolean(open.project)}
                onToggle={() => toggle("project")}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <Field
                    label="Project Name"
                    value={project.projectName}
                    onChange={(value) =>
                      patch("projectDefinition", { projectName: value })
                    }
                  />
                  <Field
                    label="Project Type"
                    value={project.projectType}
                    onChange={(value) =>
                      patch("projectDefinition", { projectType: value })
                    }
                  />
                  <Field
                    label="Number of Buildings"
                    value={project.buildingCount}
                    onChange={(value) =>
                      patch("projectDefinition", { buildingCount: value })
                    }
                  />
                  <Field
                    label="Number of Storeys"
                    value={project.storeys}
                    onChange={(value) =>
                      patch("projectDefinition", { storeys: value })
                    }
                  />
                  <Field
                    label="Approximate GFA"
                    value={project.grossFloorArea}
                    onChange={(value) =>
                      patch("projectDefinition", { grossFloorArea: value })
                    }
                    placeholder="sq ft or m²"
                  />
                  <Field
                    label="Approx. Units / Rooms / Beds"
                    value={project.unitsRoomsBeds}
                    onChange={(value) =>
                      patch("projectDefinition", { unitsRoomsBeds: value })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAdvanced((current) => ({
                      ...current,
                      project: !current.project,
                    }))
                  }
                  className="mt-3 text-[10px] font-bold text-primary"
                >
                  {advanced.project
                    ? "Hide optional inputs"
                    : "Show optional inputs"}
                </button>
                {advanced.project && (
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <Field
                      label="Known Building Dimensions"
                      value={project.buildingDimensions}
                      onChange={(value) =>
                        patch("projectDefinition", {
                          buildingDimensions: value,
                        })
                      }
                    />
                    <Field
                      label="Estimated Module Count (optional)"
                      value={project.estimatedModuleCount}
                      onChange={(value) =>
                        patch("projectDefinition", {
                          estimatedModuleCount: value,
                        })
                      }
                    />
                  </div>
                )}
              </Section>
              <Section
                title="Site & Land"
                subtitle="Record real site conditions without forcing a placeholder address"
                icon={MapPin}
                status={sectionStatus("site")}
                open={Boolean(open.site)}
                onToggle={() => toggle("site")}
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <SelectField
                    label="Site Status"
                    value={site.siteStatus}
                    options={siteStatuses}
                    onChange={(value) =>
                      patch("siteLand", { siteStatus: value })
                    }
                  />
                  {[
                    "Confirmed Site / Address",
                    "Owned Site",
                    "Controlled / Under Agreement",
                    "Option / Conditional Control",
                    "Candidate Site Identified",
                  ].includes(site.siteStatus || "") && (
                    <Field
                      label="Site Address"
                      value={site.siteAddress}
                      onChange={(value) =>
                        patch("siteLand", { siteAddress: value })
                      }
                    />
                  )}
                  <Field
                    label="Municipality"
                    value={site.municipality}
                    onChange={(value) =>
                      patch("siteLand", { municipality: value })
                    }
                  />
                  <Field
                    label="Province"
                    value={site.province}
                    onChange={(value) => patch("siteLand", { province: value })}
                  />
                  {site.siteStatus === "Multiple Candidate Sites" && (
                    <Field
                      label="Number of Candidate Sites"
                      value={site.candidateSiteCount}
                      onChange={(value) =>
                        patch("siteLand", { candidateSiteCount: value })
                      }
                    />
                  )}
                  <Field
                    label="Site Owner"
                    value={site.siteOwner}
                    onChange={(value) =>
                      patch("siteLand", { siteOwner: value })
                    }
                  />
                  <Field
                    label="Site Control Notes"
                    value={site.siteControlNotes}
                    onChange={(value) =>
                      patch("siteLand", { siteControlNotes: value })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAdvanced((current) => ({
                      ...current,
                      site: !current.site,
                    }))
                  }
                  className="mt-3 text-[10px] font-bold text-primary"
                >
                  {advanced.site
                    ? "Hide site review"
                    : "Show high-level site review"}
                </button>
                {advanced.site && (
                  <div className="mt-2 grid grid-cols-3 gap-2.5 rounded-lg bg-muted/45 p-2.5">
                    {[
                      ["Zoning Known?", "zoningKnown"],
                      ["Servicing Known?", "servicingKnown"],
                      ["Access Known?", "accessKnown"],
                      ["Foundation Concept Known?", "foundationConceptKnown"],
                      [
                        "Crane / Setting Access Known?",
                        "craneSettingAccessKnown",
                      ],
                      [
                        "Transportation Constraints Known?",
                        "transportationConstraintsKnown",
                      ],
                    ].map(([label, key]) => (
                      <SelectField
                        key={key}
                        label={label}
                        value={site[key as keyof typeof site] as string}
                        options={yesNoUnknown}
                        onChange={(value) =>
                          patch("siteLand", { [key]: value })
                        }
                      />
                    ))}
                    <SelectField
                      label="Fatal constraint resolvable?"
                      value={site.fatalConstraintResolvable}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        patch("siteLand", { fatalConstraintResolvable: value })
                      }
                    />
                    <label className="mt-5 flex items-center gap-2 text-[10px] font-semibold">
                      <input
                        type="checkbox"
                        checked={Boolean(site.fatalConstraintConfirmed)}
                        onChange={(event) =>
                          patch("siteLand", {
                            fatalConstraintConfirmed: event.target.checked,
                          })
                        }
                      />
                      Confirmed fatal site / transport constraint
                    </label>
                  </div>
                )}
              </Section>
              <Section
                title="Design & Modular Compatibility"
                subtitle="Design maturity and modular compatibility are intentionally separate"
                icon={FileSearch}
                status={sectionStatus("design")}
                open={Boolean(open.design)}
                onToggle={() => toggle("design")}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      Design Maturity
                    </p>
                    <div className="space-y-2">
                      <SelectField
                        label="Design Maturity"
                        value={design.designMaturity}
                        options={designMaturity}
                        onChange={(value) =>
                          patch("design", { designMaturity: value })
                        }
                      />
                      <SelectField
                        label="Drawing Package Available"
                        value={design.drawingPackageAvailable}
                        options={yesNoUnknown}
                        onChange={(value) =>
                          patch("design", { drawingPackageAvailable: value })
                        }
                      />
                      <SelectField
                        label="Architect Identified"
                        value={design.architectIdentified}
                        options={yesNoUnknown}
                        onChange={(value) =>
                          patch("design", { architectIdentified: value })
                        }
                      />
                      <Field
                        label="Drawing Revision"
                        value={design.drawingRevision}
                        onChange={(value) =>
                          patch("design", { drawingRevision: value })
                        }
                      />
                      <Field
                        label="Drawing Date"
                        value={design.drawingDate}
                        type="date"
                        onChange={(value) =>
                          patch("design", { drawingDate: value })
                        }
                      />
                      <Field
                        label="Design Notes"
                        value={design.designNotes}
                        placeholder="Evidence, assumptions, or open items"
                        onChange={(value) =>
                          patch("design", { designNotes: value })
                        }
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                      Modular Compatibility
                    </p>
                    <div className="space-y-2">
                      <SelectField
                        label="Modular Compatibility Status"
                        value={design.modularCompatibilityStatus}
                        options={modularStatuses}
                        onChange={(value) =>
                          patch("design", { modularCompatibilityStatus: value })
                        }
                      />
                      <SelectField
                        label="Reviewed By"
                        value={design.reviewedBy}
                        options={[
                          "Sales Preliminary",
                          "Technical",
                          "Engineering",
                          "Not Reviewed",
                        ]}
                        onChange={(value) =>
                          patch("design", { reviewedBy: value })
                        }
                      />
                      {design.modularCompatibilityStatus ===
                        "Not Compatible" && (
                        <SelectField
                          label="Viable Corrective Path?"
                          value={design.viableCorrectivePath}
                          options={yesNoUnknown}
                          onChange={(value) =>
                            patch("design", { viableCorrectivePath: value })
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAdvanced((current) => ({
                      ...current,
                      design: !current.design,
                    }))
                  }
                  className="mt-3 text-[10px] font-bold text-primary"
                >
                  {advanced.design
                    ? "Hide technical prompts"
                    : "Show technical prompts"}
                </button>
                {advanced.design && (
                  <div className="mt-2 grid grid-cols-3 gap-2.5 rounded-lg bg-muted/45 p-2.5">
                    {[
                      ["Geometry modular-friendly?", "geometryModularFriendly"],
                      [
                        "Transportable geometry likely feasible?",
                        "transportableGeometryLikelyFeasible",
                      ],
                      [
                        "Site access appears feasible?",
                        "siteAccessLikelyFeasible",
                      ],
                      [
                        "Crane / setting concept feasible?",
                        "craneSettingConceptFeasible",
                      ],
                      [
                        "Structural concept compatible?",
                        "structuralConceptCompatible",
                      ],
                      [
                        "Major design conversion likely required?",
                        "majorDesignConversionLikely",
                      ],
                    ].map(([label, key]) => (
                      <SelectField
                        key={key}
                        label={label}
                        value={design[key as keyof typeof design] as string}
                        options={[...yesNoUnknown, "Technical Review Required"]}
                        onChange={(value) => patch("design", { [key]: value })}
                      />
                    ))}
                  </div>
                )}
              </Section>
              <Section
                title="Budget / Funding / Timeline"
                subtitle="Compare real client evidence to Class D only when both exist"
                icon={Landmark}
                status={sectionStatus("budget")}
                open={Boolean(open.budget)}
                onToggle={() => toggle("budget")}
              >
                <div className="grid grid-cols-3 gap-2.5">
                  <SelectField
                    label="Client Budget Provided?"
                    value={budget.clientBudgetProvided}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      patch("budgetFundingTimeline", {
                        clientBudgetProvided: value,
                      })
                    }
                  />
                  {budget.clientBudgetProvided === "Yes" && (
                    <>
                      <Field
                        label="Client Budget Amount"
                        value={budget.clientBudgetAmount}
                        onChange={(value) =>
                          patch("budgetFundingTimeline", {
                            clientBudgetAmount: value,
                          })
                        }
                      />
                      <Field
                        label="Client Budget Range — Low"
                        value={budget.clientBudgetRangeLow}
                        onChange={(value) =>
                          patch("budgetFundingTimeline", {
                            clientBudgetRangeLow: value,
                          })
                        }
                      />
                      <Field
                        label="Client Budget Range — High"
                        value={budget.clientBudgetRangeHigh}
                        onChange={(value) =>
                          patch("budgetFundingTimeline", {
                            clientBudgetRangeHigh: value,
                          })
                        }
                      />
                    </>
                  )}
                  <SelectField
                    label="Budget Basis"
                    value={budget.budgetBasis}
                    options={[
                      "Modules Only",
                      "Construction",
                      "Site Work",
                      "Soft Costs",
                      "Total Project",
                      "Unknown",
                      "Other",
                    ]}
                    onChange={(value) =>
                      patch("budgetFundingTimeline", { budgetBasis: value })
                    }
                  />
                  <SelectField
                    label="Class D Available?"
                    value={budget.classDAvailable}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      patch("budgetFundingTimeline", { classDAvailable: value })
                    }
                  />
                  {budget.classDAvailable === "Yes" && (
                    <>
                      <Field
                        label="Class D Amount"
                        value={budget.classDAmount}
                        onChange={(value) =>
                          patch("budgetFundingTimeline", {
                            classDAmount: value,
                          })
                        }
                      />
                      <Field
                        label="Class D Date"
                        value={budget.classDDate}
                        type="date"
                        onChange={(value) =>
                          patch("budgetFundingTimeline", { classDDate: value })
                        }
                      />
                      <Field
                        label="Class D Revision"
                        value={budget.classDRevision}
                        onChange={(value) =>
                          patch("budgetFundingTimeline", {
                            classDRevision: value,
                          })
                        }
                      />
                    </>
                  )}
                  <SelectField
                    label="Funding Status"
                    value={budget.fundingStatus}
                    options={[
                      "Fully Secured",
                      "Partially Secured",
                      "Financing Approved",
                      "Financing In Process",
                      "Grant Funding",
                      "Government Funding",
                      "Equity",
                      "Loan",
                      "Mixed Funding",
                      "Funding Strategy Identified",
                      "Not Secured",
                      "Unknown",
                    ]}
                    onChange={(value) =>
                      patch("budgetFundingTimeline", { fundingStatus: value })
                    }
                  />
                  <SelectField
                    label="Timeline Status"
                    value={budget.timelineStatus}
                    options={[
                      "Realistic",
                      "Aggressive",
                      "Unrealistic",
                      "Unknown",
                      "Requires Review",
                    ]}
                    onChange={(value) =>
                      patch("budgetFundingTimeline", { timelineStatus: value })
                    }
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2.5 text-[10px]">
                  <div>
                    <span className="block text-muted-foreground">
                      Client Budget
                    </span>
                    <strong>
                      {result.budget.clientBudget
                        ? result.budget.clientBudget.toLocaleString()
                        : "Not available"}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">
                      Class D Benchmark
                    </span>
                    <strong>
                      {result.budget.classD
                        ? result.budget.classD.toLocaleString()
                        : "Class D Not Available"}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">
                      Variance / Alignment
                    </span>
                    <strong>
                      {result.budget.variance === undefined
                        ? result.budget.alignment
                        : `${result.budget.variance.toFixed(1)}% · ${result.budget.alignment}`}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAdvanced((current) => ({
                      ...current,
                      budget: !current.budget,
                    }))
                  }
                  className="mt-3 text-[10px] font-bold text-primary"
                >
                  {advanced.budget
                    ? "Hide schedule inputs"
                    : "Show schedule inputs"}
                </button>
                {advanced.budget && (
                  <div className="mt-2 grid grid-cols-3 gap-2.5">
                    {[
                      ["Target Design Start", "targetDesignStart"],
                      ["Target Permit", "targetPermit"],
                      ["Target Construction Start", "targetConstructionStart"],
                      ["Target Production", "targetProduction"],
                      ["Target Delivery", "targetDelivery"],
                      ["Target Occupancy", "targetOccupancy"],
                    ].map(([label, key]) => (
                      <Field
                        key={key}
                        label={label}
                        type="date"
                        value={budget[key as keyof typeof budget] as string}
                        onChange={(value) =>
                          patch("budgetFundingTimeline", { [key]: value })
                        }
                      />
                    ))}
                  </div>
                )}
              </Section>
              <Section
                title="Team & Commitment"
                subtitle="People and evidence, not subjective seriousness scores"
                icon={UserRoundCheck}
                status={sectionStatus("team")}
                open={Boolean(open.team)}
                onToggle={() => toggle("team")}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    Project Team Members
                  </p>
                  <button
                    type="button"
                    onClick={addMember}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-primary"
                  >
                    <Plus className="size-3" />
                    Add Team Member
                  </button>
                </div>
                <div className="space-y-2">
                  {(team.members || []).map((person) => (
                    <div
                      key={person.id}
                      className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 rounded-lg border p-2"
                    >
                      <Field
                        label="Name"
                        value={person.name}
                        onChange={(value) =>
                          updateMember(person.id, { name: value })
                        }
                      />
                      <Field
                        label="Company"
                        value={person.company}
                        onChange={(value) =>
                          updateMember(person.id, { company: value })
                        }
                      />
                      <SelectField
                        label="Role"
                        value={person.role}
                        options={teamRoles}
                        onChange={(value) =>
                          updateMember(person.id, {
                            role: value as OpportunityTeamMember["role"],
                          })
                        }
                      />
                      <SelectField
                        label="Status"
                        value={person.status}
                        options={[
                          "Engaged",
                          "Proposed",
                          "TBD",
                          "Not Required",
                          "Unknown",
                        ]}
                        onChange={(value) =>
                          updateMember(person.id, {
                            status: value as OpportunityTeamMember["status"],
                          })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => deleteMember(person.id)}
                        className="mt-5 rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                        aria-label="Delete team member"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5 rounded-lg bg-muted/45 p-2.5">
                  {[
                    ["Client attended meetings?", "clientAttendedMeetings"],
                    ["Client provided documents?", "clientProvidedDocuments"],
                    ["Client provided budget?", "clientProvidedBudget"],
                    [
                      "Client assigned project contact?",
                      "clientAssignedProjectContact",
                    ],
                    ["Client engaged consultants?", "clientEngagedConsultants"],
                    [
                      "Client requested formal next step?",
                      "clientRequestedFormalNextStep",
                    ],
                    [
                      "Client accepted paid early work?",
                      "clientAcceptedPaidEarlyWork",
                    ],
                    [
                      "Client responds to information requests?",
                      "clientRespondsToRequests",
                    ],
                  ].map(([label, key]) => (
                    <SelectField
                      key={key}
                      label={label}
                      value={team[key as keyof typeof team] as string}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        patch("teamCommitment", { [key]: value })
                      }
                    />
                  ))}
                </div>
              </Section>
            </div>
          </main>
          <aside
            onWheelCapture={handleScrollableWheel}
            className="nodrag min-h-0 overflow-y-auto overscroll-contain bg-muted/20 p-3 scroll-thin"
          >
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Overall Status
                </p>
                <div className="mt-1.5">
                  <StatusBadge status={result.overallStatus} />
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Commercial Engagement:{" "}
                  <strong className="text-foreground">
                    {result.commercialEngagement}
                  </strong>
                </p>
              </div>
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Route className="size-3.5" />
                  Recommended Next Step
                </div>
                <p className="mt-1.5 text-sm font-extrabold">
                  {routeLabels[result.recommendedRoute]}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {result.routeReason}
                </p>
                {result.otherEligibleRoutes.length > 0 && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Other eligible routes:{" "}
                    <strong className="text-foreground">
                      {result.otherEligibleRoutes
                        .map((route) => routeLabels[route])
                        .join(" · ")}
                    </strong>
                  </p>
                )}
              </div>
              <SummaryList title="Eligible For" icon={CheckCircle2}>
                {result.eligibility.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-border/70 bg-background/50 p-2"
                  >
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <span className="min-w-0 text-[10px] font-semibold leading-tight">
                        {item.label}
                      </span>
                      <StatusBadge status={item.status} />
                    </div>
                    {item.reasons.length > 0 && (
                      <p className="mt-1 text-[9px] leading-snug text-muted-foreground">
                        {item.reasons.join(" ")}
                      </p>
                    )}
                  </div>
                ))}
              </SummaryList>
              {result.rules.filter((rule) => rule.category === "HARD").length >
                0 && (
                <SummaryList title="Blocking Issues" icon={CircleAlert}>
                  {result.rules
                    .filter((rule) => rule.category === "HARD")
                    .map((rule) => (
                      <div
                        key={rule.id}
                        className="rounded-md border border-red-500/25 bg-red-500/5 p-2 text-[10px]"
                      >
                        <strong className="block text-red-700">
                          {rule.name}
                        </strong>
                        <span className="text-muted-foreground">
                          {rule.message}
                        </span>
                      </div>
                    ))}
                </SummaryList>
              )}
              <SummaryList title="Required Next Actions" icon={ChevronRight}>
                {result.requiredActions.length ? (
                  <ol className="space-y-1.5 pl-4 text-[10px] text-foreground">
                    {result.requiredActions.map((action) => (
                      <li key={action} className="list-decimal pl-0.5">
                        {action}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-[10px] text-emerald-700">
                    No immediate evidence action is required.
                  </p>
                )}
              </SummaryList>
              {result.riskFlags.length > 0 && (
                <SummaryList title="Risk Flags" icon={AlertTriangle}>
                  {result.riskFlags.map((flag) => (
                    <div
                      key={flag}
                      className="flex items-center gap-1.5 text-[10px] text-amber-800"
                    >
                      <AlertTriangle className="size-3 shrink-0" />
                      {flag}
                    </div>
                  ))}
                </SummaryList>
              )}
              <div className="rounded-xl border bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Opportunity Score
                </p>
                <div className="mt-1 flex items-end gap-2">
                  <strong className="text-2xl leading-none">
                    {result.totalScore}
                  </strong>
                  <span className="pb-0.5 text-xs text-muted-foreground">
                    / 100 · {result.scoreGrade}
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Management indicator only. It cannot override a Hard Rule,
                  Overall Status, or route.
                </p>
              </div>
              <p className="text-center text-[9px] text-muted-foreground">
                Last evaluated: {formattedTime}
              </p>
            </div>
          </aside>
        </div>
        <footer className="border-t bg-muted/35 px-4 py-2 text-[10px] text-muted-foreground">
          Evidence → Rules → Eligibility → Route → Score → Overall Status →
          Required Next Actions · L2 screening only; G1 remains separately
          governed.
        </footer>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        id="in-rework"
        style={{ left: "50%" }}
        title="Re-evaluate opportunity"
        className="!top-[-8px] !z-50 !size-4 !border-2 !border-background !bg-amber-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        title="Main Input"
        className="!left-[-8px] !z-50 !size-4 !border-2 !border-background !bg-primary"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="pass-p1-p2"
        style={{ top: "12%" }}
        title="P1 · Gate 1 passed"
        className={cn(
          "!right-0 !z-50 !size-4 !border-2 !border-background",
          handleIsActive(result, "pass-p1-p2")
            ? "!bg-emerald-500"
            : "!bg-emerald-500/55",
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="loi-governed"
        style={{ top: "28%" }}
        title="P2 · Strong qualified"
        className={cn(
          "!right-0 !z-50 !size-4 !border-2 !border-background",
          handleIsActive(result, "loi-governed")
            ? "!bg-blue-500"
            : "!bg-blue-500/55",
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="csa-pcs"
        style={{ top: "44%" }}
        title="P3 · CSA / PCS route"
        className={cn(
          "!right-0 !z-50 !size-4 !border-2 !border-background",
          handleIsActive(result, "csa-pcs")
            ? "!bg-cyan-500"
            : "!bg-cyan-500/55",
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="site-feasibility"
        style={{ top: "60%" }}
        title="P4 · Site feasibility / technical hold"
        className={cn(
          "!right-0 !z-50 !size-4 !border-2 !border-background",
          handleIsActive(result, "site-feasibility")
            ? "!bg-amber-500"
            : "!bg-amber-500/55",
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="nogo-disqualified"
        style={{ top: "76%" }}
        title="P5 · No-Go / disqualified"
        className={cn(
          "!right-0 !z-50 !size-4 !border-2 !border-background",
          handleIsActive(result, "nogo-disqualified")
            ? "!bg-red-500"
            : "!bg-red-500/55",
        )}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="path-loi"
        style={{ top: "92%" }}
        title="PI · Governed LOI"
        className={cn(
          "!right-0 !z-50 !size-4 !border-2 !border-background",
          handleIsActive(result, "path-loi")
            ? "!bg-violet-500"
            : "!bg-violet-500/55",
        )}
      />
    </div>
  );
}
function SummaryList({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
export const OpportunityNode = memo(OpportunityNodeComponent);
