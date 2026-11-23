import type { Qualification, TechReviewStatus } from "@/lib/qualification";

export const FORM_101_CODE = "1.01";
export const FORM_101_VERSION = "261116";
export const FORM_101_PASS_SCORE = 70;
export const FORM_101_ORGANIZATION =
  "GROUPE PROFAB INC. · 294 rue Laurier, St-Apollinaire, QC, G0S 2E0 · www.profab.ca";

export const OCCUPANCY_GROUPS = [
  { code: "A", label: "Group A — assembly" },
  { code: "C", label: "Group C — residential" },
  { code: "D", label: "Group D — business and personal services" },
  { code: "E", label: "Group E — mercantile" },
] as const;

export type OccupancyGroupCode = (typeof OCCUPANCY_GROUPS)[number]["code"];

export const PROJECT_PARTY_ROLES = [
  { key: "owner", label: "Owner" },
  { key: "gc", label: "General Contractor" },
  { key: "client", label: "Our client (PROFAB)" },
] as const;

export type ProjectPartyRoleKey = (typeof PROJECT_PARTY_ROLES)[number]["key"];

export const DISCIPLINE_DEFINITIONS = [
  {
    key: "civil",
    number: 1,
    consultantLabel: "Civil",
    sectionTitle: "1. Civil",
    note: "The position AND orientation of every foundation are required.",
  },
  {
    key: "architectural",
    number: 2,
    consultantLabel: "Architectural",
    sectionTitle: "2. Architecture",
  },
  {
    key: "structural",
    number: 3,
    consultantLabel: "Structural",
    sectionTitle: "3. Structure",
  },
  {
    key: "mechanical",
    number: 4,
    consultantLabel: "Mechanical",
    sectionTitle: "4. Mechanical",
    note: "Pay particular attention to equipment installed outside the modules by other parties.",
  },
  {
    key: "electrical",
    number: 5,
    consultantLabel: "Electrical",
    sectionTitle: "5. Electrical",
  },
  {
    key: "plumbing",
    number: 6,
    consultantLabel: "Plumbing",
    sectionTitle: "6. Plumbing",
  },
  {
    key: "fireProtection",
    number: 7,
    consultantLabel: "Fire protection",
    sectionTitle: "7. Fire protection",
  },
] as const;

export type DisciplineKey = (typeof DISCIPLINE_DEFINITIONS)[number]["key"];

export const TARGET_DATE_FIELDS = [
  { key: "contractSignature", label: "Contract signature" },
  { key: "design", label: "Design" },
  { key: "consultantApproval", label: "Consultant approval" },
  { key: "productSelection", label: "Product selection" },
  { key: "factoryProduction", label: "Factory production" },
  { key: "delivery", label: "Delivery" },
] as const;

export type TargetDateKey = (typeof TARGET_DATE_FIELDS)[number]["key"];

export const PROJECT_DOCUMENT_DEFINITIONS = [
  { key: "permit", label: "Permit" },
  { key: "archDrawings", label: "Latest architectural drawing set" },
  { key: "sitePlan", label: "Site plan" },
  { key: "bylawsZoning", label: "Applicable municipal bylaws / zoning" },
  { key: "productSpecs", label: "Project product requirements / specifications" },
  { key: "classEstimate", label: "Class estimate (CEC) — D / C / B / A" },
  { key: "existingRfis", label: "Existing RFIs" },
  { key: "priorCorrespondence", label: "Prior correspondence / instructions" },
] as const;

export type ProjectDocumentKey = (typeof PROJECT_DOCUMENT_DEFINITIONS)[number]["key"];

export const DRAWING_ISSUE_STATUS_SUGGESTIONS = [
  "Preliminary / Concept",
  "Issued for Permit",
  "Issued for Tender",
  "Issued for Construction",
  "As-Built / Record",
] as const;

export const SUPPLY_SCOPE_OPTIONS = [
  { code: "FI/SI", label: "FI/SI", description: "Supplied and installed by PROFAB" },
  { code: "F/S", label: "F/S", description: "Supplied only by PROFAB" },
  { code: "FIA/SIO", label: "FIA/SIO", description: "Supplied and installed by others" },
] as const;

export type SupplyScopeCode = (typeof SUPPLY_SCOPE_OPTIONS)[number]["code"];

export const ANNEX_1_CATEGORIES = [
  {
    category: "Exterior",
    items: [
      "Windows — type, supplier, glazing",
      "Exterior doors and hardware",
      "Exterior cladding / siding",
      "Soffit, fascia and gutters",
      "Exterior trims / finishing",
    ],
  },
  {
    category: "Interior",
    items: [
      "Drywall taping, mudding and sanding",
      "Flooring and baseboards",
      "Interior doors and hardware",
      "Cabinets, countertops and vanities",
    ],
  },
  {
    category: "Delivery and site",
    items: [
      "Transportation / delivery",
      "Crane / rigging / lifting",
      "Module setting / structural connections",
      "Module joint completion / weatherproofing",
      "Foundation / anchorage",
      "Site utilities and MEP connections",
      "Stairs, ramps, decks and guards",
      "Testing / commissioning",
    ],
  },
  {
    category: "Products and equipment",
    items: [
      "Exterior mechanical equipment (louvers, grilles, vents)",
      "HVAC, HRV/ERV and exhaust equipment",
      "Exterior light fixtures and covers",
      "Selected plumbing fixtures",
      "Fire-stopping products and caulking",
    ],
  },
] as const;

export const ANNEX_2_BY_DISCIPLINE: Record<DisciplineKey, readonly string[]> = {
  civil: [
    "1.1. Current site plan: property lines, setbacks, site access and municipality",
    "1.2. Foundation plan: dimensioned or georeferenced position and orientation of each foundation (grid or north reference)",
    "1.3. Foundation type, dimensions and top-of-foundation elevation",
    "1.4. Finished floor elevation, site grades and benchmarks",
    "1.5. Anchorage details: sill plate, anchor bolts, hold-downs",
    "1.6. Utility entry points (water, sewer, electrical, gas): location and elevation relative to the modules",
    "1.7. Delivery route, crane location and setting sequence",
    "1.8. Entry stairs, stoops, ramps and decks: who supplies and details",
    "1.9. Geotechnical report and frost depth",
  ],
  architectural: [
    "2.1. Latest drawing set: plans, elevations, sections, revision and issue status",
    "2.2. Dimensioned floor plans and area of each unit",
    "2.3. Ceiling heights and floor-to-floor height",
    "2.4. Module split lines and marriage walls",
    "2.5. Wall, floor and roof assemblies (insulation, sheathing, finishes)",
    "2.6. Roof type, pitch, overhangs and eave details",
    "2.7. Window and exterior door schedule: sizes, rough openings, swing, make and model",
    "2.8. Exterior cladding, soffit, fascia, gutters and trim: product and colour",
    "2.9. Interior finish schedule: flooring, drywall, paint, baseboards and trim",
    "2.10. Interior doors and hardware: sizes, type and swing",
    "2.11. Kitchens and bathrooms: layouts, cabinets, countertops and vanities",
    "2.12. Code items that affect the drawings: barrier-free, egress windows, guards",
    "2.13. Work finished in the factory versus on site (exclusions)",
    "2.14. Responsible architect and contact",
  ],
  structural: [
    "3.1. Current structural drawings, revision and engineer's seal",
    "3.2. Design loads: snow, wind, seismic and occupancy",
    "3.3. Floor and roof framing: joists or trusses, spacing, manufacturer",
    "3.4. Headers, beams and posts: sizes and locations",
    "3.5. Bearing walls, shear walls and lateral system",
    "3.6. Module stacking and module-to-module connections",
    "3.7. Module-to-foundation connection",
    "3.8. Lifting points and transport requirements",
    "3.9. Framing openings and penetrations (MEP)",
    "3.10. Structural engineer and contact",
  ],
  mechanical: [
    "4.1. Current mechanical drawings and responsible consultant",
    "4.2. Heating and cooling system: type, make and model",
    "4.3. HRV/ERV: make, model and location",
    "4.4. Duct routing, bulkheads and chases",
    "4.5. Exhaust fans and range hood: model, duct size and termination",
    "4.6. Exterior louvers, grilles and vents: locations and sizes",
    "4.7. Exterior or balcony equipment: location and who installs",
    "4.8. Thermostats and controls: locations",
    "4.9. Gas appliances (fireplace, range, dryer) and venting",
    "4.10. Mechanical connections between modules",
  ],
  electrical: [
    "5.1. Current electrical drawings and responsible consultant",
    "5.2. Electrical service: size, meter and panel locations",
    "5.3. Panel schedule and appliance circuit list",
    "5.4. Layout of receptacles, switches and light fixtures",
    "5.5. Interior and exterior light fixture schedule: make and model",
    "5.6. Exterior receptacles, fixtures, covers and penetrations",
    "5.7. Smoke and CO alarm locations",
    "5.8. Low voltage: data, TV, doorbell, security",
    "5.9. Special equipment: EV charger, generator, solar",
    "5.10. Electrical connection points between modules",
  ],
  plumbing: [
    "6.1. Current plumbing drawings and responsible consultant",
    "6.2. Fixture schedule: sinks, toilets, tubs, showers and faucets (make and model)",
    "6.3. Water heater: type, capacity, make and location",
    "6.4. Supply and drain piping materials (PEX, copper, ABS, PVC)",
    "6.5. Stack and vent locations coordinated with framing",
    "6.6. Main water entry and sewer exit: location and elevation",
    "6.7. Laundry, hose bibs and floor drains",
    "6.8. Plumbing connections between modules",
    "6.9. Insulation and freeze protection",
  ],
  fireProtection: [
    "7.1. Fire protection consultant and current documents",
    "7.2. Occupancy, fire separations and rated assemblies (listing numbers)",
    "7.3. Sprinklers required? System type, head layout and designer",
    "7.4. Sprinkler water supply and entry point",
    "7.5. Fire alarm and detection: type and device locations",
    "7.6. Firestopping at module joints and penetrations: listed systems",
    "7.7. Fire-rated doors and frames: locations and rating",
    "7.8. Fire authority approvals and municipal requirements",
  ],
};

export interface PartyEntry {
  company: string;
  contact: string;
}

export interface ConsultantEntry {
  name: string;
  company: string;
  contact: string;
}

export interface DocumentEntry {
  available?: "yes" | "no";
  locationOrDate: string;
}

export interface LatestDrawingEntry {
  id: string;
  drawingName: string;
  revisionNumber: string;
  revisionDate: string;
  issueStatus: string;
  exactLocation: string;
}

export interface DisciplineIntakeItem {
  id: string;
  item: string;
  remark: string;
}

export interface DisciplineIntakeSection {
  reviewedNone?: boolean;
  items: DisciplineIntakeItem[];
}

export interface SpecialProductItem {
  id: string;
  item: string;
  description: string;
  supply?: SupplyScopeCode;
  relatedFiles: string;
}

export interface SpecialProductsSection {
  reviewedNone?: boolean;
  items: SpecialProductItem[];
}

export interface TechnicalRfiItem {
  id: string;
  rfiNo: string;
  disciplineOrIssue: string;
  sentBy: string;
  dueDate: string;
}

export interface QualificationForm101 {
  revision: string;
  updatedAt?: string;
  sectionA: {
    projectName: string;
    projectAddress: string;
    parties: Record<ProjectPartyRoleKey, PartyEntry>;
    mainContact: {
      name: string;
      companyRole: string;
      email: string;
      phone: string;
    };
    occupancyGroups: OccupancyGroupCode[];
    grossAreaSqFt: string;
    consultants: Record<DisciplineKey, ConsultantEntry>;
    budgetEstablished?: "yes" | "no";
    depositReceived?: "yes" | "no";
    permitStatus: string;
    targetDates: Record<TargetDateKey, string>;
    documents: Record<ProjectDocumentKey, DocumentEntry>;
    latestDrawings: LatestDrawingEntry[];
  };
  sectionB: {
    disciplines: Record<DisciplineKey, DisciplineIntakeSection>;
    specialProducts: SpecialProductsSection;
  };
  sectionC: {
    rfis: TechnicalRfiItem[];
  };
}

export type QualificationGrade = "A" | "B" | "C" | "D";

export interface QualificationScoreSection {
  id: "A1" | "A2" | "A3" | "B";
  label: string;
  score: number;
  maxScore: number;
}

export interface QualificationMissingItem {
  id: string;
  section: "A1" | "A2" | "A3" | "B";
  anchorId: string;
  label: string;
}

export interface QualificationForm101Evaluation {
  totalScore: number;
  grade: QualificationGrade;
  gradeLabel: "Complete / Ready" | "Mostly Complete" | "Partial Intake" | "Incomplete";
  sections: QualificationScoreSection[];
  missingItems: QualificationMissingItem[];
  q9DepositExempt: boolean;
  sectionACompletedCount: number;
  sectionBCompletedCount: number;
  openRfiCount: number;
  incompleteRfiCount: number;
  hasAnyInput: boolean;
}

const yesNo = (value: unknown): "yes" | "no" | undefined =>
  value === "yes" || value === "no" ? value : undefined;

const str = (value: unknown) => (typeof value === "string" ? value : "");

const newId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export function createEmptyQualificationForm101(): QualificationForm101 {
  const parties = {} as Record<ProjectPartyRoleKey, PartyEntry>;
  for (const role of PROJECT_PARTY_ROLES) {
    parties[role.key] = { company: "", contact: "" };
  }
  const consultants = {} as Record<DisciplineKey, ConsultantEntry>;
  const disciplines = {} as Record<DisciplineKey, DisciplineIntakeSection>;
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    consultants[discipline.key] = { name: "", company: "", contact: "" };
    disciplines[discipline.key] = { reviewedNone: false, items: [] };
  }
  const targetDates = {} as Record<TargetDateKey, string>;
  for (const dateField of TARGET_DATE_FIELDS) {
    targetDates[dateField.key] = "";
  }
  const documents = {} as Record<ProjectDocumentKey, DocumentEntry>;
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    documents[doc.key] = { available: undefined, locationOrDate: "" };
  }
  return {
    revision: "",
    sectionA: {
      projectName: "",
      projectAddress: "",
      parties,
      mainContact: { name: "", companyRole: "", email: "", phone: "" },
      occupancyGroups: [],
      grossAreaSqFt: "",
      consultants,
      budgetEstablished: undefined,
      depositReceived: undefined,
      permitStatus: "",
      targetDates,
      documents,
      latestDrawings: [],
    },
    sectionB: {
      disciplines,
      specialProducts: { reviewedNone: false, items: [] },
    },
    sectionC: {
      rfis: [],
    },
  };
}

export function normalizeQualificationForm101(
  raw?: Partial<QualificationForm101> | null,
): QualificationForm101 {
  const empty = createEmptyQualificationForm101();
  if (!raw || typeof raw !== "object") return empty;
  const rawA = raw.sectionA ?? ({} as QualificationForm101["sectionA"]);
  const rawB = raw.sectionB ?? ({} as QualificationForm101["sectionB"]);
  const rawC = raw.sectionC ?? ({} as QualificationForm101["sectionC"]);

  for (const role of PROJECT_PARTY_ROLES) {
    const entry = rawA.parties?.[role.key];
    empty.sectionA.parties[role.key] = {
      company: str(entry?.company),
      contact: str(entry?.contact),
    };
  }
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const c = rawA.consultants?.[discipline.key];
    empty.sectionA.consultants[discipline.key] = {
      name: str(c?.name),
      company: str(c?.company),
      contact: str(c?.contact),
    };
    const intake = rawB.disciplines?.[discipline.key];
    empty.sectionB.disciplines[discipline.key] = {
      reviewedNone: Boolean(intake?.reviewedNone),
      items: Array.isArray(intake?.items)
        ? intake.items.map((row) => ({
            id: str(row?.id) || newId(),
            item: str(row?.item),
            remark: str(row?.remark),
          }))
        : [],
    };
  }
  for (const dateField of TARGET_DATE_FIELDS) {
    empty.sectionA.targetDates[dateField.key] = str(rawA.targetDates?.[dateField.key]);
  }
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    const entry = rawA.documents?.[doc.key];
    empty.sectionA.documents[doc.key] = {
      available: yesNo(entry?.available),
      locationOrDate: str(entry?.locationOrDate),
    };
  }

  const validOccupancy = new Set<string>(OCCUPANCY_GROUPS.map((item) => item.code));
  const validSupply = new Set<string>(SUPPLY_SCOPE_OPTIONS.map((item) => item.code));

  return {
    revision: str(raw.revision),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    sectionA: {
      ...empty.sectionA,
      projectName: str(rawA.projectName),
      projectAddress: str(rawA.projectAddress),
      mainContact: {
        name: str(rawA.mainContact?.name),
        companyRole: str(rawA.mainContact?.companyRole),
        email: str(rawA.mainContact?.email),
        phone: str(rawA.mainContact?.phone),
      },
      occupancyGroups: Array.isArray(rawA.occupancyGroups)
        ? rawA.occupancyGroups.filter((code): code is OccupancyGroupCode =>
            validOccupancy.has(code),
          )
        : [],
      grossAreaSqFt: str(rawA.grossAreaSqFt),
      budgetEstablished: yesNo(rawA.budgetEstablished),
      depositReceived: yesNo(rawA.depositReceived),
      permitStatus: str(rawA.permitStatus),
      latestDrawings: Array.isArray(rawA.latestDrawings)
        ? rawA.latestDrawings.map((row) => ({
            id: str(row?.id) || newId(),
            drawingName: str(row?.drawingName),
            revisionNumber: str(row?.revisionNumber),
            revisionDate: str(row?.revisionDate),
            issueStatus: str(row?.issueStatus),
            exactLocation: str(row?.exactLocation),
          }))
        : [],
    },
    sectionB: {
      ...empty.sectionB,
      specialProducts: {
        reviewedNone: Boolean(rawB.specialProducts?.reviewedNone),
        items: Array.isArray(rawB.specialProducts?.items)
          ? rawB.specialProducts.items.map((row) => ({
              id: str(row?.id) || newId(),
              item: str(row?.item),
              description: str(row?.description),
              supply:
                row?.supply && validSupply.has(row.supply)
                  ? (row.supply as SupplyScopeCode)
                  : undefined,
              relatedFiles: str(row?.relatedFiles),
            }))
          : [],
      },
    },
    sectionC: {
      rfis: Array.isArray(rawC.rfis)
        ? rawC.rfis.map((row) => ({
            id: str(row?.id) || newId(),
            rfiNo: str(row?.rfiNo),
            disciplineOrIssue: str(row?.disciplineOrIssue),
            sentBy: str(row?.sentBy),
            dueDate: str(row?.dueDate),
          }))
        : [],
    },
  };
}

/** Trim blank trailing rows before saving so persisted JSON stays tidy. */
export function compactQualificationForm101(form: QualificationForm101): QualificationForm101 {
  const normalized = normalizeQualificationForm101(form);
  const disciplines = {} as Record<DisciplineKey, DisciplineIntakeSection>;
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const entry = normalized.sectionB.disciplines[discipline.key];
    disciplines[discipline.key] = {
      reviewedNone: Boolean(entry.reviewedNone),
      items: entry.items.filter((row) => row.item.trim() || row.remark.trim()),
    };
  }
  return {
    ...normalized,
    sectionA: {
      ...normalized.sectionA,
      latestDrawings: normalized.sectionA.latestDrawings.filter(
        (row) =>
          row.drawingName.trim() ||
          row.revisionNumber.trim() ||
          row.revisionDate.trim() ||
          row.issueStatus.trim() ||
          row.exactLocation.trim(),
      ),
    },
    sectionB: {
      disciplines,
      specialProducts: {
        reviewedNone: Boolean(normalized.sectionB.specialProducts.reviewedNone),
        items: normalized.sectionB.specialProducts.items.filter(
          (row) =>
            row.item.trim() || row.description.trim() || row.supply || row.relatedFiles.trim(),
        ),
      },
    },
    sectionC: {
      rfis: normalized.sectionC.rfis.filter(
        (row) =>
          row.rfiNo.trim() ||
          row.disciplineOrIssue.trim() ||
          row.sentBy.trim() ||
          row.dueDate.trim(),
      ),
    },
  };
}

const filled = (value: string | undefined) => Boolean(value && value.trim().length > 0);

function gradeForScore(
  score: number,
): Pick<QualificationForm101Evaluation, "grade" | "gradeLabel"> {
  if (score >= 85) return { grade: "A", gradeLabel: "Complete / Ready" };
  if (score >= 65) return { grade: "B", gradeLabel: "Mostly Complete" };
  if (score >= 40) return { grade: "C", gradeLabel: "Partial Intake" };
  return { grade: "D", gradeLabel: "Incomplete" };
}

/**
 * Evaluate client intake completeness on a 100-point absolute scale:
 * - Section A1 (Project & Stakeholders): 30 pts
 * - Section A2 (Commercial Status & Schedule): 20 pts (Q9 deposit auto-exempted for LOI)
 * - Section A3 (Documents & Latest Drawings): 25 pts
 * - Section B  (Discipline Intake & Special Products): 25 pts
 * Section C (RFIs) is tracked independently without distorting completeness score.
 */
export function evaluateQualificationForm101(
  qualification: Qualification,
): QualificationForm101Evaluation {
  const form = normalizeQualificationForm101(qualification.form101);
  const { sectionA, sectionB, sectionC } = form;
  const q9DepositExempt = qualification.commercialPath === "LOI";
  const missingItems: QualificationMissingItem[] = [];

  // --- Section A1 (30 pts) ---
  let a1 = 0;
  let aCompleted = 0;

  if (filled(sectionA.projectName)) {
    a1 += 3;
    aCompleted += 1;
  } else {
    missingItems.push({ id: "q1", section: "A1", anchorId: "q101-q1", label: "Q1 Project name" });
  }

  if (filled(sectionA.projectAddress)) {
    a1 += 4;
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q2",
      section: "A1",
      anchorId: "q101-q2",
      label: "Q2 Full project address",
    });
  }

  let partyPts = 0;
  const missingParties: string[] = [];
  for (const role of PROJECT_PARTY_ROLES) {
    const entry = sectionA.parties[role.key];
    const hasCompany = filled(entry.company);
    const hasContact = filled(entry.contact);
    if (hasCompany) partyPts += 1;
    if (hasContact) partyPts += 1;
    if (!hasCompany || !hasContact) missingParties.push(role.label);
  }
  a1 += partyPts;
  if (partyPts === 6) aCompleted += 1;
  else {
    missingItems.push({
      id: "q3",
      section: "A1",
      anchorId: "q101-q3",
      label: `Q3 Project parties (${missingParties.join(", ")})`,
    });
  }

  const contactValues = [
    sectionA.mainContact.name,
    sectionA.mainContact.companyRole,
    sectionA.mainContact.email,
    sectionA.mainContact.phone,
  ];
  const contactFilled = contactValues.filter(filled).length;
  a1 += Math.round((contactFilled / 4) * 5);
  if (contactFilled === 4) aCompleted += 1;
  else {
    missingItems.push({
      id: "q4",
      section: "A1",
      anchorId: "q101-q4",
      label: `Q4 Main contact (${contactFilled}/4 fields)`,
    });
  }

  if (sectionA.occupancyGroups.length > 0) {
    a1 += 3;
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q5",
      section: "A1",
      anchorId: "q101-q5",
      label: "Q5 Occupancy group",
    });
  }

  if (filled(sectionA.grossAreaSqFt)) {
    a1 += 3;
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q6",
      section: "A1",
      anchorId: "q101-q6",
      label: "Q6 Gross building area [sq. ft]",
    });
  }

  let consultantUnits = 0;
  let fullConsultants = 0;
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const entry = sectionA.consultants[discipline.key];
    const hasIdentity = filled(entry.name) || filled(entry.company);
    const hasContact = filled(entry.contact);
    if (hasIdentity && hasContact) {
      consultantUnits += 1;
      fullConsultants += 1;
    } else if (hasIdentity || hasContact) {
      consultantUnits += 0.5;
    }
  }
  a1 += Math.round((consultantUnits / DISCIPLINE_DEFINITIONS.length) * 6);
  if (fullConsultants === DISCIPLINE_DEFINITIONS.length) aCompleted += 1;
  else {
    missingItems.push({
      id: "q7",
      section: "A1",
      anchorId: "q101-q7",
      label: `Q7 Responsible consultants (${fullConsultants}/${DISCIPLINE_DEFINITIONS.length} complete)`,
    });
  }

  // --- Section A2 (20 pts) ---
  let a2 = 0;
  if (sectionA.budgetEstablished) {
    a2 += 4;
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q8",
      section: "A2",
      anchorId: "q101-q8",
      label: "Q8 Project budget status (Yes / No)",
    });
  }

  if (q9DepositExempt || sectionA.depositReceived) {
    a2 += 4;
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q9",
      section: "A2",
      anchorId: "q101-q9",
      label: "Q9 CSA/PCS deposit status (Yes / No)",
    });
  }

  if (filled(sectionA.permitStatus)) {
    a2 += 4;
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q10",
      section: "A2",
      anchorId: "q101-q10",
      label: "Q10 Permit status",
    });
  }

  const datesFilled = TARGET_DATE_FIELDS.filter((field) =>
    filled(sectionA.targetDates[field.key]),
  ).length;
  a2 += Math.round((datesFilled / TARGET_DATE_FIELDS.length) * 8);
  if (datesFilled === TARGET_DATE_FIELDS.length) aCompleted += 1;
  else {
    missingItems.push({
      id: "q11",
      section: "A2",
      anchorId: "q101-q11",
      label: `Q11 Target dates (${datesFilled}/${TARGET_DATE_FIELDS.length})`,
    });
  }

  // --- Section A3 (25 pts) ---
  let a3DocsPts = 0;
  let completeDocs = 0;
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    const entry = sectionA.documents[doc.key];
    if (entry.available === "no") {
      a3DocsPts += 2;
      completeDocs += 1;
    } else if (entry.available === "yes" && filled(entry.locationOrDate)) {
      a3DocsPts += 2;
      completeDocs += 1;
    } else if (entry.available === "yes") {
      a3DocsPts += 1;
    }
  }
  if (completeDocs === PROJECT_DOCUMENT_DEFINITIONS.length) {
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q12",
      section: "A3",
      anchorId: "q101-q12",
      label: `Q12 Project documents (${completeDocs}/${PROJECT_DOCUMENT_DEFINITIONS.length} confirmed)`,
    });
  }

  let bestDrawingAttrs = 0;
  for (const row of sectionA.latestDrawings) {
    let attrs = 0;
    if (filled(row.drawingName)) attrs += 1;
    if (filled(row.revisionNumber) || filled(row.revisionDate)) attrs += 1;
    if (filled(row.issueStatus)) attrs += 1;
    if (filled(row.exactLocation)) attrs += 1;
    if (attrs > bestDrawingAttrs) bestDrawingAttrs = attrs;
  }
  const a3DrawingsPts = Math.round((bestDrawingAttrs / 4) * 9);
  if (bestDrawingAttrs === 4) {
    aCompleted += 1;
  } else {
    missingItems.push({
      id: "q13",
      section: "A3",
      anchorId: "q101-q13",
      label:
        qualification.plansAvailable === "no"
          ? "Q13 Latest drawings register (no drawings available yet)"
          : "Q13 Latest drawings register (name, rev, status, location)",
    });
  }
  const a3 = a3DocsPts + a3DrawingsPts;

  // --- Section B (25 pts) ---
  let completedBDisciplines = 0;
  const missingDisciplines: string[] = [];
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const sec = sectionB.disciplines[discipline.key];
    const hasRows = sec.items.some((row) => filled(row.item));
    if (sec.reviewedNone || hasRows) {
      completedBDisciplines += 1;
    } else {
      missingDisciplines.push(discipline.consultantLabel);
    }
  }
  const bDisciplinesPts = Math.round((completedBDisciplines / DISCIPLINE_DEFINITIONS.length) * 18);
  if (missingDisciplines.length) {
    missingItems.push({
      id: "b-disciplines",
      section: "B",
      anchorId: "q101-section-b",
      label: `Section B disciplines (${missingDisciplines.join(", ")})`,
    });
  }

  const sp = sectionB.specialProducts;
  const spHasItemWithSupply = sp.items.some((row) => filled(row.item) && Boolean(row.supply));
  const spHasAnyItem = sp.items.some((row) => filled(row.item));
  let bSpecialPts = 0;
  let spComplete = false;
  if (sp.reviewedNone || spHasItemWithSupply) {
    bSpecialPts = 7;
    spComplete = true;
  } else if (spHasAnyItem) {
    bSpecialPts = 4;
    missingItems.push({
      id: "b8-supply",
      section: "B",
      anchorId: "q101-b8",
      label: "B.8 Special products supply scope (FI/SI, F/S, FIA/SIO)",
    });
  } else {
    missingItems.push({
      id: "b8",
      section: "B",
      anchorId: "q101-b8",
      label: "B.8 Special products & PE alignment (add items or mark None)",
    });
  }
  const b = bDisciplinesPts + bSpecialPts;

  const totalScore = Math.max(0, Math.min(100, a1 + a2 + a3 + b));
  const { grade, gradeLabel } = gradeForScore(totalScore);
  const nonEmptyRfis = sectionC.rfis.filter(
    (row) => filled(row.rfiNo) || filled(row.disciplineOrIssue),
  );
  const incompleteRfiCount = nonEmptyRfis.filter(
    (row) => !filled(row.sentBy) || !filled(row.dueDate),
  ).length;

  const hasAnyInput =
    Boolean(qualification.form101) &&
    (filled(form.revision) ||
      a1 > 0 ||
      a2 - (q9DepositExempt ? 4 : 0) > 0 ||
      a3 > 0 ||
      b > 0 ||
      nonEmptyRfis.length > 0);

  return {
    totalScore,
    grade,
    gradeLabel,
    sections: [
      { id: "A1", label: "Project & Parties", score: a1, maxScore: 30 },
      { id: "A2", label: "Commercial & Schedule", score: a2, maxScore: 20 },
      { id: "A3", label: "Docs & Drawings", score: a3, maxScore: 25 },
      { id: "B", label: "Technical Intake", score: b, maxScore: 25 },
    ],
    missingItems,
    q9DepositExempt,
    sectionACompletedCount: aCompleted,
    sectionBCompletedCount: completedBDisciplines + (spComplete ? 1 : 0),
    openRfiCount: nonEmptyRfis.length,
    incompleteRfiCount,
    hasAnyInput,
  };
}

export type QualificationGateState = "failed_score" | "pending_review" | "rejected" | "passed";

export interface QualificationGateEvaluation {
  totalScore: number;
  passScore: number;
  scorePassed: boolean;
  reviewStatus: TechReviewStatus;
  techReviewApproved: boolean;
  passed: boolean;
  state: QualificationGateState;
  statusLabel: string;
  blockingReason?: string;
}

/**
 * Qualification passes only when BOTH conditions hold:
 * 1. Form [1.01] completeness score is at least 70% (lower scores automatically fail).
 * 2. Tech Review has been explicitly approved.
 */
export function evaluateQualificationGate(
  qualification: Qualification,
): QualificationGateEvaluation {
  const { totalScore } = evaluateQualificationForm101(qualification);
  const scorePassed = totalScore >= FORM_101_PASS_SCORE;
  const reviewStatus: TechReviewStatus = qualification.techReview?.status ?? "pending";
  const techReviewApproved = scorePassed && reviewStatus === "approved";

  if (!scorePassed) {
    return {
      totalScore,
      passScore: FORM_101_PASS_SCORE,
      scorePassed: false,
      reviewStatus,
      techReviewApproved: false,
      passed: false,
      state: "failed_score",
      statusLabel: `Auto-Fail (< ${FORM_101_PASS_SCORE}%)`,
      blockingReason: `Form [${FORM_101_CODE}] score is ${totalScore}% (minimum ${FORM_101_PASS_SCORE}% required). It cannot pass until score reaches ${FORM_101_PASS_SCORE}% and Tech Review approves.`,
    };
  }

  if (reviewStatus === "rejected") {
    return {
      totalScore,
      passScore: FORM_101_PASS_SCORE,
      scorePassed: true,
      reviewStatus,
      techReviewApproved: false,
      passed: false,
      state: "rejected",
      statusLabel: "Tech Review Rejected",
      blockingReason:
        "Tech Review rejected this qualification. Update Form [1.01] and obtain Tech Review approval to continue.",
    };
  }

  if (!techReviewApproved) {
    return {
      totalScore,
      passScore: FORM_101_PASS_SCORE,
      scorePassed: true,
      reviewStatus,
      techReviewApproved: false,
      passed: false,
      state: "pending_review",
      statusLabel: "Awaiting Tech Review",
      blockingReason: `Form [${FORM_101_CODE}] reached ${totalScore}% (≥ ${FORM_101_PASS_SCORE}%). Approve Tech Review to continue to the next step.`,
    };
  }

  return {
    totalScore,
    passScore: FORM_101_PASS_SCORE,
    scorePassed: true,
    reviewStatus,
    techReviewApproved: true,
    passed: true,
    state: "passed",
    statusLabel: "Tech Review Passed",
  };
}
