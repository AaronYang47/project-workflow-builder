import { qualificationCase } from "@/lib/qualification";
import {
  DISCIPLINE_DEFINITIONS,
  PROJECT_DOCUMENT_DEFINITIONS,
  PROJECT_PARTY_ROLES,
  TARGET_DATE_FIELDS,
  type DisciplineKey,
  type QualificationForm101,
} from "@/lib/qualification-form-101";

export type FormStepSection = "a" | "b" | "c";

export type FormStepId =
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "q6"
  | "q7"
  | "routing"
  | "q8"
  | "q9"
  | "q10"
  | "q11"
  | "q12"
  | "q13"
  | `b-${DisciplineKey}`
  | "b-special"
  | "c-rfis";

export type FormStepMeta = {
  id: FormStepId;
  section: FormStepSection;
  subsection: string;
  shortLabel: string;
  title: string;
  anchorId: string;
  disciplineKey?: DisciplineKey;
};

export const FORM_101_STEPS: FormStepMeta[] = [
  {
    id: "q1",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q1",
    title: "Project name",
    anchorId: "q101-q1",
  },
  {
    id: "q2",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q2",
    title: "Project address",
    anchorId: "q101-q2",
  },
  {
    id: "q3",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q3",
    title: "Project parties",
    anchorId: "q101-q3",
  },
  {
    id: "q4",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q4",
    title: "Main contact",
    anchorId: "q101-q4",
  },
  {
    id: "q5",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q5",
    title: "Occupancy group",
    anchorId: "q101-q5",
  },
  {
    id: "q6",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q6",
    title: "Gross building area",
    anchorId: "q101-q6",
  },
  {
    id: "q7",
    section: "a",
    subsection: "Project information",
    shortLabel: "Q7",
    title: "Consultants",
    anchorId: "q101-q7",
  },
  {
    id: "routing",
    section: "a",
    subsection: "Commercial status & schedule",
    shortLabel: "Route",
    title: "Customer routing",
    anchorId: "q101-routing",
  },
  {
    id: "q8",
    section: "a",
    subsection: "Commercial status & schedule",
    shortLabel: "Q8",
    title: "Budget established",
    anchorId: "q101-q8",
  },
  {
    id: "q9",
    section: "a",
    subsection: "Commercial status & schedule",
    shortLabel: "Q9",
    title: "CSA / PCS deposit",
    anchorId: "q101-q9",
  },
  {
    id: "q10",
    section: "a",
    subsection: "Commercial status & schedule",
    shortLabel: "Q10",
    title: "Permit status",
    anchorId: "q101-q10",
  },
  {
    id: "q11",
    section: "a",
    subsection: "Commercial status & schedule",
    shortLabel: "Q11",
    title: "Target dates",
    anchorId: "q101-q11",
  },
  {
    id: "q12",
    section: "a",
    subsection: "Project documents",
    shortLabel: "Q12",
    title: "Available documents",
    anchorId: "q101-q12",
  },
  {
    id: "q13",
    section: "a",
    subsection: "Project documents",
    shortLabel: "Q13",
    title: "Latest drawings",
    anchorId: "q101-q13",
  },
  ...DISCIPLINE_DEFINITIONS.map((discipline) => ({
    id: `b-${discipline.key}` as FormStepId,
    section: "b" as const,
    subsection: "Customer intake by discipline",
    shortLabel: `B${discipline.number}`,
    title: discipline.sectionTitle,
    anchorId: `q101-b-${discipline.key}`,
    disciplineKey: discipline.key,
  })),
  {
    id: "b-special",
    section: "b",
    subsection: "Customer intake by discipline",
    shortLabel: "B8",
    title: "8. Special products",
    anchorId: "q101-b8",
  },
  {
    id: "c-rfis",
    section: "c",
    subsection: "Technical intake summary",
    shortLabel: "C",
    title: "Open RFIs & next actions",
    anchorId: "q101-section-c",
  },
];

export function isForm101StepComplete(
  stepId: FormStepId,
  form: QualificationForm101,
  isLoi: boolean,
): boolean {
  const { sectionA, sectionB, sectionC } = form;
  switch (stepId) {
    case "q1":
      return Boolean(sectionA.projectName.trim());
    case "q2":
      return Boolean(sectionA.projectAddress.trim());
    case "q3":
      return PROJECT_PARTY_ROLES.every(
        (r) => sectionA.parties[r.key].company.trim() && sectionA.parties[r.key].contact.trim(),
      );
    case "q4":
      return [
        sectionA.mainContact.name,
        sectionA.mainContact.companyRole,
        sectionA.mainContact.email,
        sectionA.mainContact.phone,
      ].every((v) => v.trim().length > 0);
    case "q5":
      return sectionA.occupancyGroups.length > 0;
    case "q6":
      return Boolean(sectionA.grossAreaSqFt.trim());
    case "q7":
      return DISCIPLINE_DEFINITIONS.every(
        (d) =>
          (sectionA.consultants[d.key].name.trim() || sectionA.consultants[d.key].company.trim()) &&
          sectionA.consultants[d.key].contact.trim(),
      );
    case "routing":
      return Boolean(qualificationCase(sectionA.routeAnswers ?? {}));
    case "q8":
      return Boolean(sectionA.budgetEstablished);
    case "q9":
      return isLoi || Boolean(sectionA.depositReceived);
    case "q10":
      return Boolean(sectionA.permitStatus.trim());
    case "q11":
      return TARGET_DATE_FIELDS.every((f) => sectionA.targetDates[f.key].trim().length > 0);
    case "q12":
      return PROJECT_DOCUMENT_DEFINITIONS.every((doc) => {
        const item = sectionA.documents[doc.key];
        return (
          item.available === "no" ||
          (item.available === "yes" && item.locationOrDate.trim().length > 0)
        );
      });
    case "q13":
      return sectionA.latestDrawings.some(
        (row) =>
          row.drawingName.trim() &&
          (row.revisionNumber.trim() || row.revisionDate.trim()) &&
          row.issueStatus.trim() &&
          row.exactLocation.trim(),
      );
    case "b-special":
      return Boolean(
        sectionB.specialProducts.reviewedNone ||
        sectionB.specialProducts.items.some((row) => row.item.trim().length > 0),
      );
    case "c-rfis":
      return sectionC.rfis.length > 0;
    default: {
      if (stepId.startsWith("b-")) {
        const key = stepId.slice(2) as DisciplineKey;
        const sec = sectionB.disciplines[key];
        if (!sec) return false;
        return Boolean(sec.reviewedNone || sec.items.some((row) => row.item.trim().length > 0));
      }
      return false;
    }
  }
}

export function findStepIndexForAnchor(anchorId: string, itemId?: string): number {
  const exact = FORM_101_STEPS.findIndex((step) => step.anchorId === anchorId);
  if (exact >= 0) return exact;
  if (itemId) {
    // Missing items for Section B disciplines may use anchorId "q101-section-b" and id "b-civil" etc.
    const byId = FORM_101_STEPS.findIndex((step) => step.id === itemId);
    if (byId >= 0) return byId;
    const byPrefix = FORM_101_STEPS.findIndex((step) => itemId.startsWith(step.id));
    if (byPrefix >= 0) return byPrefix;
  }
  if (anchorId === "q101-section-b") {
    return FORM_101_STEPS.findIndex((step) => step.section === "b");
  }
  return 0;
}

export function findInitialStepIndex(form: QualificationForm101, isLoi: boolean): number {
  const firstIncomplete = FORM_101_STEPS.findIndex(
    (step) => step.section !== "c" && !isForm101StepComplete(step.id, form, isLoi),
  );
  return firstIncomplete >= 0 ? firstIncomplete : 0;
}
