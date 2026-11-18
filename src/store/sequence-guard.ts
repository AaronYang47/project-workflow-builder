import { releaseConditionBlocker } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";

/**
 * Before a release condition or file is ticked: when the previous department
 * or an earlier required release condition on the same department isn't
 * complete yet, shows the popup naming it and returns true.
 */
export function blockIfOutOfSequence(nodeId: string, conditionIdOrIndex?: string | number) {
  const state = useWorkflowStore.getState();
  const notice = releaseConditionBlocker(state.file, nodeId, conditionIdOrIndex);
  if (notice) state.showActionBlocked({ ...notice, items: [] });
  return Boolean(notice);
}

/** Opens a department's L3 page, where its file-backed conditions are ticked. */
export const openDepartmentL3 = (nodeId: string, conditionId?: string) =>
  window.dispatchEvent(
    new CustomEvent("workflow:open-execution", {
      detail: { nodeId, ...(conditionId ? { conditionId } : {}) },
    }),
  );
