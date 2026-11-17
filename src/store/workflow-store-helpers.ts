"use client";

import { getAdaptiveNodeSize } from "@/lib/node-layout";
import { createEmptyWorkspace } from "@/lib/project-template";
import { migrateWorkflowFile } from "@/lib/workflow-migration";
import {
  demoteExtraHighLevelTerminals,
  isDefaultHighLevelProcess,
  isLegacyDefaultHighLevelFamily,
  synchronizeLinkedWorkflowOrder,
} from "@/lib/high-level-workflow";
import { DETAILED_LIFECYCLE_IDS } from "@/lib/detailed-workflow";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import type { SyncMessage } from "@/lib/collaboration/collaboration-types";
import type { ProjectOperations } from "@/types/project-operations";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

export function broadcastIfLocal(createMessage: (senderId: string) => SyncMessage) {
  if (typeof window === "undefined") return;
  const isRemoteApplying = useCollaborationStore.getState().isRemoteApplying;
  if (!isRemoteApplying) {
    const senderId = useCollaborationStore.getState().localUser.peerId;
    collaborationManager.broadcast(createMessage(senderId));
  }
}

export function textEditKey(node: DomainNode, patch: Partial<DomainNode>): string | undefined {
  const changed = Object.keys(patch).filter(
    (key) =>
      JSON.stringify(patch[key as keyof DomainNode]) !==
      JSON.stringify(node[key as keyof DomainNode]),
  );
  if (changed.length !== 1) return undefined;
  if (changed[0] === "title" || changed[0] === "description") return `${node.id}:${changed[0]}`;
  if (
    changed[0] !== "conditions" ||
    !patch.conditions ||
    patch.conditions.length !== node.conditions.length
  )
    return undefined;
  const conditionIndex = node.conditions.findIndex(
    (condition, index) => JSON.stringify(condition) !== JSON.stringify(patch.conditions?.[index]),
  );
  if (conditionIndex < 0) return undefined;
  const oldCondition = node.conditions[conditionIndex];
  const nextCondition = patch.conditions[conditionIndex];
  const fields = Object.keys(nextCondition).filter(
    (key) =>
      JSON.stringify(nextCondition[key as keyof typeof nextCondition]) !==
      JSON.stringify(oldCondition[key as keyof typeof oldCondition]),
  );
  if (fields.length !== 1 || !["label", "description"].includes(fields[0])) return undefined;
  return `${node.id}:condition:${oldCondition.id ?? conditionIndex}:${fields[0]}`;
}

export function findAvailableNodePosition(
  file: WorkflowFile,
  node: DomainNode,
  requested: { x: number; y: number },
  parentId?: string,
) {
  const size = getAdaptiveNodeSize(node);
  const occupied = Object.values(file.layout.nodes).filter(
    (layout) => layout.parentId === parentId,
  );
  const gap = 48;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const candidate = {
      x: requested.x + attempt * 64,
      y: requested.y + (attempt % 4) * 64,
    };
    const overlaps = occupied.some(
      (layout) =>
        candidate.x < layout.x + layout.width + gap &&
        candidate.x + size.width + gap > layout.x &&
        candidate.y < layout.y + layout.height + gap &&
        candidate.y + size.height + gap > layout.y,
    );
    if (!overlaps) return candidate;
  }

  return {
    x: requested.x + occupied.length * 64,
    y: requested.y + occupied.length * 64,
  };
}

export function isViewOnlyFileChange(current: WorkflowFile, next: WorkflowFile | undefined) {
  if (!next) return false;
  return (
    current.graph === next.graph &&
    current.calendar === next.calendar &&
    current.releaseConditionInbox === next.releaseConditionInbox &&
    current.execution === next.execution &&
    current.operations === next.operations &&
    current.layout.nodes === next.layout.nodes &&
    current.layout.edges === next.layout.edges &&
    current.layout.snapToGrid === next.layout.snapToGrid &&
    current.layout.gridSize === next.layout.gridSize &&
    current.highLevel?.graph === next.highLevel?.graph &&
    current.highLevel?.layout.nodes === next.highLevel?.layout.nodes
  );
}

export function normalizeHighLevelLayer2Links(
  highLevel: NonNullable<WorkflowFile["highLevel"]>,
  nodeId: string,
  linkedIds: string[],
  workflowNodes: DomainNode[],
) {
  const alreadyClaimed = new Set(
    highLevel.graph.nodes
      .filter((node) => node.id !== nodeId)
      .flatMap((node) => node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []),
  );
  const workflowNodeById = new Map(workflowNodes.map((node) => [node.id, node]));
  return Array.from(new Set(linkedIds)).filter(
    (linkedId) =>
      !alreadyClaimed.has(linkedId) &&
      workflowNodeById.has(linkedId) &&
      workflowNodeById.get(linkedId)?.type !== "phase",
  );
}

export function isBlankWorkflow(file: WorkflowFile) {
  return (
    file.graph.nodes.length === 0 &&
    file.graph.edges.length === 0 &&
    (file.highLevel?.graph.nodes.length ?? 0) === 0
  );
}

export function clearDefaultWorkflow(file: WorkflowFile) {
  const blank = createEmptyWorkspace();
  return {
    ...blank,
    graph: { ...blank.graph, metadata: file.graph.metadata },
    calendar: file.calendar,
    operations: file.operations,
  };
}

export function isSeededDetailedWorkflow(file: WorkflowFile) {
  const ids = new Set(DETAILED_LIFECYCLE_IDS);
  const hasNoNamedProject = file.graph.metadata.name.trim().length === 0;
  const hasNoHighLevelNodes = (file.highLevel?.graph.nodes.length ?? 0) === 0;
  return (
    file.graph.nodes.length >= 4 &&
    file.graph.nodes.every((node) => ids.has(node.id as (typeof DETAILED_LIFECYCLE_IDS)[number])) &&
    hasNoNamedProject &&
    hasNoHighLevelNodes
  );
}

export function removePrimaryGates(file: WorkflowFile) {
  const highLevel = file.highLevel;
  if (!highLevel) return { file, removed: false };
  const removedIds = new Set(
    highLevel.graph.nodes.filter((node) => node.type === "primaryGate").map((node) => node.id),
  );
  if (!removedIds.size) return { file, removed: false };

  const nodes = highLevel.graph.nodes.filter((node) => !removedIds.has(node.id));
  const edges = highLevel.graph.edges.filter(
    (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
  );
  const layoutNodes = Object.fromEntries(
    Object.entries(highLevel.layout.nodes).filter(([nodeId]) => !removedIds.has(nodeId)),
  );
  return {
    file: {
      ...file,
      highLevel: {
        ...highLevel,
        graph: { nodes, edges },
        layout: { ...highLevel.layout, nodes: layoutNodes },
      },
    },
    removed: true,
  };
}

export function removePhaseSelfLinks(file: WorkflowFile) {
  if (!file.highLevel) return { file, removed: false };
  const phaseIds = new Set(
    file.graph.nodes.filter((node) => node.type === "phase").map((node) => node.id),
  );
  if (!phaseIds.size) return { file, removed: false };
  let removed = false;
  const nodes = file.highLevel.graph.nodes.map((node) => {
    const linked = node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [];
    const filtered = linked.filter((id) => !phaseIds.has(id));
    if (filtered.length === linked.length) return node;
    removed = true;
    return { ...node, linkedLayer2NodeIds: filtered, linkedDetailedNodeIds: filtered };
  });
  return removed
    ? {
        file: {
          ...file,
          highLevel: { ...file.highLevel, graph: { ...file.highLevel.graph, nodes } },
        },
        removed,
      }
    : { file, removed };
}

export function normalizeLoadedWorkflow(loaded: WorkflowFile) {
  const file = loaded.highLevel
    ? { ...loaded, highLevel: demoteExtraHighLevelTerminals(loaded.highLevel) }
    : loaded;
  if (isDefaultHighLevelProcess(file.highLevel) || isLegacyDefaultHighLevelFamily(file.highLevel)) {
    return { file: clearDefaultWorkflow(file), clearedDefault: true };
  }
  if (isBlankWorkflow(file)) return { file, clearedDefault: false };
  // A current project may intentionally contain only user-authored L1 nodes
  // while its detailed layer is still empty. Do not let the legacy migration
  // scaffold L2 for that document and then classify it as a default workflow.
  if (file.graph.nodes.length === 0 && (file.highLevel?.graph.nodes.length ?? 0) > 0) {
    const sanitized = removePrimaryGates(file);
    return { file: sanitized.file, clearedDefault: sanitized.removed };
  }
  const migrated = migrateWorkflowFile(file);
  if (isSeededDetailedWorkflow(migrated)) {
    return { file: clearDefaultWorkflow(migrated), clearedDefault: true };
  }
  const sanitized = removePrimaryGates(migrated);
  const withoutSelfLinks = removePhaseSelfLinks(sanitized.file);
  const ordered = synchronizeLinkedWorkflowOrder(withoutSelfLinks.file);
  return {
    file: ordered,
    clearedDefault:
      sanitized.removed || withoutSelfLinks.removed || ordered !== withoutSelfLinks.file,
  };
}

export function withOperationalIdentity(file: WorkflowFile, operations: ProjectOperations) {
  const identity = operations.identity;
  return {
    ...file,
    graph: {
      ...file.graph,
      metadata: {
        ...file.graph.metadata,
        updatedAt: operations.updatedAt,
      },
      nodes: file.graph.nodes.map((node) =>
        node.type === "projectStart"
          ? {
              ...node,
              conditions: [
                {
                  id: "client-id-required",
                  label: "Client / Lead ID is created",
                  required: true,
                  checked: Boolean(identity.clientId),
                  locked: true,
                },
              ],
              customFields: {
                ...node.customFields,
                clientId: identity.clientId,
                leadId: identity.leadId,
                projectId: identity.projectNumber,
                legacyJobNumber:
                  typeof identity.legacyJobNumber === "string" ? identity.legacyJobNumber : "",
              },
            }
          : node,
      ),
    },
    operations,
  };
}
