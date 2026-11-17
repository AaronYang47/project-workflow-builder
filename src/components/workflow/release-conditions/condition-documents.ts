"use client";

import { type DomainNode } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  findChapterCondition,
  type WorkspaceDocument,
  type DocumentField,
  conditionDocuments,
} from "@/lib/release-conditions-workspace-model";

/** Store-backed edits to the documents attached to one release condition.
 * Each condition keeps its list as JSON in the chapter's customFields. */
export const saveConditionDocuments = (
  chapterId: string,
  conditionId: string | undefined,
  conditionIndex: number,
  field: DocumentField,
  documents: WorkspaceDocument[],
) => {
  const latest = useWorkflowStore.getState().file.graph.nodes.find((node) => node.id === chapterId);
  if (!latest) return;
  const condition = findChapterCondition(latest, conditionId, conditionIndex);
  if (!condition) return;
  const key = `${field}::release-condition::${condition.id?.trim() || "default"}`;
  useWorkflowStore.getState().updateNode(latest.id, {
    customFields: { ...latest.customFields, [key]: JSON.stringify(documents) },
  });
};

export const removeConditionDocument = (
  chapter: DomainNode,
  conditionId: string | undefined,
  conditionIndex: number,
  field: DocumentField,
  documentId: string,
) => {
  const latest = useWorkflowStore
    .getState()
    .file.graph.nodes.find((node) => node.id === chapter.id);
  const condition = findChapterCondition(latest, conditionId, conditionIndex);
  if (!latest || !condition) return;
  const documents = conditionDocuments(latest, condition, field).filter(
    (document) => document.id !== documentId,
  );
  saveConditionDocuments(latest.id, condition.id, conditionIndex, field, documents);
};
