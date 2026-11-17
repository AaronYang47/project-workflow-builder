import { sequentialExecutionBlocker } from "@/lib/workflow-progress";
import { PREVIOUS_DEPARTMENT_TITLE } from "@/store/slices/graph-slice";
import { useWorkflowStore } from "@/store/workflow-store";

/**
 * Before a release condition or file is ticked: when the previous department
 * isn't complete yet, shows the popup naming it and returns true.
 */
export function blockIfOutOfSequence(nodeId: string) {
  const state = useWorkflowStore.getState();
  const message = sequentialExecutionBlocker(state.file, nodeId);
  if (message) state.showActionBlocked({ title: PREVIOUS_DEPARTMENT_TITLE, message, items: [] });
  return Boolean(message);
}

/** Opens a department's L3 page, where its file-backed conditions are ticked. */
export const openDepartmentL3 = (nodeId: string) =>
  window.dispatchEvent(new CustomEvent("workflow:open-execution", { detail: { nodeId } }));
