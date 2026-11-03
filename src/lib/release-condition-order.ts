import { orderHighLevelNodes } from "@/lib/high-level-workflow";
import type { DomainNode, WorkflowFile } from "@/types/workflow";

/** Keep the Release Conditions board in the same order as its linked L1 workflow. */
export function orderReleaseConditionChapters(
  chapters: DomainNode[],
  file: WorkflowFile,
) {
  const highLevel = file.highLevel?.graph;
  if (!highLevel) return chapters;

  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const seen = new Set<string>();
  const orderedLinkedChapters = orderHighLevelNodes(highLevel.nodes, highLevel.edges)
    .flatMap((step) => step.linkedLayer2NodeIds ?? step.linkedDetailedNodeIds ?? [])
    .flatMap((id) => {
      const chapter = chapterById.get(id);
      if (!chapter || seen.has(id)) return [];
      seen.add(id);
      return [chapter];
    });

  if (!orderedLinkedChapters.length) return chapters;

  const linkedIds = new Set(orderedLinkedChapters.map((chapter) => chapter.id));
  return [...orderedLinkedChapters, ...chapters.filter((chapter) => !linkedIds.has(chapter.id))];
}
