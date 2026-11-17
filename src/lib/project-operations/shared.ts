import type { ApprovalRole, EstimateClass } from "@/types/project-operations";

/** Small value, date and ranking helpers shared by the project-operations modules. */
export type GateCheck = { id: string; label: string; passed: boolean; reason: string };
export type GateStatus = { ready: boolean; blockers: string[] };

export const ESTIMATE_ORDER: EstimateClass[] = ["D", "C", "B", "A"];
export const ESTIMATE_METADATA: Record<
  EstimateClass,
  {
    basis: string;
    low: number;
    high: number;
    contingency: number;
  }
> = {
  D: { basis: "Concept", low: -30, high: 50, contingency: 20 },
  C: { basis: "Preliminary", low: -20, high: 30, contingency: 15 },
  B: { basis: "Permit", low: -10, high: 15, contingency: 10 },
  A: { basis: "IFC", low: -5, high: 10, contingency: 5 },
};

export const APPROVAL_RANK: Record<ApprovalRole, number> = {
  Coordinator: 1,
  "Project Manager": 2,
  Estimator: 2,
  Engineering: 2,
  Finance: 3,
  CRO: 4,
  CEO: 5,
  Client: 1,
};

export const text = (value: unknown) => String(value ?? "").trim();
export const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function dateOnly(value: string | Date) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }
  const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

export function parseDate(value: string | Date) {
  if (value instanceof Date) return new Date(value.getTime());
  const normalized = dateOnly(value);
  return normalized ? new Date(`${normalized}T00:00:00Z`) : new Date("invalid");
}

export function addDays(value: string | Date, days: number) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(value: string | Date, months: number) {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Math.max(0, Math.floor(months)));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}
