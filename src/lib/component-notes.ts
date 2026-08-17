import type { ComponentNote, ComponentNotePost } from "@/types/workflow";

export const DEFAULT_POST_TOPIC = "Note";

export function normalizeComponentNote(value: unknown): ComponentNote | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const body = value.trim();
    if (!body) return undefined;
    return {
      posts: [
        {
          id: createPostId(),
          topic: DEFAULT_POST_TOPIC,
          body,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }
  if (typeof value === "object") {
    const candidate = value as Partial<ComponentNote>;
    const posts = Array.isArray(candidate.posts)
      ? candidate.posts
          .filter(
            (item): item is ComponentNotePost =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as ComponentNotePost).id === "string" &&
              typeof (item as ComponentNotePost).topic === "string" &&
              typeof (item as ComponentNotePost).body === "string" &&
              typeof (item as ComponentNotePost).createdAt === "string",
          )
          .map((post) => ({
            id: post.id,
            topic: post.topic.trim() || DEFAULT_POST_TOPIC,
            body: post.body.trim(),
            createdAt: post.createdAt,
          }))
          .filter((post) => post.body.length > 0)
      : [];
    if (posts.length === 0) return undefined;
    return { posts };
  }
  return undefined;
}

export function createPostId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatTimestamp(value: string): string {
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

export function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = Date.now();
  const diff = now - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatTimestamp(value);
}