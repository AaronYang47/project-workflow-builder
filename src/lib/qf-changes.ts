import {
  DISCIPLINE_DEFINITIONS,
  OCCUPANCY_GROUPS,
  PROJECT_DOCUMENT_DEFINITIONS,
  TARGET_DATE_FIELDS,
  normalizeQualificationForm101,
  type QualificationForm101,
} from "@/lib/qualification-form-101";

/**
 * What changed in the Qualification Form [1.01] between two submissions,
 * answer by answer, in words people read: shown to Sales before they submit
 * an update, to the team in the app, and in the PDF's revision log.
 */

export type FormChange = {
  /** The Form 1.01 question it belongs to (q1…q13, b-civil…, b-special, c-rfis) or "job". */
  question: string;
  label: string;
  before: string;
  after: string;
};

/** One Sales submission in the project's history, with what it changed. */
export type RevisionEntry = {
  revision: string;
  at: string;
  by: string;
  /** Empty for the first submission. */
  changes: FormChange[];
  first?: boolean;
};

const MAX_TEXT = 160;
const MAX_CHANGES = 150;

const clip = (value: string) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
};
const yesNo = (value?: string) => (value === "yes" ? "Yes" : value === "no" ? "No" : "");
const joined = (...parts: (string | undefined)[]) =>
  parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");

type Row = { id: string; text: string; title: string };

/** Lists compared row by row (by id): added, removed or edited rows. */
function compareRows(
  out: FormChange[],
  question: string,
  label: string,
  before: Row[],
  after: Row[],
) {
  const old = new Map(before.map((row) => [row.id, row]));
  const next = new Map(after.map((row) => [row.id, row]));
  for (const row of after) {
    const previous = old.get(row.id);
    if (!previous) {
      if (row.text)
        out.push({
          question,
          label: `${label}: ${row.title || "new item"}`,
          before: "",
          after: row.text,
        });
    } else if (previous.text !== row.text)
      out.push({
        question,
        label: `${label}: ${row.title || previous.title || "item"}`,
        before: previous.text,
        after: row.text,
      });
  }
  for (const row of before)
    if (!next.has(row.id) && row.text)
      out.push({
        question,
        label: `${label}: ${row.title || "item"}`,
        before: row.text,
        after: "",
      });
}

export function formChanges(
  beforeInput: QualificationForm101 | undefined,
  afterInput: QualificationForm101 | undefined,
  jobNumbers?: { before: string; after: string },
): FormChange[] {
  const before = normalizeQualificationForm101(beforeInput);
  const after = normalizeQualificationForm101(afterInput);
  const out: FormChange[] = [];
  const field = (question: string, label: string, a: string | undefined, b: string | undefined) => {
    const x = clip(a ?? "");
    const y = clip(b ?? "");
    if (x !== y) out.push({ question, label, before: x, after: y });
  };
  if (jobNumbers) field("job", "Job number", jobNumbers.before, jobNumbers.after);

  const A = before.sectionA;
  const B = after.sectionA;
  field("q1", "Project name", A.projectName, B.projectName);
  field("q2", "Project address", A.projectAddress, B.projectAddress);
  for (const [key, title] of [
    ["owner", "Owner"],
    ["gc", "General contractor"],
    ["client", "Our client (PROFAB)"],
  ] as const) {
    field("q3", `${title} company`, A.parties[key]?.company, B.parties[key]?.company);
    field("q3", `${title} contact`, A.parties[key]?.contact, B.parties[key]?.contact);
  }
  field("q4", "Main contact name", A.mainContact.name, B.mainContact.name);
  field("q4", "Main contact company & role", A.mainContact.companyRole, B.mainContact.companyRole);
  field("q4", "Main contact email", A.mainContact.email, B.mainContact.email);
  field("q4", "Main contact phone", A.mainContact.phone, B.mainContact.phone);
  const occupancy = (codes: string[]) =>
    codes
      .map((code) => OCCUPANCY_GROUPS.find((group) => group.code === code)?.label ?? code)
      .join(", ");
  field("q5", "Building use", occupancy(A.occupancyGroups), occupancy(B.occupancyGroups));
  field("q6", "Gross floor area (sq. ft.)", A.grossAreaSqFt, B.grossAreaSqFt);
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const x = A.consultants[discipline.key];
    const y = B.consultants[discipline.key];
    field(
      "q7",
      `${discipline.consultantLabel} consultant`,
      joined(x?.name, x?.company, x?.contact),
      joined(y?.name, y?.company, y?.contact),
    );
  }
  field("q8", "Project budget established", yesNo(A.budgetEstablished), yesNo(B.budgetEstablished));
  field("q8", "Project budget (CAD)", A.projectBudgetCad, B.projectBudgetCad);
  field("q9", "Deposit received (CSA / PCS)", yesNo(A.depositReceived), yesNo(B.depositReceived));
  for (const date of TARGET_DATE_FIELDS)
    field("q11", `Target date: ${date.label}`, A.targetDates[date.key], B.targetDates[date.key]);
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    const x = A.documents[doc.key];
    const y = B.documents[doc.key];
    field(
      "q12",
      doc.label.replace(/\s*\(.*\)$/, ""),
      joined(yesNo(x?.available), x?.locationOrDate),
      joined(yesNo(y?.available), y?.locationOrDate),
    );
  }
  const drawingRows = (form: QualificationForm101): Row[] =>
    form.sectionA.latestDrawings.map((row) => ({
      id: row.id,
      title: row.drawingName.trim(),
      text: clip(
        joined(
          row.drawingName,
          row.revisionNumber && `Rev ${row.revisionNumber}`,
          row.revisionDate,
          row.issueStatus,
          row.exactLocation,
        ),
      ),
    }));
  compareRows(out, "q13", "Drawing set", drawingRows(before), drawingRows(after));

  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const question = `b-${discipline.key}`;
    const title = discipline.sectionTitle.replace(/^\d+\.\s*/, "");
    const x = before.sectionB.disciplines[discipline.key];
    const y = after.sectionB.disciplines[discipline.key];
    field(
      question,
      `${title}: nothing to note`,
      x?.reviewedNone ? "Yes" : "",
      y?.reviewedNone ? "Yes" : "",
    );
    const rows = (section: typeof x): Row[] =>
      (section?.items ?? []).map((row) => ({
        id: row.id,
        title: row.item.trim(),
        text: clip(joined(row.item, row.remark)),
      }));
    compareRows(out, question, title, rows(x), rows(y));
  }
  field(
    "b-special",
    "Special products: none",
    before.sectionB.specialProducts.reviewedNone ? "Yes" : "",
    after.sectionB.specialProducts.reviewedNone ? "Yes" : "",
  );
  const specialRows = (form: QualificationForm101): Row[] =>
    form.sectionB.specialProducts.items.map((row) => ({
      id: row.id,
      title: row.item.trim(),
      text: clip(joined(row.item, row.description, row.supply, row.relatedFiles)),
    }));
  compareRows(out, "b-special", "Special item", specialRows(before), specialRows(after));
  const rfiRows = (form: QualificationForm101): Row[] =>
    form.sectionC.rfis.map((row) => ({
      id: row.id,
      title: row.rfiNo.trim(),
      text: clip(joined(row.rfiNo, row.disciplineOrIssue, row.sentBy, row.dueDate)),
    }));
  compareRows(out, "c-rfis", "Open item", rfiRows(before), rfiRows(after));
  return out.slice(0, MAX_CHANGES);
}

/** "Owner company: Laurier → Laurier inc." */
export const describeChange = (change: FormChange) =>
  change.before && change.after
    ? `${change.label}: ${change.before} → ${change.after}`
    : change.after
      ? `${change.label}: ${change.after} (added)`
      : `${change.label}: ${change.before} (removed)`;

/** The questions changed in the latest submission, for "Updated" tags. */
export const changedQuestions = (entry: RevisionEntry | undefined) =>
  new Set((entry?.changes ?? []).map((change) => change.question));

export function normalizeRevisionHistory(value: unknown): RevisionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RevisionEntry[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.at !== "string") return [];
    return [
      {
        revision: String(row.revision ?? ""),
        at: row.at,
        by: String(row.by ?? ""),
        first: Boolean(row.first),
        changes: Array.isArray(row.changes)
          ? row.changes.flatMap((change): FormChange[] =>
              change && typeof change === "object"
                ? [
                    {
                      question: String((change as FormChange).question ?? ""),
                      label: String((change as FormChange).label ?? ""),
                      before: String((change as FormChange).before ?? ""),
                      after: String((change as FormChange).after ?? ""),
                    },
                  ]
                : [],
            )
          : [],
      },
    ];
  });
}
