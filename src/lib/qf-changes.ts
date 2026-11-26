import {
  DISCIPLINE_DEFINITIONS,
  OCCUPANCY_GROUPS,
  PROJECT_DOCUMENT_DEFINITIONS,
  TARGET_DATE_FIELDS,
  normalizeQualificationForm101,
  type DisciplineKey,
  type QualificationForm101,
} from "@/lib/qualification-form-101";
import { QF_LABELS, type Lang } from "@/lib/qf-labels";

/** Change-list wording; the server records English, Sales may read French. */
const WORDS = {
  en: {
    newItem: "new item",
    item: "item",
    job: "Job number",
    q1: "Project name",
    q2: "Project address",
    parties: { owner: "Owner", gc: "General contractor", client: "Our client (PROFAB)" },
    company: (who: string) => `${who} company`,
    contact: (who: string) => `${who} contact`,
    mainName: "Main contact name",
    mainRole: "Main contact company & role",
    mainEmail: "Main contact email",
    mainPhone: "Main contact phone",
    use: "Building use",
    area: "Gross floor area (sq. ft.)",
    consultant: (discipline: string) => `${discipline} consultant`,
    budget: "Project budget established",
    budgetAmount: "Project budget (CAD)",
    deposit: "Deposit received (CSA / PCS)",
    targetDate: (label: string) => `Target date: ${label}`,
    drawing: "Drawing set",
    nothing: (title: string) => `${title}: nothing to note`,
    specialNone: "Special products: none",
    special: "Special item",
    open: "Open item",
    added: "added",
    removed: "removed",
  },
  fr: {
    newItem: "nouvel élément",
    item: "élément",
    job: "Numéro de projet",
    q1: "Nom du projet",
    q2: "Adresse du projet",
    parties: { owner: "Propriétaire", gc: "Entrepreneur général", client: "Notre client (PROFAB)" },
    company: (who: string) => `${who} — entreprise`,
    contact: (who: string) => `${who} — personne-ressource`,
    mainName: "Personne-ressource principale — nom",
    mainRole: "Personne-ressource principale — entreprise et rôle",
    mainEmail: "Personne-ressource principale — courriel",
    mainPhone: "Personne-ressource principale — téléphone",
    use: "Usage du bâtiment",
    area: "Superficie brute (pi²)",
    consultant: (discipline: string) => `Consultant — ${discipline}`,
    budget: "Budget du projet établi",
    budgetAmount: "Budget du projet (CAD)",
    deposit: "Dépôt reçu (CSA / PCS)",
    targetDate: (label: string) => `Date cible : ${label}`,
    drawing: "Jeu de dessins",
    nothing: (title: string) => `${title} : rien à signaler`,
    specialNone: "Produits particuliers : aucun",
    special: "Élément particulier",
    open: "Élément en suspens",
    added: "ajouté",
    removed: "retiré",
  },
};

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
const yesNoIn = (lang: Lang) => (value?: string) =>
  value === "yes" ? QF_LABELS[lang].yes : value === "no" ? QF_LABELS[lang].no : "";
const joined = (...parts: (string | undefined)[]) =>
  parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" · ");

type Row = { id: string; text: string; title: string };

/** Lists compared row by row (by id): added, removed or edited rows. */
function compareRows(
  words: (typeof WORDS)[Lang],
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
          label: `${label}: ${row.title || words.newItem}`,
          before: "",
          after: row.text,
        });
    } else if (previous.text !== row.text)
      out.push({
        question,
        label: `${label}: ${row.title || previous.title || words.item}`,
        before: previous.text,
        after: row.text,
      });
  }
  for (const row of before)
    if (!next.has(row.id) && row.text)
      out.push({
        question,
        label: `${label}: ${row.title || words.item}`,
        before: row.text,
        after: "",
      });
}

export function formChanges(
  beforeInput: QualificationForm101 | undefined,
  afterInput: QualificationForm101 | undefined,
  jobNumbers?: { before: string; after: string },
  lang: Lang = "en",
): FormChange[] {
  const W = WORDS[lang];
  const L = QF_LABELS[lang];
  const yesNo = yesNoIn(lang);
  const consultantText = (
    entry?: QualificationForm101["sectionA"]["consultants"][DisciplineKey],
  ) =>
    entry?.status === "na"
      ? lang === "fr"
        ? "S.O."
        : "N/A"
      : entry?.status === "unknown"
        ? lang === "fr"
          ? "Inconnu"
          : "Unknown"
        : joined(entry?.name, entry?.company, entry?.contact);
  const before = normalizeQualificationForm101(beforeInput);
  const after = normalizeQualificationForm101(afterInput);
  const out: FormChange[] = [];
  const field = (question: string, label: string, a: string | undefined, b: string | undefined) => {
    const x = clip(a ?? "");
    const y = clip(b ?? "");
    if (x !== y) out.push({ question, label, before: x, after: y });
  };
  if (jobNumbers) field("job", W.job, jobNumbers.before, jobNumbers.after);

  const A = before.sectionA;
  const B = after.sectionA;
  field("q1", W.q1, A.projectName, B.projectName);
  field("q2", W.q2, A.projectAddress, B.projectAddress);
  for (const key of ["owner", "gc", "client"] as const) {
    const title = W.parties[key];
    field("q3", W.company(title), A.parties[key]?.company, B.parties[key]?.company);
    field("q3", W.contact(title), A.parties[key]?.contact, B.parties[key]?.contact);
  }
  field("q4", W.mainName, A.mainContact.name, B.mainContact.name);
  field("q4", W.mainRole, A.mainContact.companyRole, B.mainContact.companyRole);
  field("q4", W.mainEmail, A.mainContact.email, B.mainContact.email);
  field("q4", W.mainPhone, A.mainContact.phone, B.mainContact.phone);
  const occupancy = (codes: string[]) =>
    codes
      .map((code) =>
        lang === "en"
          ? (OCCUPANCY_GROUPS.find((group) => group.code === code)?.label ?? code)
          : (L.occupancy[code as keyof typeof L.occupancy]?.title ?? code),
      )
      .join(", ");
  field("q5", W.use, occupancy(A.occupancyGroups), occupancy(B.occupancyGroups));
  field("q6", W.area, A.grossAreaSqFt, B.grossAreaSqFt);
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const x = A.consultants[discipline.key];
    const y = B.consultants[discipline.key];
    field(
      "q7",
      W.consultant(lang === "en" ? discipline.consultantLabel : L.discipline[discipline.key]),
      consultantText(x),
      consultantText(y),
    );
  }
  field("q8", W.budget, yesNo(A.budgetEstablished), yesNo(B.budgetEstablished));
  field("q8", W.budgetAmount, A.projectBudgetCad, B.projectBudgetCad);
  field("q9", W.deposit, yesNo(A.depositReceived), yesNo(B.depositReceived));
  for (const date of TARGET_DATE_FIELDS)
    field(
      "q11",
      W.targetDate(lang === "en" ? date.label : L.targetDate[date.key]),
      A.targetDates[date.key],
      B.targetDates[date.key],
    );
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    const x = A.documents[doc.key];
    const y = B.documents[doc.key];
    field(
      "q12",
      lang === "en" ? doc.label.replace(/\s*\(.*\)$/, "") : L.document[doc.key],
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
  compareRows(W, out, "q13", W.drawing, drawingRows(before), drawingRows(after));

  for (const discipline of DISCIPLINE_DEFINITIONS) {
    const question = `b-${discipline.key}`;
    const title =
      lang === "en"
        ? discipline.sectionTitle.replace(/^\d+\.\s*/, "")
        : L.discipline[discipline.key];
    const x = before.sectionB.disciplines[discipline.key];
    const y = after.sectionB.disciplines[discipline.key];
    field(question, W.nothing(title), x?.reviewedNone ? L.yes : "", y?.reviewedNone ? L.yes : "");
    const rows = (section: typeof x): Row[] =>
      (section?.items ?? []).map((row) => ({
        id: row.id,
        title: row.item.trim(),
        text: clip(joined(row.item, row.remark)),
      }));
    compareRows(W, out, question, title, rows(x), rows(y));
  }
  field(
    "b-special",
    W.specialNone,
    before.sectionB.specialProducts.reviewedNone ? L.yes : "",
    after.sectionB.specialProducts.reviewedNone ? L.yes : "",
  );
  const specialRows = (form: QualificationForm101): Row[] =>
    form.sectionB.specialProducts.items.map((row) => ({
      id: row.id,
      title: row.item.trim(),
      text: clip(joined(row.item, row.description, row.supply, row.relatedFiles)),
    }));
  compareRows(W, out, "b-special", W.special, specialRows(before), specialRows(after));
  const rfiRows = (form: QualificationForm101): Row[] =>
    form.sectionC.rfis.map((row) => ({
      id: row.id,
      title: row.rfiNo.trim(),
      text: clip(joined(row.rfiNo, row.disciplineOrIssue, row.sentBy, row.dueDate)),
    }));
  compareRows(W, out, "c-rfis", W.open, rfiRows(before), rfiRows(after));
  return out.slice(0, MAX_CHANGES);
}

/** "Owner company: Laurier → Laurier inc." */
export const describeChange = (change: FormChange, lang?: Lang | number) => {
  // Safe to pass straight to .map(), which passes an index second.
  const words = WORDS[lang === "fr" ? "fr" : "en"];
  return change.before && change.after
    ? `${change.label}: ${change.before} → ${change.after}`
    : change.after
      ? `${change.label}: ${change.after} (${words.added})`
      : `${change.label}: ${change.before} (${words.removed})`;
};

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
