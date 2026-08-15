"use client";
import { useMemo, useState } from "react";
import { GripVertical, Search, Shapes } from "lucide-react";
import { AVAILABLE_NODE_CATALOG } from "@/lib/node-catalog";
import { useWorkflowStore } from "@/store/workflow-store";
import type { WorkflowNodeType } from "@/types/workflow";

export function NodeLibrary() {
  const [query, setQuery] = useState("");
  const catalog = useMemo(
    () =>
      AVAILABLE_NODE_CATALOG.filter((item) =>
        `${item.label} ${item.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );
  const hasProjectStart = useWorkflowStore((state) =>
    state.file.graph.nodes.some((node) => node.type === "projectStart"),
  );
  const onDragStart = (event: React.DragEvent, type: WorkflowNodeType) => {
    event.dataTransfer.setData("application/workflow-node", type);
    event.dataTransfer.effectAllowed = "move";
  };
  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r bg-panel">
      <div className="flex h-12 items-center gap-2 border-b px-3">
        <Shapes className="size-4 text-primary" />
        <span className="text-sm font-semibold">Nodes</span>
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
          const disabled = item.type === "projectStart" && hasProjectStart;
          return (
            <button
              type="button"
              key={item.type}
              disabled={disabled}
              draggable={!disabled}
              onDragStart={(event) => onDragStart(event, item.type)}
              onDoubleClick={() =>
                useWorkflowStore
                  .getState()
                  .addNode(item.type, { x: 420, y: 220 })
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
        Drag to canvas · Drop Decision Module onto a Phase
      </div>
    </aside>
  );
}
