"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CornerUpLeft, MessageSquareText, Plus, Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";
import type { ComponentNote, ComponentNotePost } from "@/types/workflow";
import {
  createPostId,
  formatRelative,
  formatTimestamp,
  normalizeComponentNote,
} from "@/lib/component-notes";

interface Thread {
  root: ComponentNotePost;
  replies: ComponentNotePost[];
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
  const [replyTo, setReplyTo] = useState<ComponentNotePost | null>(null);

  const note = useMemo(() => normalizeComponentNote(stored), [stored]);
  const postCount = note?.posts.length ?? 0;

  // Group posts into distinct topic threads containing the root topic and all its replies
  const threads = useMemo<Thread[]>(() => {
    if (!note || note.posts.length === 0) return [];
    const postMap = new Map<string, ComponentNotePost>();
    note.posts.forEach((post) => postMap.set(post.id, post));

    const rootPosts: ComponentNotePost[] = [];
    const repliesByRoot = new Map<string, ComponentNotePost[]>();

    // Helper to find the ultimate root ancestor of a post
    const findRootId = (post: ComponentNotePost): string => {
      let curr = post;
      const visited = new Set<string>([curr.id]);
      while (curr.parentId && postMap.has(curr.parentId)) {
        const parent = postMap.get(curr.parentId)!;
        if (visited.has(parent.id)) break; // cycle protection
        visited.add(parent.id);
        curr = parent;
      }
      return curr.id;
    };

    // Classify roots vs replies
    note.posts.forEach((post) => {
      if (!post.parentId || !postMap.has(post.parentId)) {
        rootPosts.push(post);
        if (!repliesByRoot.has(post.id)) repliesByRoot.set(post.id, []);
      }
    });

    // Attach replies under their respective root topic thread
    note.posts.forEach((post) => {
      if (post.parentId && postMap.has(post.parentId)) {
        const rootId = findRootId(post);
        const list = repliesByRoot.get(rootId) || [];
        list.push(post);
        repliesByRoot.set(rootId, list);
      }
    });

    return rootPosts.map((root) => ({
      root,
      replies: repliesByRoot.get(root.id) || [],
    }));
  }, [note]);

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
      topic: topic || (replyTo ? `Re: ${replyTo.topic}` : "Topic"),
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
    // When deleting a post, also delete its descendant replies
    const toDelete = new Set<string>([postId]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      note.posts.forEach((p) => {
        if (p.parentId && toDelete.has(p.parentId) && !toDelete.has(p.id)) {
          toDelete.add(p.id);
          expanded = true;
        }
      });
    }
    const posts = note.posts.filter((post) => !toDelete.has(post.id));
    if (posts.length === 0) commit(undefined);
    else commit({ posts });
    if (replyTo && toDelete.has(replyTo.id)) setReplyTo(null);
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
        title={
          postCount > 0
            ? `View ${postCount} note${postCount === 1 ? "" : "s"} for ${label}`
            : `Add note to ${label}`
        }
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
          <Dialog.Overlay className="fixed inset-0 z-[1000] bg-slate-950/40 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] flex max-h-[calc(100dvh-40px)] w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none">
            {/* Header */}
            <div className="flex items-start gap-3 border-b px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-bold text-foreground">
                  Notes
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
                  {label}
                  {postCount > 0
                    ? ` · ${threads.length} topic${threads.length === 1 ? "" : "s"} (${postCount} post${postCount === 1 ? "" : "s"})`
                    : ""}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close notes"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Scrollable Threads Area */}
            <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-5">
              {threads.length === 0 ? (
                <EmptyState />
              ) : (
                threads.map((thread) => (
                  <div
                    key={thread.root.id}
                    className="rounded-xl border border-border/80 bg-card p-4 shadow-sm transition hover:border-border"
                  >
                    {/* Main Topic / Post Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                            Topic
                          </span>
                          <h4 className="truncate text-xs font-bold uppercase tracking-wide text-foreground">
                            {thread.root.topic}
                          </h4>
                        </div>

                        {/* Main Topic Body */}
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                          {thread.root.body}
                        </p>

                        {/* Topic Meta & Reply Trigger */}
                        <div className="mt-2.5 flex items-center gap-3 text-[11px]">
                          <span
                            className="text-muted-foreground"
                            title={formatTimestamp(thread.root.createdAt)}
                          >
                            {formatRelative(thread.root.createdAt)}
                          </span>
                          <button
                            type="button"
                            onClick={() => startReply(thread.root)}
                            className="inline-flex items-center gap-1 font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                          >
                            <CornerUpLeft className="size-3" />
                            Reply
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePost(thread.root.id)}
                            aria-label={`Delete topic ${thread.root.topic}`}
                            className="inline-flex items-center gap-1 text-muted-foreground/70 transition hover:text-rose-600"
                          >
                            <Trash2 className="size-3" />
                            Delete Topic
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Replies Container: Nested in the SAME box with clear indent & purple typography */}
                    {thread.replies.length > 0 ? (
                      <div className="mt-3.5 space-y-2.5 border-l-2 border-purple-300 pl-3.5 ml-2 dark:border-purple-600/70">
                        {thread.replies.map((reply) => {
                          const directParent = note?.posts.find(
                            (p) => p.id === reply.parentId,
                          );
                          const isDirectToRoot = directParent?.id === thread.root.id;

                          return (
                            <div
                              key={reply.id}
                              className="group rounded-lg border border-purple-200/80 bg-purple-50/50 p-2.5 transition dark:border-purple-900/50 dark:bg-purple-950/20"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 rounded bg-purple-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                                    <CornerUpLeft className="size-2.5" />
                                    Reply
                                  </span>
                                  {!isDirectToRoot && directParent ? (
                                    <span className="text-[11px] font-medium italic text-purple-700/80 dark:text-purple-300/80">
                                      to @{directParent.topic}
                                    </span>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deletePost(reply.id)}
                                  aria-label="Delete reply"
                                  className="text-purple-400 opacity-0 transition hover:text-rose-600 group-hover:opacity-100 dark:text-purple-500"
                                >
                                  <X className="size-3" />
                                </button>
                              </div>

                              {/* All reply text is styled in unmistakable purple */}
                              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed font-medium text-purple-800 dark:text-purple-300">
                                {reply.body}
                              </p>

                              {/* Reply Meta & Action */}
                              <div className="mt-1.5 flex items-center gap-3 text-[10px]">
                                <span
                                  className="text-purple-600/70 dark:text-purple-400/70"
                                  title={formatTimestamp(reply.createdAt)}
                                >
                                  {formatRelative(reply.createdAt)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => startReply(reply)}
                                  className="inline-flex items-center gap-0.5 font-semibold text-purple-700 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100"
                                >
                                  <CornerUpLeft className="size-2.5" />
                                  Reply
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {/* Input Form at Bottom */}
            <form
              onSubmit={handleSubmit}
              className="space-y-2 border-t bg-muted/20 px-5 py-4"
            >
              {/* Replying Banner */}
              {replyTo ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs dark:border-purple-800 dark:bg-purple-950/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <CornerUpLeft className="size-3.5 text-purple-600 dark:text-purple-400" />
                      <p className="font-semibold text-purple-800 dark:text-purple-200">
                        Replying to {replyTo.topic}
                      </p>
                    </div>
                    <p className="mt-0.5 line-clamp-1 truncate text-[11px] text-purple-700/80 dark:text-purple-300/80">
                      “{replyTo.body}”
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelReply}
                    aria-label="Cancel reply"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-200/60 dark:text-purple-300 dark:hover:bg-purple-900/60"
                  >
                    <X className="size-3" />
                    Cancel
                  </button>
                </div>
              ) : (
                <input
                  value={draftTopic}
                  onChange={(event) => setDraftTopic(event.target.value)}
                  placeholder="Topic title (e.g. Design update, Clarification)"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-normal tracking-wide outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              )}

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
                  placeholder={
                    replyTo
                      ? "Write your reply (all reply text is formatted in purple)..."
                      : "Write your note or discussion..."
                  }
                  rows={2}
                  className={cn(
                    "flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none transition focus:ring-2",
                    replyTo
                      ? "border-purple-300 text-purple-900 placeholder:text-purple-400/80 focus:border-purple-500 focus:ring-purple-500/15 dark:border-purple-800 dark:text-purple-200"
                      : "focus:border-primary focus:ring-primary/15",
                  )}
                />
                <button
                  type="submit"
                  disabled={!draftBody.trim()}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-50",
                    replyTo
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                  )}
                >
                  {replyTo ? (
                    <>
                      <CornerUpLeft className="size-3.5" />
                      Reply
                    </>
                  ) : (
                    <>
                      <Send className="size-3.5" />
                      Comment
                    </>
                  )}
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
      <p className="mt-1">
        Start the conversation by creating a new topic below.
      </p>
    </div>
  );
}