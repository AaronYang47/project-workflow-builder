import type { DomainNode } from "@/types/workflow";
import type { QualificationForm101 } from "@/lib/qualification-form-101";

export type TechReviewStatus = "pending" | "approved" | "rejected";

export type QualificationTechReview = {
  status: TechReviewStatus;
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
};

/** Choices made in the L2 Qualification node. All can be changed later. */
export type Qualification = {
  customerHistory?: "new" | "existing";
  clientType?: (typeof CLIENT_TYPES)[number];
  gcStatus?: (typeof GC_STATUSES)[number];
  contractingClient?: (typeof CONTRACTING_CLIENT)[number];
  projectType?: (typeof PROJECT_TYPES)[number];
  /** No plans → CSA; new customer with plans → PCS; existing customer → LOI. */
  plansAvailable?: "yes" | "no";
  commercialPath?: (typeof COMMERCIAL_PATHS)[number];
  /** PROFAB [1.01] Qualification Form data, stored only when edited. */
  form101?: QualificationForm101;
  /** Retained for older saved projects; no longer gates the two-step Qualification flow. */
  techReview?: QualificationTechReview;
};

export const CLIENT_TYPES = ["Owner", "GC", "Architect", "Consultant", "Other"] as const;
export const GC_STATUSES = ["Confirmed", "Pending", "Not Selected"] as const;
export const CONTRACTING_CLIENT = ["Confirmed", "TBD"] as const;
export const PROJECT_TYPES = ["FOB Yard", "Consultation", "Other"] as const;
export const COMMERCIAL_PATHS = ["LOI", "CSA", "PCS"] as const;

export const QUALIFICATION_FIELDS = [
  { key: "clientType", label: "Client Type", options: CLIENT_TYPES },
  { key: "gcStatus", label: "GC Status", options: GC_STATUSES },
  { key: "contractingClient", label: "Contracting Client", options: CONTRACTING_CLIENT },
  { key: "projectType", label: "Project Type", options: PROJECT_TYPES },
] as const;

export function qualificationOf(node: DomainNode): Qualification {
  const value = node.config.qualification;
  return value && typeof value === "object" ? (value as Qualification) : {};
}

/**
 * New customers follow plan availability; returning customers can explicitly
 * choose CSA, PCS, or LOI.
 * Older saved selections remain readable until the user answers the new questions.
 */
export function qualificationRoute(qualification: Qualification) {
  if (qualification.customerHistory === "existing") {
    return qualification.commercialPath;
  }
  if (qualification.customerHistory === "new" && qualification.plansAvailable === "no")
    return "CSA";
  if (qualification.customerHistory === "new" && qualification.plansAvailable === "yes")
    return "PCS";
  if (qualification.customerHistory) return undefined;
  if (qualification.commercialPath) return qualification.commercialPath;
  if (qualification.plansAvailable === "no") return "CSA";
  return undefined;
}
