"use client";

import { memo } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, GripVertical, Layers3 } from "lucide-react";
import type { DomainNode } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { ComponentNoteButton } from "./component-note-button";
import { ProjectIdBadge } from "./project-id-badge";

export type PhaseFlowNode = Node<{ domain: DomainNode }, "phase">;
const rowsFor = (value: string, characters: number) =>
  Math.max(1, Math.ceil(value.length / characters));

function PhaseNodeComponent({ data }: NodeProps<PhaseFlowNode>) {
  const node = data.domain;
  const selected = useWorkflowStore((state) =>
    state.selection.nodeIds.includes(node.id),
  );
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const color = node.color || "#64748b";
  return (
    <div
      data-canvas-node
      className="h-full w-full rounded-2xl border-2 bg-slate-500/[0.035]"
      style={{ borderColor: `${color}66` }}
    >
      <div className="pointer-events-auto">
        <NodeResizer
          minWidth={420}
          minHeight={260}
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
        />
      </div>
      <div
        data-phase-header
        className="phase-drag-handle pointer-events-auto relative z-10 flex min-h-28 cursor-grab items-center gap-3 overflow-hidden rounded-t-[14px] border-b bg-card/95 px-5 py-3.5 shadow-sm backdrop-blur active:cursor-grabbing"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: color }}
        />
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          <Layers3 className="size-6" />
        </span>
        <label className="min-w-0 flex-1">
          <span className="block text-sm font-black uppercase tracking-[0.15em] text-muted-foreground">
            Phase / Swimlane
          </span>
          <textarea
            aria-label="Phase title"
            defaultValue={node.title}
            rows={rowsFor(node.title, 38)}
            onBlur={(event) =>
              updateNode(node.id, {
                title: event.target.value.trim() || node.title,
              })
            }
            className="nodrag mt-0.5 min-h-8 w-full resize-none overflow-hidden bg-transparent text-2xl font-black uppercase leading-7 tracking-[0.06em] outline-none"
          />
          <textarea
            aria-label="Phase description"
            defaultValue={node.description}
            rows={rowsFor(node.description, 72)}
            onBlur={(event) =>
              updateNode(node.id, { description: event.target.value.trim() })
            }
            className="nodrag mt-0.5 min-h-6 w-full resize-none overflow-hidden bg-transparent text-sm font-medium leading-6 text-muted-foreground outline-none"
          />
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ProjectIdBadge size="large" />
          <ComponentNoteButton
            nodeId={node.id}
            noteKey="phase-card"
            label={`${node.title} phase card`}
          />
          <span
            role="img"
            aria-label="Drag phase"
            className="text-muted-foreground/50"
          >
            <GripVertical className="size-4" />
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

export const PhaseNode = memo(PhaseNodeComponent);
