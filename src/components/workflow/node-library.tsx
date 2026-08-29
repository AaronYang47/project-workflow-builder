"use client";
import { useMemo, useState } from "react";
import { GripVertical, Search, Shapes } from "lucide-react";
import { AVAILABLE_NODE_CATALOG } from "@/lib/node-catalog";
import {
  HIGH_LEVEL_NODE_CATALOG,
  type HighLevelNodeDefinition,
} from "@/lib/high-level-workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import type { HighLevelNodeType, WorkflowNodeType } from "@/types/workflow";

export function NodeLibrary({ highLevelMode = false }: { highLevelMode?: boolean }) {
  const [query, setQuery] = useState("");
  const catalog = useMemo<Array<typeof AVAILABLE_NODE_CATALOG[number] | HighLevelNodeDefinition>>(
    () =>
      (highLevelMode ? HIGH_LEVEL_NODE_CATALOG : AVAILABLE_NODE_CATALOG).filter((item) =>
        `${item.label} ${item.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [highLevelMode, query],
  );
  const hasProjectStart = useWorkflowStore((state) =>
    state.file.graph.nodes.some((node) => node.type === "projectStart"),
  );
  const onDragStart = (
    event: React.DragEvent,
    type: WorkflowNodeType | HighLevelNodeType,
  ) => {
    event.dataTransfer.setData(
      highLevelMode ? "application/high-level-node" : "application/workflow-node",
      type,
    );
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <aside className="flex h-full w-[248px] max-w-[calc(100vw-16px)] shrink-0 flex-col border-r bg-panel">
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Shapes className="size-4 text-primary" />
        <span className="text-sm font-semibold">
          {highLevelMode ? "High-Level Nodes" : "Nodes"}
        </span>
      </div>
      <div className="p-3">
        <label className="relative block">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes"
            className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto px-3 pb-5">
        {catalog.map((item) => {
          const Icon = item.icon;
          const disabled = !highLevelMode && item.type === "projectStart" && hasProjectStart;
          return (
            <button
              type="button"
              key={item.type}
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(event) => onDragStart(event, item.type)}
              onDoubleClick={() =>
                highLevelMode
                  ? useWorkflowStore
                      .getState()
                      .addHighLevelNode(item.type as HighLevelNodeType, { x: 420, y: 220 })
                  : useWorkflowStore
                      .getState()
                      .addNode(item.type as WorkflowNodeType, { x: 420, y: 220 })
              }
              className="group flex w-full items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2.5 text-left shadow-sm transition hover:border-primary/40 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border disabled:hover:shadow-sm"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ background: item.color }}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">
                  {item.label}
                </span>
                <span className="block whitespace-normal break-words text-xs leading-4 text-muted-foreground">
                {disabled ? "Already added to this project" : item.description}
                </span>
              </span>
              <GripVertical className="size-3.5 shrink-0 text-muted-foreground/35 group-hover:text-muted-foreground" />
            </button>
          );
        })}
      </div>
      <div className="border-t px-3 py-2 text-[11px] leading-4 text-muted-foreground">
        {highLevelMode
          ? "Drag to canvas · High-level process nodes"
          : "Drag to canvas · Drop Decision Module onto a Phase"}
      </div>
    </aside>
  );
}
