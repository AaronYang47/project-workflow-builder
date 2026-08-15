"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TopToolbar } from "./top-toolbar";
import { NodeLibrary } from "./node-library";
import { Inspector } from "./inspector";
import { WorkflowCanvas } from "./workflow-canvas";
import { ValidationPanel } from "./validation-panel";
import { AuthGate } from "./auth-gate";
import { CommandPalette } from "./command-palette";
import { DeleteBlockedDialog } from "./delete-blocked-dialog";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, NodeLayout } from "@/types/workflow";

export default function WorkflowBuilder() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const copied = useRef<
    { items: Array<{ node: DomainNode; layout: NodeLayout }> } | null
  >(null);
  const { leftOpen, rightOpen, validationOpen, togglePanel } =
    useWorkflowStore();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement;
      const editing =
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable;
      if (command && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (editing) return;
      const store = useWorkflowStore.getState();
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? store.redo() : store.undo();
      } else if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.dispatchEvent(new Event("workflow:save-cloud"));
      } else if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        store.duplicateSelected();
      } else if (command && event.key.toLowerCase() === "c") {
        const ids = store.selection.nodeIds;
        copied.current = {
          items: ids.flatMap((id) => {
            const node = store.file.graph.nodes.find((item) => item.id === id);
            const layout = store.file.layout.nodes[id];
            return node && layout
              ? [{ node: structuredClone(node), layout: structuredClone(layout) }]
              : [];
          }),
        };
      } else if (
        command &&
        event.key.toLowerCase() === "v" &&
        copied.current?.items.length
      ) {
        event.preventDefault();
        const copy = copied.current;
        const ids: string[] = [];
        store.commit((file) => {
          const nodes = [...file.graph.nodes];
          const layouts = { ...file.layout.nodes };
          copy.items
            .filter(({ node }) => node.type !== "projectStart")
            .forEach(({ node, layout }) => {
            const id = `${node.type}-${crypto.randomUUID().slice(0, 8)}`;
            ids.push(id);
            nodes.push({
              ...structuredClone(node),
              id,
              title: `${node.title} copy`,
            });
            layouts[id] = {
              ...layout,
              nodeId: id,
              x: layout.x + 40,
              y: layout.y + 40,
              parentId: undefined,
            };
          });
          return {
            ...file,
            graph: { ...file.graph, nodes },
            layout: { ...file.layout, nodes: layouts },
          };
        });
        store.selectNodes(ids);
      } else if (
        ["Backspace", "Delete"].includes(event.key) &&
        (store.selection.nodeIds.length || store.selection.edgeId)
      ) {
        event.preventDefault();
        store.deleteSelected();
      } else if (event.key === "Escape") {
        if (store.deleteBlocked) store.dismissDeleteBlocked();
        else {
          setPaletteOpen(false);
          store.selectNodes([]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <AuthGate>
    <main className="flex h-dvh min-h-[480px] flex-col overflow-hidden bg-background text-foreground">
      <TopToolbar openPalette={() => setPaletteOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <div className="absolute bottom-0 left-0 top-14 z-30 block md:relative md:inset-auto md:z-20">
            <NodeLibrary />
            <button
              onClick={() => togglePanel("left")}
              className="panel-edge-toggle -right-3"
              aria-label="Collapse node library"
              title="Hide node library"
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
        ) : null}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <WorkflowCanvas />
            {!leftOpen ? (
              <button
                onClick={() => togglePanel("left")}
                className="panel-edge-toggle left-0 rounded-l-none border-l-0"
                aria-label="Open node library"
                title="Show node library"
              >
                <ChevronRight className="size-4" />
              </button>
            ) : null}
            {!rightOpen ? (
              <button
                onClick={() => togglePanel("right")}
                className="panel-edge-toggle right-0 rounded-r-none border-r-0"
                aria-label="Open inspector"
                title="Show inspector"
              >
                <ChevronLeft className="size-4" />
              </button>
            ) : null}
          </div>
          {validationOpen ? <ValidationPanel /> : null}
        </div>
        {rightOpen ? (
          <div className="absolute bottom-0 right-0 top-14 z-30 block lg:relative lg:inset-auto lg:z-20">
            <button
              onClick={() => togglePanel("right")}
              className="panel-edge-toggle -left-3"
              aria-label="Close inspector"
              title="Hide inspector"
            >
              <ChevronRight className="size-4" />
            </button>
            <Inspector />
          </div>
        ) : null}
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <DeleteBlockedDialog />
    </main>
    </AuthGate>
  );
}
