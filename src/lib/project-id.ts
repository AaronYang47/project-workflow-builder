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

import type { DomainNode } from "@/types/workflow";

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

// Keep the project-id prefix in sync with the current service type so the
// gate badge shows P-YY-XXX for paid work and L-YY-XXX for legacy work.
// Inputs that don't yet match the canonical pattern pass through untouched
// so partial edits (e.g. just "L-26") don't get clobbered mid-typing.
export const normalizeProjectIdInput = (
  value: string,
  serviceType: string,
): string => {
  if (!value) return value;
  const match = value.match(/^([LP])-(\d{2})-(\d{3})$/);
  if (!match) return value;
  const desiredPrefix = serviceType === "Paid Service" ? "P" : "L";
  if (match[1] === desiredPrefix) return value;
  return `${desiredPrefix}-${match[2]}-${match[3]}`;
};

// A complete building (B-XX) or module (M-XXX) code implicitly means this is
// a Paid Service engagement, so we auto-promote the project. Anything shorter
// is treated as a partial edit and left alone.
export const shouldAutoPromoteToPaid = (
  fieldKey: string,
  value: string,
): boolean => {
  if (!value) return false;
  if (fieldKey === "config.buildingCode") return BUILDING_PATTERN.test(value);
  if (fieldKey === "config.moduleCode") return MODULE_PATTERN.test(value);
  return false;
};

// The two requirement IDs we attach to a project-start node when the project
// is classified as Paid Service. Centralising them keeps the inspector and
// gate rule paths from drifting apart.
export const PAID_CONDITION_BUILDING_ID = "paid-building-required";
export const PAID_CONDITION_MODULE_ID = "paid-module-required";

// Toggle the paid-service "Building code (B-XX)" and "Module code (M-XXX)"
// requirements on a project-start node's `conditions` list. Used in lockstep
// with `promoteToPaidService` so flipping serviceType also updates the gate's
// required conditions.
export const syncPaidConditions = (
  node: DomainNode,
  paid: boolean,
): DomainNode["conditions"] => {
  const conditions = node.conditions || [];
  const withoutPaid = conditions.filter(
    (condition) =>
      condition.id !== PAID_CONDITION_BUILDING_ID &&
      condition.id !== PAID_CONDITION_MODULE_ID,
  );
  if (!paid) return withoutPaid;
  return [
    ...withoutPaid,
    {
      id: PAID_CONDITION_BUILDING_ID,
      label: "Building code (B-XX)",
      required: true,
      checked: false,
    },
    {
      id: PAID_CONDITION_MODULE_ID,
      label: "Module code (M-XXX)",
      required: true,
      checked: false,
    },
  ];
};

// Return a copy of the node with `serviceType` set to "Paid Service" and the
// project-id prefix flipped if it was a canonical L/P pattern. Callers apply
// the patch through the store.
export const promoteToPaidService = (node: DomainNode): DomainNode => {
  const currentProjectId = String(node.customFields?.projectId || "");
  const desiredProjectId = normalizeProjectIdInput(
    currentProjectId,
    "Paid Service",
  );
  return {
    ...node,
    config: { ...node.config, serviceType: "Paid Service" },
    customFields:
      desiredProjectId === currentProjectId
        ? node.customFields
        : { ...node.customFields, projectId: desiredProjectId },
  };
};

// Mirror of `promoteToPaidService`: drop the project back to Standard and
// flip the project-id prefix from P-YY-XXX to L-YY-XXX. Used when the user
// removes the "Paid Service" tag from every condition so the gate badge
// doesn't stay on P-YY-XXX when the conditions no longer require it.
export const demoteToStandardService = (node: DomainNode): DomainNode => {
  const currentProjectId = String(node.customFields?.projectId || "");
  const desiredProjectId = normalizeProjectIdInput(
    currentProjectId,
    "Standard",
  );
  return {
    ...node,
    config: { ...node.config, serviceType: "Standard" },
    customFields:
      desiredProjectId === currentProjectId
        ? node.customFields
        : { ...node.customFields, projectId: desiredProjectId },
  };
};

// Resolve the project-level UUID that is displayed on every node in the
// project. The identifier lives on the project-start node so all cards share
// the same UUID; the requested node's own customFields.nodeUuid is only used
// as a fallback when no project-start node is present.
export function projectNodeUuid(
  node: DomainNode,
  projectStartNode: DomainNode | undefined,
): string {
  const isProjectStart = node.type === "projectStart";
  return String(
    isProjectStart
      ? node.customFields?.nodeUuid || ""
      : projectStartNode?.customFields?.nodeUuid ||
        node.customFields?.nodeUuid ||
        "",
  );
}