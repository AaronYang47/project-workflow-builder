"use client";

import { memo, useRef } from "react";
import type { NodeProps } from "@xyflow/react";
import { useNodeScrollContainment } from "@/lib/use-node-scroll-containment";
import { GateNode } from "./gate-node";
import { GeneralNode } from "./general-node";
import { OpportunityNode } from "./opportunity-node";
import { OpportunityDecisionNode } from "./opportunity-decision-node";
import { OpportunitySectionNode } from "./opportunity-section-node";
import type { WorkflowFlowNode } from "./node-utils";

import { useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { useCurrentTime } from "@/lib/use-current-time";
import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import type { ExecutionSummary } from "@/lib/execution";

function ExecutionSummaryBadge({ summary }: { summary?: ExecutionSummary }) {
  if (!summary?.hasItems) return null;

  const blocked = summary.status === "Blocked";
  const ready = summary.status === "Ready" || summary.status === "Passed";
  const Icon = blocked ? CircleAlert : ready ? CheckCircle2 : Clock3;
  const tone = blocked
    ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
    : ready
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const message = blocked
    ? "Blocked by L3 Requirements"
    : ready
      ? summary.status
      : "Execution Requirements Incomplete";

  return (
    <div
      aria-label={`Execution status: ${message}`}
      className={`pointer-events-none absolute bottom-2 right-2 z-30 flex max-w-[calc(100%-16px)] items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold shadow-sm backdrop-blur-sm ${tone}`}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">
        {summary.completedCount}/{summary.itemCount} Requirements Complete
      </span>
      <span className="hidden sm:inline">· {message}</span>
    </div>
  );
}

function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const node = data.domain;
  const rootRef = useRef<HTMLDivElement>(null);
  useNodeScrollContainment(rootRef);

  const remotePeers = useCollaborationStore((state) => state.remotePeers);
  const now = useCurrentTime();
  const activeCollaborator = Object.values(remotePeers).find(
    (peer) =>
      peer.focusedNodeId === node.id && now - peer.lastActiveAt < 30000,
  );

  const inner =
    node.type === "gate" ? (
      <GateNode node={node} selected={selected} />
    ) : node.config.opportunitySection ? (
      <OpportunitySectionNode node={node} selected={selected} />
    ) : node.type === "opportunityValidation" && node.config.opportunityRole === "decisionHub" ? (
      <OpportunityDecisionNode node={node} selected={selected} />
    ) : node.type === "opportunityValidation" ? (
      <OpportunityNode node={node} selected={selected} />
    ) : (
      <GeneralNode
        node={node}
        selected={selected}
        emphasized={data.emphasized}
        dimmed={data.dimmed}
        reached={data.reached}
      />
    );

  const decorated = (
    <div ref={rootRef} className="relative h-full w-full">
      {inner}
      <ExecutionSummaryBadge summary={data.executionSummary} />
    </div>
  );

  if (!activeCollaborator) return decorated;

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
      {decorated}
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);
