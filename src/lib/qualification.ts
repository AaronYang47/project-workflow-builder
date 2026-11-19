import type { DomainNode } from "@/types/workflow";
import type { QualificationForm101 } from "@/lib/qualification-form-101";

/** Choices made in the L2 Qualification node. All can be changed later. */
export type Qualification = {
  clientType?: (typeof CLIENT_TYPES)[number];
  gcStatus?: (typeof GC_STATUSES)[number];
  contractingClient?: (typeof CONTRACTING_CLIENT)[number];
  projectType?: (typeof PROJECT_TYPES)[number];
  /** Plans Available? Yes → LOI / CSA / PCS; No → CSA (Concept Consultation). */
  plansAvailable?: "yes" | "no";
  commercialPath?: (typeof COMMERCIAL_PATHS)[number];
  /** PROFAB [1.01] Qualification Form data, stored only when edited. */
  form101?: QualificationForm101;
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
 * The route the project takes after Qualification: with plans, the chosen
 * LOI / CSA / PCS; without plans, CSA (Concept Consultation). Undefined until
 * "Plans Available?" is answered.
 */
export function qualificationRoute(qualification: Qualification) {
  if (qualification.plansAvailable === "no") return "CSA (Concept Consultation)";
  if (qualification.plansAvailable === "yes")
    return qualification.commercialPath ?? "LOI / CSA / PCS (choose one)";
  return undefined;
}
