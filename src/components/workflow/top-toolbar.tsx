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
  LoaderCircle,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  Redo2,
  Search,
  Sun,
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

export function TopToolbar({ openPalette }: { openPalette: () => void }) {
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
    if (arranging) return;
    setArranging(true);
    try {
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
    <header data-workflow-toolbar className="relative z-40 flex h-14 shrink-0 items-center border-b bg-background px-2 shadow-[0_1px_0_rgba(15,23,42,.03)]">
      <div className="scroll-thin flex h-full min-w-0 flex-1 items-center gap-2 overflow-x-auto px-2">
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
            className="h-7 w-auto min-w-[100px] max-w-[180px] border-transparent bg-transparent px-1.5 text-sm font-semibold shadow-none hover:border-border focus:border-primary"
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
            className="h-7 w-16 shrink-0 bg-transparent px-1 text-[11px] text-muted-foreground outline-none focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
      <div className="mx-1.5 h-6 w-px bg-border/60" />
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
        <ToolButton label="Validate workflow" onClick={store.validate}>
          <CheckCircle2 className="size-4" />
        </ToolButton>
        <Button
          title="Automatically arrange nodes and route connections"
          aria-label="Auto arrange nodes"
          variant="outline"
          size="sm"
          onClick={arrange}
          disabled={arranging}
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
        <ToolButton
          label="Group selected"
          onClick={store.groupSelected}
          disabled={!store.selection.nodeIds.length}
        >
          <Group className="size-4" />
        </ToolButton>
        <ToolButton
          label="Zoom to fit"
          onClick={() => window.dispatchEvent(new Event("workflow:fit"))}
        >
          <Focus className="size-4" />
        </ToolButton>
      </div>
      <div className="mx-2 h-6 w-px bg-border/60" />
      <div className="flex shrink-0 items-center gap-2.5 mr-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={openPalette}
          className="hidden h-8 gap-2 border border-border/80 text-muted-foreground lg:flex"
          aria-label="Search nodes and commands"
        >
          <Search className="size-3.5" />
          <span className="text-xs">Search</span>
          <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">⌘K</kbd>
        </Button>
        <CollaboratorPresence />
      </div>
      <div className="ml-auto flex shrink-0 items-center pl-2">
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
