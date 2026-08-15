"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquareText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";

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
  const note = useWorkflowStore(
    (state) =>
      state.file.graph.nodes.find((node) => node.id === nodeId)?.config
        .componentNotes?.[noteKey] || "",
  );
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);

  const save = () => {
    const node = useWorkflowStore
      .getState()
      .file.graph.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const componentNotes = { ...(node.config.componentNotes || {}) };
    const value = draft.trim();
    if (value) componentNotes[noteKey] = value;
    else delete componentNotes[noteKey];
    updateNode(nodeId, { config: { ...node.config, componentNotes } });
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Open note for ${label}`}
        title={note ? `View note for ${label}` : `Add note to ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          setDraft(note);
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
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl outline-none">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageSquareText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-sm font-bold">Component note</Dialog.Title>
                    <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                      {label}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button type="button" aria-label="Close note" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
                  </Dialog.Close>
                </div>
                <textarea
                  autoFocus
                  aria-label={`Note text for ${label}`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Add a note for this component…"
                  rows={8}
                  className="mt-4 w-full resize-y rounded-xl border bg-muted/20 p-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <button type="button" className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted">Cancel</button>
                  </Dialog.Close>
                  <button
                    type="button"
                    onClick={save}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Save note
                  </button>
                </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
