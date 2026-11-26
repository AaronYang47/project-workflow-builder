import { qualificationPartyIssue } from "@/lib/qualification";
import {
  DISCIPLINE_DEFINITIONS,
  PROJECT_DOCUMENT_DEFINITIONS,
  TARGET_DATE_FIELDS,
  consultantAnswered,
  qualificationBudgetComplete,
  type DisciplineKey,
  type QualificationForm101,
} from "@/lib/qualification-form-101";

export type FormStepId =
  | "q1"
  | "q2"
  | "q3"
  | "q4"
  | "q5"
  | "q6"
  | "q7"
  | "q8"
  | "q9"
  | "q11"
  | "q12"
  | "q13"
  | `b-${DisciplineKey}`
  | "b-special"
  | "c-rfis";

export const FORM_101_GROUPS = [
  {
    id: "written",
    title: "Written answers",
    section: "a",
    questions: ["q1", "q2", "q3", "q4", "q6", "q7", "q11"],
  },
  { id: "choice", title: "Single choice", section: "a", questions: ["q5"] },
  { id: "yes-no", title: "Yes / No", section: "a", questions: ["q8", "q9", "q12"] },
  { id: "drawings", title: "Drawing details", section: "a", questions: ["q13"] },
  {
    id: "technical",
    title: "Technical intake",
    section: "b",
    questions: [...DISCIPLINE_DEFINITIONS.map((item) => `b-${item.key}` as const), "b-special"],
  },
  { id: "rfis", title: "RFIs & next actions", section: "c", questions: ["c-rfis"] },
] as const satisfies ReadonlyArray<{
  id: string;
  title: string;
  section: "a" | "b" | "c";
  questions: readonly FormStepId[];
}>;

export type FormGroup = (typeof FORM_101_GROUPS)[number];
export type FormGroupId = FormGroup["id"];

export function form101GroupIndex(questionId: FormStepId) {
  return FORM_101_GROUPS.findIndex((group) => group.questions.some((id) => id === questionId));
}

export function isForm101GroupComplete(
  group: FormGroup,
  form: QualificationForm101,
  isLoi: boolean,
) {
  return group.questions.every((id) => isForm101StepComplete(id, form, isLoi));
}

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
      return !qualificationPartyIssue(sectionA.parties);
    case "q4":
      return [
        sectionA.mainContact.name,
        sectionA.mainContact.companyRole,
        sectionA.mainContact.email,
        sectionA.mainContact.phone,
      ].every((v) => v.trim().length > 0);
    case "q5":
      return sectionA.occupancyGroups.length === 1;
    case "q6":
      return Boolean(sectionA.grossAreaSqFt.trim());
    case "q7":
      return DISCIPLINE_DEFINITIONS.every((d) => consultantAnswered(sectionA.consultants[d.key]));
    case "q8":
      return qualificationBudgetComplete(sectionA);
    case "q9":
      return isLoi || Boolean(sectionA.depositReceived);
    case "q11":
      return TARGET_DATE_FIELDS.every((f) => sectionA.targetDates[f.key].trim().length > 0);
    case "q12":
      return PROJECT_DOCUMENT_DEFINITIONS.every((doc) =>
        Boolean(sectionA.documents[doc.key].available),
      );
    case "q13":
      return (
        sectionA.documents.archDrawings.available === "no" ||
        sectionA.latestDrawings.some(
          (row) =>
            row.drawingName.trim() &&
            (row.revisionNumber.trim() || row.revisionDate.trim()) &&
            row.issueStatus.trim() &&
            row.exactLocation.trim(),
        )
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

export function firstUnfinishedGroup(
  form: QualificationForm101,
  isLoi: boolean,
  skipped: ReadonlySet<FormGroupId>,
) {
  void skipped;
  // Required questions are answered in order; optional ones in any order once
  // the required ones are done, so only an unfinished required group locks
  // what follows it.
  const index = FORM_101_GROUPS.findIndex(
    (group) => group.section === "a" && !isForm101GroupComplete(group, form, isLoi),
  );
  return index >= 0 ? index : FORM_101_GROUPS.length - 1;
}
