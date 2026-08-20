import { getNodeDefinition } from "@/lib/node-catalog";
import { clone } from "@/lib/clone";
import type { DomainNode, WorkflowNodeType } from "@/types/workflow";

const referenceDefaults: Partial<
  Record<WorkflowNodeType, DomainNode["config"]["reference"]>
> = {
  terminal: {},
};

export function createDomainNode(type: WorkflowNodeType, id: string): DomainNode {
  const def = getNodeDefinition(type);
  const gate = type === "gate";
  const projectStart = type === "projectStart";
  return {
    id,
    type,
    title: gate ? "Gate review" : def.label,
    description: gate
      ? "Review the work item before approval"
      : projectStart
        ? "Start the project and establish its project record."
      : def.description,
    color: def.color,
    metadata: {},
    conditions: projectStart
      ? [{ id: "project-id-required", label: "Project ID is entered", required: true, checked: false, locked: true }]
      : [],
    documents: [],
    criteria: [],
    customFields: projectStart
      ? {
          projectId: "",
          legacyJobNumber: "",
          nodeUuid: crypto.randomUUID(),
        }
      : {},
    config: projectStart
      ? { serviceType: "Standard", buildingCode: "", moduleCode: "" }
      : type === "opportunityValidation"
        ? {
            stage: "Opportunity Validation",
            iconKey: "check",
            outcomes: [
              {
                id: "pass-p1-p2",
                label: "GATE 1 PASSED (P1/P2)",
                edgeType: "success",
                color: "#16866f",
                enabled: true,
              },
              {
                id: "csa-pcs",
                label: "Proceed to CSA / PCS",
                edgeType: "normal",
                color: "#2563eb",
                enabled: true,
              },
              {
                id: "loi-governed",
                label: "Strategic Governed LOI",
                edgeType: "normal",
                color: "#9333ea",
                enabled: true,
              },
              {
                id: "site-feasibility",
                label: "Site Feasibility Loop",
                edgeType: "hold",
                color: "#d97706",
                enabled: true,
              },
              {
                id: "hold-rework",
                label: "HOLD · Rework Loop",
                edgeType: "hold",
                color: "#ea580c",
                enabled: true,
              },
              {
                id: "nogo-disqualified",
                label: "NO-GO · Disqualified",
                edgeType: "failure",
                color: "#dc2626",
                enabled: true,
              },
            ],
            opportunity: {
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
              gapMitigationNotes: "Plans at concept stage -> proceed with CSA for design coordination & modular optimization",
              engagementPath: "CSA",
              engagementStatus: "Draft",
              decisionOutcome: "draft",
            },
          }
      : gate
        ? {
          gateLabel: "DECISION",
          decisionMode: "binary",
          gateIconKey: "check",
          gateHeaderColor: "#2563a9",
          gateTitleColor: "#ffffff",
          conditionsTitle: "Approval conditions",
          conditionsSubtitle: "requirements complete",
          checklistTitle: "Conditions checklist",
          checklistHint: "Every applicable required document must be complete",
          conditionLabel: "Condition",
          addConditionLabel: "Add condition",
          documentsLabel: "All applicable required documents",
          addDocumentLabel: "Add document",
          decisionTitle: "Decision",
          decisionSubtitle: "Approval routing",
          departmentLabel: "Department",
          approverLabel: "Approved by",
          detailsNeededLabel: "Details needed",
          outcomes: [
            {
              id: "yes",
              label: "YES",
              edgeType: "success",
              color: "#16866f",
              enabled: true,
            },
            {
              id: "no",
              label: "NO",
              edgeType: "failure",
              color: "#b34a47",
              enabled: true,
            },
          ],
          gateRules: [
            {
              id: `rule-${crypto.randomUUID().slice(0, 6)}`,
              label: "Enter required condition",
              checked: false,
              requirementType: "Required",
              signatures: [],
            },
          ],
          approvedDepartment: "",
          approvedBy: "",
        }
      : type === "phase"
        ? { locked: false }
        : referenceDefaults[type]
          ? { reference: clone(referenceDefaults[type]!) }
          : { stage: "Stage", iconKey: "activity" },
  };
}
