"use client";

import { memo } from "react";
import { NodeResizer, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, GripVertical, Layers3 } from "lucide-react";
import type { DomainNode } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  PROJECT_ID_PATTERN,
  legacyJobNumberFromProjectId,
  projectIdForDisplay,
} from "@/lib/project-id";
import { ComponentNoteButton } from "./component-note-button";

export type PhaseFlowNode = Node<{ domain: DomainNode }, "phase">;
const rowsFor = (value: string, characters: number) =>
  Math.max(1, Math.ceil(value.length / characters));

function PhaseNodeComponent({ data }: NodeProps<PhaseFlowNode>) {
  const node = data.domain;
  const selected = useWorkflowStore((state) =>
    state.selection.nodeIds.includes(node.id),
  );
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const projectStartNode = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "projectStart"),
  );
  const serviceType = String(projectStartNode?.config.serviceType || "Standard");
  const rawProjectId = String(
    projectStartNode?.customFields.projectId || "",
  );
  const displayedProjectId = projectIdForDisplay(rawProjectId, serviceType);
  const showBadge = PROJECT_ID_PATTERN.test(displayedProjectId);
  const color = node.color || "#64748b";
  return (
    <div
      data-canvas-node
      className="h-full w-full rounded-2xl border-2 bg-slate-500/[0.035]"
      style={{ borderColor: `${color}66` }}
    >
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
      <div
        data-phase-header
        className="relative z-10 flex min-h-24 cursor-grab items-center gap-3 overflow-hidden rounded-t-[14px] border-b bg-card/95 px-5 py-3 shadow-sm backdrop-blur active:cursor-grabbing"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: color }}
        />
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ backgroundColor: color }}
        >
          <Layers3 className="size-5" />
        </span>
        <label className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
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
            className="nodrag mt-0.5 min-h-7 w-full resize-none overflow-hidden bg-transparent text-lg font-black uppercase leading-6 tracking-[0.06em] outline-none"
          />
          <textarea
            aria-label="Phase description"
            defaultValue={node.description}
            rows={rowsFor(node.description, 72)}
            onBlur={(event) =>
              updateNode(node.id, { description: event.target.value.trim() })
            }
            className="nodrag mt-0.5 min-h-5 w-full resize-none overflow-hidden bg-transparent text-xs font-medium leading-5 text-muted-foreground outline-none"
          />
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {showBadge ? (
            <span
              title={`${displayedProjectId} · Legacy ${legacyJobNumberFromProjectId(displayedProjectId) || "—"}`}
              className="flex flex-col items-end gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 font-mono text-xs font-bold leading-tight tracking-tight text-primary"
            >
              <span>{displayedProjectId}</span>
              <span className="rounded bg-primary/20 px-1 text-[10px] font-bold tracking-tight text-primary">
                Legacy {legacyJobNumberFromProjectId(displayedProjectId) || "—"}
              </span>
            </span>
          ) : null}
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
