"use client";

import { normalizePreviousPhaseDependencies } from "@/lib/process-dependencies";
import {
  parseReleaseConditionLines,
  RELEASE_CONDITION_INBOX_ID,
} from "@/lib/release-condition-inbox";
import { applyReleaseConditionImport } from "@/lib/release-condition-import";
import { patchNode } from "@/lib/workflow-graph";
import { appendHistory } from "@/store/workflow-persist";
import type { Condition, DomainNode } from "@/types/workflow";
import { broadcastIfLocal } from "@/store/workflow-store-helpers";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

export type ReleaseConditionsSlice = Pick<
  WorkflowState,
  | "deleteNodeCondition"
  | "addReleaseConditionLines"
  | "ensureReleaseConditionIds"
  | "importReleaseConditions"
  | "setReleaseConditionInbox"
  | "moveNodeCondition"
>;

/** Release conditions: inbox, import, ordering and moves between chapters. */
export function createReleaseConditionsSlice(set: StoreSet, get: StoreGet): ReleaseConditionsSlice {
  return {
    deleteNodeCondition: (nodeId, conditionId, conditionIndex) => {
      let deleted = false;
      let nextConditions: DomainNode["conditions"] = [];
      let linkedExecutionItemId: string | undefined;
      get().commit((file) => {
        const node = file.graph.nodes.find((item) => item.id === nodeId);
        if (!node) return file;
        const index = conditionId
          ? node.conditions.findIndex((condition) => condition.id === conditionId)
          : (conditionIndex ?? -1);
        const condition = node.conditions[index];
        if (!condition || condition.locked) return file;

        deleted = true;
        nextConditions = node.conditions.filter((_, itemIndex) => itemIndex !== index);
        linkedExecutionItemId = condition.linkedExecutionItemId;
        let nextFile = patchNode(file, nodeId, { conditions: nextConditions });
        // Rows that followed the deleted condition now follow what it followed
        // (or start with the Phase), so the L4 schedule doesn't break.
        const deletedId = condition.id || `index-${index}`;
        nextFile = {
          ...nextFile,
          graph: {
            ...nextFile.graph,
            nodes: nextFile.graph.nodes.map((item) =>
              item.conditions.some(
                (entry) =>
                  entry.predecessor?.nodeId === nodeId &&
                  entry.predecessor.conditionId === deletedId,
              )
                ? {
                    ...item,
                    conditions: item.conditions.map((entry) =>
                      entry.predecessor?.nodeId === nodeId &&
                      entry.predecessor.conditionId === deletedId
                        ? {
                            ...entry,
                            predecessor: condition.predecessor,
                            ...(condition.predecessor ? {} : { startOffsetDays: 0 }),
                          }
                        : entry,
                    ),
                  }
                : item,
            ),
          },
        };

        // A release condition can create a local L3 requirement when its
        // form is opened. Remove that orphan with the condition, while
        // preserving any catalog-controlled ProFab record.
        if (linkedExecutionItemId && nextFile.execution) {
          const linkedItem = nextFile.execution.items.find(
            (item) => item.id === linkedExecutionItemId,
          );
          if (linkedItem && !linkedItem.catalogId) {
            nextFile = {
              ...nextFile,
              execution: {
                ...nextFile.execution,
                items: nextFile.execution.items.filter((item) => item.id !== linkedExecutionItemId),
              },
            };
          }
        }
        return nextFile;
      });
      if (!deleted) return;

      set({ focusedInspectorField: undefined });
      broadcastIfLocal((senderId) => ({
        type: "PATCH_NODE",
        senderId,
        nodeId,
        patch: { conditions: nextConditions },
        timestamp: Date.now(),
      }));
    },
    addReleaseConditionLines: (input) => {
      const added = parseReleaseConditionLines(input);
      if (!added.length) return 0;
      get().setReleaseConditionInbox([...(get().file.releaseConditionInbox ?? []), ...added]);
      return added.length;
    },
    ensureReleaseConditionIds: () => {
      const current = get().file;
      const inboxNeedsIds = (current.releaseConditionInbox ?? []).some(
        (condition) => !condition.id,
      );
      const chapterIds = current.graph.nodes
        .filter(
          (node) =>
            (node.type === "general" || node.type === "projectStart") &&
            node.conditions.some((condition) => !condition.id),
        )
        .map((node) => node.id);
      if (!inboxNeedsIds && !chapterIds.length) return;
      get().commitTransient((file) => ({
        ...file,
        releaseConditionInbox: (file.releaseConditionInbox ?? []).map((condition) =>
          condition.id ? condition : { ...condition, id: `condition-${crypto.randomUUID()}` },
        ),
        graph: {
          ...file.graph,
          nodes: file.graph.nodes.map((node) =>
            chapterIds.includes(node.id)
              ? {
                  ...node,
                  conditions: node.conditions.map((condition) =>
                    condition.id
                      ? condition
                      : { ...condition, id: `condition-${crypto.randomUUID()}` },
                  ),
                }
              : node,
          ),
        },
      }));
      const latest = get().file;
      if (inboxNeedsIds)
        broadcastIfLocal((senderId) => ({
          type: "PATCH_RELEASE_CONDITION_INBOX",
          senderId,
          conditions: latest.releaseConditionInbox ?? [],
          timestamp: Date.now(),
        }));
      for (const nodeId of chapterIds) {
        const node = latest.graph.nodes.find((item) => item.id === nodeId);
        if (node)
          broadcastIfLocal((senderId) => ({
            type: "PATCH_NODE",
            senderId,
            nodeId,
            patch: { conditions: node.conditions },
            timestamp: Date.now(),
          }));
      }
    },
    importReleaseConditions: (rows) => {
      const applied = applyReleaseConditionImport(get().file, rows);
      if (applied.file === get().file) return applied.result;
      get().commit(() => applied.file);
      const latest = get().file;
      if (applied.result.inboxChanged)
        broadcastIfLocal((senderId) => ({
          type: "PATCH_RELEASE_CONDITION_INBOX",
          senderId,
          conditions: latest.releaseConditionInbox ?? [],
          timestamp: Date.now(),
        }));
      for (const chapterId of applied.result.changedNodeIds) {
        const node = latest.graph.nodes.find((item) => item.id === chapterId);
        if (node)
          broadcastIfLocal((senderId) => ({
            type: "PATCH_NODE",
            senderId,
            nodeId: chapterId,
            patch: { conditions: node.conditions },
            timestamp: Date.now(),
          }));
      }
      return applied.result;
    },
    setReleaseConditionInbox: (conditions) => {
      const previous = get().file.releaseConditionInbox ?? [];
      if (JSON.stringify(previous) === JSON.stringify(conditions)) return;
      get().commit((file) => {
        const retainedItemIds = new Set([
          ...conditions.map((condition) => condition.linkedExecutionItemId),
          ...file.graph.nodes.flatMap((node) =>
            node.conditions.map((condition) => condition.linkedExecutionItemId),
          ),
        ]);
        const removedItemIds = new Set(
          previous
            .map((condition) => condition.linkedExecutionItemId)
            .filter((id) => id && !retainedItemIds.has(id)),
        );
        return {
          ...file,
          releaseConditionInbox: conditions,
          execution: file.execution
            ? {
                ...file.execution,
                items: file.execution.items.filter(
                  (item) => !removedItemIds.has(item.id) || Boolean(item.catalogId),
                ),
              }
            : file.execution,
        };
      });
      broadcastIfLocal((senderId) => ({
        type: "PATCH_RELEASE_CONDITION_INBOX",
        senderId,
        conditions,
        timestamp: Date.now(),
      }));
    },
    moveNodeCondition: (sourceNodeId, sourceIndex, targetNodeId, targetIndex) => {
      const previousFile = get().file;
      set((state) => {
        const fromInbox = sourceNodeId === RELEASE_CONDITION_INBOX_ID;
        const toInbox = targetNodeId === RELEASE_CONDITION_INBOX_ID;
        const source = state.file.graph.nodes.find((node) => node.id === sourceNodeId);
        const target = state.file.graph.nodes.find((node) => node.id === targetNodeId);
        const sourceConditionsAll = fromInbox
          ? (state.file.releaseConditionInbox ?? [])
          : (source?.conditions ?? []);
        if ((!target && !toInbox) || !sourceConditionsAll[sourceIndex]) return state;
        if (sourceNodeId === targetNodeId && sourceIndex === targetIndex) return state;
        const original = sourceConditionsAll[sourceIndex];
        if (
          original.locked &&
          !(
            original.id === "project-id-required" &&
            source?.type === "projectStart" &&
            sourceNodeId === targetNodeId
          )
        )
          return state;
        const documentFields = { ...original.unassignedDocumentFields };
        const sourceFields = { ...source?.customFields };
        const suffix = `::release-condition::${original.id?.trim() || "default"}`;
        if (sourceNodeId !== targetNodeId && !fromInbox) {
          for (const [key, value] of Object.entries(sourceFields)) {
            if (key.endsWith(suffix)) {
              documentFields[key] = value;
              delete sourceFields[key];
            }
          }
          if (sourceIndex === 0) {
            for (const field of ["legalDocuments", "customerDocuments", "supportingDocuments"]) {
              if (sourceFields[field] !== undefined) {
                documentFields[`${field}${suffix}`] ??= sourceFields[field];
                delete sourceFields[field];
              }
            }
          }
        }
        const { unassignedDocumentFields: _parkedFields, ...condition } = original;
        void _parkedFields;
        const moved = toInbox
          ? { ...condition, unassignedDocumentFields: documentFields }
          : condition;
        const sourceConditions = sourceConditionsAll.filter((_, index) => index !== sourceIndex);
        const targetConditions =
          sourceNodeId === targetNodeId
            ? sourceConditions
            : toInbox
              ? [...(state.file.releaseConditionInbox ?? [])]
              : [...target!.conditions];
        targetConditions.splice(
          Math.max(0, Math.min(targetIndex, targetConditions.length)),
          0,
          moved,
        );
        const nodes = state.file.graph.nodes.map((node) =>
          node.id === sourceNodeId
            ? {
                ...node,
                conditions: sourceNodeId === targetNodeId ? targetConditions : sourceConditions,
                ...(sourceNodeId !== targetNodeId ? { customFields: sourceFields } : {}),
              }
            : node.id === targetNodeId && !toInbox
              ? {
                  ...node,
                  conditions: targetConditions,
                  customFields: { ...node.customFields, ...documentFields },
                }
              : node,
        );
        const relocatePredecessor = (item: Condition): Condition =>
          sourceNodeId !== targetNodeId &&
          original.id &&
          item.predecessor?.nodeId === sourceNodeId &&
          item.predecessor.conditionId === original.id
            ? { ...item, predecessor: { ...item.predecessor, nodeId: targetNodeId } }
            : item;
        const relocatedNodes = nodes.map((node) => {
          const conditions = node.conditions.map(relocatePredecessor);
          return conditions.some((condition, index) => condition !== node.conditions[index])
            ? { ...node, conditions }
            : node;
        });
        const nextInbox = toInbox
          ? targetConditions
          : fromInbox
            ? sourceConditions
            : state.file.releaseConditionInbox;
        const execution = state.file.execution;
        return {
          past: appendHistory(state.past, state.file),
          file: normalizePreviousPhaseDependencies({
            ...state.file,
            releaseConditionInbox: nextInbox?.map(relocatePredecessor),
            graph: { ...state.file.graph, nodes: relocatedNodes },
            execution:
              execution && moved.linkedExecutionItemId && sourceNodeId !== targetNodeId
                ? {
                    ...execution,
                    items: execution.items.map((item) =>
                      item.id === moved.linkedExecutionItemId
                        ? { ...item, linkedLayer2NodeId: targetNodeId }
                        : item,
                    ),
                  }
                : execution,
          }),
          future: [],
          dirty: true,
        };
      });
      if (get().file !== previousFile) {
        if (
          sourceNodeId === RELEASE_CONDITION_INBOX_ID ||
          targetNodeId === RELEASE_CONDITION_INBOX_ID ||
          JSON.stringify(previousFile.releaseConditionInbox) !==
            JSON.stringify(get().file.releaseConditionInbox)
        ) {
          broadcastIfLocal((senderId) => ({
            type: "PATCH_RELEASE_CONDITION_INBOX",
            senderId,
            conditions: get().file.releaseConditionInbox ?? [],
            timestamp: Date.now(),
          }));
        }
        const changedIds = get()
          .file.graph.nodes.filter(
            (node) => node !== previousFile.graph.nodes.find((previous) => previous.id === node.id),
          )
          .map((node) => node.id);
        for (const nodeId of new Set([sourceNodeId, targetNodeId, ...changedIds])) {
          const node = get().file.graph.nodes.find((node) => node.id === nodeId);
          if (node)
            broadcastIfLocal((senderId) => ({
              type: "PATCH_NODE",
              senderId,
              nodeId,
              patch: { conditions: node.conditions, customFields: node.customFields },
              timestamp: Date.now(),
            }));
        }
      }
    },
  };
}
