"use client";

import { useMemo, useState } from "react";
import { type DomainNode, type WorkflowFile } from "@/types/workflow";
import { chapterConditions, buildProcessMap } from "@/lib/release-conditions-workspace-model";

/**
 * Selection on the Release Conditions process map: which Department, step and
 * condition are highlighted, and the data the map and dialogs read from it.
 */
export function useProcessSelection(file: WorkflowFile, chapters: DomainNode[]) {
  const [selectedProcessNodeId, setSelectedProcessNodeId] = useState<string | null>(null);
  const [selectedProcessConditionRef, setSelectedProcessCondition] = useState<{
    id?: string;
    index: number;
  } | null>(null);
  const [selectedProcessStepId, setSelectedProcessStepId] = useState<string | null>(null);
  const processMap = useMemo(() => buildProcessMap(file, chapters), [chapters, file]);

  const selectProcessLocation = (
    nodeId: string | null,
    condition?: { id?: string; index: number } | null,
    stepId?: string | null,
    scrollToBoard = false,
  ) => {
    setSelectedProcessNodeId(nodeId);
    setSelectedProcessCondition(condition ?? null);
    const location = nodeId
      ? processMap.locationsByChapter
          .get(nodeId)
          ?.find((entry) => !stepId || entry.group.id === stepId)
      : undefined;
    setSelectedProcessStepId(stepId ?? location?.group.id ?? null);
    if (scrollToBoard && nodeId) {
      window.requestAnimationFrame(() => {
        const target = Array.from(
          document.querySelectorAll<HTMLElement>("[data-release-condition-chapter-id]"),
        ).find((element) => element.dataset.releaseConditionChapterId === nodeId);
        target?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      });
    }
  };
  const selectedProcessChapter = chapters.find((chapter) => chapter.id === selectedProcessNodeId);
  const selectedProcessLocation = selectedProcessNodeId
    ? (processMap.locationsByChapter
        .get(selectedProcessNodeId)
        ?.find((entry) => entry.group.id === selectedProcessStepId) ??
      processMap.locationsByChapter.get(selectedProcessNodeId)?.[0])
    : undefined;
  const selectedProcessConditionIndex =
    selectedProcessConditionRef && selectedProcessChapter
      ? chapterConditions(selectedProcessChapter).findIndex((condition, index) =>
          selectedProcessConditionRef.id
            ? condition.id === selectedProcessConditionRef.id
            : index === selectedProcessConditionRef.index,
        )
      : -1;
  const selectedProcessCondition =
    selectedProcessConditionIndex >= 0 && selectedProcessChapter
      ? chapterConditions(selectedProcessChapter)[selectedProcessConditionIndex]
      : undefined;
  const selectedProcessConditionIsOptional = Boolean(
    selectedProcessChapter &&
    selectedProcessConditionIndex >= selectedProcessChapter.conditions.length,
  );
  return {
    processMap,
    selectProcessLocation,
    selectedProcessNodeId,
    selectedProcessConditionRef,
    selectedProcessStepId,
    selectedProcessChapter,
    selectedProcessLocation,
    selectedProcessConditionIndex,
    selectedProcessCondition,
    selectedProcessConditionIsOptional,
  };
}

export type ProcessSelection = ReturnType<typeof useProcessSelection>;
