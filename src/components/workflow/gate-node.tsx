"use client";

import { NodeResizer } from "@xyflow/react";
import { getGateLayoutMetrics, withMeasuredGateHeight } from "@/lib/gate-layout";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { cn } from "@/lib/utils";
import { GateRules } from "./gate-rules";

export function GateNode({
  node,
  selected,
  phaseColor,
}: {
  node: DomainNode;
  selected: boolean;
  phaseColor?: string;
}) {
  const layoutHeight = useWorkflowStore(
    (state) => state.file.layout.nodes[node.id]?.height,
  );
  const metrics = withMeasuredGateHeight(
    getGateLayoutMetrics(node),
    layoutHeight,
  );
  return (
    <div
      data-canvas-node
      data-testid="gate-card"
      className={cn(
        "relative h-full w-full overflow-visible rounded-2xl transition duration-200 l2-gate-card",
        selected && "ring-2 ring-primary/80 ring-offset-2 ring-offset-background shadow-lg",
      )}
    >
      <NodeResizer
        minWidth={metrics.width}
        minHeight={metrics.height}
        isVisible={selected}
        onResizeEnd={(_, params) =>
          useWorkflowStore
            .getState()
            .updateLayout(
              node.id,
              { width: params.width, height: params.height },
              true,
            )
        }
        lineClassName="!border-primary"
        handleClassName="!size-2.5 !rounded-sm !border-primary !bg-background"
      />
      <GateRules node={node} phaseColor={phaseColor} />
    </div>
  );
}