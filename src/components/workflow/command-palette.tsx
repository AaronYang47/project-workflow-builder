"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { AVAILABLE_NODE_CATALOG } from "@/lib/node-catalog";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const hasProjectStart = useWorkflowStore((state) =>
    state.file.graph.nodes.some((node) => node.type === "projectStart"),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      AVAILABLE_NODE_CATALOG.filter((item) =>
        `${item.label} ${item.description} ${item.category}`
          .toLowerCase()
          .includes(normalizedQuery),
      ),
    [normalizedQuery],
  );

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-50 w-[560px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover shadow-2xl outline-none">
          <Dialog.Title className="sr-only">Search nodes and commands</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search the node library and add a node to the current workflow.
          </Dialog.Description>
          <div className="flex h-12 items-center gap-3 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search nodes or commands…"
              aria-label="Search nodes or commands"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>
          <div className="scroll-thin max-h-[min(420px,65vh)] overflow-y-auto p-2">
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Add node
            </p>
            {results.length ? (
              results.map((item) => {
                const Icon = item.icon;
                const disabled = item.type === "projectStart" && hasProjectStart;
                return (
                  <button
                    type="button"
                    key={item.type}
                    disabled={disabled}
                    onClick={() => {
                      useWorkflowStore
                        .getState()
                        .addNode(item.type, { x: 460, y: 240 });
                      close();
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ background: item.color }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {item.label}
                      </span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {disabled ? "Already added" : item.category}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="flex min-h-28 flex-col items-center justify-center px-6 text-center">
                <Search className="mb-2 size-5 text-muted-foreground/60" />
                <p className="text-sm font-medium">No matching nodes</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a broader name, description, or category.
                </p>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
