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
  normalizeComponentNote,
  revisionLabel,
} from "@/lib/component-notes";

const MAX_HISTORY = 20;

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
      const history = [...(previous.history ?? []), revision].slice(-MAX_HISTORY);
      next.history = history;
    }
    commit(next);
    setOpen(false);
  };

  const clearNote = () => {
    if (!note) {
      setDraftTopic("");
      setDraftBody("");
      return;
    }
    commit(undefined);
    setDraftTopic("");
    setDraftBody("");
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
          "nodrag nopan relative inline-flex size-12 shrink-0 items-center justify-center rounded-lg border bg-background/90 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary",
          className,
        )}
      >
        <MessageSquareText className="size-6" />
        {note ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 size-4 rounded-full border-2 border-background bg-primary"
          />
        ) : null}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1000] bg-slate-950/35 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-5xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border bg-background shadow-2xl outline-none">
            <div className="flex items-start gap-6 border-b-2 px-10 py-8">
              <span className="flex size-[72px] items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageSquareText className="size-9" />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <Dialog.Title className="text-3xl font-bold leading-tight">
                  Component note
                </Dialog.Title>
                <Dialog.Description className="mt-2 truncate text-2xl text-muted-foreground">
                  {label}
                </Dialog.Description>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                  aria-pressed={historyOpen}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-2xl font-semibold transition",
                    historyOpen
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "text-muted-foreground hover:border-primary/40 hover:text-primary",
                  )}
                  title="Show note history"
                >
                  <History className="size-7" />
                  History
                  {historyCount > 0 ? (
                    <span className="rounded bg-muted px-2 text-xl font-bold text-muted-foreground">
                      {historyCount}
                    </span>
                  ) : null}
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close note"
                    className="rounded-lg p-3 text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-8" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="space-y-8 px-10 py-10">
              {historyOpen ? (
                <NoteHistory
                  note={note}
                  onRestore={restoreRevision}
                  onClose={() => setHistoryOpen(false)}
                  label={label}
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
                    <span className="text-2xl font-semibold uppercase tracking-wide text-muted-foreground">
                      Topic
                    </span>
                    <input
                      value={draftTopic}
                      onChange={(event) => setDraftTopic(event.target.value)}
                      placeholder="Give this note a theme"
                      className="mt-2 w-full rounded-xl border-2 bg-muted/20 px-6 py-4 text-3xl font-semibold outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />
                  </label>
                  <label className="block">
                    <span className="text-2xl font-semibold uppercase tracking-wide text-muted-foreground">
                      Body
                    </span>
                    <textarea
                      autoFocus={!restoreTarget}
                      aria-label={`Note text for ${label}`}
                      value={draftBody}
                      onChange={(event) => setDraftBody(event.target.value)}
                      placeholder="Add a note for this component…"
                      rows={10}
                      className="mt-2 w-full resize-y rounded-xl border-2 bg-muted/20 p-6 text-3xl leading-12 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />
                  </label>
                  <NoteMeta
                    updatedAtLabel={updatedAtLabel}
                    hasNote={Boolean(note)}
                  />
                </>
              )}
            </div>

            <div className="flex items-center justify-between border-t-2 px-10 py-6">
              <button
                type="button"
                onClick={clearNote}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-2xl font-semibold text-muted-foreground hover:text-rose-600"
              >
                <Trash2 className="size-7" />
                {note ? "Delete note" : "Clear draft"}
              </button>
              <div className="flex justify-end gap-4">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-xl border-2 px-8 py-4 text-3xl font-semibold hover:bg-muted"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={saveDraft}
                  className="rounded-xl bg-primary px-8 py-4 text-3xl font-semibold text-primary-foreground"
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
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-2xl text-muted-foreground">
      {updatedAtLabel ? (
        <span className="inline-flex items-center gap-2">
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
    <div className="flex items-start justify-between gap-6 rounded-2xl border-2 border-amber-300/60 bg-amber-50 px-6 py-4 text-2xl text-amber-900">
      <div className="flex items-start gap-4">
        <RotateCcw className="mt-1 size-7 shrink-0" />
        <div>
          <p className="font-semibold leading-snug">
            Restored from “{revisionLabel(revision)}” · {formatTimestamp(revision.savedAt)}
          </p>
          <p className="mt-1 text-amber-900/80">
            Save to make it the active note; cancel to keep your draft unchanged.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-md p-2 text-amber-700 hover:bg-amber-100"
        aria-label="Dismiss restore notice"
      >
        <X className="size-7" />
      </button>
    </div>
  );
}

function NoteHistory({
  note,
  onRestore,
  onClose,
  label,
}: {
  note?: ComponentNote;
  onRestore: (revision: ComponentNoteRevision) => void;
  onClose: () => void;
  label: string;
}) {
  const revisions = note?.history ?? [];
  if (revisions.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed bg-muted/30 px-8 py-12 text-center text-2xl text-muted-foreground">
        <p className="font-semibold text-foreground/80">No prior versions yet</p>
        <p className="mt-2">
          Save the note with a new topic or body to create the first revision.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-2xl font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <RotateCcw className="size-7" />
          Back to editor
        </button>
      </div>
    );
  }
  return (
    <ul className="max-h-[40rem] space-y-4 overflow-y-auto pr-2">
      {[...revisions].reverse().map((revision, index) => (
        <li
          key={`${revision.savedAt}-${index}`}
          className="flex items-start justify-between gap-6 rounded-2xl border-2 bg-muted/20 px-6 py-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-4">
              <span className="truncate text-2xl font-semibold text-foreground">
                {revisionLabel(revision)}
              </span>
              <span className="text-2xl text-muted-foreground">
                {formatTimestamp(revision.savedAt)}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-2xl leading-10 text-muted-foreground">
              {revision.body}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRestore(revision)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 px-4 py-2 text-2xl font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <RotateCcw className="size-7" />
            Restore
          </button>
        </li>
      ))}
      <li className="text-center text-xl text-muted-foreground">
        {label}
      </li>
    </ul>
  );
}