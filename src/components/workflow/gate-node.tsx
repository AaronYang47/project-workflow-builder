"use client";

import { NodeResizer } from "@xyflow/react";
import { getGateLayoutMetrics, withMeasuredGateHeight } from "@/lib/gate-layout";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { GateRules } from "./gate-rules";

export function GateNode({
  node,
  selected,
}: {
  node: DomainNode;
  selected: boolean;
}) {
  const layoutHeight = useWorkflowStore(
    (state) => state.file.layout.nodes[node.id]?.height,
  );
  const metrics = withMeasuredGateHeight(
    getGateLayoutMetrics(node),
    layoutHeight,
  );
  return (
    <div data-canvas-node className="relative h-full w-full overflow-visible rounded-2xl">
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
      <GateRules node={node} />
    </div>
  );
}