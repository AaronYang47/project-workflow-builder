// Helpers around the Project ID conventions used by Project Start and the
// derived Legacy Job Number / building+module codes.
//
// Project ID = `<prefix>-<YY>-<NNN>`
//   prefix: "L" (default) or "P" once any Paid Service Type is present
//   YY    : two-digit current year
//   NNN   : three-digit sequence (001..999)
//
// Legacy Job Number = the five digits after `L-` (i.e. YY + NNN).
//
// Building code  = B-XX
// Module code    = M-XXX
// Both are required once a Paid Service Type shows up.

export type ProjectIdPrefix = "L" | "P";

export const PROJECT_ID_PATTERN = /^[LP]-\d{2}-\d{3}$/;
export const LEGACY_JOB_NUMBER_PATTERN = /^\d{5}$/;
export const BUILDING_PATTERN = /^B-\d{2}$/;
export const MODULE_PATTERN = /^M-\d{3}$/;

export function currentYearSuffix(date = new Date()): string {
  return String(date.getFullYear()).slice(-2);
}

export function buildProjectId(
  sequence: number | string,
  prefix: ProjectIdPrefix = "L",
  yearSuffix = currentYearSuffix(),
): string {
  const numeric = Math.max(0, Math.min(999, Math.floor(Number(sequence) || 0)));
  return `${prefix}-${yearSuffix}-${String(numeric).padStart(3, "0")}`;
}

export function legacyJobNumberFromProjectId(projectId: string): string {
  const match = projectId.match(/^[LP]-(\d{2})-(\d{3})$/);
  if (!match) return "";
  return `${match[1]}${match[2]}`;
}

export function projectIdPrefix(projectId: string): ProjectIdPrefix | null {
  if (!projectId) return null;
  return projectId.startsWith("L-")
    ? "L"
    : projectId.startsWith("P-")
      ? "P"
      : null;
}

export function projectIdForDisplay(
  projectId: string,
  serviceType: string,
): string {
  const match = projectId.match(/^([LP])-(\d{2})-(\d{3})$/);
  if (!match) return projectId;
  const desired = serviceType === "Paid Service" ? "P" : "L";
  if (match[1] === desired) return projectId;
  return `${desired}-${match[2]}-${match[3]}`;
}

export function swapProjectIdPrefix(
  projectId: string,
  nextPrefix: ProjectIdPrefix,
): string {
  const tail = projectId.replace(/^[LP]-/, "");
  return `${nextPrefix}-${tail}`;
}

export function normalizeProjectId(input: string): string {
  // Strict: require exactly L-YY-XXX or P-YY-XXX. Anything else → default.
  const strict = String(input || "").match(/^([LP])-(\d{2})-(\d{3})$/);
  if (strict) {
    return input;
  }
  // Tolerant: try to salvage prefix + first 2 digits + last 3 digits from corrupt input.
  const trimmed = String(input || "").trim();
  const prefixMatch = trimmed.match(/^([LP])-/);
  const yyMatch = trimmed.match(/(\d{2})/);
  const seqMatch = trimmed.match(/(\d{3})(?=[^\d]*$)/);
  if (prefixMatch && yyMatch && seqMatch) {
    return `${prefixMatch[1]}-${yyMatch[1]}-${seqMatch[1]}`;
  }
  return `L-${currentYearSuffix()}-001`;
}