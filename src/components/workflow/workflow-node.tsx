"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { GateNode } from "./gate-node";
import { GeneralNode } from "./general-node";
import { OpportunityNode } from "./opportunity-node";
import type { WorkflowFlowNode } from "./node-utils";

function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const node = data.domain;
  if (node.type === "gate") return <GateNode node={node} selected={selected} />;
  if (node.type === "opportunityValidation") {
    return <OpportunityNode node={node} selected={selected} />;
  }
  return (
    <GeneralNode
      node={node}
      selected={selected}
      emphasized={data.emphasized}
      dimmed={data.dimmed}
      reached={data.reached}
    />
  );
}

export const WorkflowNode = memo(WorkflowNodeComponent);