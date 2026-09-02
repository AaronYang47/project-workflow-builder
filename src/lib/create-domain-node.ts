import { getNodeDefinition } from "@/lib/node-catalog";
import { clone } from "@/lib/clone";
import { createDefaultMatrixReference, matrixKindForNode } from "@/lib/matrix-config";
import type { DomainNode, WorkflowNodeType } from "@/types/workflow";

export function createDefaultTerminalConditions(): DomainNode["conditions"] {
  return [
    {
      id: "project-completion-recorded",
      label: "Project completion and warranty are recorded",
      required: true,
      checked: false,
    },
  ];
}

const referenceDefaults: Partial<
  Record<WorkflowNodeType, DomainNode["config"]["reference"]>
> = {
  terminal: {},
};

export function createDomainNode(type: WorkflowNodeType, id: string): DomainNode {
  const def = getNodeDefinition(type);
  const gate = type === "gate";
  const projectStart = type === "projectStart";
  const matrixKind = matrixKindForNode({ type });
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
      : type === "terminal"
        ? createDefaultTerminalConditions()
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
        : matrixKind
          ? {
              stage: "Governance",
              iconKey: "document",
              matrixKind,
              reference: createDefaultMatrixReference(matrixKind),
            }
        : referenceDefaults[type]
          ? { reference: clone(referenceDefaults[type]!) }
          : { stage: "Stage", iconKey: "activity" },
  };
}
