import type { Condition, DomainNode } from "@/types/workflow";

export const RELEASE_CONDITION_INBOX_ID = "__release-condition-inbox__";

/** Cards that own steps in L3 and the Gantt: Departments, Project Start, Estimation and Route Selection. */
export const isReleaseConditionChapter = (node: Pick<DomainNode, "type">): boolean =>
  node.type === "general" ||
  node.type === "projectStart" ||
  node.type === "estimation" ||
  node.type === "commercialRule";

/** One line per condition; an optional date can be prefixed as YYYY-MM-DD | text. */
export function parseReleaseConditionLines(input: string): Condition[] {
  return input.split(/\r?\n/).flatMap((line) => {
    const value = line.trim();
    if (!value) return [];
    const dated = value.match(/^(\d{4}-\d{2}-\d{2})\s*\|\s*(.+)$/);
    return [
      {
        id: `condition-${crypto.randomUUID()}`,
        label: dated ? dated[2].trim() : value,
        ...(dated ? { displayDate: dated[1] } : {}),
        required: true,
        checked: false,
      },
    ];
  });
}
