import {
  EXECUTION_APPLICABILITY,
  EXECUTION_APPLICABILITY_DETERMINATIONS,
  EXECUTION_ITEM_TYPES,
  EDITABLE_FORM_FIELD_TYPES,
  type EditableFormField,
  type ExecutionApplicability,
  type ExecutionApplicabilityDetermination,
  type ExecutionItem,
  type ExecutionItemStatus,
  type ExecutionItemType,
  type ExecutionLayer,
  type WorkflowFile,
} from "@/types/workflow";
import { getProfabForm } from "@/lib/profab-forms";
import { profabFormMissingFields } from "@/lib/profab-form-runtime";
import type { ProjectOperations } from "@/types/project-operations";

export type ExecutionItemProgress = "complete" | "incomplete" | "blocked";

export interface ExecutionProgressOptions {
  /**
   * L2 nodes use a file checklist instead of an editable L3 execution form.
   * In that mode the checkbox is the source of truth for completion.
   */
  checklistOnly?: boolean;
}

export interface ExecutionSummary {
  hasItems: boolean;
  itemCount: number;
  completedCount: number;
  requiredCount: number;
  requiredCompletedCount: number;
  status: "Ready" | "Incomplete" | "Blocked" | "Passed";
}

function normalizeFormOverrides(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const fields = Array.isArray(source.fields)
    ? source.fields.flatMap((field, index) => {
        if (!field || typeof field !== "object") return [];
        const value = field as Partial<EditableFormField>;
        const type = EDITABLE_FORM_FIELD_TYPES.includes(
          value.type as (typeof EDITABLE_FORM_FIELD_TYPES)[number],
        )
          ? (value.type as EditableFormField["type"])
          : "text";
        return [
          {
            id:
              typeof value.id === "string" && value.id.trim()
                ? value.id.trim()
                : `custom-field-${index + 1}`,
            label:
              typeof value.label === "string" && value.label.trim()
                ? value.label.trim()
                : `Field ${index + 1}`,
            type,
            required: value.required !== false,
            section:
              typeof value.section === "string" && value.section.trim()
                ? value.section.trim()
                : "Custom fields",
            ...(typeof value.placeholder === "string"
              ? { placeholder: value.placeholder }
              : {}),
            ...(typeof value.help === "string" ? { help: value.help } : {}),
            ...(Array.isArray(value.options)
              ? {
                  options: value.options.filter(
                    (option): option is string => typeof option === "string",
                  ),
                }
              : {}),
          },
        ];
      })
    : [];
  return {
    ...(typeof source.title === "string" ? { title: source.title } : {}),
    ...(typeof source.description === "string"
      ? { description: source.description }
      : {}),
    fields,
    removedFieldIds: Array.isArray(source.removedFieldIds)
      ? source.removedFieldIds.filter(
          (fieldId): fieldId is string => typeof fieldId === "string",
        )
      : [],
  };
}

const isCompleteStatus = (status: ExecutionItemStatus) =>
  status === "Complete" || status === "Passed";

export function executionItemApplicability(item: ExecutionItem) {
  return item.applicability || (item.required ? "Required" : "Optional");
}

export function executionItemApplicabilityDetermination(item: ExecutionItem) {
  const applicability = executionItemApplicability(item);
  if (applicability === "Required") return "Applicable" as const;
  if (applicability === "Not Applicable") return "Not Applicable" as const;
  if (applicability === "Optional" || applicability === "Supporting") {
    return item.applicabilityDetermination || "Applicable";
  }
  return item.applicabilityDetermination || "Pending";
}

export function executionItemIsNotApplicable(item: ExecutionItem) {
  return executionItemApplicabilityDetermination(item) === "Not Applicable";
}

/** Conditional/triggered controls remain gating until someone records whether
 * they apply. This prevents a blank conditional form from becoming a loophole. */
export function executionItemIsGateRequired(item: ExecutionItem) {
  const applicability = executionItemApplicability(item);
  if (applicability === "Optional" || applicability === "Supporting") {
    return false;
  }
  if (executionItemIsNotApplicable(item)) {
    return !item.applicabilityReason?.trim();
  }
  return true;
}

export function executionItemFormMissingFields(
  item: ExecutionItem,
  operations?: ProjectOperations,
) {
  const form = getProfabForm(item);
  if (!form) return [];
  const determination = executionItemApplicabilityDetermination(item);
  if (determination === "Pending") return ["Applicability determination"];
  if (determination === "Not Applicable") {
    return item.applicabilityReason?.trim()
      ? []
      : ["Not-applicable reason"];
  }
  const values = item.formValues || {};
  return profabFormMissingFields(form, values, operations);
}

export function executionItemCanComplete(
  item: ExecutionItem,
  operations?: ProjectOperations,
) {
  return executionItemFormMissingFields(item, operations).length === 0;
}

export function executionItemProgress(
  item: ExecutionItem,
  operations?: ProjectOperations,
  options?: ExecutionProgressOptions,
): ExecutionItemProgress {
  if (options?.checklistOnly) {
    if (
      executionItemIsNotApplicable(item) &&
      item.applicabilityReason?.trim()
    ) {
      return "complete";
    }
    return item.checklistComplete === true ? "complete" : "incomplete";
  }

  if (
    item.status === "Blocked" ||
    item.signatureStatus === "Rejected" ||
    item.approvalStatus === "Rejected" ||
    item.taskStatus === "Blocked"
  ) {
    return "blocked";
  }

  if (item.formStale) return "incomplete";

  if (!executionItemCanComplete(item, operations)) return "incomplete";

  if (executionItemIsNotApplicable(item)) return "complete";

  const signatureReady =
    !item.signatureRequired || item.signatureStatus === "Signed";
  const approvalReady =
    !item.approvalRequired || item.approvalStatus === "Approved";
  const approvalItemReady =
    item.type !== "Approval" || item.approvalStatus === "Approved";
  const taskReady =
    item.type !== "Task" ||
    item.taskStatus === "Complete" ||
    (item.taskStatus === undefined && isCompleteStatus(item.status));

  if (
    isCompleteStatus(item.status) &&
    signatureReady &&
    approvalReady &&
    approvalItemReady &&
    taskReady
  ) {
    return "complete";
  }

  return "incomplete";
}

export function executionItemProgressLabel(
  item: ExecutionItem,
  operations?: ProjectOperations,
  options?: ExecutionProgressOptions,
) {
  if (options?.checklistOnly) {
    if (
      executionItemIsNotApplicable(item) &&
      item.applicabilityReason?.trim()
    ) {
      return "Not required";
    }
    return item.checklistComplete === true ? "Checked" : "Required";
  }

  if (executionItemProgress(item, operations) === "blocked") return "Blocked";
  if (item.formStale) return "Controlled snapshot is stale";
  const missingFields = executionItemFormMissingFields(item, operations);
  if (missingFields[0] === "Applicability determination") {
    return "Applicability pending";
  }
  if (executionItemIsNotApplicable(item)) {
    return missingFields.length ? "N/A reason required" : "Not applicable";
  }
  if (missingFields.length) {
    return `${missingFields.length} required field${missingFields.length === 1 ? "" : "s"} missing`;
  }
  if (item.signatureRequired && item.signatureStatus !== "Signed") {
    return item.signatureStatus === "Partially Signed"
      ? "Partially signed"
      : "Waiting for signature";
  }
  if (item.approvalRequired && item.approvalStatus !== "Approved") {
    return "Waiting for approval";
  }
  if (item.type === "Approval" && item.approvalStatus !== "Approved") {
    return "Waiting for approval";
  }
  if (item.type === "Task" && item.taskStatus !== "Complete") {
    return item.taskStatus === "In Progress" ? "In progress" : "Task incomplete";
  }
  if (executionItemProgress(item, operations) === "complete") {
    return item.status === "Passed" ? "Passed" : "Complete";
  }
  return item.status;
}

export function getExecutionSummary(
  linkedLayer2NodeId: string,
  items: ExecutionItem[] | undefined,
  operations?: ProjectOperations,
  options?: ExecutionProgressOptions,
): ExecutionSummary {
  const linked = (items || []).filter(
    (item) => item.linkedLayer2NodeId === linkedLayer2NodeId,
  );
  const required = linked.filter(executionItemIsGateRequired);
  const counted = options?.checklistOnly ? required : linked;
  const completedCount = counted.filter(
    (item) => executionItemProgress(item, operations, options) === "complete",
  ).length;
  const requiredCompletedCount = required.filter(
    (item) => executionItemProgress(item, operations, options) === "complete",
  ).length;
  const blocked = required.some(
    (item) => executionItemProgress(item, operations, options) === "blocked",
  );
  const requiredReady = required.every(
    (item) => executionItemProgress(item, operations, options) === "complete",
  );
  const passed =
    required.length > 0 &&
    requiredReady &&
    (options?.checklistOnly || required.every((item) => item.status === "Passed"));

  return {
    hasItems: counted.length > 0,
    itemCount: counted.length,
    completedCount,
    requiredCount: required.length,
    requiredCompletedCount,
    status: blocked
      ? "Blocked"
      : requiredReady
        ? passed
          ? "Passed"
          : "Ready"
        : "Incomplete",
  };
}

export function createExecutionItem(
  id: string,
  linkedLayer2NodeId: string,
  type: ExecutionItemType = "Document",
): ExecutionItem {
  const signatureBased = type === "Document" || type === "Agreement";
  return {
    id,
    linkedLayer2NodeId,
    type,
    title: `New ${type}`,
    description: "",
    required: true,
    status: "Not Started",
    signatureRequired: signatureBased,
    approvalRequired: false,
    responsibleRole: "",
    dueDate: "",
    notes: "",
    signatureStatus: signatureBased ? "Pending" : "Not Required",
    signers: [],
    approvalStatus: "Pending",
    taskStatus: type === "Task" ? "Not Started" : undefined,
    applicability: "Required",
    applicabilityDetermination: "Applicable",
    applicabilityReason: "",
    formValues: {},
  };
}

export function normalizeExecutionLayer(
  execution: WorkflowFile["execution"],
): ExecutionLayer {
  if (!execution || !Array.isArray(execution.items)) {
    return { items: [] };
  }

  return {
    items: execution.items
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const raw = item as Partial<ExecutionItem>;
        const type: ExecutionItemType = EXECUTION_ITEM_TYPES.includes(
          raw.type as (typeof EXECUTION_ITEM_TYPES)[number],
        )
          ? (raw.type as ExecutionItemType)
          : "Task";
        const applicability: ExecutionApplicability = EXECUTION_APPLICABILITY.includes(
          raw.applicability as ExecutionApplicability,
        )
          ? (raw.applicability as ExecutionApplicability)
          : raw.required === false
            ? "Optional"
            : "Required";
        const applicabilityDetermination: ExecutionApplicabilityDetermination =
          EXECUTION_APPLICABILITY_DETERMINATIONS.includes(
            raw.applicabilityDetermination as ExecutionApplicabilityDetermination,
          )
            ? (raw.applicabilityDetermination as ExecutionApplicabilityDetermination)
            : applicability === "Required"
              ? "Applicable"
              : applicability === "Not Applicable"
                ? "Not Applicable"
                : applicability === "Conditional" || applicability === "Triggered"
                  ? "Pending"
                  : "Applicable";
        return {
          ...createExecutionItem(
            typeof raw.id === "string" && raw.id ? raw.id : `execution-${index + 1}`,
            typeof raw.linkedLayer2NodeId === "string"
              ? raw.linkedLayer2NodeId
              : "",
            type,
          ),
          ...raw,
          id:
            typeof raw.id === "string" && raw.id
              ? raw.id
              : `execution-${index + 1}`,
          linkedLayer2NodeId:
            typeof raw.linkedLayer2NodeId === "string"
              ? raw.linkedLayer2NodeId
              : "",
          type,
          title: typeof raw.title === "string" ? raw.title : `New ${type}`,
          description: typeof raw.description === "string" ? raw.description : "",
          required: raw.required !== false,
          applicability,
          applicabilityDetermination,
          applicabilityReason:
            typeof raw.applicabilityReason === "string"
              ? raw.applicabilityReason
              : "",
          responsibleRole:
            typeof raw.responsibleRole === "string" ? raw.responsibleRole : "",
          dueDate: typeof raw.dueDate === "string" ? raw.dueDate : "",
          notes: typeof raw.notes === "string" ? raw.notes : "",
          signers: Array.isArray(raw.signers)
            ? raw.signers.filter((signer): signer is string => typeof signer === "string")
            : [],
          formValues:
            raw.formValues && typeof raw.formValues === "object"
              ? Object.fromEntries(
                  Object.entries(raw.formValues).filter(
                    ([, value]) =>
                      typeof value === "string" || typeof value === "boolean",
                  ),
                )
              : {},
          formOverrides: normalizeFormOverrides(raw.formOverrides),
          formSnapshot:
            raw.formSnapshot &&
            typeof raw.formSnapshot === "object" &&
            raw.formSnapshot.values &&
            typeof raw.formSnapshot.values === "object"
              ? {
                  capturedAt:
                    typeof raw.formSnapshot.capturedAt === "string"
                      ? raw.formSnapshot.capturedAt
                      : "",
                  authorizationState:
                    raw.formSnapshot.authorizationState === "Executed" ||
                    raw.formSnapshot.authorizationState === "Approved" ||
                    raw.formSnapshot.authorizationState === "Executed & Approved"
                      ? raw.formSnapshot.authorizationState
                      : "Approved",
                  documentRevision:
                    typeof raw.formSnapshot.documentRevision === "string"
                      ? raw.formSnapshot.documentRevision
                      : "",
                  values: Object.fromEntries(
                    Object.entries(raw.formSnapshot.values).filter(
                      ([, value]) =>
                        typeof value === "string" || typeof value === "boolean",
                    ),
                  ),
                }
              : undefined,
          formStale: raw.formStale === true,
          formStaleFieldIds: Array.isArray(raw.formStaleFieldIds)
            ? raw.formStaleFieldIds.filter(
                (fieldId): fieldId is string => typeof fieldId === "string",
              )
            : [],
        };
      }),
  };
}
