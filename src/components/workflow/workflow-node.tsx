"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { GateNode } from "./gate-node";
import { GeneralNode } from "./general-node";
import { OpportunityNode } from "./opportunity-node";
import type { WorkflowFlowNode } from "./node-utils";

import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { useWorkflowStore } from "@/store/workflow-store";

function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const node = data.domain;
  const remotePeers = useCollaborationStore((state) => state.remotePeers);
  const activeCollaborator = Object.values(remotePeers).find(
    (peer) => peer.focusedNodeId === node.id && Date.now() - peer.lastActiveAt < 30000,
  );

  const storeSelected = useWorkflowStore((state) =>
    state.selection.nodeIds.includes(node.id),
  );
  const isSelected = selected || storeSelected;
  const selectNodes = useWorkflowStore((state) => state.selectNodes);
  const selectEdge = useWorkflowStore((state) => state.selectEdge);

  const handleSelectNode = (e: React.SyntheticEvent) => {
    if (typeof window !== "undefined") {
      (
        window as unknown as { __lastNodeClickTime?: number }
      ).__lastNodeClickTime = Date.now();
    }
    const currentSelection = useWorkflowStore.getState().selection;
    if (!currentSelection.nodeIds.includes(node.id) || currentSelection.edgeId) {
      selectNodes([node.id]);
      selectEdge(undefined);
      useCollaborationStore.getState().setFocusedNodeId(node.id);
    }
  };

  let inner = null;
  if (node.type === "gate") {
    inner = <GateNode node={node} selected={isSelected} />;
  } else if (node.type === "opportunityValidation") {
    inner = <OpportunityNode node={node} selected={isSelected} />;
  } else {
    inner = (
      <GeneralNode
        node={node}
        selected={isSelected}
        emphasized={data.emphasized}
        dimmed={data.dimmed}
        reached={data.reached}
      />
    );
  }

  const content = (
    <div
      onClick={handleSelectNode}
      onPointerDownCapture={handleSelectNode}
      className="h-full w-full"
    >
      {inner}
    </div>
  );

  if (!activeCollaborator) {
    return content;
  }

  return (
    <div className="relative group h-full w-full">
      {/* Remote Collaborator Halo & Badge */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-2xl ring-2 transition-all duration-300 z-20"
        style={{
          boxShadow: `0 0 12px ${activeCollaborator.color}40`,
          borderColor: activeCollaborator.color,
        }}
      />
      <div
        className="pointer-events-none absolute -top-3.5 right-4 z-30 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold text-white shadow-md transition-transform"
        style={{ backgroundColor: activeCollaborator.color }}
      >
        <span className="size-1.5 rounded-full bg-white animate-pulse" />
        <span>{activeCollaborator.name}</span>
      </div>
      {content}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);