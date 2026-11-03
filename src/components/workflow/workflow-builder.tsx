"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CollaborativeViewState } from "@/lib/collaboration/collaboration-types";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { AuthGate } from "./auth-gate";
import { useWorkflowStore } from "@/store/workflow-store";
import { exportPresentationPdf } from "@/lib/presentation-pdf-export";
import { exportExecutivePresentationPdf } from "@/lib/executive-presentation-pdf-export";
import type { DomainNode, NodeLayout } from "@/types/workflow";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { collaborationManager } from "@/lib/collaboration/collaboration-manager";
import { CollaborationControlOverlay } from "./collaboration-control-overlay";
import { useShallow } from "zustand/react/shallow";

const TopToolbar = dynamic(() => import("./top-toolbar").then((module) => module.TopToolbar), { ssr: false });
const NodeLibrary = dynamic(() => import("./node-library").then((module) => module.NodeLibrary), { ssr: false });
const Inspector = dynamic(() => import("./inspector").then((module) => module.Inspector), { ssr: false });
const WorkflowCanvas = dynamic(() => import("./workflow-canvas").then((module) => module.WorkflowCanvas), { ssr: false });
const HighLevelWorkflowView = dynamic(() => import("./high-level-workflow-view").then((module) => module.HighLevelWorkflowView), { ssr: false });
const ExecutionView = dynamic(() => import("./execution-view").then((module) => module.ExecutionView), { ssr: false });
const ValidationPanel = dynamic(() => import("./validation-panel").then((module) => module.ValidationPanel), { ssr: false });
const CommandPalette = dynamic(() => import("./command-palette").then((module) => module.CommandPalette), { ssr: false });
const DeleteBlockedDialog = dynamic(() => import("./delete-blocked-dialog").then((module) => module.DeleteBlockedDialog), { ssr: false });
const ConfirmClearDialog = dynamic(() => import("./confirm-clear-dialog").then((module) => module.ConfirmClearDialog), { ssr: false });
const PyramidLocationWidget = dynamic(() => import("./pyramid-location-widget").then((module) => module.PyramidLocationWidget), { ssr: false });

function RemoteCollaboratorCursors({ view }: { view: CollaborativeViewState }) {
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const surface = document.querySelector("[data-collaboration-surface]");
    if (!surface) return;
    const update = () => setViewport(surface.querySelector<HTMLElement>(".react-flow__viewport"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(surface, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [view.layer, view.executionNodeId]);
  const { isConnected, roomId, remotePeers } = useCollaborationStore(
    useShallow((state) => ({
      isConnected: state.isConnected,
      roomId: state.roomId,
      remotePeers: state.remotePeers,
    })),
  );
  if (!isConnected || roomId === "local-only") return null;

  const visiblePeers = Object.values(remotePeers).filter(
    (peer) => peer.cursor?.view?.layer === view.layer &&
      (view.layer !== "L3" || peer.cursor.view.executionNodeId === view.executionNodeId) &&
      Date.now() - (peer.cursorAt ?? 0) < 30000,
  );
  if (!visiblePeers.length) return null;

  return <>{visiblePeers.map((peer) => {
    const cursor = peer.cursor!;
    const canvas = cursor.space === "canvas";
    if (canvas && !viewport) return null;
    const zoom = viewport ? new DOMMatrix(getComputedStyle(viewport).transform).a || 1 : 1;
    const marker = (
      <div key={peer.peerId} data-remote-cursor={peer.peerId}
        className="pointer-events-none absolute z-[9999]"
        style={{ left: canvas ? cursor.x : `${cursor.x * 100}%`, top: canvas ? cursor.y : `${cursor.y * 100}%`, transform: canvas ? `scale(${1 / zoom})` : undefined, transformOrigin: "0 0" }}>
        <svg className="size-5 drop-shadow" viewBox="0 0 20 24" fill="none">
          <path d="M2 1.5v18l4.8-4.2 3.1 6.4 3-1.4-3.2-6.3 6.5-.4L2 1.5Z" fill={peer.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="ml-3 -mt-1 block max-w-40 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-md" style={{ backgroundColor: peer.color }}>{peer.name}</span>
      </div>
    );
    return canvas ? createPortal(marker, viewport!, peer.peerId) : marker;
  })}</>;

}

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
  const workspaceSurfaceRef = useRef<HTMLDivElement | null>(null);
  const { isCollaborationConnected, editControlReady, editorViewState, remotePeerCount } =
    useCollaborationStore(
      useShallow((state) => ({
        isCollaborationConnected: state.isConnected,
        editControlReady: state.editControlReady,
        editorViewState: state.editorViewState,
        remotePeerCount: Object.keys(state.remotePeers).length,
      })),
    );
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));
  const editorName = useCollaborationStore((state) =>
    state.editorPeerId ? state.remotePeers[state.editorPeerId]?.name : undefined,
  );
  const editorExecutionNodeAvailable = useWorkflowStore((state) =>
    Boolean(editorViewState?.executionNodeId && state.file.graph.nodes.some(
      (node) => node.id === editorViewState.executionNodeId,
    )),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [viewportMode, setViewportMode] = useState<"mobile" | "desktop" | null>(null);
  const [isHighLevelView, setIsHighLevelView] = useState(true);
  useEffect(() => {
    const returnView = sessionStorage.getItem("release-conditions:return-view");
    const layer = new URLSearchParams(window.location.search).get("layer");
    if (layer === "L2" || (!layer && returnView === "l2")) setIsHighLevelView(false);
    sessionStorage.removeItem("release-conditions:return-view");
  }, []);
  const [executionNodeId, setExecutionNodeId] = useState<string | null>(null);
  const [executionItemId, setExecutionItemId] = useState<string | null>(null);
  const [executionConditionId, setExecutionConditionId] = useState<string | null>(null);
  const workflowHydrated = useWorkflowStore((state) => state.hydrated);
  useEffect(() => {
    if (!workflowHydrated || !canEditWorkflow) return;
    const params = new URLSearchParams(window.location.search);
    const nodeId = params.get("executionNode");
    if (!nodeId || !useWorkflowStore.getState().file.graph.nodes.some((node) => node.id === nodeId)) return;
    setIsHighLevelView(false);
    setExecutionNodeId(nodeId);
    setExecutionConditionId(params.get("condition") || null);
  }, [workflowHydrated, canEditWorkflow]);
  const isExecutionView = executionNodeId !== null;
  const currentLayer = isExecutionView ? "L3" : isHighLevelView ? "L1" : "L2";

  useEffect(() => {
    if (!editControlReady || !canEditWorkflow) return;
    collaborationManager.broadcastViewState({
      layer: currentLayer,
      ...(currentLayer === "L3" && executionNodeId ? { executionNodeId } : {}),
    });
  }, [canEditWorkflow, currentLayer, editControlReady, executionNodeId, isCollaborationConnected, remotePeerCount]);

  const applyEditorView = useCallback((view: NonNullable<typeof editorViewState>) => {
    if (view.page && view.page !== "workflow") return;
    if (view.layer === "L1") {
      setIsHighLevelView(true);
      setExecutionNodeId(null);
      setExecutionItemId(null);
      setExecutionConditionId(null);
      return;
    }
    setIsHighLevelView(false);
    if (view.layer === "L3" && view.executionNodeId) {
      const nodeExists = useWorkflowStore.getState().file.graph.nodes.some(
        (node) => node.id === view.executionNodeId,
      );
      if (nodeExists) {
        setExecutionNodeId(view.executionNodeId);
        return;
      }
    }
    setExecutionNodeId(null);
    setExecutionItemId(null);
    setExecutionConditionId(null);
  }, []);
  useEffect(() => {
    if (!editControlReady || canEditWorkflow || !editorViewState) return;
    applyEditorView(editorViewState);
  }, [applyEditorView, canEditWorkflow, editControlReady, editorViewState, editorExecutionNodeAvailable, isCollaborationConnected]);
  const [layer1FocusRequest, setLayer1FocusRequest] = useState<string | null>(null);
  const [layer2FocusRequest, setLayer2FocusRequest] = useState<string[] | null>(null);
  const requestLayer2Focus = useCallback((nodeIds: string[]) => {
    if (!canEditCollaborativeWorkflow()) return;
    setLayer2FocusRequest(nodeIds);
  }, []);
  const clearLayer2FocusRequest = useCallback(() => {
    setLayer2FocusRequest(null);
  }, []);
  const clearLayer1FocusRequest = useCallback(() => {
    setLayer1FocusRequest(null);
  }, []);
  const broadcastEditorCursor = useCallback((event: React.PointerEvent<HTMLDivElement>, force = false) => {
    if (!canEditCollaborativeWorkflow()) return;
    const surface = workspaceSurfaceRef.current;
    if (!surface) return;
    const view: CollaborativeViewState = { layer: currentLayer, ...(executionNodeId ? { executionNodeId } : {}) };
    const canvas = (event.target as HTMLElement).closest<HTMLElement>(".react-flow");
    const viewport = canvas?.querySelector<HTMLElement>(".react-flow__viewport");
    if (canvas && viewport) {
      const bounds = canvas.getBoundingClientRect();
      const matrix = new DOMMatrix(getComputedStyle(viewport).transform);
      collaborationManager.broadcastCursor(
        (event.clientX - bounds.left - matrix.e) / matrix.a,
        (event.clientY - bounds.top - matrix.f) / matrix.d,
        view, "canvas", force,
      );
    } else if (currentLayer === "L3") {
      const bounds = surface.getBoundingClientRect();
      collaborationManager.broadcastCursor((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height, view, "surface", force);
    }
  }, [currentLayer, executionNodeId]);
  const openLayer1Context = useCallback((nodeId: string) => {
    if (!canEditCollaborativeWorkflow()) return;
    if (nodeId) {
      useWorkflowStore.getState().selectHighLevelNodes([nodeId]);
      setLayer1FocusRequest(nodeId);
    }
    setExecutionNodeId(null);
    setExecutionConditionId(null);
    setIsHighLevelView(true);
  }, []);
  const openExecutionView = useCallback((nodeId?: string) => {
    if (!canEditCollaborativeWorkflow()) return;
    const workflow = useWorkflowStore.getState();
    const selectedId = nodeId || workflow.selection.nodeIds[0] || workflow.file.graph.nodes[0]?.id;
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
    if (!canEditCollaborativeWorkflow()) return;
    setExecutionNodeId(null);
    setExecutionItemId(null);
    setExecutionConditionId(null);
  }, []);
  const focusLayer2Node = useCallback((nodeId: string) => {
    if (!canEditCollaborativeWorkflow()) return;
    setExecutionNodeId(null);
    setExecutionItemId(null);
    setExecutionConditionId(null);
    setIsHighLevelView(false);
    useWorkflowStore.getState().selectNodes([nodeId]);
    setLayer2FocusRequest([nodeId]);
  }, []);
  useEffect(() => {
    const handleOpenExecution = (event: Event) => {
      const custom = event as CustomEvent<{
        nodeId?: string;
        itemId?: string;
        conditionId?: string;
      }>;
      if (custom.detail?.nodeId) {
        setExecutionItemId(custom.detail.itemId ?? null);
        setExecutionConditionId(custom.detail.conditionId ?? null);
        openExecutionView(custom.detail.nodeId);
      }
    };
    window.addEventListener("workflow:open-execution", handleOpenExecution);
    return () =>
      window.removeEventListener("workflow:open-execution", handleOpenExecution);
  }, [openExecutionView]);

  useEffect(() => {
    const handleExport = async (event: Event) => {
      const custom = event as CustomEvent<{
        format:
          | "png"
          | "svg"
          | "pdf"
          | "l1-pdf"
          | "l1-swimlane-pdf"
          | "l1-gantt-pdf"
          | "l2-pdf"
          | "l3-pdf"
          | "tech-pdf"
          | "presentation-pdf"
          | "presentation-no-conditions-pdf";
        switched?: boolean;
      }>;
      const format = custom.detail?.format;
      if (!format || custom.detail?.switched) return;

      if (format === "l1-swimlane-pdf" || format === "l1-gantt-pdf") {
        void import("@/lib/l1-department-swimlane-pdf-export")
          .then(({ exportL1DepartmentSwimlanePdf }) =>
            exportL1DepartmentSwimlanePdf(useWorkflowStore.getState().file, { gantt: format === "l1-gantt-pdf" }),
          )
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Could not export the High Level Process System Flowchart PDF.";
            window.alert(message);
          });
        return;
      }

      if (format === "tech-pdf") {
        void exportPresentationPdf(useWorkflowStore.getState().file);
        return;
      }

      if (format === "presentation-pdf" || format === "presentation-no-conditions-pdf") {
        void exportExecutivePresentationPdf(useWorkflowStore.getState().file, {
          includeReleaseConditions: format === "presentation-pdf",
        });
        return;
      }

      if (format === "l3-pdf") {
        // Handled by PyramidLocationWidget to export the full expanded Process Locator diagram
        return;
      }

      if (format === "l1-pdf" && !isHighLevelView) {
        const prevExecutionId = executionNodeId;
        setIsHighLevelView(true);
        if (prevExecutionId) setExecutionNodeId(null);
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("workflow:export", {
              detail: { format: "l1-pdf", switched: true },
            }),
          );
          setTimeout(() => {
            setIsHighLevelView(false);
            if (prevExecutionId) {
              setExecutionNodeId(prevExecutionId);
            }
          }, 350);
        }, 150);
        return;
      }

      if (format === "l2-pdf" && (isHighLevelView || isExecutionView)) {
        const wasHighLevel = isHighLevelView;
        const prevExecutionId = executionNodeId;
        setIsHighLevelView(false);
        setExecutionNodeId(null);
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("workflow:export", {
              detail: { format: "l2-pdf", switched: true },
            }),
          );
          setTimeout(() => {
            if (wasHighLevel) setIsHighLevelView(true);
            if (prevExecutionId) setExecutionNodeId(prevExecutionId);
          }, 350);
        }, 150);
        return;
      }
    };

    window.addEventListener("workflow:export", handleExport);
    return () => window.removeEventListener("workflow:export", handleExport);
  }, [isHighLevelView, isExecutionView, executionNodeId]);

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
        if (canEditCollaborativeWorkflow()) setPaletteOpen(true);
        return;
      }
      if (editing) return;
      if (!canEditCollaborativeWorkflow()) {
        if (command || ["Backspace", "Delete"].includes(event.key)) event.preventDefault();
        return;
      }
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
          useWorkflowStore.getState().file.graph.nodes.length > 0
        }
        onOpenExecutionView={() => openExecutionView()}
        onCloseExecutionView={closeExecutionView}
        onToggleHighLevelView={() => {
          if (!canEditCollaborativeWorkflow()) return;
          setExecutionNodeId(null);
          setIsHighLevelView((active) => !active);
        }}
      />
      <div
        ref={workspaceSurfaceRef}
        data-collaboration-surface
        className="relative flex min-h-0 min-w-0 flex-1"
        onPointerMove={broadcastEditorCursor}
        onPointerDown={(event) => broadcastEditorCursor(event, true)}
      >
        {isCollaborationConnected && editControlReady && !canEditWorkflow ? (
          <div className="pointer-events-none absolute left-1/2 top-2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-cyan-400/50 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-cyan-700 shadow-lg backdrop-blur dark:text-cyan-200 sm:hidden" role="status" aria-live="polite">
            <Eye className="size-3.5" />
            <span>Following {editorName || "the editor"} · {currentLayer}{currentLayer === "L3" ? " Conditions · Forms & execution" : currentLayer === "L2" ? " Detailed Workflow" : " High-Level Process"}</span>
          </div>
        ) : null}
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
                onExit={() => { if (canEditCollaborativeWorkflow()) setIsHighLevelView(false); }}
                onFocusLayer2Nodes={requestLayer2Focus}
                focusNodeId={layer1FocusRequest}
                onFocusRequestHandled={clearLayer1FocusRequest}
              />
            ) : null}
            {isExecutionView && executionNodeId ? (
              <ExecutionView
                key={`${executionNodeId}:${executionConditionId ?? "default"}:${executionItemId ?? "default"}`}
                nodeId={executionNodeId}
                focusItemId={executionItemId}
                activeConditionId={executionConditionId}
                onSelectCondition={(conditionId) => setExecutionConditionId(conditionId)}
                onBack={closeExecutionView}
                onFocusNode={focusLayer2Node}
                onOpenLayer1Node={openLayer1Context}
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
        <RemoteCollaboratorCursors view={{ layer: currentLayer, ...(executionNodeId ? { executionNodeId } : {}) }} />
        <CollaborationControlOverlay />
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <DeleteBlockedDialog />
      <ConfirmClearDialog />
      <PyramidLocationWidget
        viewLayer={isExecutionView ? "L3" : isHighLevelView ? "L1" : "L2"}
        executionNodeId={executionNodeId}
        onFocusLayer1={openLayer1Context}
        onFocusLayer2={focusLayer2Node}
      />
    </main>
    </AuthGate>
  );
}
