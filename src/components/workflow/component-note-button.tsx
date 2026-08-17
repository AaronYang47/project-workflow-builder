"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CornerUpLeft, MessageSquareText, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { ComponentNote, ComponentNotePost } from "@/types/workflow";
import {
  createPostId,
  formatRelative,
  formatTimestamp,
  normalizeComponentNote,
} from "@/lib/component-notes";

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
  const [replyTo, setReplyTo] = useState<ComponentNotePost | null>(null);

  const note = useMemo(() => normalizeComponentNote(stored), [stored]);
  const postCount = note?.posts.length ?? 0;

  const commit = (next: ComponentNote | undefined) => {
    const current = useWorkflowStore.getState();
    const node = current.file.graph.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    const componentNotes = { ...(node.config.componentNotes || {}) };
    if (next && next.posts.length > 0) componentNotes[noteKey] = next;
    else delete componentNotes[noteKey];
    updateNode(nodeId, { config: { ...node.config, componentNotes } });
  };

  const addPost = () => {
    const body = draftBody.trim();
    if (!body) return;
    const topic = draftTopic.trim();
    const post: ComponentNotePost = {
      id: createPostId(),
      topic: topic || "Note",
      body,
      createdAt: new Date().toISOString(),
      parentId: replyTo?.id,
    };
    const posts = [...(note?.posts ?? []), post];
    commit({ posts });
    setDraftTopic("");
    setDraftBody("");
    setReplyTo(null);
  };

  const startReply = (post: ComponentNotePost) => {
    setReplyTo(post);
    setDraftTopic("");
    setDraftBody("");
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const deletePost = (postId: string) => {
    if (!note) return;
    const posts = note.posts.filter((post) => post.id !== postId);
    if (posts.length === 0) commit(undefined);
    else commit({ posts });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addPost();
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Open notes for ${label}`}
        title={postCount > 0 ? `View ${postCount} note${postCount === 1 ? "" : "s"} for ${label}` : `Add note to ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          setDraftTopic("");
          setDraftBody("");
          setReplyTo(null);
          setOpen(true);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          "nodrag nopan relative inline-flex size-6 shrink-0 items-center justify-center rounded-md border bg-background/90 text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary",
          className,
        )}
      >
        <MessageSquareText className="size-3" />
        {postCount > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full border border-background bg-primary px-1 text-[9px] font-bold leading-4 text-primary-foreground"
          >
            {postCount > 99 ? "99+" : postCount}
          </span>
        ) : null}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1000] bg-slate-950/35 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none">
            <div className="flex items-start gap-3 border-b px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-bold">Notes</Dialog.Title>
                <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                  {label}
                  {postCount > 0 ? ` · ${postCount} post${postCount === 1 ? "" : "s"}` : ""}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close notes"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {postCount === 0 ? (
                <EmptyState />
              ) : (
                <ul className="space-y-3">
                  {note?.posts.map((post) => (
                    <li
                      key={post.id}
                      className="rounded-xl border bg-muted/20 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {post.topic}
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                            {post.body}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span title={formatTimestamp(post.createdAt)}>
                              {formatRelative(post.createdAt)}
                            </span>
                            <button
                              type="button"
                              onClick={() => startReply(post)}
                              className="inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-primary"
                            >
                              <CornerUpLeft className="size-3" />
                              Reply
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deletePost(post.id)}
                          aria-label={`Delete note about ${post.topic}`}
                          title="Delete this post"
                          className="rounded-md p-1 text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-2 border-t bg-muted/10 px-5 py-4"
            >
              {replyTo ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold uppercase tracking-wide text-primary">
                      Replying to {replyTo.topic}
                    </p>
                    <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-muted-foreground">
                      {replyTo.body}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelReply}
                    aria-label="Cancel reply"
                    className="rounded-md p-1 text-muted-foreground hover:bg-background"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : null}
              <input
                value={draftTopic}
                onChange={(event) => setDraftTopic(event.target.value)}
                placeholder="Topic (optional)"
                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-normal tracking-wide outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <div className="flex items-end gap-2">
                <textarea
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                      addPost();
                    }
                  }}
                  placeholder="Write a comment…"
                  rows={2}
                  className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <button
                  type="submit"
                  disabled={!draftBody.trim()}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition disabled:opacity-50"
                >
                  <Send className="size-3.5" />
                  Comment
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center text-xs text-muted-foreground">
      <MessageSquareText className="mx-auto mb-2 size-5 text-muted-foreground/70" />
      <p className="font-semibold text-foreground/80">No notes yet</p>
      <p className="mt-1">Start the conversation by adding the first note below.</p>
    </div>
  );
}