"use client";

import { useLayoutEffect, useMemo, useRef, useState, type TextareaHTMLAttributes } from "react";
import { ArrowRight, Download, FileUp, GripVertical, ListChecks, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { TopToolbar } from "./top-toolbar";
import { AuthGate } from "./auth-gate";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import { isReleaseConditionChapter, RELEASE_CONDITION_INBOX_ID } from "@/lib/release-condition-inbox";
import { downloadReleaseConditionTemplate, parseReleaseConditionExcel } from "@/lib/release-condition-excel";
import { orderReleaseConditionChapters } from "@/lib/release-condition-order";
import { conditionDurationLabel } from "@/lib/condition-duration";
import { type Condition, type DomainNode } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import { canEditCollaborativeWorkflow, useCollaborationStore } from "@/lib/collaboration/collaboration-store";
import { CollaborationControlOverlay } from "./collaboration-control-overlay";
import {
  conditionText,
  chapterConditions,
  type DocumentCategory,
  DOCUMENT_GROUPS,
  conditionDocuments,
  conditionFormCount,
  departmentBoardHeading,
  type DocumentDialogFlow,
  processStepName,
  fitConditionText,
  buildProcessMap,
} from "@/lib/release-conditions-workspace-model";
import { AddDocumentDialog, type DocumentDialogRequest } from "./release-conditions/add-document-dialog";
import { AssignConditionDialog } from "./release-conditions/assign-condition-dialog";
import { ConditionFormsDialog } from "./release-conditions/condition-forms-dialog";
import { OptionalConditionsDialog } from "./release-conditions/optional-conditions-dialog";

function ConditionTextArea({ value, ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { fitConditionText(ref.current); }, [value]);
  return <textarea {...props} ref={ref} value={value} />;
}

export function ReleaseConditionsWorkspace() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [mobileInboxOpen, setMobileInboxOpen] = useState(false);
  const [assignInboxCondition, setAssignInboxCondition] = useState<{ id?: string; index: number } | null>(null);
  const [mobileProcessMapOpen, setMobileProcessMapOpen] = useState(false);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDescription, setChapterDescription] = useState("");
  const [chapterOwnerId, setChapterOwnerId] = useState("");
  const [selectedProcessNodeId, setSelectedProcessNodeId] = useState<string | null>(null);
  const [selectedProcessConditionRef, setSelectedProcessCondition] = useState<{ id?: string; index: number } | null>(null);
  const [selectedProcessStepId, setSelectedProcessStepId] = useState<string | null>(null);
  const [documentsPopupOpen, setDocumentsPopupOpen] = useState(false);
  const [optionalPopupChapterId, setOptionalPopupChapterId] = useState<string | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelMessage, setExcelMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [documentRequest, setDocumentRequest] = useState<DocumentDialogRequest | null>(null);
  const excelInput = useRef<HTMLInputElement>(null);
  const file = useWorkflowStore((state) => state.file);
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));
  const collaborationRoomId = useCollaborationStore((state) => state.roomId);
  const collaborationEditorId = useCollaborationStore((state) => state.editorPeerId);
  const workflowHref = collaborationRoomId !== "local-only"
    ? `/?room=${encodeURIComponent(collaborationRoomId)}${collaborationEditorId ? `&editor=${encodeURIComponent(collaborationEditorId)}` : ""}`
    : "/";
  const hydrated = useWorkflowStore((state) => state.hydrated);
  const addLines = useWorkflowStore((state) => state.addReleaseConditionLines);
  const ensureReleaseConditionIds = useWorkflowStore((state) => state.ensureReleaseConditionIds);
  const importReleaseConditions = useWorkflowStore((state) => state.importReleaseConditions);
  const setInbox = useWorkflowStore((state) => state.setReleaseConditionInbox);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const addNode = useWorkflowStore((state) => state.addNode);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const updateHighLevelNode = useWorkflowStore((state) => state.updateHighLevelNode);
  const inbox = file.releaseConditionInbox ?? [];








  const requestDocumentDialog = (flow: DocumentDialogFlow, chapter: DomainNode, condition: Condition, conditionIndex: number, category: DocumentCategory) => {
    const isOptional = (chapter.optionalConditions ?? []).some((item) => item.id === condition.id);
    setDocumentRequest({ flow, required: !isOptional, target: { chapterId: chapter.id, conditionId: condition.id, conditionIndex, category } });
  };
  const openDocumentDialog = (chapter: DomainNode, condition: Condition, conditionIndex: number, category: DocumentCategory) =>
    requestDocumentDialog("single", chapter, condition, conditionIndex, category);
  const openLibraryBatchDialog = (chapter: DomainNode, condition: Condition, conditionIndex: number, category: DocumentCategory) =>
    requestDocumentDialog("library-batch", chapter, condition, conditionIndex, category);

  const chapters = useMemo(() => file.graph.nodes.filter(isReleaseConditionChapter), [file.graph.nodes]);
  const orderedChapters = useMemo(() => orderReleaseConditionChapters(chapters, file), [chapters, file]);
  const needle = query.trim().toLowerCase();
  const boardChapters = needle ? [...orderedChapters].sort((left, right) =>
    Number(right.conditions.some((condition, index) => conditionText(condition, index).toLowerCase().includes(needle))) -
    Number(left.conditions.some((condition, index) => conditionText(condition, index).toLowerCase().includes(needle)))) : orderedChapters;
  const visibleInbox = inbox.map((condition, index) => ({ condition, index }))
    .filter(({ condition, index }) => !needle || conditionText(condition, index).toLowerCase().includes(needle));
  const matchCount = visibleInbox.length + chapters.reduce((count, chapter) => count + chapter.conditions.filter((condition, index) =>
    !needle || conditionText(condition, index).toLowerCase().includes(needle)).length, 0);
  const processMap = useMemo(() => buildProcessMap(file, chapters), [chapters, file]);

  const selectProcessLocation = (nodeId: string | null, condition?: { id?: string; index: number } | null, stepId?: string | null, scrollToBoard = false) => {
    setSelectedProcessNodeId(nodeId);
    setSelectedProcessCondition(condition ?? null);
    const location = nodeId ? processMap.locationsByChapter.get(nodeId)?.find((entry) => !stepId || entry.group.id === stepId) : undefined;
    setSelectedProcessStepId(stepId ?? location?.group.id ?? null);
    if (scrollToBoard && nodeId) {
      window.requestAnimationFrame(() => {
        const target = Array.from(document.querySelectorAll<HTMLElement>("[data-release-condition-chapter-id]"))
          .find((element) => element.dataset.releaseConditionChapterId === nodeId);
        target?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      });
    }
  };
  const selectedProcessChapter = chapters.find((chapter) => chapter.id === selectedProcessNodeId);
  const selectedProcessLocation = selectedProcessNodeId
    ? processMap.locationsByChapter.get(selectedProcessNodeId)?.find((entry) => entry.group.id === selectedProcessStepId)
      ?? processMap.locationsByChapter.get(selectedProcessNodeId)?.[0]
    : undefined;
  const selectedProcessConditionIndex = selectedProcessConditionRef && selectedProcessChapter
    ? chapterConditions(selectedProcessChapter).findIndex((condition, index) => selectedProcessConditionRef.id
      ? condition.id === selectedProcessConditionRef.id
      : index === selectedProcessConditionRef.index)
    : -1;
  const selectedProcessCondition = selectedProcessConditionIndex >= 0 && selectedProcessChapter
    ? chapterConditions(selectedProcessChapter)[selectedProcessConditionIndex]
    : undefined;
  const selectedProcessConditionIsOptional = Boolean(selectedProcessChapter && selectedProcessConditionIndex >= selectedProcessChapter.conditions.length);

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
      setExcelMessage({ text: "Could not create the Excel template. Please try again.", error: true });
    } finally {
      setExcelBusy(false);
    }
  };
  const importExcel = async (upload?: File) => {
    if (!upload) return;
    setExcelBusy(true);
    setExcelMessage(null);
    try {
      if (!upload.name.toLowerCase().endsWith(".xlsx")) throw new Error("Please choose an .xlsx Excel file.");
      if (upload.size > 10 * 1024 * 1024) throw new Error("The Excel file must be smaller than 10 MB.");
      const rows = await parseReleaseConditionExcel(await upload.arrayBuffer());
      const latestChapters = useWorkflowStore.getState().file.graph.nodes.filter(isReleaseConditionChapter);
      const byName = new Map<string, string | null>();
      const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
      for (const chapter of latestChapters) {
        const key = normalize(chapter.title);
        byName.set(key, byName.has(key) ? null : chapter.id);
      }
      const unmatched = new Set<string>();
      const prepared = rows.map((row) => {
        const chapterId = row.chapterName ? byName.get(normalize(row.chapterName)) : undefined;
        if (row.chapterName && !chapterId) {
          if (row.conditionId) throw new Error(`Department “${row.chapterName}” was not found. Fix the name before updating existing conditions.`);
          unmatched.add(row.chapterName);
        }
        return { label: row.label, chapterId: chapterId || undefined, conditionId: row.conditionId || undefined };
      });
      const result = importReleaseConditions(prepared);
      const detail = unmatched.size ? ` Unmatched Departments: ${[...unmatched].join(", ")}; those conditions are unassigned.` : "";
      setExcelMessage({ text: `Processed ${rows.length} rows: ${result.addedAssigned} added to Departments, ${result.addedUnassigned} added to Unassigned, ${result.updated} updated, ${result.moved} moved, ${result.unchanged} unchanged.${detail}`, error: false });
      setMobileAddOpen(false);
    } catch (error) {
      setExcelMessage({ text: error instanceof Error ? error.message : "Could not read the Excel file.", error: true });
    } finally {
      setExcelBusy(false);
      if (excelInput.current) excelInput.current.value = "";
    }
  };
  const setInboxCondition = (index: number, patch: Partial<Condition>) => {
    const latest = useWorkflowStore.getState().file.releaseConditionInbox ?? [];
    const conditionId = inbox[index]?.id;
    const currentIndex = conditionId ? latest.findIndex((condition) => condition.id === conditionId) : index;
    if (currentIndex < 0 || !latest[currentIndex]) return;
    setInbox(latest.map((condition, current) => current === currentIndex ? { ...condition, ...patch } : condition));
  };
  const move = (sourceId: string, sourceIndex: number, targetId: string, targetIndex?: number) => {
    const target = chapters.find((chapter) => chapter.id === targetId);
    if (!target && targetId !== RELEASE_CONDITION_INBOX_ID) return;
    moveCondition(sourceId, sourceIndex, targetId, targetIndex ?? (target?.conditions.length ?? inbox.length));
  };
  const assignFromInbox = (targetId: string) => {
    if (!canEditWorkflow || !assignInboxCondition) return;
    const latestInbox = useWorkflowStore.getState().file.releaseConditionInbox ?? [];
    const sourceIndex = assignInboxCondition.id
      ? latestInbox.findIndex((condition) => condition.id === assignInboxCondition.id)
      : assignInboxCondition.index;
    if (sourceIndex < 0 || !latestInbox[sourceIndex]) return;
    move(RELEASE_CONDITION_INBOX_ID, sourceIndex, targetId);
    setAssignInboxCondition(null);
    setMobileInboxOpen(false);
    selectProcessLocation(targetId, { id: latestInbox[sourceIndex].id, index: chapters.find((chapter) => chapter.id === targetId)?.conditions.length ?? 0 }, null, true);
  };
  const startCreateChapter = () => {
    setEditingChapterId(null);
    setChapterTitle("");
    setChapterDescription("");
    setChapterOwnerId("");
    setCreatingChapter(true);
  };
  const startEditChapter = (chapter: DomainNode) => {
    const owner = file.highLevel?.graph.nodes.find((node) => (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).includes(chapter.id));
    setCreatingChapter(false);
    setEditingChapterId(chapter.id);
    setChapterTitle(chapter.title);
    setChapterDescription(chapter.description ?? "");
    setChapterOwnerId(owner?.id ?? "");
  };
  const saveChapter = () => {
    const title = chapterTitle.trim();
    if (!title) return;
    const currentFile = useWorkflowStore.getState().file;
    let id = editingChapterId;
    if (creatingChapter) {
      const layouts = Object.values(currentFile.layout.nodes);
      const right = Math.max(0, ...layouts.map((layout) => layout.x + layout.width));
      id = addNode("general", { x: right + 80, y: 220 });
    }
    if (!id) return;
    updateNode(id, { title, description: chapterDescription.trim() });
    const latest = useWorkflowStore.getState().file;
    for (const node of latest.highLevel?.graph.nodes ?? []) {
      const links = node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? [];
      if (node.id === chapterOwnerId && !links.includes(id)) {
        updateHighLevelNode(node.id, { linkedLayer2NodeIds: [...links, id] });
      } else if (node.id !== chapterOwnerId && links.includes(id)) {
        updateHighLevelNode(node.id, { linkedLayer2NodeIds: links.filter((linkedId) => linkedId !== id) });
      }
    }
    setCreatingChapter(false);
    setEditingChapterId(null);
    if (id) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-release-condition-drop-node-id="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "end", behavior: "smooth" }));
  };
  const chapterForm = (mode: "create" | "edit") => (
    <form aria-label={mode === "create" ? "Create Department" : "Edit Department"} onSubmit={(event) => { event.preventDefault(); saveChapter(); }} className="space-y-2 rounded-lg border border-primary/35 bg-background p-3 shadow-md">
      <label className="block text-[10px] font-semibold text-muted-foreground">Department name
        <input autoFocus aria-label="Department name" value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} maxLength={100} className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary" />
      </label>
      <label className="block text-[10px] font-semibold text-muted-foreground">Department description
        <textarea aria-label="Department description" value={chapterDescription} onChange={(event) => setChapterDescription(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary" />
      </label>
      <label className="block text-[10px] font-semibold text-muted-foreground">Show under L1
        <select aria-label="L1 Department owner" value={chapterOwnerId} onChange={(event) => setChapterOwnerId(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary">
          <option value="">No L1 link</option>
          {(file.highLevel?.graph.nodes ?? []).map((node) => <option key={node.id} value={node.id}>{node.title}</option>)}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => { setCreatingChapter(false); setEditingChapterId(null); }} className="rounded-md border px-2.5 py-1.5 text-[11px]">Cancel</button>
        <button type="submit" disabled={!chapterTitle.trim()} className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40">{mode === "create" ? "Add Department" : "Save Department"}</button>
      </div>
    </form>
  );

  return (
    <AuthGate>
      <main className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <TopToolbar pageLayer="L3" isHighLevelView={false} onToggleHighLevelView={() => {}} openPalette={() => {}} onPageSearch={() => document.querySelector<HTMLInputElement>('[aria-label="Search release conditions"]')?.focus()} />
        <CollaborationControlOverlay />

        {!hydrated ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading release conditions…</div> : (
          <div className="flex min-h-0 flex-1 flex-row">
            {mobileInboxOpen ? <button type="button" data-mobile-inbox-backdrop aria-label="Close unassigned conditions" onClick={() => { setMobileInboxOpen(false); setMobileAddOpen(false); }} className="fixed inset-0 z-40 bg-black/50 lg:hidden" /> : null}
            <section
              aria-label="Unassigned release conditions"
              data-mobile-inbox-open={mobileInboxOpen}
              data-release-condition-drop-node-id={RELEASE_CONDITION_INBOX_ID}
              data-release-condition-count={inbox.length}
              className={`${mobileInboxOpen ? "fixed inset-y-0 left-0 z-50 flex w-[min(85vw,320px)] shadow-2xl" : "hidden"} min-h-0 shrink-0 flex-col border-r bg-panel lg:static lg:flex lg:h-full lg:w-[350px] lg:max-w-none lg:shadow-none`}
            >
              <div className="shrink-0 border-b p-2 lg:p-4">
                <div className="flex items-start justify-between gap-1 lg:items-center lg:gap-2">
                  <div className="min-w-0"><h2 className="text-xs font-bold leading-4 lg:text-sm">Unassigned conditions</h2><p className="mt-0.5 hidden text-[11px] text-muted-foreground lg:block">Paste one condition per line.</p></div>
                  <div className="flex shrink-0 items-center gap-1 lg:gap-2"><span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-bold text-primary lg:text-xs">{inbox.length}</span><button type="button" aria-label="Add or import conditions" aria-expanded={mobileAddOpen} onClick={() => setMobileAddOpen(true)} className="flex size-9 items-center justify-center rounded-lg border text-primary lg:hidden"><Plus className="size-4" /></button><button type="button" aria-label="Close unassigned conditions" onClick={() => setMobileInboxOpen(false)} className="flex size-9 items-center justify-center rounded-lg border lg:hidden"><X className="size-4" /></button></div>
                </div>
                {mobileAddOpen ? <button type="button" aria-label="Dismiss add or import panel" onClick={() => setMobileAddOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" /> : null}
                <div className={mobileAddOpen ? "fixed inset-x-3 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border bg-panel p-4 shadow-2xl lg:static lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none" : "hidden lg:block"}>
                <div className="flex items-center justify-between lg:hidden"><h3 className="text-sm font-bold">Add or import conditions</h3><button type="button" aria-label="Close add or import panel" onClick={() => setMobileAddOpen(false)} className="flex size-9 items-center justify-center rounded-lg border"><Plus className="size-4 rotate-45" /></button></div>
                <textarea
                  aria-label="Enter release conditions, one per line"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") addDraft(); }}
                  placeholder={"Permit drawing approved\nProduct data sheet received\nSite review complete"}
                  rows={6}
                  className="mt-3 w-full resize-none rounded-lg border bg-background px-3 py-2 text-xs leading-5 outline-none focus:border-primary"
                />
                <button type="button" onClick={addDraft} disabled={!draft.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-45">
                  <Plus className="size-4" /> Add conditions
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button type="button" onClick={downloadTemplate} disabled={excelBusy} className="flex items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-[11px] font-semibold hover:border-primary/60 disabled:opacity-50"><Download className="size-3.5" /> Excel template</button>
                  <button type="button" onClick={() => excelInput.current?.click()} disabled={excelBusy} className="flex items-center justify-center gap-1.5 rounded-lg border bg-background px-2 py-2 text-[11px] font-semibold hover:border-primary/60 disabled:opacity-50"><FileUp className="size-3.5" /> Import Excel</button>
                  <input ref={excelInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Select release conditions Excel file" onChange={(event) => { void importExcel(event.target.files?.[0]); }} className="sr-only" />
                </div>
                </div>
                {excelMessage ? <p role={excelMessage.error ? "alert" : "status"} className={`mt-2 rounded-md border px-2 py-1.5 text-[10px] leading-4 ${excelMessage.error ? "border-destructive/50 text-destructive" : "border-emerald-500/40 text-emerald-400"}`}>{excelMessage.text}</p> : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 p-2 pb-1 lg:p-3 lg:pb-2">
                  <label className="relative block">
                    <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground lg:left-2.5 lg:size-4" />
                    <input aria-label="Search release conditions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-9 w-full min-w-0 rounded-lg border bg-background pl-7 pr-2 text-[11px] outline-none focus:border-primary lg:pl-9 lg:pr-3 lg:text-xs" />
                  </label>
                  {needle ? <p className="mt-1 text-[10px] text-muted-foreground">{matchCount} matching conditions across this project</p> : null}
                </div>
                <div data-release-condition-list className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-4 scroll-thin lg:px-3">
                  {visibleInbox.map(({ condition, index }) => (
                    <div key={condition.id || index} data-release-condition-index={index} data-release-condition-node-id={RELEASE_CONDITION_INBOX_ID} role="group" aria-label={`Unassigned release condition ${index + 1}`} className="rounded-lg border bg-card p-1.5 shadow-xs lg:p-2.5">
                      <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:gap-2">
                        <button type="button" data-inbox-drag-handle aria-label={`Drag unassigned release condition ${index + 1}`} disabled={!chapters.length} onPointerDown={(event) => beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, { nodeId: RELEASE_CONDITION_INBOX_ID, index, label: conditionText(condition, index) }, (target) => move(RELEASE_CONDITION_INBOX_ID, index, target.nodeId, target.index))} className="hidden size-7 shrink-0 touch-none cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40 sm:flex"><GripVertical className="size-4" /></button>
                        <ConditionTextArea aria-label={`Unassigned condition text ${index + 1}`} value={condition.label ?? condition.description ?? `Release condition ${index + 1}`} onChange={(event) => setInboxCondition(index, { label: event.target.value })} onBlur={(event) => { const label = event.target.value.trim(); if (label && label !== condition.label) setInboxCondition(index, { label }); }} rows={1} className="min-w-0 flex-1 basis-[calc(100%-32px)] resize-none overflow-hidden bg-transparent text-[11px] leading-4 outline-none lg:basis-auto lg:text-xs lg:leading-5" />
                        <button type="button" aria-label={`Delete unassigned release condition ${index + 1}`} onClick={() => setInbox(inbox.filter((_, current) => current !== index))} className="ml-auto flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:ml-0 lg:size-7"><Trash2 className="size-3.5" /></button>
                        <button type="button" data-mobile-assign-button aria-label={`Assign ${conditionText(condition, index)}`} disabled={!canEditWorkflow || !chapters.length || condition.locked} onClick={() => setAssignInboxCondition({ id: condition.id, index })} className="hidden min-h-9 w-full items-center justify-center rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-40 max-sm:flex">Assign to department</button>
                      </div>
                    </div>
                  ))}
                  {!visibleInbox.length ? <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{needle ? "No unassigned conditions match this search." : "Drag conditions from a Department here to unassign them."}</p> : null}
                </div>
              </div>
            </section>

            {assignInboxCondition ? (
              <AssignConditionDialog request={assignInboxCondition} inbox={inbox} chapters={chapters} onAssign={assignFromInbox} onClose={() => setAssignInboxCondition(null)} />
            ) : null}

            <section aria-label="Department condition board" className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 lg:justify-end lg:px-5">
                <button type="button" data-mobile-inbox-toggle aria-label={`Open unassigned conditions, ${inbox.length} items`} onClick={() => setMobileInboxOpen(true)} className="flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold lg:hidden">Unassigned <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">{inbox.length}</span></button>
                <button type="button" onClick={startCreateChapter} aria-label="New Department" className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"><Plus className="size-3.5" /> Department</button>
              </div>
              <section aria-label="Process map" data-mobile-process-map-open={mobileProcessMapOpen} className="shrink-0 border-b bg-muted/10">
                <button type="button" data-mobile-process-map-toggle aria-expanded={mobileProcessMapOpen} onClick={() => setMobileProcessMapOpen((open) => !open)} className="flex min-h-10 w-full items-center justify-between px-3 text-xs font-semibold text-muted-foreground lg:hidden">Process map <span>{mobileProcessMapOpen ? "Hide ▲" : "Show ▼"}</span></button>
                <div data-mobile-process-map-content className={mobileProcessMapOpen ? "block" : "hidden lg:block"}>
                <div className="scroll-thin overflow-x-auto px-3 py-2.5 lg:px-5">
                  {processMap.groups.length ? (
                    <div className="flex min-w-max items-stretch gap-2">
                      {processMap.groups.map((group, groupIndex) => {
                        const kindLabel = group.kind === "start" ? "START" : group.kind === "end" ? "FINISH" : group.kind === "primaryGate" ? "GATE" : group.kind === "unlinked" ? "UNLINKED" : "PHASE";
                        return (
                          <div key={group.id} className="flex items-stretch gap-2">
                            <div className="w-[210px] shrink-0 overflow-hidden rounded-lg border bg-background shadow-xs" style={{ borderColor: `${group.color}66` }}>
                              <button type="button" aria-pressed={selectedProcessStepId === group.id && !selectedProcessNodeId} onClick={() => selectProcessLocation(null, null, group.id)} className={`flex w-full flex-col items-start border-l-[3px] px-2.5 py-2 text-left transition ${selectedProcessStepId === group.id && !selectedProcessNodeId ? "process-selection-glow" : "hover:bg-muted/50"}`} style={{ borderLeftColor: group.color }}>
                                <span className="text-[8px] font-black uppercase tracking-[0.13em]" style={{ color: group.color }}>{kindLabel}</span>
                                <span className="mt-0.5 w-full whitespace-normal break-words text-[11px] font-bold leading-4" title={processStepName(group)}>{processStepName(group)}</span>
                              </button>
                              <div className="space-y-1 border-t p-1.5">
                                {group.chapters.length ? group.chapters.map((chapter) => {
                                  const heading = departmentBoardHeading(chapter);
                                  const isSelected = selectedProcessNodeId === chapter.id && selectedProcessStepId === group.id;
                                  return (
                                    <button key={chapter.id} type="button" aria-pressed={isSelected} onClick={() => selectProcessLocation(chapter.id, null, group.id, true)} className={`flex w-full min-w-0 items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-left transition ${isSelected ? "process-selection-glow" : "hover:border-primary/55 hover:bg-primary/[0.04]"}`} style={{ borderColor: isSelected ? undefined : `${group.color}55`, backgroundColor: isSelected ? undefined : `${group.color}0d` }}>
                                      <span className="min-w-0"><span className="block truncate text-[10px] font-semibold" title={heading.department}>{heading.department}</span><span className="block truncate text-[8px] text-muted-foreground" title={heading.chapter}>{heading.chapter}</span></span>
                                      {chapter.conditions.length ? <span className="shrink-0 rounded-md bg-background/80 px-1.5 py-0.5 text-[8px] font-semibold text-muted-foreground">{chapter.conditions.length} RC</span> : null}
                                    </button>
                                  );
                                }) : <p className="px-1 py-2 text-center text-[9px] text-muted-foreground">No linked departments</p>}
                              </div>
                            </div>
                            {groupIndex < processMap.groups.length - 1 ? <ArrowRight aria-hidden className="mt-8 size-4 shrink-0 self-start text-muted-foreground/60" /> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="rounded-md border border-dashed bg-background px-3 py-2 text-[10px] text-muted-foreground">Add process phases and link Departments to show their locations here.</p>}
                </div>
                {selectedProcessNodeId || selectedProcessStepId ? <div aria-live="polite" className="flex min-h-10 items-center gap-2 border-t bg-primary/[0.035] px-3 py-2 lg:px-5">
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 text-[10px] leading-4">
                    <span className="mr-1.5 font-bold uppercase tracking-wide text-primary">Process location</span>
                    {selectedProcessChapter && selectedProcessLocation ? (() => {
                      const heading = departmentBoardHeading(selectedProcessChapter);
                      const processGroups = processMap.groups.filter((group) => group.kind !== "unlinked");
                      const stepIndex = processGroups.findIndex((group) => group.id === selectedProcessLocation.group.id);
                      const group = selectedProcessLocation.group;
                      const locationLabel = group.kind === "unlinked"
                        ? "Not linked to an L1 process step"
                        : `Step ${stepIndex + 1} of ${processGroups.length} · ${processStepName(group)}`;
                      const conditionIndex = selectedProcessCondition
                        ? selectedProcessConditionIndex
                        : -1;
                      const selectedConditionLabel = conditionIndex >= 0 && selectedProcessCondition
                        ? conditionText(selectedProcessCondition, conditionIndex)
                        : "";
                      return <><span className="font-semibold text-foreground">{locationLabel}</span><span className="text-muted-foreground"> · </span><span className="font-semibold text-foreground">{heading.department} · {heading.chapter}</span>{selectedConditionLabel ? <><span className="text-muted-foreground"> · Form / RC: </span><span className="font-medium text-foreground">{selectedConditionLabel}</span></> : null}</>;
                    })() : selectedProcessStepId ? (() => {
                      const group = processMap.groups.find((item) => item.id === selectedProcessStepId);
                      const processGroups = processMap.groups.filter((item) => item.kind !== "unlinked");
                      const stepIndex = processGroups.findIndex((item) => item.id === selectedProcessStepId);
                      return group ? <span className="font-semibold text-foreground">{group.kind === "unlinked" ? group.title : `Step ${stepIndex + 1} of ${processGroups.length} · ${processStepName(group)}`} · Select a Department to see its forms</span> : <span className="text-muted-foreground">Select a department or form to see its process position.</span>;
                    })() : <span className="text-muted-foreground">Select a department or form to see its process position.</span>}
                  </div>
                </div> : null}
                </div>
              </section>
              {creatingChapter ? <div className="shrink-0 border-b p-3 lg:p-4">{chapterForm("create")}</div> : null}
              {chapters.length ? (
                <div data-release-condition-board className="scroll-thin flex min-h-0 flex-1 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain p-2 sm:gap-4 sm:p-4 lg:p-5">
                  {boardChapters.map((chapter) => {
                    const visible = chapter.conditions.map((condition, index) => ({ condition, index }))
                      .filter(({ condition, index }) => !needle || conditionText(condition, index).toLowerCase().includes(needle) || DOCUMENT_GROUPS.some((group) => conditionDocuments(chapter, condition, group.field).some((document) => `${document.title} ${document.fileName ?? ""}`.toLowerCase().includes(needle))));
                    const heading = departmentBoardHeading(chapter);
                    return (
                      <div key={chapter.id} role="group" data-release-condition-chapter data-release-condition-chapter-id={chapter.id} data-release-condition-drop-node-id={chapter.id} data-release-condition-count={chapter.conditions.length} aria-label={`${heading.department}, ${heading.chapter}`} style={{ width: "fit-content", minWidth: "min(320px, 84vw)", maxWidth: "min(460px, 92vw)" }} className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/70 shadow-sm transition ${selectedProcessNodeId === chapter.id ? "process-selection-glow" : ""}`}>
                        <div className="shrink-0 border-b bg-primary/[0.06] px-3 py-3">
                          <div className="flex items-center justify-between gap-2"><button type="button" aria-pressed={selectedProcessNodeId === chapter.id && !selectedProcessConditionRef} onClick={() => selectProcessLocation(chapter.id)} className="min-w-0 flex-1 text-left"><h3 className="truncate text-sm font-bold" title={heading.department}>{heading.department}</h3><span className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground" title={chapter.title}>{heading.chapter}</span></button><div className="flex shrink-0 items-center gap-1">{chapter.type === "general" ? <button type="button" aria-label={`Edit ${chapter.title} Department`} onClick={() => startEditChapter(chapter)} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"><Pencil className="size-3.5" /></button> : null}<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-bold text-primary">{chapter.conditions.length}</span></div></div>
                        </div>
                        {editingChapterId === chapter.id ? <div className="shrink-0 p-2">{chapterForm("edit")}</div> : null}
                        <section aria-label="Release conditions" className="flex min-h-0 flex-1 flex-col p-3">
                          <header className="mb-2 flex shrink-0 items-center justify-between gap-2 border-b pb-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Release Conditions</h4>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[9px] font-semibold text-primary">{visible.length}{needle ? ` / ${chapter.conditions.length}` : ""}</span>
                          </header>
                          <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                            {visible.map(({ condition, index }) => {
                              const formsCount = conditionFormCount(chapter, condition);
                              const selected = selectedProcessNodeId === chapter.id && (selectedProcessConditionRef?.id ? selectedProcessConditionRef.id === condition.id : selectedProcessConditionRef?.index === index);
                              return (
                                <div key={condition.id || index} data-release-condition-index={index} data-release-condition-node-id={chapter.id} role="group" aria-label={`Release condition ${index + 1}: ${conditionText(condition, index)}`} onClick={() => selectProcessLocation(chapter.id, { id: condition.id, index })} className={`flex min-w-0 items-stretch overflow-hidden rounded-lg border transition ${selected ? "border-primary bg-primary/[0.08] ring-1 ring-primary/30 shadow-sm" : "bg-background/70 hover:border-primary/45 hover:bg-background"}`}>
                                  <button type="button" aria-label={`Drag release condition ${index + 1}`} onPointerDown={(event) => beginReleaseConditionDrag(event.nativeEvent, event.currentTarget, { nodeId: chapter.id, index, label: conditionText(condition, index) }, (target) => move(chapter.id, index, target.nodeId, target.index))} className="flex w-8 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground hover:bg-primary/10"><GripVertical className="size-3.5" /></button>
                                  <button type="button" aria-pressed={selected} onClick={(event) => { event.stopPropagation(); selectProcessLocation(chapter.id, { id: condition.id, index }); }} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-2 text-left">
                                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{index + 1}</span>
                                    <span className="min-w-0 flex-1"><span className="block break-words text-[11px] font-semibold leading-4 text-foreground">{conditionText(condition, index)}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">Release condition{conditionDurationLabel(condition) ? ` · ${conditionDurationLabel(condition)}` : ""}</span></span>
                                  </button>
                                  <button type="button" aria-label={`View forms for ${conditionText(condition, index)}`} onClick={(event) => { event.stopPropagation(); selectProcessLocation(chapter.id, { id: condition.id, index }); setDocumentsPopupOpen(true); }} className={`my-auto shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold hover:ring-1 hover:ring-primary/40 ${formsCount ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{formsCount} {formsCount === 1 ? "form" : "forms"}</button>
                                  <ArrowRight className="pointer-events-none mx-2 my-auto size-3.5 shrink-0 text-muted-foreground/70" />
                                </div>
                              );
                            })}
                            {!visible.length ? <p className="rounded-lg border border-dashed p-4 text-center text-[10px] leading-4 text-muted-foreground">{needle ? "No release conditions or forms match this search." : "No release conditions in this Department."}</p> : null}
                          </div>
                        </section>
                        <button type="button" aria-label={`Open Optional Conditions for ${heading.department} ${heading.chapter}`} onClick={() => setOptionalPopupChapterId(chapter.id)} className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground transition hover:bg-primary/10 hover:text-primary">
                          <span>Optional Conditions <span data-optional-count={(chapter.optionalConditions ?? []).length} className={`ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[9px] ${(chapter.optionalConditions ?? []).length > 0 ? "optional-count-breathe" : "bg-muted"}`}>{(chapter.optionalConditions ?? []).length}</span></span><ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><ListChecks className="size-9 text-muted-foreground" /><p className="text-sm font-semibold">No Departments yet</p><p className="max-w-sm text-xs text-muted-foreground">Use + Department above to create your first Department.</p></div>}
            </section>
          </div>
        )}
        {optionalPopupChapterId ? (
          <OptionalConditionsDialog
            chapterId={optionalPopupChapterId}
            canEdit={canEditWorkflow}
            onClose={() => setOptionalPopupChapterId(null)}
            onViewForms={(chapterId, condition) => { selectProcessLocation(chapterId, condition); setDocumentsPopupOpen(true); }}
            onConditionRemoved={(conditionId) => { if (selectedProcessCondition?.id === conditionId) setDocumentsPopupOpen(false); }}
          />
        ) : null}
        {documentsPopupOpen && selectedProcessChapter && selectedProcessCondition ? (
          <ConditionFormsDialog
            chapter={selectedProcessChapter}
            condition={selectedProcessCondition}
            conditionIndex={selectedProcessConditionIndex}
            isOptional={selectedProcessConditionIsOptional}
            needle={needle}
            canEdit={canEditWorkflow}
            workflowHref={workflowHref}
            onClose={() => setDocumentsPopupOpen(false)}
            onAddDocument={(category) => openDocumentDialog(selectedProcessChapter, selectedProcessCondition, selectedProcessConditionIndex, category)}
            onAddFromLibrary={(category) => openLibraryBatchDialog(selectedProcessChapter, selectedProcessCondition, selectedProcessConditionIndex, category)}
          />
        ) : null}
        {documentRequest ? <AddDocumentDialog key={JSON.stringify(documentRequest.target) + documentRequest.flow} request={documentRequest} onClose={() => setDocumentRequest(null)} /> : null}
      </main>
    </AuthGate>
  );
}
