"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileSearch,
  MapPin,
  Plus,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  evaluateOpportunity,
  evaluationSnapshot,
  getOpportunityConfig,
} from "@/lib/opportunity-evaluation";
import { useWorkflowStore } from "@/store/workflow-store";
import type {
  DomainNode,
  OpportunityIntake,
  OpportunityStakeholder,
  OpportunityTeamMember,
} from "@/types/workflow";

type OpportunitySectionKey = NonNullable<
  DomainNode["config"]["opportunitySection"]
>;
type FieldValue = string | number | undefined;

const sectionMeta: Record<
  OpportunitySectionKey,
  { title: string; subtitle: string; color: string; icon: LucideIcon }
> = {
  client: {
    title: "Client & Authority",
    subtitle: "Who can approve the work?",
    color: "#2563a9",
    icon: Users,
  },
  project: {
    title: "Project Definition",
    subtitle: "What is being delivered?",
    color: "#397d91",
    icon: Building2,
  },
  site: {
    title: "Site & Land",
    subtitle: "Is the site real and controlled?",
    color: "#177a77",
    icon: MapPin,
  },
  design: {
    title: "Design & Modular",
    subtitle: "How ready and compatible is the design?",
    color: "#7657b5",
    icon: FileSearch,
  },
  commercial: {
    title: "Commercial Fit",
    subtitle: "Budget, funding and timing",
    color: "#9a5c24",
    icon: DollarSign,
  },
  team: {
    title: "Team & Commitment",
    subtitle: "Is the client ready to engage?",
    color: "#52734d",
    icon: CalendarClock,
  },
};

const yesNoUnknown = ["Yes", "No", "Unknown"];
const selectOptions: Record<string, string[]> = {
  clientType: [
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
  ],
  decisionAuthorityStatus: ["Confirmed", "Partially Confirmed", "Unknown"],
  clientRelationship: ["Standard", "Returning", "Trusted", "Strategic"],
  decisionRole: [
    "Final Decision Maker",
    "Financial Approver",
    "Technical Approver",
    "Project Lead",
    "Owner / Partner",
    "Board / Committee",
    "Consultant",
    "Influencer",
    "Other",
  ],
  projectType: [
    "Multi-Family Residential",
    "Hospitality / Hotel",
    "Student Housing",
    "Seniors Housing",
    "Workforce Housing",
    "Institutional",
    "Commercial",
    "Mixed-Use",
    "Other",
  ],
  siteStatus: [
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
  ],
  designMaturity: [
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
  ],
  modularCompatibilityStatus: [
    "Not Reviewed",
    "Appears Compatible",
    "Requires Technical Review",
    "Partially Compatible",
    "Major Rework Likely",
    "Not Compatible",
    "Unknown",
  ],
  reviewedBy: ["Sales Preliminary", "Technical", "Engineering", "Not Reviewed"],
  fundingStatus: [
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
  ],
  timelineStatus: [
    "Realistic",
    "Aggressive",
    "Unrealistic",
    "Unknown",
    "Requires Review",
  ],
  teamRole: [
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
  ],
  teamStatus: ["Engaged", "Proposed", "TBD", "Not Required", "Unknown"],
};

function CompactField({
  label,
  value,
  options,
  onChange,
  type = "select",
}: {
  label: string;
  value?: FieldValue;
  options?: string[];
  onChange: (value: string) => void;
  type?: "select" | "text" | "date";
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold text-muted-foreground">
        {label}
      </span>
      {type === "text" || type === "date" ? (
        <input
          type={type}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
        />
      ) : (
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none focus:border-primary"
        >
          <option value="">Select…</option>
          {(options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

function MoreButton({
  open,
  onClick,
  children,
}: {
  open: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
    >
      {open ? (
        <ChevronDown className="size-3" />
      ) : (
        <ChevronRight className="size-3" />
      )}
      {open ? "Hide" : "Show"} {children}
    </button>
  );
}

function OpportunitySectionNodeComponent({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const section = node.config.opportunitySection || "client";
  const meta = sectionMeta[section];
  const Icon = meta.icon;
  // Split nodes are the detailed editing surface. Keep the complete evidence
  // set visible on first open, while still allowing the user to collapse it.
  const [expanded, setExpanded] = useState(true);
  const parent = useWorkflowStore(
    (state) =>
      state.file.graph.nodes.find(
        (item) => item.id === node.config.opportunityParentId,
      ) ||
      state.file.graph.nodes.find(
        (item) => item.type === "opportunityValidation",
      ),
  );
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const layout = useWorkflowStore((state) => state.file.layout.nodes[node.id]);
  const opp = useMemo(
    () => (parent ? getOpportunityConfig(parent) : undefined),
    [parent],
  );
  const intake = opp?.intake || {};
  const intakeKey = (
    section === "commercial"
      ? "budgetFundingTimeline"
      : section === "client"
        ? "clientAuthority"
        : section === "project"
          ? "projectDefinition"
          : section === "site"
            ? "siteLand"
            : section
  ) as keyof OpportunityIntake;
  const current = (intake[intakeKey] || {}) as Record<string, unknown>;
  const result = useMemo(
    () => (parent ? evaluateOpportunity(parent) : undefined),
    [parent],
  );

  useEffect(() => {
    const root = document.querySelector(`[data-id="${node.id}"]`);
    if (!root) return;
    const stopCanvasWheel = (event: Event) => {
      const wheel = event as WheelEvent;
      if (!wheel.ctrlKey && !wheel.metaKey && wheel.deltaY !== 0)
        event.stopPropagation();
    };
    root.addEventListener("wheel", stopCanvasWheel, { capture: true });
    return () =>
      root.removeEventListener("wheel", stopCanvasWheel, { capture: true });
  }, [node.id]);

  // Migrate previously-created split cards from the compact 360×250 preset
  // so the full evidence form is immediately readable without resizing.
  useEffect(() => {
    if (layout && (layout.width < 420 || layout.height < 460)) {
      useWorkflowStore
        .getState()
        .updateLayout(node.id, { width: 420, height: 460 }, false);
    }
  }, [layout, node.id]);

  const updateShared = (values: Record<string, unknown>) => {
    if (!parent || !opp) return;
    const nextIntake = {
      ...intake,
      [intakeKey]: { ...current, ...values },
    } as OpportunityIntake;
    const candidate = {
      ...parent,
      config: { ...parent.config, opportunity: { ...opp, intake: nextIntake } },
    };
    updateNode(parent.id, {
      config: {
        ...parent.config,
        opportunity: {
          ...opp,
          intake: nextIntake,
          evaluation: evaluationSnapshot(evaluateOpportunity(candidate)),
        },
      },
    });
  };
  const updateList = (key: "stakeholders" | "members", values: unknown[]) =>
    updateShared({ [key]: values });
  const addStakeholder = () =>
    updateList("stakeholders", [
      ...((current.stakeholders as OpportunityStakeholder[] | undefined) || []),
      { id: crypto.randomUUID(), decisionRole: "Influencer" },
    ]);
  const addTeamMember = () =>
    updateList("members", [
      ...((current.members as OpportunityTeamMember[] | undefined) || []),
      { id: crypto.randomUUID(), status: "TBD" },
    ]);
  const stakeholders =
    (current.stakeholders as OpportunityStakeholder[] | undefined) || [];
  const members =
    (current.members as OpportunityTeamMember[] | undefined) || [];
  const complete =
    section === "client"
      ? current.decisionAuthorityStatus === "Confirmed" &&
        current.requiredDecisionPartiesIdentified === "Yes" &&
        Boolean(current.clientName && current.primaryContactName)
      : section === "project"
        ? Boolean(current.storeys && current.grossFloorArea)
        : section === "site"
          ? [
              "Owned Site",
              "Confirmed Site / Address",
              "Controlled / Under Agreement",
            ].includes(String(current.siteStatus))
          : section === "design"
            ? Boolean(
                current.designMaturity &&
                current.modularCompatibilityStatus === "Appears Compatible",
              )
            : section === "commercial"
              ? current.clientBudgetProvided === "Yes" &&
                current.classDAvailable === "Yes" &&
                current.fundingStatus === "Fully Secured" &&
                current.timelineStatus === "Realistic"
              : Boolean(
                  members.some((member) => member.status === "Engaged") ||
                  current.clientAttendedMeetings === "Yes",
                );
  if (!parent) return null;

  return (
    <div className="relative h-full w-full overflow-visible">
      <div
        data-canvas-node
        className={cn(
          "workflow-node flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-[0_6px_18px_rgba(15,23,42,.1)]",
          selected && "ring-2 ring-primary/80",
        )}
        style={{ borderColor: `${meta.color}66` }}
      >
        <NodeResizer
          minWidth={320}
          minHeight={228}
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
          className="flex items-center gap-2 border-b px-3 py-2.5"
          style={{ backgroundColor: `${meta.color}10` }}
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: meta.color }}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold">{meta.title}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {meta.subtitle}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase",
              complete
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                : "border-amber-500/30 bg-amber-500/10 text-amber-700",
            )}
          >
            {complete ? "Complete" : "Action"}
          </span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 overscroll-contain">
          {section === "client" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <CompactField
                  label="Client / Organization"
                  value={current.clientName as string}
                  type="text"
                  onChange={(value) => updateShared({ clientName: value })}
                />
                <CompactField
                  label="Client Type"
                  value={current.clientType as string}
                  options={selectOptions.clientType}
                  onChange={(value) => updateShared({ clientType: value })}
                />
                <CompactField
                  label="Decision Authority"
                  value={current.decisionAuthorityStatus as string}
                  options={selectOptions.decisionAuthorityStatus}
                  onChange={(value) =>
                    updateShared({ decisionAuthorityStatus: value })
                  }
                />
                <CompactField
                  label="Client Relationship"
                  value={current.clientRelationship as string}
                  options={selectOptions.clientRelationship}
                  onChange={(value) =>
                    updateShared({ clientRelationship: value })
                  }
                />
              </div>
              <MoreButton
                open={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                approval evidence
              </MoreButton>
              {expanded && (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <CompactField
                      label="Final Authority Identified"
                      value={current.finalDecisionAuthorityIdentified as string}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        updateShared({
                          finalDecisionAuthorityIdentified: value,
                        })
                      }
                    />
                    <CompactField
                      label="Required Parties Identified"
                      value={
                        current.requiredDecisionPartiesIdentified as string
                      }
                      options={yesNoUnknown}
                      onChange={(value) =>
                        updateShared({
                          requiredDecisionPartiesIdentified: value,
                        })
                      }
                    />
                  </div>
                  <div className="mt-2">
                    <CompactField
                      label="Approval Path"
                      value={current.approvalPath as string}
                      type="text"
                      onChange={(value) =>
                        updateShared({ approvalPath: value })
                      }
                    />
                    <div className="mt-2">
                      <CompactField
                        label="Notes"
                        value={current.notes as string}
                        type="text"
                        onChange={(value) => updateShared({ notes: value })}
                      />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        Approval roster
                      </span>
                      <button
                        type="button"
                        onClick={addStakeholder}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                      >
                        <Plus className="size-3" />
                        Add
                      </button>
                    </div>
                    {stakeholders.map((person) => (
                      <div
                        key={person.id}
                        className="space-y-1 rounded-md border bg-muted/20 p-1.5"
                      >
                        <div className="grid grid-cols-2 gap-1.5">
                          <CompactField
                            label="Name"
                            value={person.name}
                            type="text"
                            onChange={(value) =>
                              updateList(
                                "stakeholders",
                                stakeholders.map((item) =>
                                  item.id === person.id
                                    ? { ...item, name: value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <CompactField
                            label="Role / Title"
                            value={person.role}
                            type="text"
                            onChange={(value) =>
                              updateList(
                                "stakeholders",
                                stakeholders.map((item) =>
                                  item.id === person.id
                                    ? { ...item, role: value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <CompactField
                            label="Organization"
                            value={person.organization}
                            type="text"
                            onChange={(value) =>
                              updateList(
                                "stakeholders",
                                stakeholders.map((item) =>
                                  item.id === person.id
                                    ? { ...item, organization: value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <CompactField
                            label="Decision Role"
                            value={person.decisionRole}
                            options={selectOptions.decisionRole}
                            onChange={(value) =>
                              updateList(
                                "stakeholders",
                                stakeholders.map((item) =>
                                  item.id === person.id
                                    ? { ...item, decisionRole: value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <CompactField
                            label="Email"
                            value={person.email}
                            type="text"
                            onChange={(value) =>
                              updateList(
                                "stakeholders",
                                stakeholders.map((item) =>
                                  item.id === person.id
                                    ? { ...item, email: value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <CompactField
                            label="Phone"
                            value={person.phone}
                            type="text"
                            onChange={(value) =>
                              updateList(
                                "stakeholders",
                                stakeholders.map((item) =>
                                  item.id === person.id
                                    ? { ...item, phone: value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${person.name || "stakeholder"}`}
                          onClick={() =>
                            updateList(
                              "stakeholders",
                              stakeholders.filter(
                                (item) => item.id !== person.id,
                              ),
                            )
                          }
                          className="inline-flex h-7 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-red-600"
                        >
                          <Trash2 className="size-3" /> Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {section === "project" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <CompactField
                  label="Project Name"
                  value={current.projectName as string}
                  type="text"
                  onChange={(value) => updateShared({ projectName: value })}
                />
                <CompactField
                  label="Project Type"
                  value={current.projectType as string}
                  options={selectOptions.projectType}
                  onChange={(value) => updateShared({ projectType: value })}
                />
                <CompactField
                  label="Storeys"
                  value={current.storeys as string}
                  type="text"
                  onChange={(value) => updateShared({ storeys: value })}
                />
                <CompactField
                  label="Approx. GFA"
                  value={current.grossFloorArea as string}
                  type="text"
                  onChange={(value) => updateShared({ grossFloorArea: value })}
                />
              </div>
              <MoreButton
                open={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                scale details
              </MoreButton>
              {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <CompactField
                    label="Number of Buildings"
                    value={current.buildingCount as string}
                    type="text"
                    onChange={(value) => updateShared({ buildingCount: value })}
                  />
                  <CompactField
                    label="Units / Rooms / Beds"
                    value={current.unitsRoomsBeds as string}
                    type="text"
                    onChange={(value) =>
                      updateShared({ unitsRoomsBeds: value })
                    }
                  />
                  <CompactField
                    label="Building Dimensions"
                    value={current.buildingDimensions as string}
                    type="text"
                    onChange={(value) =>
                      updateShared({ buildingDimensions: value })
                    }
                  />
                  <CompactField
                    label="Estimated Module Count"
                    value={current.estimatedModuleCount as string}
                    type="text"
                    onChange={(value) =>
                      updateShared({ estimatedModuleCount: value })
                    }
                  />
                </div>
              )}
            </>
          )}
          {section === "site" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <CompactField
                  label="Site Status"
                  value={current.siteStatus as string}
                  options={selectOptions.siteStatus}
                  onChange={(value) => updateShared({ siteStatus: value })}
                />
                <CompactField
                  label="Municipality"
                  value={current.municipality as string}
                  type="text"
                  onChange={(value) => updateShared({ municipality: value })}
                />
                <CompactField
                  label="Province"
                  value={current.province as string}
                  type="text"
                  onChange={(value) => updateShared({ province: value })}
                />
                <CompactField
                  label="Site Owner"
                  value={current.siteOwner as string}
                  type="text"
                  onChange={(value) => updateShared({ siteOwner: value })}
                />
              </div>
              <MoreButton
                open={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                site control evidence
              </MoreButton>
              {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <CompactField
                    label="Candidate Site Count"
                    value={current.candidateSiteCount as string}
                    type="text"
                    onChange={(value) =>
                      updateShared({ candidateSiteCount: value })
                    }
                  />
                  <CompactField
                    label="Zoning Known"
                    value={current.zoningKnown as string}
                    options={yesNoUnknown}
                    onChange={(value) => updateShared({ zoningKnown: value })}
                  />
                  <CompactField
                    label="Access Known"
                    value={current.accessKnown as string}
                    options={yesNoUnknown}
                    onChange={(value) => updateShared({ accessKnown: value })}
                  />
                  <CompactField
                    label="Servicing Known"
                    value={current.servicingKnown as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ servicingKnown: value })
                    }
                  />
                  <CompactField
                    label="Foundation Concept Known"
                    value={current.foundationConceptKnown as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ foundationConceptKnown: value })
                    }
                  />
                  <CompactField
                    label="Crane / Setting Access Known"
                    value={current.craneSettingAccessKnown as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ craneSettingAccessKnown: value })
                    }
                  />
                  <CompactField
                    label="Transportation Constraints Known"
                    value={current.transportationConstraintsKnown as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ transportationConstraintsKnown: value })
                    }
                  />
                  <CompactField
                    label="Site Control Notes"
                    value={current.siteControlNotes as string}
                    type="text"
                    onChange={(value) =>
                      updateShared({ siteControlNotes: value })
                    }
                  />
                  <CompactField
                    label="Fatal Constraint Resolvable"
                    value={current.fatalConstraintResolvable as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ fatalConstraintResolvable: value })
                    }
                  />
                  <label className="mt-5 flex items-center gap-2 text-[10px] font-semibold">
                    <input
                      type="checkbox"
                      checked={Boolean(current.fatalConstraintConfirmed)}
                      onChange={(event) =>
                        updateShared({
                          fatalConstraintConfirmed: event.target.checked,
                        })
                      }
                    />
                    Fatal site / transport constraint confirmed
                  </label>
                </div>
              )}
            </>
          )}
          {section === "design" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <CompactField
                  label="Design Maturity"
                  value={current.designMaturity as string}
                  options={selectOptions.designMaturity}
                  onChange={(value) => updateShared({ designMaturity: value })}
                />
                <CompactField
                  label="Modular Compatibility"
                  value={current.modularCompatibilityStatus as string}
                  options={selectOptions.modularCompatibilityStatus}
                  onChange={(value) =>
                    updateShared({
                      modularCompatibilityStatus: value,
                      ...(value !== "Not Compatible"
                        ? { viableCorrectivePath: undefined }
                        : {}),
                    })
                  }
                />
                <CompactField
                  label="Reviewed By"
                  value={current.reviewedBy as string}
                  options={selectOptions.reviewedBy}
                  onChange={(value) => updateShared({ reviewedBy: value })}
                />
                {current.modularCompatibilityStatus === "Not Compatible" && (
                  <CompactField
                    label="Viable Corrective Path?"
                    value={current.viableCorrectivePath as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ viableCorrectivePath: value })
                    }
                  />
                )}
              </div>
              <MoreButton
                open={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                design evidence
              </MoreButton>
              {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  <CompactField
                    label="Drawing Package Available"
                    value={current.drawingPackageAvailable as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ drawingPackageAvailable: value })
                    }
                  />
                  <CompactField
                    label="Architect Identified"
                    value={current.architectIdentified as string}
                    options={yesNoUnknown}
                    onChange={(value) =>
                      updateShared({ architectIdentified: value })
                    }
                  />
                  <CompactField
                    label="Drawing Revision"
                    value={current.drawingRevision as string}
                    type="text"
                    onChange={(value) =>
                      updateShared({ drawingRevision: value })
                    }
                  />
                  <CompactField
                    label="Drawing Date"
                    value={current.drawingDate as string}
                    type="date"
                    onChange={(value) => updateShared({ drawingDate: value })}
                  />
                  <CompactField
                    label="Design Notes"
                    value={current.designNotes as string}
                    type="text"
                    onChange={(value) => updateShared({ designNotes: value })}
                  />
                  <CompactField
                    label="Geometry Modular Friendly"
                    value={current.geometryModularFriendly as string}
                    options={[...yesNoUnknown, "Technical Review Required"]}
                    onChange={(value) =>
                      updateShared({ geometryModularFriendly: value })
                    }
                  />
                  <CompactField
                    label="Site Access Feasible"
                    value={current.siteAccessLikelyFeasible as string}
                    options={[...yesNoUnknown, "Technical Review Required"]}
                    onChange={(value) =>
                      updateShared({ siteAccessLikelyFeasible: value })
                    }
                  />
                  <CompactField
                    label="Transportable Geometry Feasible"
                    value={
                      current.transportableGeometryLikelyFeasible as string
                    }
                    options={[...yesNoUnknown, "Technical Review Required"]}
                    onChange={(value) =>
                      updateShared({
                        transportableGeometryLikelyFeasible: value,
                      })
                    }
                  />
                  <CompactField
                    label="Crane / Setting Feasible"
                    value={current.craneSettingConceptFeasible as string}
                    options={[...yesNoUnknown, "Technical Review Required"]}
                    onChange={(value) =>
                      updateShared({ craneSettingConceptFeasible: value })
                    }
                  />
                  <CompactField
                    label="Structural Concept Compatible"
                    value={current.structuralConceptCompatible as string}
                    options={[...yesNoUnknown, "Technical Review Required"]}
                    onChange={(value) =>
                      updateShared({ structuralConceptCompatible: value })
                    }
                  />
                  <CompactField
                    label="Major Design Conversion Required"
                    value={current.majorDesignConversionLikely as string}
                    options={[...yesNoUnknown, "Technical Review Required"]}
                    onChange={(value) =>
                      updateShared({ majorDesignConversionLikely: value })
                    }
                  />
                </div>
              )}
            </>
          )}
          {section === "commercial" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <CompactField
                  label="Client Budget"
                  value={current.clientBudgetProvided as string}
                  options={yesNoUnknown}
                  onChange={(value) =>
                    updateShared({ clientBudgetProvided: value })
                  }
                />
                {current.clientBudgetProvided === "Yes" && (
                  <>
                    <CompactField
                      label="Budget Amount"
                      value={current.clientBudgetAmount as string}
                      type="text"
                      onChange={(value) =>
                        updateShared({ clientBudgetAmount: value })
                      }
                    />
                    <CompactField
                      label="Budget Range — Low"
                      value={current.clientBudgetRangeLow as string}
                      type="text"
                      onChange={(value) =>
                        updateShared({ clientBudgetRangeLow: value })
                      }
                    />
                    <CompactField
                      label="Budget Range — High"
                      value={current.clientBudgetRangeHigh as string}
                      type="text"
                      onChange={(value) =>
                        updateShared({ clientBudgetRangeHigh: value })
                      }
                    />
                  </>
                )}
                <CompactField
                  label="Budget Basis"
                  value={current.budgetBasis as string}
                  options={[
                    "Modules Only",
                    "Construction",
                    "Site Work",
                    "Soft Costs",
                    "Total Project",
                    "Unknown",
                    "Other",
                  ]}
                  onChange={(value) => updateShared({ budgetBasis: value })}
                />
                <CompactField
                  label="Class D Benchmark"
                  value={current.classDAvailable as string}
                  options={yesNoUnknown}
                  onChange={(value) => updateShared({ classDAvailable: value })}
                />
                {current.classDAvailable === "Yes" && (
                  <>
                    <CompactField
                      label="Class D Amount"
                      value={current.classDAmount as string}
                      type="text"
                      onChange={(value) =>
                        updateShared({ classDAmount: value })
                      }
                    />
                    <CompactField
                      label="Class D Date"
                      value={current.classDDate as string}
                      type="date"
                      onChange={(value) => updateShared({ classDDate: value })}
                    />
                    <CompactField
                      label="Class D Revision"
                      value={current.classDRevision as string}
                      type="text"
                      onChange={(value) =>
                        updateShared({ classDRevision: value })
                      }
                    />
                  </>
                )}
                <CompactField
                  label="Funding"
                  value={current.fundingStatus as string}
                  options={selectOptions.fundingStatus}
                  onChange={(value) => updateShared({ fundingStatus: value })}
                />
                <CompactField
                  label="Timeline"
                  value={current.timelineStatus as string}
                  options={selectOptions.timelineStatus}
                  onChange={(value) => updateShared({ timelineStatus: value })}
                />
              </div>
              <MoreButton
                open={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                commercial assumptions
              </MoreButton>
              {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  {[
                    ["Target Design Start", "targetDesignStart"],
                    ["Target Permit", "targetPermit"],
                    ["Target Construction Start", "targetConstructionStart"],
                    ["Target Production", "targetProduction"],
                    ["Target Delivery", "targetDelivery"],
                    ["Target Occupancy", "targetOccupancy"],
                  ].map(([label, key]) => (
                    <CompactField
                      key={key}
                      label={label}
                      value={current[key] as string}
                      type="date"
                      onChange={(value) => updateShared({ [key]: value })}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          {section === "team" && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <CompactField
                  label="Attended Meetings"
                  value={current.clientAttendedMeetings as string}
                  options={yesNoUnknown}
                  onChange={(value) =>
                    updateShared({ clientAttendedMeetings: value })
                  }
                />
                <CompactField
                  label="Provided Documents"
                  value={current.clientProvidedDocuments as string}
                  options={yesNoUnknown}
                  onChange={(value) =>
                    updateShared({ clientProvidedDocuments: value })
                  }
                />
                <CompactField
                  label="Assigned Project Contact"
                  value={current.clientAssignedProjectContact as string}
                  options={yesNoUnknown}
                  onChange={(value) =>
                    updateShared({ clientAssignedProjectContact: value })
                  }
                />
                <CompactField
                  label="Engaged Consultants"
                  value={current.clientEngagedConsultants as string}
                  options={yesNoUnknown}
                  onChange={(value) =>
                    updateShared({ clientEngagedConsultants: value })
                  }
                />
              </div>
              <MoreButton
                open={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                engagement and team roster
              </MoreButton>
              {expanded && (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    <CompactField
                      label="Provided Budget"
                      value={current.clientProvidedBudget as string}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        updateShared({ clientProvidedBudget: value })
                      }
                    />
                    <CompactField
                      label="Requested Formal Next Step"
                      value={current.clientRequestedFormalNextStep as string}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        updateShared({ clientRequestedFormalNextStep: value })
                      }
                    />
                    <CompactField
                      label="Accepted Paid Early Work"
                      value={current.clientAcceptedPaidEarlyWork as string}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        updateShared({ clientAcceptedPaidEarlyWork: value })
                      }
                    />
                    <CompactField
                      label="Responds to Requests"
                      value={current.clientRespondsToRequests as string}
                      options={yesNoUnknown}
                      onChange={(value) =>
                        updateShared({ clientRespondsToRequests: value })
                      }
                    />
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-muted-foreground">
                        Project team
                      </span>
                      <button
                        type="button"
                        onClick={addTeamMember}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"
                      >
                        <Plus className="size-3" />
                        Add
                      </button>
                    </div>
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="space-y-1 rounded-md border bg-muted/20 p-1.5"
                      >
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            ["Name", "name"],
                            ["Company", "company"],
                            ["Email", "email"],
                            ["Phone", "phone"],
                          ].map(([label, key]) => (
                            <CompactField
                              key={key}
                              label={label}
                              value={
                                member[
                                  key as keyof OpportunityTeamMember
                                ] as string
                              }
                              type="text"
                              onChange={(value) =>
                                updateList(
                                  "members",
                                  members.map((item) =>
                                    item.id === member.id
                                      ? { ...item, [key]: value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          ))}
                          <CompactField
                            label="Role"
                            value={member.role}
                            options={selectOptions.teamRole}
                            onChange={(value) =>
                              updateList(
                                "members",
                                members.map((item) =>
                                  item.id === member.id
                                    ? { ...item, role: value }
                                    : item,
                                ),
                              )
                            }
                          />
                          <CompactField
                            label="Status"
                            value={member.status}
                            options={selectOptions.teamStatus}
                            onChange={(value) =>
                              updateList(
                                "members",
                                members.map((item) =>
                                  item.id === member.id
                                    ? { ...item, status: value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${member.name || "team member"}`}
                          onClick={() =>
                            updateList(
                              "members",
                              members.filter((item) => item.id !== member.id),
                            )
                          }
                          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <footer className="border-t bg-muted/30 px-3 py-1.5 text-[9px] text-muted-foreground">
          Shared with Opportunity Decision Hub · updates re-evaluate
          automatically
        </footer>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        title="Section input"
        className="!left-[-8px] !z-50 !size-3 !border-2 !border-background !bg-slate-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        title="Section complete"
        className="!right-[-8px] !z-50 !size-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}

export const OpportunitySectionNode = memo(OpportunitySectionNodeComponent);
