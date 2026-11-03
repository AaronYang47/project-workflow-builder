import { isReleaseConditionChapter, RELEASE_CONDITION_INBOX_ID } from "@/lib/release-condition-inbox";
import type { Condition, WorkflowFile } from "@/types/workflow";

export interface ReleaseConditionImportRow {
  label: string;
  chapterId?: string;
  conditionId?: string;
}

export interface ReleaseConditionImportResult {
  addedAssigned: number;
  addedUnassigned: number;
  updated: number;
  moved: number;
  unchanged: number;
  inboxChanged: boolean;
  changedNodeIds: string[];
}

export function applyReleaseConditionImport(file: WorkflowFile, rows: ReleaseConditionImportRow[]) {
  const chapters = file.graph.nodes.filter(isReleaseConditionChapter);
  const chapterIds = new Set(chapters.map((node) => node.id));
  const existing = new Map<string, { nodeId: string; condition: Condition }>();
  for (const condition of file.releaseConditionInbox ?? []) {
    if (condition.id) existing.set(condition.id, { nodeId: RELEASE_CONDITION_INBOX_ID, condition });
  }
  for (const chapter of chapters) {
    for (const condition of chapter.conditions) {
      if (condition.id) existing.set(condition.id, { nodeId: chapter.id, condition });
    }
  }

  const seen = new Set<string>();
  const destination = new Map<string, Condition[]>();
  const movedExecutionItems = new Map<string, string>();
  const result: ReleaseConditionImportResult = {
    addedAssigned: 0, addedUnassigned: 0, updated: 0, moved: 0, unchanged: 0,
    inboxChanged: false, changedNodeIds: [],
  };
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) continue;
    const targetId = row.chapterId && chapterIds.has(row.chapterId) ? row.chapterId : RELEASE_CONDITION_INBOX_ID;
    let condition: Condition;
    if (row.conditionId) {
      if (seen.has(row.conditionId)) throw new Error(`Condition ID ${row.conditionId} appears more than once in the spreadsheet.`);
      const previous = existing.get(row.conditionId);
      if (!previous) throw new Error(`Condition ID ${row.conditionId} is not in this project. Download a fresh template or clear the ID to add a new condition.`);
      seen.add(row.conditionId);
      if (previous.condition.locked && (label !== previous.condition.label || targetId !== previous.nodeId)) {
        throw new Error(`“${previous.condition.label}” is locked and cannot be edited or moved from Excel.`);
      }
      if (previous.condition.linkedExecutionItemId && targetId === RELEASE_CONDITION_INBOX_ID) {
        throw new Error(`“${previous.condition.label}” is linked to L3 and cannot be moved to Unassigned.`);
      }
      condition = { ...previous.condition, label };
      if (targetId !== previous.nodeId) {
        result.moved++;
        if (condition.linkedExecutionItemId) movedExecutionItems.set(condition.linkedExecutionItemId, targetId);
      } else if (label !== previous.condition.label) result.updated++;
      else result.unchanged++;
    } else {
      condition = { id: `condition-${crypto.randomUUID()}`, label, required: true, checked: false };
      if (targetId === RELEASE_CONDITION_INBOX_ID) result.addedUnassigned++;
      else result.addedAssigned++;
    }
    destination.set(targetId, [...(destination.get(targetId) ?? []), condition]);
  }

  const nextList = (nodeId: string, current: Condition[]) => [
    ...current.filter((condition) => !condition.id || !seen.has(condition.id)),
    ...(destination.get(nodeId) ?? []),
  ];
  const nextInbox = nextList(RELEASE_CONDITION_INBOX_ID, file.releaseConditionInbox ?? []);
  result.inboxChanged = JSON.stringify(nextInbox) !== JSON.stringify(file.releaseConditionInbox ?? []);
  const nextNodes = file.graph.nodes.map((node) => {
    if (!isReleaseConditionChapter(node)) return node;
    const conditions = nextList(node.id, node.conditions);
    if (JSON.stringify(conditions) === JSON.stringify(node.conditions)) return node;
    result.changedNodeIds.push(node.id);
    return { ...node, conditions };
  });
  const execution = movedExecutionItems.size && file.execution
    ? { ...file.execution, items: file.execution.items.map((item) => {
      const nodeId = movedExecutionItems.get(item.id);
      return nodeId ? { ...item, linkedLayer2NodeId: nodeId } : item;
    }) }
    : file.execution;
  const nextFile = result.inboxChanged || result.changedNodeIds.length || movedExecutionItems.size
    ? { ...file, releaseConditionInbox: nextInbox, graph: { ...file.graph, nodes: nextNodes }, execution }
    : file;
  return { file: nextFile, result };
}
