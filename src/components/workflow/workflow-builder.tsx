"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AuthGate } from "./auth-gate";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode, NodeLayout } from "@/types/workflow";

const TopToolbar = dynamic(() => import("./top-toolbar").then((module) => module.TopToolbar), { ssr: false });
const NodeLibrary = dynamic(() => import("./node-library").then((module) => module.NodeLibrary), { ssr: false });
const Inspector = dynamic(() => import("./inspector").then((module) => module.Inspector), { ssr: false });
const WorkflowCanvas = dynamic(() => import("./workflow-canvas").then((module) => module.WorkflowCanvas), { ssr: false });
const HighLevelWorkflowView = dynamic(() => import("./high-level-workflow-view").then((module) => module.HighLevelWorkflowView), { ssr: false });
const ExecutionView = dynamic(() => import("./execution-view").then((module) => module.ExecutionView), { ssr: false });
const ValidationPanel = dynamic(() => import("./validation-panel").then((module) => module.ValidationPanel), { ssr: false });
const CommandPalette = dynamic(() => import("./command-palette").then((module) => module.CommandPalette), { ssr: false });
const DeleteBlockedDialog = dynamic(() => import("./delete-blocked-dialog").then((module) => module.DeleteBlockedDialog), { ssr: false });

function subscribeToMediaQuery(
  query: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
) {
  // Older iOS Safari exposes the legacy addListener API only. Keep the
  // responsive panel guard compatible so the app can boot on those devices.
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }

  if (typeof query.addListener === "function") {
    query.addListener(listener);
    return () => query.removeListener(listener);
  }

  return () => undefined;
}

export default function WorkflowBuilder() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [viewportMode, setViewportMode] = useState<"mobile" | "desktop" | null>(null);
  const [isHighLevelView, setIsHighLevelView] = useState(true);
  const [executionNodeId, setExecutionNodeId] = useState<string | null>(null);
  const isExecutionView = executionNodeId !== null;
  const [layer1FocusRequest, setLayer1FocusRequest] = useState<string | null>(null);
  const [layer2FocusRequest, setLayer2FocusRequest] = useState<string[] | null>(null);
  const requestLayer2Focus = useCallback((nodeIds: string[]) => {
    setLayer2FocusRequest(nodeIds);
  }, []);
  const clearLayer2FocusRequest = useCallback(() => {
    setLayer2FocusRequest(null);
  }, []);
  const clearLayer1FocusRequest = useCallback(() => {
    setLayer1FocusRequest(null);
  }, []);
  const openLayer1Context = useCallback((nodeId: string) => {
    if (nodeId) {
      useWorkflowStore.getState().selectHighLevelNodes([nodeId]);
      setLayer1FocusRequest(nodeId);
    }
    setExecutionNodeId(null);
    setIsHighLevelView(true);
  }, []);
  const openExecutionView = useCallback((nodeId?: string) => {
    const selectedId = nodeId || useWorkflowStore.getState().selection.nodeIds[0];
    if (
      !selectedId ||
      !useWorkflowStore
        .getState()
        .file.graph.nodes.some((node) => node.id === selectedId)
    ) {
      return;
    }
    useWorkflowStore.getState().selectNodes([selectedId]);
    setIsHighLevelView(false);
    setExecutionNodeId(selectedId);
  }, []);
  const closeExecutionView = useCallback(() => {
    setExecutionNodeId(null);
  }, []);
  const copied = useRef<
    { items: Array<{ node: DomainNode; layout: NodeLayout }> } | null
  >(null);
  const { leftOpen, rightOpen, validationOpen, selection, togglePanel } =
    useWorkflowStore();
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    const compact = window.matchMedia("(max-width: 1023px)");
    const adaptPanels = () => {
      const state = useWorkflowStore.getState();
      setViewportMode(mobile.matches ? "mobile" : "desktop");
      if (compact.matches && state.rightOpen) state.togglePanel("right");
      if (mobile.matches && state.leftOpen) state.togglePanel("left");
    };
    adaptPanels();
    const unsubscribeMobile = subscribeToMediaQuery(mobile, adaptPanels);
    const unsubscribeCompact = subscribeToMediaQuery(compact, adaptPanels);
    return () => {
      unsubscribeMobile();
      unsubscribeCompact();
    };
  }, []);
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
      } else if (
        !executionNodeId &&
        command &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        store.duplicateSelected();
      } else if (
        !executionNodeId &&
        command &&
        event.key.toLowerCase() === "c"
      ) {
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
        !executionNodeId &&
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
        !executionNodeId &&
        ["Backspace", "Delete"].includes(event.key) &&
        (isHighLevelView
          ? store.highLevelSelection.nodeIds.length || store.highLevelSelection.edgeId
          : store.selection.nodeIds.length || store.selection.edgeId)
      ) {
        event.preventDefault();
        if (isHighLevelView) {
          if (store.highLevelSelection.nodeIds.length) {
            store.deleteHighLevelNodes(store.highLevelSelection.nodeIds);
          } else if (store.highLevelSelection.edgeId) {
            store.deleteHighLevelEdge(store.highLevelSelection.edgeId);
          }
        } else store.deleteSelected();
      } else if (event.key === "Escape") {
        if (store.deleteBlocked) store.dismissDeleteBlocked();
        else {
          setPaletteOpen(false);
          store.selectNodes([]);
          store.selectHighLevelNodes([]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [executionNodeId, isHighLevelView]);

  if (viewportMode === null) {
    return <main className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground"><p className="text-xs">Loading workflow…</p></main>;
  }

  return (
    <AuthGate>
    <main className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <TopToolbar
        openPalette={() => setPaletteOpen(true)}
        isHighLevelView={isHighLevelView}
        isExecutionView={isExecutionView}
        canOpenExecutionView={
          !isHighLevelView && selection.nodeIds.length === 1
        }
        onOpenExecutionView={() => openExecutionView()}
        onCloseExecutionView={closeExecutionView}
        onToggleHighLevelView={() => {
          setExecutionNodeId(null);
          setIsHighLevelView((active) => !active);
        }}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {leftOpen && !isExecutionView ? (
          <div className="absolute inset-y-0 left-0 z-30 block md:relative md:inset-auto md:z-20">
            <NodeLibrary highLevelMode={isHighLevelView} />
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
            {(!isHighLevelView && !isExecutionView) ? (
              <WorkflowCanvas
                active={!isHighLevelView && !isExecutionView}
                focusNodeIds={layer2FocusRequest}
                onFocusRequestHandled={clearLayer2FocusRequest}
                onOpenLayer1Node={openLayer1Context}
              />
            ) : null}
            {isHighLevelView ? (
              <HighLevelWorkflowView
                onExit={() => setIsHighLevelView(false)}
                onFocusLayer2Nodes={requestLayer2Focus}
                focusNodeId={layer1FocusRequest}
                onFocusRequestHandled={clearLayer1FocusRequest}
              />
            ) : null}
            {isExecutionView && executionNodeId ? (
              <ExecutionView
                nodeId={executionNodeId}
                onBack={closeExecutionView}
                onSelectNode={(nextId) => setExecutionNodeId(nextId)}
              />
            ) : null}
            {!leftOpen && !isExecutionView ? (
              <button
                onClick={() => togglePanel("left")}
                className="panel-edge-toggle left-0 rounded-l-none border-l-0"
                aria-label="Open node library"
                title="Show node library"
              >
                <ChevronRight className="size-4" />
              </button>
            ) : null}
            {!rightOpen && !isExecutionView ? (
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
          {validationOpen && !isExecutionView ? (
            <ValidationPanel highLevelMode={isHighLevelView} />
          ) : null}
        </div>
        {rightOpen && !isExecutionView ? (
          <div className="absolute inset-y-0 right-0 z-30 flex h-full min-h-0 lg:relative lg:inset-auto lg:z-20">
            <button
              onClick={() => togglePanel("right")}
              className="panel-edge-toggle -left-3"
              aria-label="Close inspector"
              title="Hide inspector"
            >
              <ChevronRight className="size-4" />
            </button>
            <Inspector
              highLevelMode={isHighLevelView}
              onOpenExecutionView={openExecutionView}
            />
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
