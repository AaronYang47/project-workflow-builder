import type { HighLevelNodeType } from "@/types/workflow";

type LinkedRow = { title: string; hasSteps: boolean };

/** Room for the chapter chip, drag handle, optional steps badge and the full department name. */
export function highLevelCardWidth(type: HighLevelNodeType, rows: LinkedRow[]): number {
  const base = type === "phase" || type === "primaryGate" ? 288 :
    type === "start" || type === "end" ? 256 : 208;
  if (!rows.length) return base;
  const rowWidth = Math.max(...rows.map(({ title, hasSteps }) => {
    const textWidth = Array.from(title).reduce(
      (sum, character) => sum + (character.charCodeAt(0) > 0xff ? 12 : 7),
      0,
    );
    // Card padding + row padding + chapter chip + drag handle + gaps + badge.
    return textWidth + (hasSteps ? 194 : 138);
  }));
  return Math.min(560, Math.max(base, Math.ceil(rowWidth / 16) * 16));
}
