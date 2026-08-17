"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  History,
  MessageSquareText,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { ComponentNote, ComponentNoteRevision } from "@/types/workflow";
import {
  MAX_COMPONENT_NOTE_HISTORY,
  normalizeComponentNote,
  revisionLabel,
} from "@/lib/component-notes";

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultTopic(): string {
  return "Untitled note";
}

function noteFromDraft(topic: string, body: string): ComponentNote | undefined {
  const trimmedBody = body.trim();
  if (!trimmedBody && !topic.trim()) return undefined;
  return {
    topic: topic.trim() || defaultTopic(),
    body: trimmedBody,
    updatedAt: new Date().toISOString(),
    history: [],
  };
}

export function ComponentNoteButton({
  nodeId,
  noteKey,
  label,
  className,
}: {
  nodeId: string;
  noteKey: string;
  label: string;
  className?: string;
}) {
  const stored = useWorkflowStore(
    (state) =>
      state.file.graph.nodes.find((node) => node.id === nodeId)?.config
        .componentNotes?.[noteKey],
  );
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const [open, setOpen] = useState(false);
  const [draftTopic, setDraftTopic] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<ComponentNoteRevision | null>(
    null,
  );

  const note = useMemo(() => normalizeComponentNote(stored), [stored]);

  useEffect(() => {
    if (!open) return;
    setDraftTopic(note?.topic ?? "");
    setDraftBody(note?.body ?? "");
    setHistoryOpen(false);
    setRestoreTarget(null);
  }, [open, note?.topic, note?.body]);

  const commit = (next: ComponentNote | undefined) => {
    const current = useWorkflowStore.getState();
    const node = current.file.graph.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const componentNotes = { ...(node.config.componentNotes || {}) };
    if (next) componentNotes[noteKey] = next;
    else delete componentNotes[noteKey];
    updateNode(nodeId, { config: { ...node.config, componentNotes } });
  };

  const saveDraft = () => {
    const previous = note;
    const prepared = noteFromDraft(draftTopic, draftBody);
    if (!prepared) {
      commit(undefined);
      setOpen(false);
      return;
    }
    const next: ComponentNote = { ...prepared, history: previous?.history ?? [] };
    if (previous && (previous.body !== prepared.body || previous.topic !== prepared.topic)) {
      const revision: ComponentNoteRevision = {
        topic: previous.topic,
        body: previous.body,
        savedAt: new Date().toISOString(),
      };
      const history = [...(previous.history ?? []), revision].slice(-MAX_COMPONENT_NOTE_HISTORY);
      next.history = history;
    }
    commit(next);
    setOpen(false);
  };

  const clearNote = () => {
    commit(undefined);
    setDraftTopic("");
    setDraftBody("");
    setRestoreTarget(null);
    setHistoryOpen(false);
    if (note) setOpen(false);
  };

  const restoreRevision = (revision: ComponentNoteRevision) => {
    setDraftTopic(revision.topic);
    setDraftBody(revision.body);
    setRestoreTarget(revision);
    setHistoryOpen(false);
  };

  const updatedAtLabel = note ? formatTimestamp(note.updatedAt) : undefined;
  const historyCount = note?.history?.length ?? 0;

  return (
    <>
      <button
        type="button"
        aria-label={`Open note for ${label}`}
        title={note ? `View note for ${label}` : `Add note to ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          "nodrag nopan relative inline-flex size-6 shrink-0 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary",
          className,
        )}
      >
        <MessageSquareText className="size-3" />
        {note ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-background bg-primary"
          />
        ) : null}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1000] bg-slate-950/35 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none">
            <div className="flex items-start gap-3 border-b px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-bold">Component note</Dialog.Title>
                <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                  {label}
                </Dialog.Description>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                  aria-pressed={historyOpen}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold transition",
                    historyOpen
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "text-muted-foreground hover:border-primary/40 hover:text-primary",
                  )}
                  title="Show note history"
                >
                  <History className="size-3.5" />
                  History
                  {historyCount > 0 ? (
                    <span className="rounded bg-muted px-1 text-[10px] font-bold text-muted-foreground">
                      {historyCount}
                    </span>
                  ) : null}
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close note"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5">
              {historyOpen ? (
                <NoteHistory
                  note={note}
                  onRestore={restoreRevision}
                  onClose={() => setHistoryOpen(false)}
                />
              ) : (
                <>
                  {restoreTarget ? (
                    <RestoreBanner
                      revision={restoreTarget}
                      onDismiss={() => setRestoreTarget(null)}
                    />
                  ) : null}
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Topic
                    </span>
                    <input
                      value={draftTopic}
                      onChange={(event) => setDraftTopic(event.target.value)}
                      placeholder="Give this note a theme"
                      className="mt-1 w-full rounded-lg border bg-muted/20 px-3 py-2 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Body
                    </span>
                    <textarea
                      autoFocus={!restoreTarget}
                      aria-label={`Note text for ${label}`}
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                      placeholder="Add a note for this component…"
                      rows={8}
                      className="mt-1 w-full resize-y rounded-lg border bg-muted/20 p-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </label>
                  <NoteMeta
                    updatedAtLabel={updatedAtLabel}
                    hasNote={Boolean(note)}
                  />
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t px-5 py-3">
              <button
                type="button"
                onClick={clearNote}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-rose-600"
              >
                <Trash2 className="size-3.5" />
                {note ? "Delete note" : "Clear draft"}
              </button>
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={saveDraft}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Save note
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function NoteMeta({
  updatedAtLabel,
  hasNote,
}: {
  updatedAtLabel?: string;
  hasNote: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {updatedAtLabel ? (
        <span className="inline-flex items-center gap-1">
          <span className="font-semibold uppercase tracking-wide">Updated</span>
          <span>{updatedAtLabel}</span>
        </span>
      ) : (
        <span className="italic">No previous edits</span>
      )}
      {!hasNote ? <span className="italic">New draft</span> : null}
    </div>
  );
}

function RestoreBanner({
  revision,
  onDismiss,
}: {
  revision: ComponentNoteRevision;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 size-3.5 shrink-0" />
        <div>
          <p className="font-semibold">
            Restored from “{revisionLabel(revision)}” · {formatTimestamp(revision.savedAt)}
          </p>
          <p className="text-amber-900/80">
            Save to make it the active note; cancel to keep your draft unchanged.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-1 text-amber-700 hover:bg-amber-100"
        aria-label="Dismiss restore notice"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function NoteHistory({
  note,
  onRestore,
  onClose,
}: {
  note?: ComponentNote;
  onRestore: (revision: ComponentNoteRevision) => void;
  onClose: () => void;
}) {
  const revisions = note?.history ?? [];
  if (revisions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
        <p className="font-semibold text-foreground/80">No prior versions yet</p>
        <p className="mt-1">
          Save the note with a new topic or body to create the first revision.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <RotateCcw className="size-3.5" />
          Back to editor
        </button>
      </div>
    );
  }
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {[...revisions].reverse().map((revision, index) => (
        <li
          key={`${revision.savedAt}-${index}`}
          className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-semibold text-foreground">
                {revisionLabel(revision)}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatTimestamp(revision.savedAt)}
              </span>
            </div>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[12px] leading-5 text-muted-foreground">
              {revision.body}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRestore(revision)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <RotateCcw className="size-3.5" />
            Restore
          </button>
        </li>
      ))}
    </ul>
  );
}