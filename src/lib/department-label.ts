import type { DomainNode } from "@/types/workflow";

export const isSalesDepartmentName = (name: string) => /\bsales?\b/i.test(name);
export const isTechnicalDepartmentName = (name: string) => /\btech(?:nical)?\b/i.test(name);
export const isProductionDepartmentName = (name: string) => /\bproduction\b/i.test(name);

const isChapterNumber = (value: string) =>
  /^(?:(?:chapter|department|stage)\s*)?\d+$/i.test(value.trim());

/** Display a department name without exposing its Chapter/Title identifier. */
export function departmentDisplayName(node: DomainNode) {
  if (node.type !== "general" && node.type !== "projectStart") return node.title;

  const stage = String(node.config.stage ?? "").trim();
  const title = node.title.trim();
  const candidates = [stage, title].filter((value) => value && !isChapterNumber(value));
  let name = "";
  let partiallyInvolved = false;
  for (const candidate of candidates) {
    const candidateIsPartiallyInvolved = /\s+partially\s+involved$/i.test(candidate);
    const candidateName = candidate
      .replace(/\s+partially\s+involved$/i, "")
      .replace(/^(?:department|chapter|stage)\s+/i, "")
      .replace(/\s+department$/i, "")
      .replace(/^(?:department|chapter|stage)$/i, "")
      .trim();
    if (!candidateName) {
      partiallyInvolved ||= candidateIsPartiallyInvolved;
      continue;
    }
    name = candidateName;
    partiallyInvolved ||= candidateIsPartiallyInvolved;
    break;
  }

  if (!name) return partiallyInvolved ? "Department Partially Involved" : "Department";
  return `Department ${name}${partiallyInvolved ? " Partially Involved" : ""}`;
}
