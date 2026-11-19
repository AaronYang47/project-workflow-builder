"use client";

import { useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { Download, FileUp, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import {
  isReleaseConditionChapter,
  RELEASE_CONDITION_INBOX_ID,
} from "@/lib/release-condition-inbox";
import {
  downloadReleaseConditionTemplate,
  parseReleaseConditionExcel,
} from "@/lib/release-condition-excel";
import { type Condition, type DomainNode, type WorkflowFile } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { conditionText, fitConditionText } from "@/lib/release-conditions-workspace-model";

function ConditionTextArea({
  value,
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    fitConditionText(ref.current);
  }, [value]);
  return <textarea {...props} ref={ref} value={value} />;
}

/** Unassigned release conditions: search, add, Excel import/export and drag source. */
export function InboxPanel({
  file,
  inbox,
  chapters,
  canEditWorkflow,
  query,
  setQuery,
  needle,
  mobileInboxOpen,
  setMobileInboxOpen,
  move,
  setAssignInboxCondition,
}: {
  file: WorkflowFile;
  inbox: Condition[];
  chapters: DomainNode[];
  canEditWorkflow: boolean;
  query: string;
  setQuery: (query: string) => void;
  needle: string;
  mobileInboxOpen: boolean;
  setMobileInboxOpen: (open: boolean) => void;
  move: (sourceId: string, sourceIndex: number, targetId: string, targetIndex?: number) => void;
  setAssignInboxCondition: (condition: { id?: string; index: number } | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelMessage, setExcelMessage] = useState<{ text: string; error: boolean } | null>(null);
  const excelInput = useRef<HTMLInputElement>(null);
  const addLines = useWorkflowStore((state) => state.addReleaseConditionLines);
  const ensureReleaseConditionIds = useWorkflowStore((state) => state.ensureReleaseConditionIds);
  const importReleaseConditions = useWorkflowStore((state) => state.importReleaseConditions);
  const setInbox = useWorkflowStore((state) => state.setReleaseConditionInbox);
  const visibleInbox = inbox
    .map((condition, index) => ({ condition, index }))
    .filter(
      ({ condition, index }) =>
        !needle || conditionText(condition, index).toLowerCase().includes(needle),
    );
  const matchCount =
    visibleInbox.length +
    chapters.reduce(
      (count, chapter) =>
        count +
        chapter.conditions.filter(
          (condition, index) =>
            !needle || conditionText(condition, index).toLowerCase().includes(needle),
        ).length,
      0,
    );
  const addDraft = () => {
    if (addLines(draft)) {
      setDraft("");
      setMobileAddOpen(false);
    }
  };
  const downloadTemplate = async () => {
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      ensureReleaseConditionIds();
      await downloadReleaseConditionTemplate(useWorkflowStore.getState().file);
    } catch {
      setExcelMessage({
        text: "Could not create the Excel template. Please try again.",
        error: true,
      });
    } finally {
      setExcelBusy(false);
    }
  };
  const importExcel = async (upload?: File) => {
    if (!upload) return;
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      if (!upload.name.toLowerCase().endsWith(".xlsx"))
        throw new Error("Please choose an .xlsx Excel file.");
      if (upload.size > 10 * 1024 * 1024)
        throw new Error("The Excel file must be smaller than 10 MB.");
      const rows = await parseReleaseConditionExcel(await upload.arrayBuffer());
      const latestChapters = useWorkflowStore
        .getState()
        .file.graph.nodes.filter(isReleaseConditionChapter);
      const byName = new Map<string, string | null>();
      const normalize = (name: string) =>
        name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
      for (const chapter of latestChapters) {
        const key = normalize(chapter.title);
        byName.set(key, byName.has(key) ? null : chapter.id);
      }
      const unmatched = new Set<string>();
      const prepared = rows.map((row) => {
        const chapterId = row.chapterName ? byName.get(normalize(row.chapterName)) : undefined;
        if (row.chapterName && !chapterId) {
          if (row.conditionId)
            throw new Error(
              `Department “${row.chapterName}” was not found. Fix the name before updating existing conditions.`,
            );
          unmatched.add(row.chapterName);
        }
        return {
          label: row.label,
          chapterId: chapterId || undefined,
          conditionId: row.conditionId || undefined,
        };
      });
      const result = importReleaseConditions(prepared);
      const detail = unmatched.size
        ? ` Unmatched Departments: ${[...unmatched].join(", ")}; those conditions are unassigned.`
        : "";
      setExcelMessage({
        text: `Processed ${rows.length} rows: ${result.addedAssigned} added to Departments, ${result.addedUnassigned} added to Unassigned, ${result.updated} updated, ${result.moved} moved, ${result.unchanged} unchanged.${detail}`,
        error: false,
      });
      setMobileAddOpen(false);
    } catch (error) {
      setExcelMessage({
        text: error instanceof Error ? error.message : "Could not read the Excel file.",
        error: true,
      });
    } finally {
      setExcelBusy(false);
      if (excelInput.current) excelInput.current.value = "";
    }
  };
  const setInboxCondition = (index: number, patch: Partial<Condition>) => {
    const latest = useWorkflowStore.getState().file.releaseConditionInbox ?? [];
    const conditionId = inbox[index]?.id;
    const currentIndex = conditionId
      ? latest.findIndex((condition) => condition.id === conditionId)
      : index;
    if (currentIndex < 0 || !latest[currentIndex]) return;
    setInbox(
      latest.map((condition, current) =>
        current === currentIndex ? { ...condition, ...patch } : condition,
      ),
    );
  };
  return (
    <>
      {mobileInboxOpen ? (
        <button
          type="button"
          data-mobile-inbox-backdrop
          aria-label="Close unassigned conditions"
          onClick={() => {
            setMobileInboxOpen(false);
            setMobileAddOpen(false);
          }}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      ) : null}
      <section
        aria-label="Unassigned steps"
        data-mobile-inbox-open={mobileInboxOpen}
        data-release-condition-drop-node-id={RELEASE_CONDITION_INBOX_ID}
        data-release-condition-count={inbox.length}
        className={`${mobileInboxOpen ? "fixed inset-y-0 left-0 z-50 flex w-[min(85vw,320px)] shadow-2xl" : "hidden"} min-h-0 shrink-0 flex-col border-r bg-panel lg:static lg:flex lg:h-full lg:w-[350px] lg:max-w-none lg:shadow-none`}
      >
        <div className="shrink-0 border-b p-2 lg:p-4">
          <div className="flex items-start justify-between gap-1 lg:items-center lg:gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-bold leading-4 lg:text-sm">Unassigned conditions</h2>
              <p className="mt-0.5 hidden text-[11px] text-muted-foreground lg:block">
                Paste one condition per line.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1 lg:gap-2">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-bold text-primary lg:text-xs">
                {inbox.length}
              </span>
              <button
                type="button"
                aria-label="Add or import conditions"
                aria-expanded={mobileAddOpen}
                onClick={() => setMobileAddOpen(true)}
                className="flex size-9 items-center justify-center rounded-lg border text-primary lg:hidden"
              >
                <Plus className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Close unassigned conditions"
                onClick={() => setMobileInboxOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg border lg:hidden"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          {mobileAddOpen ? (
            <button
              type="button"
              aria-label="Dismiss add or import panel"
              onClick={() => setMobileAddOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />
          ) : null}
          <div
            className={
              mobileAddOpen
                ? "fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border bg-panel p-4 shadow-2xl lg:static lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                : "hidden lg:block"
            }
          >
            <div className="flex items-center justify-between lg:hidden">
              <h3 className="text-sm font-bold">Add or import conditions</h3>
              <button
                type="button"
                aria-label="Close add or import panel"
                onClick={() => setMobileAddOpen(false)}
                className="flex size-9 items-center justify-center rounded-lg border"
              >
                <Plus className="size-4 rotate-45" />
              </button>
            </div>
            <textarea
              aria-label="Enter steps, one per line"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addDraft();
              }}
              placeholder={
                "Permit drawing approved\nProduct data sheet received\nSite review complete"
              }
              rows={6}
              className="mt-3 w-full resize-none rounded-lg border bg-background px-3 py-2 text-xs leading-5 outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={addDraft}
              disabled={!draft.trim()}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-45"
            >
              <Plus className="size-4" /> Add conditions
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={downloadTemplate}
                disabled={excelBusy}
                className="flex items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-[11px] font-semibold hover:border-primary/60 disabled:opacity-50"
              >
                <Download className="size-3.5" /> Excel template
              </button>
              <button
                type="button"
                onClick={() => excelInput.current?.click()}
                disabled={excelBusy}
                className="flex items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-[11px] font-semibold hover:border-primary/60 disabled:opacity-50"
              >
                <FileUp className="size-3.5" /> Import Excel
              </button>
              <input
                ref={excelInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                aria-label="Select steps Excel file"
                onChange={(event) => {
                  void importExcel(event.target.files?.[0]);
                }}
                className="sr-only"
              />
            </div>
          </div>
          {excelMessage ? (
            <p
              role={excelMessage.error ? "alert" : "status"}
              className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-4 ${excelMessage.error ? "border-destructive/50 text-destructive" : "border-emerald-500/40 text-emerald-400"}`}
            >
              {excelMessage.text}
            </p>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 p-2 pb-1 lg:p-3 lg:pb-2">
            <label className="relative block">
              <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground lg:left-2.5 lg:size-4" />
              <input
                aria-label="Search steps"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-9 w-full min-w-0 rounded-lg border bg-background pl-7 pr-2 text-[11px] outline-none focus:border-primary lg:pl-9 lg:pr-3 lg:text-xs"
              />
            </label>
            {needle ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {matchCount} matching conditions across this project
              </p>
            ) : null}
          </div>
          <div
            data-release-condition-list
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-4 scroll-thin lg:px-3"
          >
            {visibleInbox.map(({ condition, index }) => (
              <div
                key={condition.id || index}
                data-release-condition-index={index}
                data-release-condition-node-id={RELEASE_CONDITION_INBOX_ID}
                role="group"
                aria-label={`Unassigned step ${index + 1}`}
                className="rounded-lg border bg-card p-1.5 shadow-xs lg:p-2.5"
              >
                <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:gap-2">
                  <button
                    type="button"
                    data-inbox-drag-handle
                    aria-label={`Drag unassigned step ${index + 1}`}
                    disabled={!chapters.length}
                    onPointerDown={(event) =>
                      beginReleaseConditionDrag(
                        event.nativeEvent,
                        event.currentTarget,
                        {
                          nodeId: RELEASE_CONDITION_INBOX_ID,
                          index,
                          label: conditionText(condition, index),
                        },
                        (target) =>
                          move(RELEASE_CONDITION_INBOX_ID, index, target.nodeId, target.index),
                      )
                    }
                    className="hidden size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 sm:flex"
                  >
                    <GripVertical className="size-4" />
                  </button>
                  <ConditionTextArea
                    aria-label={`Unassigned condition text ${index + 1}`}
                    value={condition.label ?? condition.description ?? `Step ${index + 1}`}
                    onChange={(event) => setInboxCondition(index, { label: event.target.value })}
                    onBlur={(event) => {
                      const label = event.target.value.trim();
                      if (label && label !== condition.label) setInboxCondition(index, { label });
                    }}
                    rows={1}
                    className="min-w-0 flex-1 basis-[calc(100%-32px)] resize-none overflow-hidden bg-transparent text-[11px] leading-4 outline-none lg:basis-auto lg:text-xs lg:leading-5"
                  />
                  <button
                    type="button"
                    aria-label={`Delete unassigned step ${index + 1}`}
                    onClick={() => setInbox(inbox.filter((_, current) => current !== index))}
                    className="ml-auto flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:ml-0 lg:size-7"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    data-mobile-assign-button
                    aria-label={`Assign ${conditionText(condition, index)}`}
                    disabled={!canEditWorkflow || !chapters.length || condition.locked}
                    onClick={() => setAssignInboxCondition({ id: condition.id, index })}
                    className="hidden min-h-9 w-full items-center justify-center rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-40 max-sm:flex"
                  >
                    Assign to department
                  </button>
                </div>
              </div>
            ))}
            {!visibleInbox.length ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                {needle
                  ? "No unassigned conditions match this search."
                  : "Drag conditions from a Department here to unassign them."}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
