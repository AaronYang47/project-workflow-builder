import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import type { WorkflowFile } from "@/types/workflow";

/** Earlier phases are already enforced as a whole-phase barrier, never as an
 * individual RC dependency. Remove those redundant legacy references without
 * changing same-phase dependencies or hiding invalid future/missing links. */
export function normalizePreviousPhaseDependencies(file: WorkflowFile): WorkflowFile {
  const owners = new Map<string, number>();
  orderHighLevelNodes(file.highLevel?.graph.nodes ?? [], file.highLevel?.graph.edges ?? []).forEach((phase, index) => {
    (phase.linkedLayer2NodeIds ?? phase.linkedDetailedNodeIds ?? []).forEach((id) => {
      if (!owners.has(id)) owners.set(id, index);
    });
  });
  const byId = new Map(file.graph.nodes.map((node) => [node.id, node]));
  let changed = false;
  const nodes = file.graph.nodes.map((node) => {
    const phase = owners.get(node.id);
    let nodeChanged = false;
    const conditions = node.conditions.map((condition) => {
      const ref = condition.predecessor;
      const previousPhase = ref && owners.get(ref.nodeId);
      if (phase === undefined || previousPhase === undefined || previousPhase >= phase || !ref ||
        !byId.get(ref.nodeId)?.conditions.some((previous, index) => (previous.id || `index-${index}`) === ref.conditionId)) return condition;
      nodeChanged = changed = true;
      const { predecessor: _previous, ...next } = condition;
      void _previous;
      return next;
    });
    return nodeChanged ? { ...node, conditions } : node;
  });
  return changed ? { ...file, graph: { ...file.graph, nodes } } : file;
}
