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
  /** Plans available, chosen by hand on Route Selection; it decides the plans branch of the route. */
  routePlans?: "yes" | "no";
  /** After CSA / Consultation: plans now ready (yes) or still none (no), chosen on Route Selection. */
  routeConsultPlans?: "yes" | "no";
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

/** Every customer situation and the route it takes. The Owner sits above the
 * GC so its hand-over lines run straight down into the GC box. */
export const QUALIFICATION_CASES: QualificationCase[] = [
  { id: "profab", client: "ProFab", situation: "Our own company", steps: ["LOI"], route: "LOI" },
  { id: "owner-vip", client: "Owner", situation: "VIP", steps: ["LOI"], route: "LOI" },
  {
    id: "owner-no-plans",
    client: "Owner",
    situation: "Regular · no plans",
    // CSA with the Owner, then the Owner finds a GC, who does PCS.
    steps: ["CSA", "GC", "PCS"],
    route: "CSA",
    handoff: "gc-plans",
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
  { id: "gc-vip", client: "GC", situation: "VIP", steps: ["LOI"], route: "LOI" },
  {
    id: "gc-no-plans",
    client: "GC",
    situation: "Regular · no plans",
    steps: ["CSA", "PCS"],
    route: "CSA",
  },
  { id: "gc-plans", client: "GC", situation: "Regular · has plans", steps: ["PCS"], route: "PCS" },
];

/** The steps drawn on a situation's own row: a hand-over stops where the next client takes over. */
export function ownRouteSteps(item: QualificationCase) {
  if (!item.handoff) return item.steps;
  const next = QUALIFICATION_CASES.find((other) => other.id === item.handoff)?.client;
  const at = next ? item.steps.indexOf(next) : -1;
  return at < 0 ? [] : item.steps.slice(0, at);
}

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

export const PROJECT_PARTY_ROLES = [
  { key: "owner", label: "Owner" },
  { key: "gc", label: "General Contractor" },
  { key: "client", label: "Our client (PROFAB)" },
] as const;

export function qualificationPartyIssue(parties?: QualificationForm101["sectionA"]["parties"]) {
  let hasCompany = false;
  const missing: string[] = [];
  for (const role of PROJECT_PARTY_ROLES) {
    const party: PartyEntry | undefined = parties?.[role.key];
    const company = Boolean(party?.company?.trim());
    const contact = Boolean(party?.contact?.trim());
    hasCompany ||= company;
    if (company && !contact) missing.push(`${role.label}: add a contact.`);
    if (contact && !company) missing.push(`${role.label}: add a company.`);
  }
  if (!hasCompany) missing.unshift("Enter at least one company and its contact.");
  return missing.join(" ");
}

/**
 * Who the customer is comes from the form's parties (Q3); whether there are
 * plans is chosen by hand on Route Selection.
 */
export function qualificationFormRouteAnswers(
  section: QualificationForm101["sectionA"] | undefined,
  plansAvailable?: "yes" | "no",
): QualificationRouteAnswers {
  const parties = section?.parties;
  if (qualificationPartyIssue(parties)) return { plansAvailable };
  if (parties?.client?.company.trim()) return { clientCategory: "ProFab", plansAvailable };
  if (parties?.gc?.company.trim())
    return { clientCategory: "GC", customerTier: "regular", plansAvailable };
  if (parties?.owner?.company.trim())
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

export function qualificationCaseFor(qualification: Qualification) {
  return qualificationCase(
    qualification.form101
      ? qualificationFormRouteAnswers(qualification.form101.sectionA, qualification.routePlans)
      : qualification,
  );
}

/**
 * Use the original form answers whenever the project has a form.
 * Older projects may still have a route saved outside the form.
 */
export function qualificationRoute(qualification: Qualification) {
  if (qualification.form101 || qualification.clientCategory)
    return qualificationCaseFor(qualification)?.route;
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
