import type { Node } from "@xyflow/react";
import {
  Activity,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Flag,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";
import type {
  DomainNode,
  GateSignatureRequirement,
  RequirementType,
  WorkflowNodeType,
} from "@/types/workflow";
import type { GateCompletionState } from "@/lib/workflow-progress";

export type WorkflowFlowNode = Node<
  {
    domain: DomainNode;
    emphasized?: boolean;
    dimmed?: boolean;
    reached?: boolean;
  },
  "workflow"
>;

// React 19 + @xyflow/react: the React root's delegated event listener is not
// always a DOM ancestor of the buttons rendered inside a node (the renderer
// sits below the React root container in dev/Next.js setups), so a synthetic
// click that originates on a button is dropped before React's delegation
// runs. Stopping propagation at the button keeps the click from also being
// claimed by xyflow's NodeWrapper selection handler and lets our onClick fire
// reliably. Returns the original event for use as `onClick`.
function stopBubble<E extends React.SyntheticEvent>(handler: (event: E) => void) {
  return (event: E) => {
    event.stopPropagation();
    handler(event);
  };
}

function saveText(
  node: DomainNode,
  field: "title" | "description",
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed !== node[field])
    useWorkflowStore.getState().updateNode(node.id, { [field]: trimmed });
}
const textareaRows = (
  value: string | undefined,
  charactersPerLine: number,
  minimum = 2,
) => Math.max(minimum, Math.ceil((value?.length || 0) / charactersPerLine));

const iconOptions = {
  activity: Activity,
  document: FileText,
  person: UserRound,
  building: Building2,
  flag: Flag,
  check: CheckCircle2,
  settings: Settings2,
  box: Boxes,
};

const currentRevisionComplete = (signature: GateSignatureRequirement) => {
  if (!signature.revisionControlled) return true;
  const current = signature.revisions?.find(
    (revision) => revision.status === "Current",
  );
  return Boolean(
    current?.revision.trim() &&
    current.receivedDate &&
    current.department.trim() &&
    current.modifiedBy.trim(),
  );
};
const signatureIsComplete = (signature: GateSignatureRequirement) =>
  Boolean(
    signature.abbreviation.trim() &&
    signature.fullName.trim() &&
    signature.department.trim() &&
    signature.signedBy.trim() &&
    currentRevisionComplete(signature),
  );
const requirementApplies = (item: {
  requirementType?: RequirementType;
  applicable?: boolean;
}) =>
  item.requirementType !== "Optional" &&
  (item.requirementType !== "Conditional" || item.applicable !== false);
const statusStyles: Record<
  GateCompletionState,
  { card: string; header: string; accent: string; label: string }
> = {
  none: {
    card: "border-slate-300 bg-gradient-to-br from-rose-50/95 via-card to-rose-100/70 dark:border-slate-800 dark:from-rose-950/45 dark:to-card",
    header:
      "border-rose-200/80 bg-gradient-to-r from-rose-100/90 via-rose-50/50 to-transparent dark:border-rose-900 dark:from-rose-950/60",
    accent: "bg-rose-500",
    label: "Not started",
  },
  partial: {
    card: "border-amber-300 bg-gradient-to-br from-amber-50/95 via-card to-amber-100/70 dark:border-amber-900 dark:from-amber-950/45 dark:to-card",
    header:
      "border-amber-200/80 bg-gradient-to-r from-amber-100/90 via-amber-50/50 to-transparent dark:border-amber-900 dark:from-amber-950/60",
    accent: "bg-amber-500",
    label: "In progress",
  },
  complete: {
    card: "border-emerald-300 bg-gradient-to-br from-emerald-50/95 via-card to-emerald-100/70 dark:border-emerald-900 dark:from-emerald-950/45 dark:to-card",
    header:
      "border-emerald-200/80 bg-gradient-to-r from-emerald-100/90 via-emerald-50/50 to-transparent dark:border-emerald-900 dark:from-emerald-950/60",
    accent: "bg-emerald-500",
    label: "Complete",
  },
};

// Re-exported helper kept available for callers that previously consumed
// stopBubble from the monolithic file.
export {
  stopBubble,
  saveText,
  textareaRows,
  iconOptions,
  currentRevisionComplete,
  signatureIsComplete,
  requirementApplies,
  statusStyles,
};

// Re-export common types so downstream files don't need to re-import them.
export type { GateSignatureRequirement, RequirementType };

export const SECTION_BASED_REFERENCE_TYPES = [
  "controlBackbone",
  "responsibilityLane",
] as const satisfies readonly WorkflowNodeType[];
export type SectionBasedReferenceType =
  (typeof SECTION_BASED_REFERENCE_TYPES)[number];

export const isSectionBasedReference = (
  type: WorkflowNodeType,
): type is SectionBasedReferenceType =>
  (SECTION_BASED_REFERENCE_TYPES as readonly WorkflowNodeType[]).includes(type);