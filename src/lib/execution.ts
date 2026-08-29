import {
  EXECUTION_ITEM_TYPES,
  type ExecutionItem,
  type ExecutionItemStatus,
  type ExecutionItemType,
  type ExecutionLayer,
  type WorkflowFile,
} from "@/types/workflow";

export type ExecutionItemProgress = "complete" | "incomplete" | "blocked";

export interface ExecutionSummary {
  hasItems: boolean;
  itemCount: number;
  completedCount: number;
  requiredCount: number;
  requiredCompletedCount: number;
  status: "Ready" | "Incomplete" | "Blocked" | "Passed";
}

const isCompleteStatus = (status: ExecutionItemStatus) =>
  status === "Complete" || status === "Passed";

export function executionItemProgress(
  item: ExecutionItem,
): ExecutionItemProgress {
  if (
    item.status === "Blocked" ||
    item.signatureStatus === "Rejected" ||
    item.approvalStatus === "Rejected" ||
    item.taskStatus === "Blocked"
  ) {
    return "blocked";
  }

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

export function executionItemProgressLabel(item: ExecutionItem) {
  if (executionItemProgress(item) === "blocked") return "Blocked";
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
  if (executionItemProgress(item) === "complete") {
    return item.status === "Passed" ? "Passed" : "Complete";
  }
  return item.status;
}

export function getExecutionSummary(
  linkedLayer2NodeId: string,
  items: ExecutionItem[] | undefined,
): ExecutionSummary {
  const linked = (items || []).filter(
    (item) => item.linkedLayer2NodeId === linkedLayer2NodeId,
  );
  const required = linked.filter((item) => item.required);
  const completedCount = linked.filter(
    (item) => executionItemProgress(item) === "complete",
  ).length;
  const requiredCompletedCount = required.filter(
    (item) => executionItemProgress(item) === "complete",
  ).length;
  const blocked = required.some(
    (item) => executionItemProgress(item) === "blocked",
  );
  const requiredReady = required.every(
    (item) => executionItemProgress(item) === "complete",
  );
  const passed =
    required.length > 0 &&
    requiredReady &&
    required.every((item) => item.status === "Passed");

  return {
    hasItems: linked.length > 0,
    itemCount: linked.length,
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
          responsibleRole:
            typeof raw.responsibleRole === "string" ? raw.responsibleRole : "",
          dueDate: typeof raw.dueDate === "string" ? raw.dueDate : "",
          notes: typeof raw.notes === "string" ? raw.notes : "",
          signers: Array.isArray(raw.signers)
            ? raw.signers.filter((signer): signer is string => typeof signer === "string")
            : [],
        };
      }),
  };
}
