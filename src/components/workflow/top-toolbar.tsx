"use client";
import { useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  AlignHorizontalDistributeCenter,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Focus,
  Group,
  ImageDown,
  Layers,
  LoaderCircle,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Redo2,
  Search,
  Sun,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { autoLayout } from "@/lib/layout";
import { downloadWorkflowExcel, parseWorkflowExcel } from "@/lib/excel-workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { CloudProjectControls } from "./cloud-project-controls";
import { CollaboratorPresence } from "./collaborator-presence";

function ToolButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      title={label}
      aria-label={label}
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {children}
    </Button>
  );
}

const saveImage = (format: "png" | "svg") => {
  window.dispatchEvent(
    new CustomEvent("workflow:export", { detail: { format } }),
  );
};

export function TopToolbar({
  openPalette,
  isHighLevelView,
  onToggleHighLevelView,
  isExecutionView = false,
  canOpenExecutionView = false,
  onOpenExecutionView,
  onCloseExecutionView,
}: {
  openPalette: () => void;
  isHighLevelView: boolean;
  onToggleHighLevelView: () => void;
  isExecutionView?: boolean;
  canOpenExecutionView?: boolean;
  onOpenExecutionView?: () => void;
  onCloseExecutionView?: () => void;
}) {
  const store = useWorkflowStore();
  const dirty = store.dirty;
  const { theme, setTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const metadataSnapshot = useRef<typeof store.file | null>(null);
  const [arranging, setArranging] = useState(false);
  const beginMetadataEdit = () => {
    if (!metadataSnapshot.current)
      metadataSnapshot.current = structuredClone(
        useWorkflowStore.getState().file,
      );
  };
  const updateMeta = (patch: Partial<typeof store.file.graph.metadata>) =>
    store.commitTransient((file) => ({
      ...file,
      graph: {
        ...file.graph,
        metadata: {
          ...file.graph.metadata,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  const finishMetadataEdit = () => {
    if (!metadataSnapshot.current) return;
    store.recordSnapshot(metadataSnapshot.current);
    metadataSnapshot.current = null;
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (
        useWorkflowStore.getState().dirty &&
        !window.confirm(
          "This project has unsaved changes. Importing will discard those changes. Continue?",
        )
      ) return;
      store.replaceFile(await parseWorkflowExcel(await file.arrayBuffer()));
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Could not import workflow.",
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  const arrange = async () => {
    if (arranging || isExecutionView) return;
    setArranging(true);
    try {
      if (isHighLevelView) {
        useWorkflowStore.getState().autoArrangeHighLevel();
        window.setTimeout(
          () => window.dispatchEvent(new Event("workflow:fit-high-level")),
          120,
        );
        window.setTimeout(
          () => window.dispatchEvent(new Event("workflow:fit-high-level")),
          520,
        );
        return;
      }
      const arranged = await autoLayout(useWorkflowStore.getState().file);
      useWorkflowStore.getState().commit(() => arranged);
      window.setTimeout(
        () => window.dispatchEvent(new Event("workflow:measure-layout")),
        80,
      );
      window.setTimeout(
        () => window.dispatchEvent(new Event("workflow:fit")),
        480,
      );
      window.setTimeout(
        () => window.dispatchEvent(new Event("workflow:fit")),
        960,
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? `Could not arrange workflow: ${error.message}`
          : "Could not arrange workflow.",
      );
    } finally {
      setArranging(false);
    }
  };
  return (
    <header
      data-workflow-toolbar
      className="relative z-40 grid shrink-0 grid-cols-1 grid-rows-[44px_44px_44px] border-b bg-background px-2 shadow-[0_1px_0_rgba(15,23,42,.03)] sm:grid-cols-[minmax(0,1fr)_auto] sm:grid-rows-[48px_44px] min-[1800px]:h-14 min-[1800px]:grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)] min-[1800px]:grid-rows-1"
    >
      <div className="scroll-thin col-start-1 row-start-1 flex h-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden px-2 min-[1800px]:col-start-1">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-primary-foreground">
          PW
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            aria-label="Workflow name"
            value={store.file.graph.metadata.name}
            onFocus={beginMetadataEdit}
            onChange={(e) => updateMeta({ name: e.target.value })}
            onBlur={finishMetadataEdit}
            className="block h-7 w-[170px] min-w-[150px] max-w-[180px] shrink-0 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus:border-primary"
          />
          <span className="inline shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {store.file.graph.metadata.status}
          </span>
          <span className="inline shrink-0 text-[11px] text-muted-foreground/50">
            •
          </span>
          <input
            aria-label="Version"
            value={store.file.graph.metadata.version}
            onFocus={beginMetadataEdit}
            onChange={(e) => updateMeta({ version: e.target.value })}
            onBlur={finishMetadataEdit}
            className="block h-7 w-16 shrink-0 bg-transparent px-1 text-[11px] text-muted-foreground outline-none focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {dirty ? (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
              role="status"
              aria-live="polite"
              title="Unsaved changes"
            >
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Unsaved
            </span>
          ) : (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
              role="status"
              aria-live="polite"
              title="All changes saved"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              Saved
            </span>
          )}
        </div>
      </div>
      <div className="scroll-thin col-start-1 row-start-2 flex h-full min-w-0 items-center justify-start gap-1 overflow-x-auto border-t px-2 sm:col-span-2 min-[1800px]:col-span-1 min-[1800px]:col-start-2 min-[1800px]:row-start-1 min-[1800px]:justify-center min-[1800px]:border-t-0">
      <div className="mx-1.5 hidden h-6 w-px shrink-0 bg-border/60 min-[1800px]:block" />
      <div className="flex shrink-0 items-center gap-1">
        <ToolButton
          label="Undo (⌘Z)"
          onClick={store.undo}
          disabled={!store.past.length}
        >
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton
          label="Redo (⇧⌘Z)"
          onClick={store.redo}
          disabled={!store.future.length}
        >
          <Redo2 className="size-4" />
        </ToolButton>
      </div>
      <div className="mx-1.5 h-6 w-px bg-border/60" />
      <div className="flex shrink-0 items-center gap-1">
        <ToolButton
          label={isHighLevelView ? "Validate High-Level workflow" : "Validate workflow"}
          onClick={isHighLevelView ? store.validateHighLevel : store.validate}
          disabled={isExecutionView}
        >
          <CheckCircle2 className="size-4" />
        </ToolButton>
        <Button
          title="Automatically arrange nodes and route connections"
          aria-label="Auto arrange nodes"
          variant="outline"
          size="sm"
          onClick={arrange}
          disabled={arranging || isExecutionView}
          className="h-8 shrink-0 px-2.5 text-xs"
        >
          <span className={arranging ? "animate-spin" : ""}>
            {arranging ? (
              <LoaderCircle className="size-3.5" />
            ) : (
              <AlignHorizontalDistributeCenter className="size-3.5" />
            )}
          </span>
          {arranging ? "Arranging…" : "Auto arrange"}
        </Button>
        {isHighLevelView && !isExecutionView && (store.file.highLevel?.graph.nodes.length || 0) > 0 && (
          <Button
            title="Clear all L1 nodes"
            aria-label="Clear L1 Nodes"
            variant="ghost"
            size="sm"
            onClick={() => {
              store.showConfirmClear({
                title: "Clear L1 High-Level Workflow",
                message:
                  "Are you sure you want to clear all L1 High-Level nodes? This action cannot be undone and will remove the entire lifecycle skeleton.",
                confirmLabel: "Clear L1 Workflow",
                onConfirm: store.clearHighLevelNodes,
              });
            }}
            className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5 mr-1" />
            Clear L1
          </Button>
        )}
        {!isHighLevelView && !isExecutionView && store.file.graph.nodes.length > 0 && (
          <Button
            title="Clear all L2 nodes"
            aria-label="Clear L2 Nodes"
            variant="ghost"
            size="sm"
            onClick={() => {
              store.showConfirmClear({
                title: "Clear L2 Detailed Workflow",
                message:
                  "Are you sure you want to clear all L2 workflow nodes? All nodes, connections, and layouts on the detailed canvas will be removed.",
                confirmLabel: "Clear L2 Workflow",
                onConfirm: store.clearDetailedNodes,
              });
            }}
            className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5 mr-1" />
            Clear L2
          </Button>
        )}
        {isExecutionView && (store.file.execution?.items.length || 0) > 0 && (
          <Button
            title="Clear all L3 execution requirements"
            aria-label="Clear L3 Requirements"
            variant="ghost"
            size="sm"
            onClick={() => {
              store.showConfirmClear({
                title: "Clear L3 Execution Requirements",
                message:
                  "Are you sure you want to clear all L3 execution requirements across all workflow nodes? This action cannot be undone.",
                confirmLabel: "Clear L3 Requirements",
                onConfirm: () => store.clearExecutionItems(),
              });
            }}
            className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5 mr-1" />
            Clear L3
          </Button>
        )}
        <div
          className="flex h-8 shrink-0 items-center rounded-md border bg-muted/35 p-0.5"
          aria-label="Workflow view level"
          role="group"
        >
          <Button
            title="Show the high-level project process"
            aria-label="L1 · High Level"
            aria-pressed={isHighLevelView && !isExecutionView}
            variant="ghost"
            size="sm"
            onClick={
              isHighLevelView
                ? undefined
                : isExecutionView
                  ? () => {
                      onCloseExecutionView?.();
                      onToggleHighLevelView();
                    }
                  : onToggleHighLevelView
            }
            className={`h-7 rounded px-2 text-[11px] font-semibold ${
              isHighLevelView && !isExecutionView
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
          >
            <Layers className="mr-1 size-3.5" />
            L1 · High Level
          </Button>
          <Button
            title="Show the detailed workflow"
            aria-label="L2 · Detailed Workflow"
            aria-pressed={!isHighLevelView && !isExecutionView}
            variant="ghost"
            size="sm"
            onClick={
              isHighLevelView
                ? onToggleHighLevelView
                : isExecutionView
                  ? onCloseExecutionView
                  : undefined
            }
            className={`h-7 rounded px-2 text-[11px] font-semibold ${
              !isHighLevelView && !isExecutionView
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
          >
            L2 · Detailed Workflow
          </Button>
          <Button
            title={
              isExecutionView
                ? "Execution requirements for the selected workflow node"
                : canOpenExecutionView
                  ? "Show execution requirements for the selected workflow node"
                  : "Select a workflow node to open Execution View"
            }
            aria-label="L3 · Execution View"
            aria-pressed={isExecutionView}
            variant="ghost"
            size="sm"
            disabled={!isExecutionView && !canOpenExecutionView}
            onClick={isExecutionView ? undefined : onOpenExecutionView}
            className={`h-7 rounded px-2 text-[11px] font-semibold ${
              isExecutionView
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
          >
            L3 · Execution View
          </Button>
        </div>
        <ToolButton
          label="Group selected"
          onClick={store.groupSelected}
          disabled={
            isHighLevelView ||
            isExecutionView ||
            !store.selection.nodeIds.length
          }
        >
          <Group className="size-4" />
        </ToolButton>
        <ToolButton
          label="Zoom to fit"
          disabled={isExecutionView}
          onClick={() =>
            window.dispatchEvent(
              new Event(isHighLevelView ? "workflow:fit-high-level" : "workflow:fit"),
            )
          }
        >
          <Focus className="size-4" />
        </ToolButton>
      </div>
      <div className="mx-2 h-6 w-px shrink-0 bg-border/60" />
      <div className="flex shrink-0 items-center gap-2.5 mr-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={openPalette}
          className="flex h-8 shrink-0 gap-2 border border-border/80 text-muted-foreground"
          aria-label="Search nodes and commands"
        >
          <Search className="size-3.5" />
          <span className="text-xs">Search</span>
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">⌘K</kbd>
        </Button>
        <CollaboratorPresence />
      </div>
      </div>
      <div className="scroll-thin col-start-1 row-start-3 flex h-full min-w-0 items-center justify-start overflow-x-auto border-t pl-2 sm:col-start-2 sm:row-start-1 sm:border-t-0 min-[1800px]:col-start-3 min-[1800px]:justify-end">
        <ToolButton
          label="Export Excel"
          onClick={() => {
            void downloadWorkflowExcel(store.file).catch((error) => {
              window.alert(
                error instanceof Error
                  ? error.message
                  : "Could not export workflow.",
              );
            });
          }}
        >
          <FileSpreadsheet className="size-4" />
        </ToolButton>
        <ToolButton
          label="Import Excel"
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="size-4" />
        </ToolButton>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => importFile(e.target.files?.[0])}
        />
        <div className="group relative">
          <ToolButton label="Export image">
            <ImageDown className="size-4" />
          </ToolButton>
          <div className="invisible absolute right-0 top-8 z-50 w-36 rounded-md border bg-popover p-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => saveImage("png")}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
            >
              <Download className="size-3.5" />
              Export PNG
            </button>
            <button
              type="button"
              onClick={() => saveImage("svg")}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
            >
              <Download className="size-3.5" />
              Export SVG
            </button>
          </div>
        </div>
        <ToolButton
          label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </ToolButton>
        <ToolButton
          label="Toggle node library"
          onClick={() => store.togglePanel("left")}
        >
          <PanelLeftClose className="size-4" />
        </ToolButton>
        <ToolButton
          label="Toggle inspector"
          onClick={() => store.togglePanel("right")}
        >
          <PanelRightClose className="size-4" />
        </ToolButton>
        <CloudProjectControls />
      </div>
    </header>
  );
}
