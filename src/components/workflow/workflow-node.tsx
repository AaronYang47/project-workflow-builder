"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { GateNode } from "./gate-node";
import { GeneralNode } from "./general-node";
import { OpportunityNode } from "./opportunity-node";
import type { WorkflowFlowNode } from "./node-utils";

import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";

function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const node = data.domain;
  const remotePeers = useCollaborationStore((state) => state.remotePeers);
  const activeCollaborator = Object.values(remotePeers).find(
    (peer) => peer.focusedNodeId === node.id && Date.now() - peer.lastActiveAt < 30000,
  );

  let inner = null;
  if (node.type === "gate") {
    inner = <GateNode node={node} selected={selected} />;
  } else if (node.type === "opportunityValidation") {
    inner = <OpportunityNode node={node} selected={selected} />;
  } else {
    inner = (
      <GeneralNode
        node={node}
        selected={selected}
        emphasized={data.emphasized}
        dimmed={data.dimmed}
        reached={data.reached}
      />
    );
  }

  if (!activeCollaborator) {
    return inner;
  }

  return (
    <div className="relative group">
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
      {inner}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);