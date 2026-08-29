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
                label: "P1 · Gate 1 Passed",
                edgeType: "success",
                color: "#16866f",
                enabled: true,
              },
              {
                id: "loi-governed",
                label: "P2 · Strong Qualified",
                edgeType: "normal",
                color: "#2563eb",
                enabled: true,
              },
              {
                id: "csa-pcs",
                label: "P3 · CSA / PCS",
                edgeType: "normal",
                color: "#0891b2",
                enabled: true,
              },
              {
                id: "site-feasibility",
                label: "P4 · Site Feasibility",
                edgeType: "hold",
                color: "#d97706",
                enabled: true,
              },
              {
                id: "nogo-disqualified",
                label: "P5 · No-Go / Disqualified",
                edgeType: "failure",
                color: "#dc2626",
                enabled: true,
              },
              {
                id: "path-loi",
                label: "PL · Path LOI",
                edgeType: "normal",
                color: "#7c3aed",
                enabled: true,
              },
            ],
            opportunity: {
              intake: {
                clientAuthority: {
                  decisionAuthorityStatus: "Unknown",
                  finalDecisionAuthorityIdentified: "Unknown",
                  requiredDecisionPartiesIdentified: "Unknown",
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
              },
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
