import type { DomainNode } from "@/types/workflow";
import type { PartyEntry, QualificationForm101 } from "@/lib/qualification-form-101";

export type TechReviewStatus = "pending" | "approved" | "rejected";

export type QualificationTechReview = {
  status: TechReviewStatus;
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
};

/** Form data and compatibility fields for saved Qualification nodes. */
export type Qualification = {
  /** Who the customer is: General Contractor, building Owner, or ProFab itself. */
  clientCategory?: ClientCategory;
  /** VIP customers go through the LOI channel. */
  customerTier?: "vip" | "regular";
  /** Retained for older saved projects; replaced by clientCategory and customerTier. */
  customerHistory?: "new" | "existing";
  clientType?: (typeof CLIENT_TYPES)[number];
  gcStatus?: (typeof GC_STATUSES)[number];
  contractingClient?: (typeof CONTRACTING_CLIENT)[number];
  projectType?: (typeof PROJECT_TYPES)[number];
  /** Plan availability from the older route selector. */
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

export const CLIENT_CATEGORIES = ["GC", "Owner", "ProFab"] as const;
export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];
export type QualificationRouteAnswers = Pick<
  Qualification,
  "clientCategory" | "customerTier" | "plansAvailable"
>;

export type QualificationCase = {
  id: string;
  client: ClientCategory;
  situation: string;
  /** The steps the customer goes through, in order. */
  steps: string[];
  /** The CSA / PCS / LOI card the workflow continues into. */
  route: (typeof COMMERCIAL_PATHS)[number];
  /** Handed over to another situation, which carries on from there. */
  handoff?: string;
};

/** Every customer situation and the route it takes. */
export const QUALIFICATION_CASES: QualificationCase[] = [
  { id: "profab", client: "ProFab", situation: "Our own company", steps: ["LOI"], route: "LOI" },
  { id: "gc-vip", client: "GC", situation: "VIP", steps: ["LOI"], route: "LOI" },
  {
    id: "gc-no-plans",
    client: "GC",
    situation: "Regular · no plans",
    steps: ["CSA", "PCS"],
    route: "CSA",
  },
  { id: "gc-plans", client: "GC", situation: "Regular · has plans", steps: ["PCS"], route: "PCS" },
  { id: "owner-vip", client: "Owner", situation: "VIP", steps: ["LOI"], route: "LOI" },
  {
    id: "owner-no-plans",
    client: "Owner",
    situation: "Regular · no plans",
    steps: ["CSA", "PCS"],
    route: "CSA",
  },
  {
    id: "owner-plans",
    client: "Owner",
    situation: "Regular · has plans",
    // The Owner passes the project to their GC, who goes straight to PCS.
    steps: ["GC", "PCS"],
    route: "PCS",
    handoff: "gc-plans",
  },
];

/** The situation this Qualification describes, once enough has been chosen. */
export function qualificationCase({
  clientCategory,
  customerTier,
  plansAvailable,
}: QualificationRouteAnswers) {
  if (!clientCategory) return undefined;
  const id =
    clientCategory === "ProFab"
      ? "profab"
      : customerTier === "vip"
        ? `${clientCategory.toLowerCase()}-vip`
        : customerTier === "regular" && plansAvailable
          ? `${clientCategory.toLowerCase()}-${plansAvailable === "yes" ? "plans" : "no-plans"}`
          : undefined;
  return QUALIFICATION_CASES.find((item) => item.id === id);
}

const hasPartyInfo = (party?: PartyEntry) =>
  Boolean(party?.company?.trim() || party?.contact?.trim());

export function qualificationFormRouteAnswers(
  section: QualificationForm101["sectionA"] | undefined,
): QualificationRouteAnswers {
  const parties = section?.parties;
  const plansAvailable = section?.documents?.archDrawings?.available;
  if (hasPartyInfo(parties?.client)) return { clientCategory: "ProFab", plansAvailable };
  if (hasPartyInfo(parties?.gc))
    return { clientCategory: "GC", customerTier: "regular", plansAvailable };
  if (hasPartyInfo(parties?.owner))
    return { clientCategory: "Owner", customerTier: "regular", plansAvailable };
  return { plansAvailable };
}

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
 * Use the original form answers whenever the project has a form.
 * Older projects may still have a route saved outside the form.
 */
export function qualificationRoute(qualification: Qualification) {
  if (qualification.form101)
    return qualificationCase(qualificationFormRouteAnswers(qualification.form101.sectionA))?.route;
  if (qualification.clientCategory) return qualificationCase(qualification)?.route;
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
