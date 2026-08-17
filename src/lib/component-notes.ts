import type { ComponentNote, ComponentNoteRevision } from "@/types/workflow";

export const EMPTY_REVISION: Pick<ComponentNoteRevision, "topic" | "body"> = {
  topic: "",
  body: "",
};

const DEFAULT_TOPIC = "Untitled note";

export function normalizeComponentNote(value: unknown): ComponentNote | undefined {
  if (!value) return undefined;
  if (typeof value === "string") {
    const body = value.trim();
    if (!body) return undefined;
    const savedAt = new Date().toISOString();
    return {
      topic: DEFAULT_TOPIC,
      body,
      updatedAt: savedAt,
      history: [],
    };
  }
  if (typeof value === "object") {
    const candidate = value as Partial<ComponentNote>;
    const body = typeof candidate.body === "string" ? candidate.body.trim() : "";
    if (!body) return undefined;
    const topic =
      typeof candidate.topic === "string" && candidate.topic.trim()
        ? candidate.topic.trim()
        : DEFAULT_TOPIC;
    const updatedAt =
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString();
    const history = Array.isArray(candidate.history)
      ? candidate.history
          .filter(
            (item): item is ComponentNoteRevision =>
              typeof item === "object" &&
              item !== null &&
              typeof (item as ComponentNoteRevision).topic === "string" &&
              typeof (item as ComponentNoteRevision).body === "string" &&
              typeof (item as ComponentNoteRevision).savedAt === "string",
          )
          .slice(-20)
      : [];
    return { topic, body, updatedAt, history };
  }
  return undefined;
}

export function emptyComponentNote(): ComponentNote {
  return {
    topic: DEFAULT_TOPIC,
    body: "",
    updatedAt: new Date().toISOString(),
    history: [],
  };
}

export function noteSummary(note: ComponentNote): string {
  return note.body.trim();
}

export function revisionLabel(revision: ComponentNoteRevision): string {
  return revision.topic.trim() || DEFAULT_TOPIC;
}