"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import {
  AlignHorizontalDistributeCenter,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Download,
  FileSpreadsheet,
  FileText,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { autoLayout } from "@/lib/layout";
import { downloadWorkflowExcel, parseWorkflowExcel } from "@/lib/excel-workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { CloudProjectControls } from "./cloud-project-controls";
import { CollaboratorPresence } from "./collaborator-presence";
import { R2FileDialog } from "./r2-file-dialog";

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

const saveImage = (
  format: "png" | "svg" | "pdf" | "l1-pdf" | "l2-pdf" | "l3-pdf",
) => {
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
  const [r2DialogOpen, setR2DialogOpen] = useState(false);
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
      className="relative z-40 grid shrink-0 grid-cols-1 grid-rows-[44px_44px_44px] border-b bg-background px-2 shadow-[0_1px_0_rgba(15,23,42,.03)] sm:grid-cols-[minmax(0,1fr)_auto] sm:grid-rows-[48px_44px] min-[1440px]:!h-14 min-[1440px]:!grid-cols-[minmax(220px,max-content)_minmax(0,1fr)_max-content] min-[1440px]:!grid-rows-1"
    >
      <div className="scroll-thin col-start-1 row-start-1 flex h-full min-w-0 items-center gap-2 overflow-x-auto overflow-y-hidden px-2 min-[1440px]:col-start-1">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-black">
          <Image
            src="/falcon-mark.png"
            alt=""
            width={570}
            height={420}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Input
            aria-label="Workflow name"
            value={store.file.graph.metadata.name}
            onFocus={beginMetadataEdit}
            onChange={(e) => updateMeta({ name: e.target.value })}
            onBlur={finishMetadataEdit}
            className="workflow-name-input block h-7 w-[240px] min-w-[180px] max-w-[320px] shrink-0 border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus:border-primary"
          />
          <span className="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:inline">
            {store.file.graph.metadata.status}
          </span>
          <span className="hidden shrink-0 text-[11px] text-muted-foreground/50 lg:inline">
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
              className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 lg:flex dark:text-emerald-300"
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
      <div className="scroll-thin col-start-1 row-start-2 flex h-full min-w-0 items-center justify-start gap-1 overflow-x-auto border-t px-2 sm:col-span-2 min-[1440px]:!col-span-1 min-[1440px]:!col-start-2 min-[1440px]:!row-start-1 min-[1440px]:!justify-start min-[1440px]:!border-t-0">
      <div className="mx-1.5 hidden h-6 w-px shrink-0 bg-border/60 min-[1440px]:block" />
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
          className="h-8 min-w-[112px] shrink-0 justify-center gap-1.5 px-2.5 text-xs"
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
                  ? () => {
                      onCloseExecutionView?.();
                      onToggleHighLevelView();
                    }
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
            className="h-8 shrink-0 border-l border-border/60 pl-3 pr-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1 size-3.5" />
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
            className="h-8 shrink-0 border-l border-border/60 pl-3 pr-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1 size-3.5" />
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
            className="h-8 shrink-0 border-l border-border/60 pl-3 pr-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1 size-3.5" />
            Clear L3
          </Button>
        )}
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
      <div className="scroll-thin col-start-1 row-start-3 flex h-full min-w-0 items-center justify-start overflow-x-auto border-t pl-2 sm:col-start-2 sm:row-start-1 sm:border-t-0 min-[1440px]:!col-start-3 min-[1440px]:!row-start-1 min-[1440px]:justify-end min-[1440px]:!border-t-0">
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-slate-300 dark:border-slate-700 bg-background/80 text-xs font-semibold hover:bg-muted"
            >
              <Download className="size-3.5 text-primary" />
              <span>Export</span>
              <ChevronDown className="size-3 text-muted-foreground opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-1.5">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Print-Ready PDF Documents
            </div>
            <DropdownMenuItem
              onClick={() => saveImage("l1-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-emerald-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">L1 · High-Level Process</span>
                <span className="text-[10px] text-muted-foreground">Process flow only, 1:1 styles (PDF)</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => saveImage("l2-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-sky-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">L2 · Detailed Workflow</span>
                <span className="text-[10px] text-muted-foreground">All phases, gates & steps (PDF)</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => saveImage("l3-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-purple-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">L3 · All Expanded Matrix</span>
                <span className="text-[10px] text-muted-foreground">Full execution architecture (PDF)</span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1.5" />

            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Image & Vector Export
            </div>
            <DropdownMenuItem
              onClick={() => saveImage("png")}
              className="gap-2.5 cursor-pointer py-1.5 rounded-md hover:bg-muted"
            >
              <ImageDown className="size-4 text-emerald-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">Export Image (PNG)</span>
                <span className="text-[10px] text-muted-foreground">High-res canvas snapshot</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => saveImage("svg")}
              className="gap-2.5 cursor-pointer py-1.5 rounded-md hover:bg-muted"
            >
              <Download className="size-3.5 text-amber-500 shrink-0" />
              <span className="text-xs">Export SVG (Vector)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
        <CloudProjectControls
          onOpenUploadForms={() => setR2DialogOpen(true)}
        />
      </div>
      <R2FileDialog
        open={r2DialogOpen}
        onClose={() => setR2DialogOpen(false)}
      />
    </header>
  );
}
