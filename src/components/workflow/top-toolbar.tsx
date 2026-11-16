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
  Presentation,
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
import { EditorTransferControl } from "./editor-transfer-control";
import { WorkflowLayerNavigation } from "./workflow-layer-navigation";
import { R2FileDialog } from "./r2-file-dialog";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";

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
    | "presentation-no-conditions-pdf",
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
  pageLayer,
  onPageExport,
  onPageSearch,
}: {
  openPalette: () => void;
  isHighLevelView: boolean;
  onToggleHighLevelView: () => void;
  isExecutionView?: boolean;
  canOpenExecutionView?: boolean;
  onOpenExecutionView?: () => void;
  onCloseExecutionView?: () => void;
  pageLayer?: "L3" | "L4";
  onPageExport?: (format: string) => void;
  onPageSearch?: () => void;
}) {
  const store = useWorkflowStore();
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));
  const dirty = store.dirty;
  const { theme, setTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const metadataSnapshot = useRef<typeof store.file | null>(null);
  const [arranging, setArranging] = useState(false);
  const [r2DialogOpen, setR2DialogOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const exportFormat = (format: Parameters<typeof saveImage>[0]) => {
    if (!pageLayer) { saveImage(format); return; }
    if (onPageExport) { onPageExport(format); return; }
    const file = useWorkflowStore.getState().file;
    const exportDocument = async () => {
      if (format === "l1-swimlane-pdf" || format === "l1-gantt-pdf") {
        const { exportL1DepartmentSwimlanePdf } = await import("@/lib/l1-department-swimlane-pdf-export");
        await exportL1DepartmentSwimlanePdf(file, { gantt: format === "l1-gantt-pdf" });
      } else if (format === "l3-pdf") {
        const { exportL3ExecutionPdf } = await import("@/lib/l3-pdf-export");
        await exportL3ExecutionPdf(file);
      } else if (format === "tech-pdf") {
        const { exportPresentationPdf } = await import("@/lib/presentation-pdf-export");
        await exportPresentationPdf(file);
      } else if (format === "presentation-pdf" || format === "presentation-no-conditions-pdf") {
        const { exportExecutivePresentationPdf } = await import("@/lib/executive-presentation-pdf-export");
        await exportExecutivePresentationPdf(file, { includeReleaseConditions: format === "presentation-pdf" });
      } else {
        window.alert("Open L1 or L2 to export the canvas in this format.");
      }
    };
    void exportDocument().catch((error: unknown) => window.alert(error instanceof Error ? error.message : "Could not export document."));
  };
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
      data-mobile-tools-open={mobileToolsOpen}
      className="relative z-40 grid shrink-0 grid-cols-1 border-b bg-background px-2 shadow-[0_1px_0_rgba(15,23,42,.03)] xl:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div className="col-start-1 row-start-1 flex min-h-12 min-w-0 flex-nowrap items-center gap-2 px-2 py-1">
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
        <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
          <Input
            aria-label="Workflow name"
            value={store.file.graph.metadata.name}
            disabled={!canEditWorkflow}
            onFocus={beginMetadataEdit}
            onChange={(e) => updateMeta({ name: e.target.value })}
            onBlur={finishMetadataEdit}
            className="workflow-name-input block h-7 w-[240px] min-w-0 max-w-full flex-1 sm:flex-none border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus:border-primary"
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
            disabled={!canEditWorkflow}
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
        <button type="button" data-mobile-toolbar-toggle aria-label={mobileToolsOpen ? "Hide toolbar" : "Show toolbar"} aria-expanded={mobileToolsOpen} aria-controls="workflow-toolbar-actions workflow-toolbar-tools" onClick={() => setMobileToolsOpen((open) => !open)} className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground sm:hidden"><ChevronDown className={`size-4 transition-transform ${mobileToolsOpen ? "rotate-180" : ""}`} /></button>
      </div>
      <div id="workflow-toolbar-actions" className={`col-start-1 row-start-3 min-h-11 min-w-0 flex-wrap items-center justify-start gap-x-1 gap-y-2 border-t px-2 py-2 xl:col-span-2 xl:row-start-2 ${mobileToolsOpen ? "flex" : "hidden sm:flex"}`}>
      <div className="flex shrink-0 max-sm:order-1 items-center gap-1">
        <ToolButton
          label="Undo (⌘Z)"
          onClick={store.undo}
          disabled={!canEditWorkflow || !store.past.length}
        >
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton
          label="Redo (⇧⌘Z)"
          onClick={store.redo}
          disabled={!canEditWorkflow || !store.future.length}
        >
          <Redo2 className="size-4" />
        </ToolButton>
      </div>
      <div className="mx-1.5 hidden h-6 w-px bg-border/60 sm:block" />
      <div className="flex min-w-0 flex-wrap items-center gap-1 max-sm:order-3 max-sm:w-full max-sm:flex-nowrap">
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
          disabled={!canEditWorkflow || arranging || isExecutionView}
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
          className="flex min-h-8 min-w-0 flex-wrap items-center rounded-md border bg-muted/35 p-0.5"
          aria-label="Workflow view level"
          role="group"
        >
          {pageLayer ? <WorkflowLayerNavigation currentLayer={pageLayer} embedded /> : <><Button
            title="Show the high-level project process"
            aria-label="L1 · High Level"
            aria-pressed={isHighLevelView && !isExecutionView}
            disabled={!canEditWorkflow}
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
            <span className="xl:hidden">L1</span><span className="hidden xl:inline">L1 · High Level</span>
          </Button>
          <Button
            title="Show the detailed workflow"
            aria-label="L2 · Detailed Workflow"
            aria-pressed={!isHighLevelView && !isExecutionView}
            disabled={!canEditWorkflow}
            variant="ghost"
            size="sm"
            onClick={
              isHighLevelView
                ? onToggleHighLevelView
                : isExecutionView
                  ? () => {
                      onCloseExecutionView?.();
                    }
                  : undefined
            }
            className={`h-7 rounded px-2 text-[11px] font-semibold ${
              !isHighLevelView && !isExecutionView
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
            }`}
          >
            <span className="xl:hidden">L2</span><span className="hidden xl:inline">L2 · Detailed Workflow</span>
          </Button>
          <WorkflowLayerNavigation currentLayer={isExecutionView ? "L3" : isHighLevelView ? "L1" : "L2"} onlyAdvanced /></>}
        </div>


        {isExecutionView && (store.file.execution?.items.length || 0) > 0 && (
          <Button
            title="Clear all execution forms"
            aria-label="Clear Forms"
            variant="ghost"
            size="sm"
            onClick={() => {
              store.showConfirmClear({
                title: "Clear Execution Forms",
                message:
                  "Are you sure you want to clear all execution requirements across all workflow nodes? This action cannot be undone.",
                confirmLabel: "Clear Forms",
                onConfirm: () => store.clearExecutionItems(),
              });
            }}
            disabled={!canEditWorkflow}
            className="h-8 shrink-0 border-l border-border/60 pl-3 pr-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1 size-3.5" />
            Clear Forms
          </Button>
        )}
        <span className="hidden lg:contents"><ToolButton
          label="Group selected"
          onClick={store.groupSelected}
          disabled={
            Boolean(pageLayer) ||
            !canEditWorkflow ||
            isHighLevelView ||
            isExecutionView ||
            !store.selection.nodeIds.length
          }
        >
          <Group className="size-4" />
        </ToolButton></span>
        <span className="hidden lg:contents"><ToolButton
          label="Zoom to fit"
          disabled={Boolean(pageLayer) || isExecutionView}
          onClick={() =>
            window.dispatchEvent(
              new Event(isHighLevelView ? "workflow:fit-high-level" : "workflow:fit"),
            )
          }
        >
          <Focus className="size-4" />
        </ToolButton></span>
      </div>
      <div className="mx-2 hidden h-6 w-px shrink-0 bg-border/60 sm:block" />
      <div data-toolbar-search-group className="order-2 mr-0 flex min-w-0 flex-1 flex-nowrap items-center gap-1 sm:order-none sm:ml-auto sm:mr-2 sm:gap-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={pageLayer ? onPageSearch : openPalette}
          disabled={!canEditWorkflow}
          className="flex h-8 min-w-0 flex-1 justify-start gap-2 overflow-hidden border border-border/80 text-muted-foreground sm:min-w-24"
          aria-label="Search nodes and commands"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="hidden truncate text-xs min-[360px]:inline">Search</span>
          <kbd className="ml-1 hidden rounded bg-muted px-1.5 py-0.5 text-[11px] sm:ml-auto sm:inline">⌘K</kbd>
        </Button>
        <EditorTransferControl compactOnMobile />
        <CollaboratorPresence />
      </div>
      </div>
      <div id="workflow-toolbar-tools" className={`col-start-1 row-start-2 min-h-12 min-w-0 flex-wrap items-center justify-start gap-x-1 gap-y-2 border-t py-2 pl-2 xl:col-start-2 xl:row-start-1 xl:border-t-0 ${mobileToolsOpen ? "flex" : "hidden sm:flex"}`}>
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
          disabled={!canEditWorkflow}
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
              onClick={() => exportFormat("l1-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-emerald-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">L1 · High-Level Process</span>
                <span className="text-[10px] text-muted-foreground">11 × 17 vector PDF · same as the canvas</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("l2-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-sky-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">L2 · Detailed Workflow</span>
                <span className="text-[10px] text-muted-foreground">11 × 17 vector PDF · same as the canvas</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("l1-swimlane-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-teal-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">High Level Process System Flowchart</span>
                <span className="text-[10px] text-muted-foreground">Phases, departments, forms & release conditions</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("l1-gantt-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-teal-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">High Level Process System Flowchart with Gantt Chart</span>
                <span className="text-[10px] text-muted-foreground">Adaptive phases & departments · relative schedule</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("l3-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-purple-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">Conditions · Forms Matrix</span>
                <span className="text-[10px] text-muted-foreground">Full execution architecture (PDF)</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("tech-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <FileText className="size-4 text-sky-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">Export PDF for Tech</span>
                <span className="text-[10px] text-muted-foreground">L1-L2-L3 technical architecture (PDF)</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("presentation-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <Presentation className="size-4 text-amber-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">Export PDF for Presentation</span>
                <span className="text-[10px] text-muted-foreground">With Release Conditions</span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => exportFormat("presentation-no-conditions-pdf")}
              className="gap-2.5 cursor-pointer py-2 rounded-md hover:bg-muted"
            >
              <Presentation className="size-4 text-amber-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">Export PDF for Presentation · No RC</span>
                <span className="text-[10px] text-muted-foreground">Without Release Conditions</span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1.5" />

            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
              Image & Vector Export
            </div>
            <DropdownMenuItem
              onClick={() => exportFormat("png")}
              className="gap-2.5 cursor-pointer py-1.5 rounded-md hover:bg-muted"
            >
              <ImageDown className="size-4 text-emerald-500 shrink-0" />
              <div className="flex flex-col">
                <span className="font-semibold text-xs">Export Image (PNG)</span>
                <span className="text-[10px] text-muted-foreground">High-res canvas snapshot</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => exportFormat("svg")}
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
          readOnly={!canEditWorkflow}
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
