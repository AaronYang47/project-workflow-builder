"use client";

import { useMemo, useState } from "react";
import { ArrowRight, GripVertical, ListChecks, Pencil, Plus } from "lucide-react";
import { TopToolbar } from "./top-toolbar";
import { AuthGate } from "./auth-gate";
import { beginReleaseConditionDrag } from "@/lib/release-condition-drag";
import {
  isReleaseConditionChapter,
  RELEASE_CONDITION_INBOX_ID,
} from "@/lib/release-condition-inbox";
import { orderReleaseConditionChapters } from "@/lib/release-condition-order";
import { conditionDurationLabel } from "@/lib/condition-duration";
import { type Condition, type DomainNode } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  canEditCollaborativeWorkflow,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";
import { CollaborationControlOverlay } from "./collaboration-control-overlay";
import {
  conditionText,
  type DocumentCategory,
  DOCUMENT_GROUPS,
  conditionDocuments,
  conditionFormCount,
  departmentBoardHeading,
  type DocumentDialogFlow,
} from "@/lib/release-conditions-workspace-model";
import {
  AddDocumentDialog,
  type DocumentDialogRequest,
} from "./release-conditions/add-document-dialog";
import { AssignConditionDialog } from "./release-conditions/assign-condition-dialog";
import { ConditionFormsDialog } from "./release-conditions/condition-forms-dialog";
import { OptionalConditionsDialog } from "./release-conditions/optional-conditions-dialog";
import { InboxPanel } from "./release-conditions/inbox-panel";
import { ProcessMapPanel } from "./release-conditions/process-map-panel";
import { useProcessSelection } from "./release-conditions/use-process-selection";

export function ReleaseConditionsWorkspace() {
  const [query, setQuery] = useState("");
  const [mobileInboxOpen, setMobileInboxOpen] = useState(false);
  const [assignInboxCondition, setAssignInboxCondition] = useState<{
    id?: string;
    index: number;
  } | null>(null);
  const [creatingChapter, setCreatingChapter] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("");
  const [chapterDescription, setChapterDescription] = useState("");
  const [chapterOwnerId, setChapterOwnerId] = useState("");
  const [documentsPopupOpen, setDocumentsPopupOpen] = useState(false);
  const [optionalPopupChapterId, setOptionalPopupChapterId] = useState<string | null>(null);
  const [documentRequest, setDocumentRequest] = useState<DocumentDialogRequest | null>(null);
  const file = useWorkflowStore((state) => state.file);
  const canEditWorkflow = useCollaborationStore((state) => canEditCollaborativeWorkflow(state));
  const collaborationRoomId = useCollaborationStore((state) => state.roomId);
  const collaborationEditorId = useCollaborationStore((state) => state.editorPeerId);
  const workflowHref =
    collaborationRoomId !== "local-only"
      ? `/?room=${encodeURIComponent(collaborationRoomId)}${collaborationEditorId ? `&editor=${encodeURIComponent(collaborationEditorId)}` : ""}`
      : "/";
  const hydrated = useWorkflowStore((state) => state.hydrated);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const addNode = useWorkflowStore((state) => state.addNode);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const updateHighLevelNode = useWorkflowStore((state) => state.updateHighLevelNode);
  const inbox = file.releaseConditionInbox ?? [];

  const requestDocumentDialog = (
    flow: DocumentDialogFlow,
    chapter: DomainNode,
    condition: Condition,
    conditionIndex: number,
    category: DocumentCategory,
  ) => {
    const isOptional = (chapter.optionalConditions ?? []).some((item) => item.id === condition.id);
    setDocumentRequest({
      flow,
      required: !isOptional,
      target: { chapterId: chapter.id, conditionId: condition.id, conditionIndex, category },
    });
  };
  const openDocumentDialog = (
    chapter: DomainNode,
    condition: Condition,
    conditionIndex: number,
    category: DocumentCategory,
  ) => requestDocumentDialog("single", chapter, condition, conditionIndex, category);
  const openLibraryBatchDialog = (
    chapter: DomainNode,
    condition: Condition,
    conditionIndex: number,
    category: DocumentCategory,
  ) => requestDocumentDialog("library-batch", chapter, condition, conditionIndex, category);

  const chapters = useMemo(
    () => file.graph.nodes.filter(isReleaseConditionChapter),
    [file.graph.nodes],
  );
  const orderedChapters = useMemo(
    () => orderReleaseConditionChapters(chapters, file),
    [chapters, file],
  );
  const needle = query.trim().toLowerCase();
  const boardChapters = needle
    ? [...orderedChapters].sort(
        (left, right) =>
          Number(
            right.conditions.some((condition, index) =>
              conditionText(condition, index).toLowerCase().includes(needle),
            ),
          ) -
          Number(
            left.conditions.some((condition, index) =>
              conditionText(condition, index).toLowerCase().includes(needle),
            ),
          ),
      )
    : orderedChapters;
  const selection = useProcessSelection(file, chapters);
  const {
    selectProcessLocation,
    selectedProcessNodeId,
    selectedProcessConditionRef,
    selectedProcessChapter,
    selectedProcessConditionIndex,
    selectedProcessCondition,
    selectedProcessConditionIsOptional,
  } = selection;

  const move = (sourceId: string, sourceIndex: number, targetId: string, targetIndex?: number) => {
    const target = chapters.find((chapter) => chapter.id === targetId);
    if (!target && targetId !== RELEASE_CONDITION_INBOX_ID) return;
    moveCondition(
      sourceId,
      sourceIndex,
      targetId,
      targetIndex ?? target?.conditions.length ?? inbox.length,
    );
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
    selectProcessLocation(
      targetId,
      {
        id: latestInbox[sourceIndex].id,
        index: chapters.find((chapter) => chapter.id === targetId)?.conditions.length ?? 0,
      },
      null,
      true,
    );
  };
  const startCreateChapter = () => {
    setEditingChapterId(null);
    setChapterTitle("");
    setChapterDescription("");
    setChapterOwnerId("");
    setCreatingChapter(true);
  };
  const startEditChapter = (chapter: DomainNode) => {
    const owner = file.highLevel?.graph.nodes.find((node) =>
      (node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []).includes(chapter.id),
    );
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
        updateHighLevelNode(node.id, {
          linkedLayer2NodeIds: links.filter((linkedId) => linkedId !== id),
        });
      }
    }
    setCreatingChapter(false);
    setEditingChapterId(null);
    if (id)
      window.requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-release-condition-drop-node-id="${id}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "end", behavior: "smooth" }),
      );
  };
  const chapterForm = (mode: "create" | "edit") => (
    <form
      aria-label={mode === "create" ? "Create Department" : "Edit Department"}
      onSubmit={(event) => {
        event.preventDefault();
        saveChapter();
      }}
      className="space-y-2 rounded-lg border border-primary/35 bg-background p-3 shadow-md"
    >
      <label className="block text-[10px] font-semibold text-muted-foreground">
        Department name
        <input
          autoFocus
          aria-label="Department name"
          value={chapterTitle}
          onChange={(event) => setChapterTitle(event.target.value)}
          maxLength={100}
          className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        />
      </label>
      <label className="block text-[10px] font-semibold text-muted-foreground">
        Department description
        <textarea
          aria-label="Department description"
          value={chapterDescription}
          onChange={(event) => setChapterDescription(event.target.value)}
          rows={2}
          className="mt-1 w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        />
      </label>
      <label className="block text-[10px] font-semibold text-muted-foreground">
        Show under L1
        <select
          aria-label="L1 Department owner"
          value={chapterOwnerId}
          onChange={(event) => setChapterOwnerId(event.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
        >
          <option value="">No L1 link</option>
          {(file.highLevel?.graph.nodes ?? []).map((node) => (
            <option key={node.id} value={node.id}>
              {node.title}
            </option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            setCreatingChapter(false);
            setEditingChapterId(null);
          }}
          className="rounded-md border px-2.5 py-1.5 text-[11px]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!chapterTitle.trim()}
          className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          {mode === "create" ? "Add Department" : "Save Department"}
        </button>
      </div>
    </form>
  );

  return (
    <AuthGate>
      <main className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
        <TopToolbar
          pageLayer="L3"
          isHighLevelView={false}
          onToggleHighLevelView={() => {}}
          openPalette={() => {}}
          onPageSearch={() =>
            document
              .querySelector<HTMLInputElement>('[aria-label="Search release conditions"]')
              ?.focus()
          }
        />
        <CollaborationControlOverlay />

        {!hydrated ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading release conditions…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-row">
            <InboxPanel
              file={file}
              inbox={inbox}
              chapters={chapters}
              canEditWorkflow={canEditWorkflow}
              query={query}
              setQuery={setQuery}
              needle={needle}
              mobileInboxOpen={mobileInboxOpen}
              setMobileInboxOpen={setMobileInboxOpen}
              move={move}
              setAssignInboxCondition={setAssignInboxCondition}
            />

            {assignInboxCondition ? (
              <AssignConditionDialog
                request={assignInboxCondition}
                inbox={inbox}
                chapters={chapters}
                onAssign={assignFromInbox}
                onClose={() => setAssignInboxCondition(null)}
              />
            ) : null}

            <section
              aria-label="Department condition board"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 lg:justify-end lg:px-5">
                <button
                  type="button"
                  data-mobile-inbox-toggle
                  aria-label={`Open unassigned conditions, ${inbox.length} items`}
                  onClick={() => setMobileInboxOpen(true)}
                  className="flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold lg:hidden"
                >
                  Unassigned{" "}
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-primary">
                    {inbox.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={startCreateChapter}
                  aria-label="New Department"
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Plus className="size-3.5" /> Department
                </button>
              </div>
              <ProcessMapPanel chapters={chapters} selection={selection} />
              {creatingChapter ? (
                <div className="shrink-0 border-b p-3 lg:p-4">{chapterForm("create")}</div>
              ) : null}
              {chapters.length ? (
                <div
                  data-release-condition-board
                  className="scroll-thin flex min-h-0 flex-1 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain p-2 sm:gap-4 sm:p-4 lg:p-5"
                >
                  {boardChapters.map((chapter) => {
                    const visible = chapter.conditions
                      .map((condition, index) => ({ condition, index }))
                      .filter(
                        ({ condition, index }) =>
                          !needle ||
                          conditionText(condition, index).toLowerCase().includes(needle) ||
                          DOCUMENT_GROUPS.some((group) =>
                            conditionDocuments(chapter, condition, group.field).some((document) =>
                              `${document.title} ${document.fileName ?? ""}`
                                .toLowerCase()
                                .includes(needle),
                            ),
                          ),
                      );
                    const heading = departmentBoardHeading(chapter);
                    return (
                      <div
                        key={chapter.id}
                        role="group"
                        data-release-condition-chapter
                        data-release-condition-chapter-id={chapter.id}
                        data-release-condition-drop-node-id={chapter.id}
                        data-release-condition-count={chapter.conditions.length}
                        aria-label={`${heading.department}, ${heading.chapter}`}
                        style={{
                          width: "fit-content",
                          minWidth: "min(320px, 84vw)",
                          maxWidth: "min(460px, 92vw)",
                        }}
                        className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border bg-card/70 shadow-sm transition ${selectedProcessNodeId === chapter.id ? "process-selection-glow" : ""}`}
                      >
                        <div className="shrink-0 border-b bg-primary/[0.06] px-3 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              aria-pressed={
                                selectedProcessNodeId === chapter.id && !selectedProcessConditionRef
                              }
                              onClick={() => selectProcessLocation(chapter.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <h3 className="truncate text-sm font-bold" title={heading.department}>
                                {heading.department}
                              </h3>
                              <span
                                className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground"
                                title={chapter.title}
                              >
                                {heading.chapter}
                              </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-1">
                              {chapter.type === "general" ? (
                                <button
                                  type="button"
                                  aria-label={`Edit ${chapter.title} Department`}
                                  onClick={() => startEditChapter(chapter)}
                                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              ) : null}
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-bold text-primary">
                                {chapter.conditions.length}
                              </span>
                            </div>
                          </div>
                        </div>
                        {editingChapterId === chapter.id ? (
                          <div className="shrink-0 p-2">{chapterForm("edit")}</div>
                        ) : null}
                        <section
                          aria-label="Release conditions"
                          className="flex min-h-0 flex-1 flex-col p-3"
                        >
                          <header className="mb-2 flex shrink-0 items-center justify-between gap-2 border-b pb-2">
                            <h4 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                              Release Conditions
                            </h4>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-primary/10 px-1 text-[9px] font-semibold text-primary">
                              {visible.length}
                              {needle ? ` / ${chapter.conditions.length}` : ""}
                            </span>
                          </header>
                          <div
                            data-release-condition-list
                            className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1"
                          >
                            {visible.map(({ condition, index }) => {
                              const formsCount = conditionFormCount(chapter, condition);
                              const selected =
                                selectedProcessNodeId === chapter.id &&
                                (selectedProcessConditionRef?.id
                                  ? selectedProcessConditionRef.id === condition.id
                                  : selectedProcessConditionRef?.index === index);
                              return (
                                <div
                                  key={condition.id || index}
                                  data-release-condition-index={index}
                                  data-release-condition-node-id={chapter.id}
                                  role="group"
                                  aria-label={`Release condition ${index + 1}: ${conditionText(condition, index)}`}
                                  onClick={() =>
                                    selectProcessLocation(chapter.id, { id: condition.id, index })
                                  }
                                  className={`flex min-w-0 items-stretch overflow-hidden rounded-lg border transition ${selected ? "border-primary bg-primary/[0.08] ring-1 ring-primary/30 shadow-sm" : "bg-background/70 hover:border-primary/45 hover:bg-background"}`}
                                >
                                  <button
                                    type="button"
                                    aria-label={`Drag release condition ${index + 1}`}
                                    onPointerDown={(event) =>
                                      beginReleaseConditionDrag(
                                        event.nativeEvent,
                                        event.currentTarget,
                                        {
                                          nodeId: chapter.id,
                                          index,
                                          label: conditionText(condition, index),
                                        },
                                        (target) =>
                                          move(chapter.id, index, target.nodeId, target.index),
                                      )
                                    }
                                    className="flex w-8 shrink-0 touch-none cursor-grab items-center justify-center text-muted-foreground hover:bg-primary/10"
                                  >
                                    <GripVertical className="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      selectProcessLocation(chapter.id, {
                                        id: condition.id,
                                        index,
                                      });
                                    }}
                                    className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pr-2 text-left"
                                  >
                                    <span
                                      className={`flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                                    >
                                      {index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block break-words text-[11px] font-semibold leading-4 text-foreground">
                                        {conditionText(condition, index)}
                                      </span>
                                      <span className="mt-0.5 block text-[9px] text-muted-foreground">
                                        Release condition
                                        {conditionDurationLabel(condition)
                                          ? ` · ${conditionDurationLabel(condition)}`
                                          : ""}
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`View forms for ${conditionText(condition, index)}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      selectProcessLocation(chapter.id, {
                                        id: condition.id,
                                        index,
                                      });
                                      setDocumentsPopupOpen(true);
                                    }}
                                    className={`my-auto shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold hover:ring-1 hover:ring-primary/40 ${formsCount ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                                  >
                                    {formsCount} {formsCount === 1 ? "form" : "forms"}
                                  </button>
                                  <ArrowRight className="pointer-events-none mx-2 my-auto size-3.5 shrink-0 text-muted-foreground/70" />
                                </div>
                              );
                            })}
                            {!visible.length ? (
                              <p className="rounded-lg border border-dashed p-4 text-center text-[10px] leading-4 text-muted-foreground">
                                {needle
                                  ? "No release conditions or forms match this search."
                                  : "No release conditions in this Department."}
                              </p>
                            ) : null}
                          </div>
                        </section>
                        <button
                          type="button"
                          aria-label={`Open Optional Conditions for ${heading.department} ${heading.chapter}`}
                          onClick={() => setOptionalPopupChapterId(chapter.id)}
                          className="flex shrink-0 items-center justify-between gap-2 border-t px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                        >
                          <span>
                            Optional Conditions{" "}
                            <span
                              data-optional-count={(chapter.optionalConditions ?? []).length}
                              className={`ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[9px] ${(chapter.optionalConditions ?? []).length > 0 ? "optional-count-breathe" : "bg-muted"}`}
                            >
                              {(chapter.optionalConditions ?? []).length}
                            </span>
                          </span>
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                  <ListChecks className="size-9 text-muted-foreground" />
                  <p className="text-sm font-semibold">No Departments yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Use + Department above to create your first Department.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
        {optionalPopupChapterId ? (
          <OptionalConditionsDialog
            chapterId={optionalPopupChapterId}
            canEdit={canEditWorkflow}
            onClose={() => setOptionalPopupChapterId(null)}
            onViewForms={(chapterId, condition) => {
              selectProcessLocation(chapterId, condition);
              setDocumentsPopupOpen(true);
            }}
            onConditionRemoved={(conditionId) => {
              if (selectedProcessCondition?.id === conditionId) setDocumentsPopupOpen(false);
            }}
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
            onAddDocument={(category) =>
              openDocumentDialog(
                selectedProcessChapter,
                selectedProcessCondition,
                selectedProcessConditionIndex,
                category,
              )
            }
            onAddFromLibrary={(category) =>
              openLibraryBatchDialog(
                selectedProcessChapter,
                selectedProcessCondition,
                selectedProcessConditionIndex,
                category,
              )
            }
          />
        ) : null}
        {documentRequest ? (
          <AddDocumentDialog
            key={JSON.stringify(documentRequest.target) + documentRequest.flow}
            request={documentRequest}
            onClose={() => setDocumentRequest(null)}
          />
        ) : null}
      </main>
    </AuthGate>
  );
}
