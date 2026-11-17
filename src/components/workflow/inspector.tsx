"use client";
import { HighLevelInspector } from "./high-level-inspector";

import { DetailedInspector } from "./inspector/detailed-inspector";

export function Inspector({
  highLevelMode = false,
  onOpenExecutionView,
}: {
  highLevelMode?: boolean;
  onOpenExecutionView?: (nodeId: string) => void;
}) {
  return highLevelMode ? (
    <HighLevelInspector />
  ) : (
    <DetailedInspector onOpenExecutionView={onOpenExecutionView} />
  );
}
