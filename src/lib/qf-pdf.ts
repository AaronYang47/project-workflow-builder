import type { jsPDF as JsPdf } from "jspdf";
import { QF_ANNEX_1, QF_ANNEX_2 } from "@/lib/qf-pdf-annex";
import type { DisciplineKey, QualificationForm101 } from "@/lib/qualification-form-101";

/**
 * PROFAB Qualification Form [1.01] as a PDF laid out like the Word form
 * S_1.01_QF_V261126_Table_Format.docx: US Letter, the same margins, column
 * widths, fonts, shading, borders and bilingual (French / English) labels,
 * filled in with the answers from the system's Form 1.01.
 *
 * Word measures in twips (1/20 pt); the numbers below are the form's own
 * twips divided by 20.
 */

export const QF_PDF_VERSION = "261126";
export const QF_PDF_STEP = "1.01";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 72;
const MARGIN_R = 72;
const MARGIN_T = 61.2;
const MARGIN_B = 57.6;
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
/** Arial Narrow is about 82% as wide as Arial (Helvetica). */
const NARROW = 0.82;
const GRID = "#555555";

type Font = { size: number; narrow?: boolean };
type Seg = { text: string; bold?: boolean; italic?: boolean } | { box: boolean };
type Para = { segs: Seg[]; align?: "left" | "center" | "right" };
type Cell = {
  paras: Para[];
  span?: number;
  fill?: string;
  vAlign?: "center" | "bottom";
  /** Bottom border only, dotted (the revision line). */
  dottedBottom?: boolean;
};
type Row = { cells: Cell[]; minHeight?: number };
type Table = {
  cols: number[];
  font: Font;
  /** Cell padding: top, right, bottom, left. */
  pad: [number, number, number, number];
  border?: number;
  rows: Row[];
  headerRows?: number;
  /** Word "line" spacing multiple and space after each paragraph. */
  lineFactor?: number;
  paraAfter?: number;
  /** Keep this table on the same page as the start of the next block. */
  keepWithNext?: boolean;
  spaceBefore?: number;
};

const t = (text: string, style: { bold?: boolean; italic?: boolean } = {}): Seg => ({
  text,
  ...style,
});
const b = (text: string) => t(text, { bold: true });
const i = (text: string) => t(text, { italic: true });
const box = (checked: boolean): Seg => ({ box: checked });
const p = (...segs: Seg[]): Para => ({ segs });
const pr = (...segs: Seg[]): Para => ({ segs, align: "right" });
const pc = (...segs: Seg[]): Para => ({ segs, align: "center" });
const cell = (paras: Para[], extra: Partial<Cell> = {}): Cell => ({
  paras,
  vAlign: "center",
  ...extra,
});
const tw = (...values: number[]) => values.map((value) => value / 20);

const yes = (value: "yes" | "no" | undefined) => [
  box(value === "yes"),
  t(" Oui / Yes   "),
  box(value === "no"),
  t(" Non / No"),
];

const filled = (label: string, value: string | undefined) =>
  p(t(label), ...(value?.trim() ? [t(` ${value.trim()}`)] : []));

/** "2026-12-01" → "2026.12.01"; empty → the form's blank. */
const formDate = (value: string | undefined) => {
  const text = value?.trim();
  if (!text) return "____.____.____";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}.${iso[2]}.${iso[3]}` : text;
};

const issueKind = (status: string) => {
  const text = status.trim().toLowerCase();
  if (!text) return undefined;
  if (/permit|\bifp\b/.test(text)) return "IFP" as const;
  if (/construction|\bifc\b/.test(text)) return "IFC" as const;
  return "OTHER" as const;
};

const PERMIT_STATUSES = [
  { fr: "Non demandé", en: "Not applied", match: /not applied|non demand/i },
  { fr: "En cours", en: "Pending", match: /pending|en cours|in progress|applied/i },
  { fr: "Délivré", en: "Issued", match: /issued|délivr|deliv/i },
  { fr: "Non requis", en: "Not required", match: /not required|non requis/i },
] as const;

function permitStatusIndex(status: string) {
  const text = status.trim();
  if (!text) return -1;
  // "Not applied" and "Not required" are checked before the looser words.
  const order = [0, 3, 2, 1];
  return order.find((index) => PERMIT_STATUSES[index].match.test(text)) ?? -1;
}

const DISCIPLINES: { key: DisciplineKey; fr: string; en: string; note?: [string, string] }[] = [
  {
    key: "civil",
    fr: "1. Génie civil",
    en: "1. Civil",
    note: [
      "La position ET l’orientation de chaque fondation sont requises.",
      "The position AND orientation of every foundation are required.",
    ],
  },
  { key: "architectural", fr: "2. Architecture", en: "2. Architecture" },
  { key: "structural", fr: "3. Structure", en: "3. Structure" },
  {
    key: "mechanical",
    fr: "4. Mécanique",
    en: "4. Mechanical",
    note: [
      "Porter une attention particulière à l’équipement installé à l’extérieur des modules par d’autres parties.",
      "Pay particular attention to equipment installed outside the modules by other parties.",
    ],
  },
  { key: "electrical", fr: "5. Électricité", en: "5. Electrical" },
  { key: "plumbing", fr: "6. Plomberie", en: "6. Plumbing" },
  { key: "fireProtection", fr: "7. Protection incendie", en: "7. Fire protection" },
];

const CONSULTANTS: { key: DisciplineKey; fr: string; en: string }[] = [
  { key: "civil", fr: "Génie civil", en: "Civil" },
  { key: "architectural", fr: "Architecture", en: "Architectural" },
  { key: "structural", fr: "Structure", en: "Structural" },
  { key: "mechanical", fr: "Mécanique", en: "Mechanical" },
  { key: "electrical", fr: "Électricité", en: "Electrical" },
  { key: "plumbing", fr: "Plomberie", en: "Plumbing" },
  { key: "fireProtection", fr: "Protection incendie", en: "Fire protection" },
];

const OCCUPANCY = [
  { code: "A", label: "Réunion / Assembly" },
  { code: "C", label: "Habitation / Residential" },
  { code: "D", label: "Affaires et services personnels / Business and personal services" },
  { code: "E", label: "Commercial / Mercantile" },
] as const;

/* ------------------------------------------------------------------ blocks */

const heading = (fr: string, en: string, spaceBefore = 5): Table => ({
  cols: tw(4680, 4680),
  font: { size: 11.5, narrow: true },
  pad: [2.25, 3.25, 2.25, 3.25],
  rows: [
    {
      cells: [cell([p(b(fr))], { fill: "#D9D9D9" }), cell([pr(b(en))], { fill: "#D9D9D9" })],
    },
  ],
  keepWithNext: true,
  spaceBefore,
});

const note = (fr: string[], en: string[], size = 10, italic = false): Table => ({
  cols: tw(4680, 4680),
  font: { size, narrow: true },
  pad: [1.1, 3.25, 1.1, 3.25],
  rows: [
    {
      cells: [
        cell(fr.map((line) => p(t(line, { italic })))),
        cell(en.map((line) => p(t(line, { italic })))),
      ],
    },
  ],
  keepWithNext: true,
  spaceBefore: 3,
});

const labelCell = (fr: string, en: string) => cell([p(t(fr)), p(i(en))]);
const groupRow = (text: string): Row => ({
  cells: [cell([p(b(text))], { span: 3, fill: "#D9D9D9" })],
});
const itemRow = (fr: string, en: string, response: Para[], details: Para[]): Row => ({
  cells: [labelCell(fr, en), cell(response), cell(details)],
  minHeight: 21,
});

function drawingDetails(
  drawing: QualificationForm101["sectionA"]["latestDrawings"][number] | undefined,
  fallbackLocation = "",
): Para[] {
  const kind = issueKind(drawing?.issueStatus ?? "");
  return [
    p(t(`Nom / Name: ${drawing?.drawingName?.trim() || "_____________________"}`)),
    p(
      t(
        `N° rév. / Rev. no.: ${drawing?.revisionNumber?.trim() || "______"}  Date: ${
          drawing?.revisionDate?.trim() ? formDate(drawing.revisionDate) : "________"
        }`,
      ),
    ),
    p(
      t("Émission / Issue: "),
      box(kind === "IFP"),
      t(" IFP "),
      box(kind === "IFC"),
      t(" IFC "),
      box(kind === "OTHER"),
      t(` Autre/Other${kind === "OTHER" ? ` ${drawing!.issueStatus.trim()}` : ""}`),
    ),
    filled("Emplacement exact / Exact location:", drawing?.exactLocation || fallbackLocation),
    p(t("Date du courriel / Email date:")),
  ];
}

function sectionATable(
  form: QualificationForm101,
  meta: { projectName: string; jobNumber: string },
): Table {
  const a = form.sectionA;
  const docRow = (
    key: keyof QualificationForm101["sectionA"]["documents"],
    fr: string,
    en: string,
    extra: Para[] = [],
  ) =>
    itemRow(
      fr,
      en,
      [p(...yes(a.documents[key]?.available))],
      [
        ...extra,
        filled("Empl. / date courriel | Location / email date:", a.documents[key]?.locationOrDate),
      ],
    );
  const permitIndex = permitStatusIndex(a.permitStatus);
  const [firstDrawing, secondDrawing, ...moreDrawings] = a.latestDrawings;
  const archAvailable = a.documents.archDrawings?.available;
  return {
    cols: tw(3139, 2362, 3859),
    font: { size: 9 },
    pad: [1.8, 3.25, 1.8, 3.25],
    border: 0.75,
    headerRows: 1,
    spaceBefore: 2,
    rows: [
      {
        cells: [
          cell([p(b("ÉLÉMENT / ITEM"))], { fill: "#E6E6E6" }),
          cell([p(b("RÉPONSE / RESPONSE"))], { fill: "#E6E6E6" }),
          cell([p(b("DÉTAILS / RÉFÉRENCE")), p(b("DETAILS / REFERENCE"))], { fill: "#E6E6E6" }),
        ],
      },
      groupRow("Renseignements sur le projet / Project information"),
      itemRow(
        "Nom du projet",
        "Project name",
        [p(t(a.projectName.trim() || meta.projectName))],
        meta.jobNumber ? [p(t(`N° de projet / Job no.: ${meta.jobNumber}`))] : [],
      ),
      itemRow(
        "Adresse complète du projet",
        "Full project address",
        [p(t(a.projectAddress))],
        [p(t("Ville, province, code postal / City, province, postal code:"))],
      ),
      itemRow(
        "Type de bâtiment",
        "Building type",
        OCCUPANCY.map((group) =>
          p(box(a.occupancyGroups.includes(group.code)), t(` ${group.label}`)),
        ),
        [p(t("Sélection multiple / Multiple selections allowed"))],
      ),
      itemRow(
        "Superficie brute totale",
        "Total gross floor area",
        [p(t(`${a.grossAreaSqFt.trim() || "__________"} pi² / sq. ft.`))],
        [],
      ),
      groupRow("Parties au projet / Project parties"),
      ...(
        [
          ["owner", "Propriétaire", "Owner"],
          ["gc", "Entrepreneur général", "General Contractor"],
          ["client", "Notre client (PROFAB)", "Our client (PROFAB)"],
        ] as const
      ).map(([key, fr, en]) =>
        itemRow(
          fr,
          en,
          [filled("Entreprise / Company:", a.parties[key]?.company)],
          [filled("Personne-ressource / Contact:", a.parties[key]?.contact)],
        ),
      ),
      groupRow("Personne-ressource principale / Main contact"),
      {
        cells: [
          cell([p(t("Nom / Name"))]),
          cell([p(t(a.mainContact.name))]),
          cell([filled("Entreprise et rôle / Company & role:", a.mainContact.companyRole)]),
        ],
        minHeight: 21,
      },
      {
        cells: [
          cell([p(t("Courriel / Email"))]),
          cell([p(t(a.mainContact.email))]),
          cell([filled("Téléphone / Phone:", a.mainContact.phone)]),
        ],
        minHeight: 21,
      },
      groupRow("Consultants responsables / Responsible consultants"),
      ...CONSULTANTS.map(({ key, fr, en }) =>
        itemRow(
          fr,
          en,
          [filled("Nom / Name:", a.consultants[key]?.name)],
          [
            filled("Entreprise / Company:", a.consultants[key]?.company),
            filled("Coordonnées / Contact:", a.consultants[key]?.contact),
          ],
        ),
      ),
      groupRow(
        "Statut commercial et documents du projet / Commercial status and project documents",
      ),
      itemRow(
        "Budget du projet établi",
        "Project budget established",
        [p(...yes(a.budgetEstablished))],
        [p(t("Aucun montant requis / No amount required"))],
      ),
      itemRow(
        "Dépôt reçu (CSA / PCS)",
        "Deposit received (CSA / PCS)",
        [p(...yes(a.depositReceived))],
        [p(t("Aucun dépôt pour une LOI / No deposit for an LOI"))],
      ),
      itemRow(
        "Permis",
        "Permit",
        [
          p(...yes(a.documents.permit?.available)),
          p(t("Statut / Status:")),
          ...PERMIT_STATUSES.map((status, index) =>
            p(box(index === permitIndex), t(` ${status.fr} / ${status.en}`)),
          ),
        ],
        [
          filled("Emplacement / File location:", a.documents.permit?.locationOrDate),
          p(t("")),
          p(t("Date du courriel / Email date:")),
        ],
      ),
      itemRow(
        "Dernier jeu de dessins d’architecture",
        "Latest architectural drawing set",
        [p(...yes(archAvailable))],
        drawingDetails(firstDrawing, a.documents.archDrawings?.locationOrDate),
      ),
      itemRow(
        "Autre jeu de dessins (au besoin)",
        "Additional drawing set (as needed)",
        [p(...yes(secondDrawing ? "yes" : undefined))],
        [
          ...drawingDetails(secondDrawing),
          ...moreDrawings.flatMap((drawing) => [p(t("")), ...drawingDetails(drawing)]),
        ],
      ),
      itemRow(
        "Plan d’implantation",
        "Site plan",
        [p(...yes(archAvailable === "yes" ? "yes" : undefined))],
        [
          p(t("Empl. / date courriel | Location / email date:")),
          ...(archAvailable === "yes"
            ? [p(t("Inclus dans le jeu de dessins / Included in the drawing set"))]
            : []),
        ],
      ),
      docRow(
        "bylawsZoning",
        "Règlements municipaux / zonage applicables",
        "Applicable municipal bylaws / zoning",
      ),
      docRow(
        "productSpecs",
        "Exigences / devis des produits du projet",
        "Project product requirements / specifications",
      ),
      docRow("classEstimate", "Estimation de classe (CEC)", "Class estimate (CEC)", [
        p(
          t("Classe / Class: "),
          box(false),
          t(" D  "),
          box(false),
          t(" C  "),
          box(false),
          t(" B  "),
          box(false),
          t(" A"),
        ),
      ]),
      docRow("existingRfis", "RFI existantes", "Existing RFIs"),
      docRow(
        "priorCorrespondence",
        "Correspondance / instructions antérieures",
        "Prior correspondence / instructions",
      ),
      groupRow("Dates cibles du projet / Project target dates"),
      ...(
        [
          ["contractSignature", "Signature du contrat", "Contract signature"],
          ["design", "Conception", "Design"],
          ["consultantApproval", "Approbation des consultants", "Consultant approval"],
          ["productSelection", "Sélection des produits", "Product selection"],
          ["factoryProduction", "Production en usine", "Factory production"],
          ["delivery", "Livraison", "Delivery"],
        ] as const
      ).map(([key, fr, en]) => itemRow(fr, en, [p(t(formDate(a.targetDates[key])))], [])),
    ],
  };
}

const narrowGrid = (cols: number[], header: string[], rows: Row[]): Table => ({
  cols,
  font: { size: 10.5, narrow: true },
  pad: [1.7, 3.25, 1.7, 3.25],
  border: 0.5,
  headerRows: 1,
  spaceBefore: 3,
  rows: [{ cells: header.map((label) => cell([p(b(label))], { fill: "#E7E7E7" })) }, ...rows],
});

const padRows = (rows: Row[], count: number, blank: () => Row) => [
  ...rows,
  ...Array.from({ length: Math.max(0, count - rows.length) }, blank),
];

function disciplineTable(form: QualificationForm101, key: DisciplineKey): Table {
  const section = form.sectionB.disciplines[key];
  const items = section?.items.filter((item) => item.item.trim() || item.remark.trim()) ?? [];
  const rows: Row[] = items.map((item) => ({
    cells: [cell([p(t(item.item))]), cell([p(t(item.remark))])],
    minHeight: 19,
  }));
  if (!rows.length && section?.reviewedNone)
    rows.push({ cells: [cell([p(t("Aucun / None"))]), cell([p(t(""))])], minHeight: 19 });
  return narrowGrid(
    tw(3024, 6336),
    ["ÉLÉMENT / ITEM", "REMARQUE / REMARK"],
    padRows(rows, 6, () => ({ cells: [cell([]), cell([])], minHeight: 19 })),
  );
}

function specialTable(form: QualificationForm101): Table {
  const special = form.sectionB.specialProducts;
  const supply = (code?: string) => [
    p(
      box(code === "FI/SI"),
      t(" FI/SI  "),
      box(code === "F/S"),
      t(" F/S  "),
      box(code === "FIA/SIO"),
      t(" FIA/SIO"),
    ),
  ];
  const items = special.items.filter(
    (item) =>
      item.item.trim() || item.description.trim() || item.relatedFiles.trim() || item.supply,
  );
  const rows: Row[] = items.map((item) => ({
    cells: [
      cell([p(t(item.item))]),
      cell([p(t(item.description))]),
      cell(supply(item.supply)),
      cell([p(t(item.relatedFiles))]),
    ],
    minHeight: 22,
  }));
  if (!rows.length && special.reviewedNone)
    rows.push({
      cells: [cell([p(t("Aucun / None"))]), cell([]), cell(supply()), cell([])],
      minHeight: 22,
    });
  return narrowGrid(
    tw(1656, 2376, 2880, 2448),
    ["ÉLÉMENT / ITEM", "DESCRIPTION", "FOURNITURE / SUPPLY", "FICHIERS ASSOCIÉS / RELATED FILES"],
    padRows(rows, 5, () => ({
      cells: [cell([]), cell([]), cell(supply()), cell([])],
      minHeight: 22,
    })),
  );
}

function rfiTable(form: QualificationForm101): Table {
  const items = form.sectionC.rfis.filter(
    (rfi) => rfi.rfiNo.trim() || rfi.disciplineOrIssue.trim() || rfi.sentBy.trim() || rfi.dueDate,
  );
  return narrowGrid(
    tw(1224, 4176, 1944, 2016),
    ["N° RFI / RFI #", "DISCIPLINE / SUJET / ISSUE", "ENVOYÉ PAR / SENT BY", "ÉCHÉANCE / DUE DATE"],
    padRows(
      items.map((rfi) => ({
        cells: [
          cell([p(t(rfi.rfiNo))]),
          cell([p(t(rfi.disciplineOrIssue))]),
          cell([p(t(rfi.sentBy))]),
          cell([p(t(rfi.dueDate ? formDate(rfi.dueDate) : ""))]),
        ],
        minHeight: 18,
      })),
      6,
      () => ({ cells: [cell([]), cell([]), cell([]), cell([])], minHeight: 18 }),
    ),
  );
}

const annexTable = (groups: typeof QF_ANNEX_1): Table => ({
  cols: tw(4680, 4680),
  font: { size: 10.5, narrow: true },
  pad: [1.1, 3.25, 1.1, 3.25],
  spaceBefore: 3,
  rows: groups.flatMap((group) => [
    {
      cells: [
        cell([p(b(group.title[0]))], { fill: "#D9D9D9" }),
        cell([p(b(group.title[1]))], { fill: "#D9D9D9" }),
      ],
    },
    ...group.items.map(([fr, en]) => ({ cells: [cell([p(t(fr))]), cell([p(t(en))])] })),
  ]),
});

export type QfPdfMeta = {
  projectName: string;
  jobNumber?: string;
  /** PNG data URL of the PROFAB logo for the page header. */
  logoDataUrl?: string;
  /** Compressed by default; tests read the plain text. */
  compress?: boolean;
};

function formBlocks(form: QualificationForm101, meta: QfPdfMeta): Table[] {
  const revision = form.revision.trim() || "#";
  const top: Table[] = [
    {
      cols: tw(4770, 4590),
      font: { size: 18, narrow: true },
      pad: [0, 5.4, 0, 5.4],
      lineFactor: 1.08,
      paraAfter: 8,
      rows: [
        {
          cells: [
            cell([p(b("FORMULAIRE DE QUALIFICATION"))], { vAlign: undefined }),
            cell([pr(b("QUALIFICATION FORM"))], { vAlign: undefined }),
          ],
        },
      ],
    },
    {
      cols: tw(4770, 4590),
      font: { size: 12, narrow: true },
      pad: [0, 5.4, 0, 5.4],
      lineFactor: 1.08,
      paraAfter: 8,
      spaceBefore: 3,
      rows: [
        {
          cells: [
            cell(
              [
                p(t("GROUPE PROFAB INC.")),
                p(t("294 rue Laurier, St-Apollinaire, QC, G0S 2E0")),
                p(t("www.profab.ca")),
              ],
              { vAlign: undefined },
            ),
            cell([pr(t(`Étape / Step: [${QF_PDF_STEP}]`)), pr(t(`Version: ${QF_PDF_VERSION}`))], {
              vAlign: undefined,
            }),
          ],
        },
      ],
    },
    {
      // The ruled line under the address block, then the revision line.
      cols: tw(3150, 3060, 3150),
      font: { size: 12, narrow: true },
      pad: [0, 5.4, 0, 5.4],
      spaceBefore: 4,
      rows: [
        {
          cells: [
            cell([p(b("révision"))], { vAlign: "bottom", dottedBottom: true }),
            cell([pc(t(`[${revision}]`))], { vAlign: "bottom", dottedBottom: true }),
            cell([pr(b("revision"))], { vAlign: "bottom", dottedBottom: true }),
          ],
          minHeight: 15,
        },
      ],
    },
  ];
  return [
    ...top,
    heading("A. Qualification des ventes", "A. Sales intake"),
    note(
      ["Cocher les cases applicables; laisser vide si inconnu."],
      ["Check applicable boxes; leave blank if unknown."],
    ),
    sectionATable(form, { projectName: meta.projectName, jobNumber: meta.jobNumber ?? "" }),
    heading("B. Remise technique par discipline", "B. Customer intake by discipline", 8),
    note(
      [
        "Éléments particuliers ou conditions discutés avec le client, une ligne concise par élément, y compris ce que le client envisage encore. Voir les exemples à l’annexe 2.",
      ],
      [
        "Special items or conditions discussed with the client, one concise line per item, including what the client is still considering. See examples in Annex 2.",
      ],
      10.5,
      true,
    ),
    ...DISCIPLINES.flatMap((discipline) => [
      heading(discipline.fr, discipline.en),
      ...(discipline.note ? [note([discipline.note[0]], [discipline.note[1]], 10.5, true)] : []),
      disciplineTable(form, discipline.key),
    ]),
    heading("8. Produits et éléments particuliers", "8. Special products and items"),
    note(
      [
        "Toutes disciplines : éléments ayant une incidence sur la portée de PROFAB, par nous ou par d’autres. Spécification de chaque élément (voir annexe 1).",
      ],
      [
        "All disciplines: items affecting PROFAB scope, by us or by others. Specification for each item (see Annex 1).",
      ],
      10.5,
      true,
    ),
    note(
      ["Cette liste doit correspondre aux options inscrites dans l’estimation préliminaire (PE)."],
      ["This list must match the options entered in the Preliminary Estimation (PE)."],
      10.5,
      true,
    ),
    specialTable(form),
    {
      ...note(
        [
          "FI = fourni et installé par PROFAB",
          "F = fourni seulement par PROFAB",
          "FIA = fourni et installé par d’autres",
        ],
        [
          "SI = supplied and installed by PROFAB",
          "S = supplied only by PROFAB",
          "SIO = supplied and installed by others",
        ],
        10,
        true,
      ),
      keepWithNext: false,
    },
    heading("C. Résumé de la remise technique", "C. Technical intake summary", 8),
    note(
      ["Information manquante et prochaines actions"],
      ["Missing information and next actions"],
      10.5,
    ),
    rfiTable(form),
    heading("Annexe 1 — Exemples d’éléments particuliers", "Annex 1 — Special item examples", 8),
    annexTable(QF_ANNEX_1),
    heading("Annexe 2 — Exemples par discipline", "Annex 2 — Examples by discipline", 8),
    annexTable(QF_ANNEX_2),
  ];
}

/* ------------------------------------------------------------------ layout */

type Token =
  | { kind: "text"; text: string; bold?: boolean; italic?: boolean; width: number }
  | { kind: "space"; width: number; bold?: boolean; italic?: boolean }
  | { kind: "box"; checked: boolean; width: number };
type Line = { tokens: Token[]; width: number };

const fontStyle = (seg: { bold?: boolean; italic?: boolean }) =>
  seg.bold && seg.italic ? "bolditalic" : seg.bold ? "bold" : seg.italic ? "italic" : "normal";

class Renderer {
  y = MARGIN_T;
  constructor(private doc: JsPdf) {}

  private measure(text: string, seg: { bold?: boolean; italic?: boolean }, font: Font) {
    this.doc.setFont("helvetica", fontStyle(seg));
    this.doc.setFontSize(font.size);
    return this.doc.getTextWidth(text) * (font.narrow ? NARROW : 1);
  }

  private boxSize(font: Font) {
    return font.size * 0.72;
  }

  private tokens(para: Para, font: Font): Token[] {
    const out: Token[] = [];
    for (const seg of para.segs) {
      if ("box" in seg) {
        out.push({ kind: "box", checked: seg.box, width: this.boxSize(font) + 1 });
        continue;
      }
      for (const piece of seg.text.split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece))
          out.push({ kind: "space", width: this.measure(piece, seg, font), ...seg });
        else
          out.push({
            kind: "text",
            text: piece,
            bold: seg.bold,
            italic: seg.italic,
            width: this.measure(piece, seg, font),
          });
      }
    }
    return out;
  }

  /** Splits a word wider than the line into pieces that fit. */
  private splitWord(token: Extract<Token, { kind: "text" }>, max: number, font: Font) {
    const pieces: Extract<Token, { kind: "text" }>[] = [];
    let current = "";
    for (const char of token.text) {
      if (current && this.measure(current + char, token, font) > max) {
        pieces.push({ ...token, text: current, width: this.measure(current, token, font) });
        current = "";
      }
      current += char;
    }
    if (current)
      pieces.push({ ...token, text: current, width: this.measure(current, token, font) });
    return pieces;
  }

  lines(para: Para, width: number, font: Font): Line[] {
    const lines: Line[] = [];
    let line: Line = { tokens: [], width: 0 };
    const push = () => {
      while (line.tokens.at(-1)?.kind === "space") line.width -= line.tokens.pop()!.width;
      lines.push(line);
      line = { tokens: [], width: 0 };
    };
    for (const token of this.tokens(para, font)) {
      if (token.kind === "space" && !line.tokens.length && lines.length) continue;
      if (line.width + token.width > width + 0.01 && line.tokens.length && token.kind !== "space")
        push();
      if (token.kind === "text" && token.width > width) {
        for (const piece of this.splitWord(token, width, font)) {
          if (line.tokens.length) push();
          line.tokens.push(piece);
          line.width += piece.width;
        }
        continue;
      }
      if (token.kind === "space" && !line.tokens.length) continue;
      line.tokens.push(token);
      line.width += token.width;
    }
    push();
    return lines;
  }

  private lineHeight(table: Table) {
    return table.font.size * 1.15 * (table.lineFactor ?? 1);
  }

  private cellWidth(table: Table, column: number, span: number) {
    return table.cols.slice(column, column + span).reduce((sum, value) => sum + value, 0);
  }

  private cellLayout(table: Table, cellValue: Cell, width: number) {
    const inner = width - table.pad[1] - table.pad[3];
    const paras = cellValue.paras.map((para) => ({
      para,
      lines: this.lines(para, inner, table.font),
    }));
    const lh = this.lineHeight(table);
    const after = table.paraAfter ?? 0;
    // Word adds the space after every paragraph, the last one in a cell too.
    const textHeight = paras.reduce((sum, item) => sum + item.lines.length * lh + after, 0);
    return { paras, textHeight, inner };
  }

  rowHeight(table: Table, row: Row) {
    let column = 0;
    let height = row.minHeight ?? 0;
    for (const value of row.cells) {
      const span = value.span ?? 1;
      const layout = this.cellLayout(table, value, this.cellWidth(table, column, span));
      height = Math.max(height, layout.textHeight + table.pad[0] + table.pad[2]);
      column += span;
    }
    return height;
  }

  private drawToken(token: Token, x: number, baseline: number, font: Font) {
    const doc = this.doc;
    if (token.kind === "box") {
      const size = this.boxSize(font);
      const top = baseline - size * 0.92;
      doc.setDrawColor(0);
      doc.setLineWidth(0.6);
      doc.rect(x, top, size, size);
      if (token.checked) {
        doc.setLineWidth(0.9);
        doc.line(x + size * 0.18, top + size * 0.18, x + size * 0.82, top + size * 0.82);
        doc.line(x + size * 0.82, top + size * 0.18, x + size * 0.18, top + size * 0.82);
      }
      return;
    }
    if (token.kind === "space") return;
    doc.setFont("helvetica", fontStyle(token));
    doc.setFontSize(font.size);
    doc.setTextColor(0);
    // Always set the scale: PDF keeps it across text calls on a page.
    doc.text(token.text, x, baseline, { horizontalScale: font.narrow ? NARROW : 1 });
  }

  drawRow(table: Table, row: Row, height: number) {
    const doc = this.doc;
    let column = 0;
    let x = MARGIN_L;
    const lh = this.lineHeight(table);
    for (const value of row.cells) {
      const span = value.span ?? 1;
      const width = this.cellWidth(table, column, span);
      if (value.fill) {
        doc.setFillColor(value.fill);
        // A hair wider, so two shaded cells side by side show no seam.
        doc.rect(x, this.y, width + 0.4, height, "F");
      }
      const layout = this.cellLayout(table, value, width);
      const free = height - table.pad[0] - table.pad[2] - layout.textHeight;
      let top =
        this.y +
        table.pad[0] +
        (value.vAlign === "center" ? free / 2 : value.vAlign === "bottom" ? free : 0);
      for (const { para, lines } of layout.paras) {
        for (const line of lines) {
          const left = x + table.pad[3];
          const start =
            para.align === "right"
              ? left + layout.inner - line.width
              : para.align === "center"
                ? left + (layout.inner - line.width) / 2
                : left;
          let cursor = start;
          const baseline = top + table.font.size * 0.93 * (table.lineFactor ?? 1);
          for (const token of line.tokens) {
            this.drawToken(token, cursor, baseline, table.font);
            cursor += token.width;
          }
          top += lh;
        }
        top += table.paraAfter ?? 0;
      }
      if (table.border) {
        doc.setDrawColor(GRID);
        doc.setLineWidth(table.border);
        doc.rect(x, this.y, width, height);
      }
      if (value.dottedBottom) {
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.setLineDashPattern([0.8, 1.2], 0);
        doc.line(x, this.y + height, x + width, this.y + height);
        doc.setLineDashPattern([], 0);
      }
      x += width;
      column += span;
    }
    this.y += height;
  }

  newPage() {
    this.doc.addPage("letter", "portrait");
    this.y = MARGIN_T;
  }

  get bottom() {
    return PAGE_H - MARGIN_B;
  }
}

/** Height a table's opening needs on a page: header rows and the first body row. */
function openingHeight(renderer: Renderer, table: Table) {
  const rows = table.rows.slice(0, (table.headerRows ?? 0) + 1);
  return rows.reduce((sum, row) => sum + renderer.rowHeight(table, row), table.spaceBefore ?? 0);
}

function render(doc: JsPdf, blocks: Table[]) {
  const renderer = new Renderer(doc);
  blocks.forEach((table, index) => {
    // Keep headings and notes with the start of what follows (Word "keep with next").
    let keep = openingHeight(renderer, table);
    if (table.keepWithNext) {
      keep = table.rows.reduce((sum, row) => sum + renderer.rowHeight(table, row), 0);
      for (let next = index + 1; blocks[next]; next++) {
        const block = blocks[next];
        if (block.keepWithNext)
          keep +=
            (block.spaceBefore ?? 0) +
            block.rows.reduce((sum, row) => sum + renderer.rowHeight(block, row), 0);
        else {
          keep += openingHeight(renderer, block);
          break;
        }
      }
    }
    if (renderer.y > MARGIN_T && renderer.y + keep > renderer.bottom) renderer.newPage();
    else if (renderer.y > MARGIN_T) renderer.y += table.spaceBefore ?? 0;

    const headerRows = table.rows.slice(0, table.headerRows ?? 0);
    table.rows.forEach((row, rowIndex) => {
      const height = renderer.rowHeight(table, row);
      if (renderer.y + height > renderer.bottom && renderer.y > MARGIN_T) {
        renderer.newPage();
        if (rowIndex >= headerRows.length)
          for (const header of headerRows)
            renderer.drawRow(table, header, renderer.rowHeight(table, header));
      }
      renderer.drawRow(table, row, height);
    });
    if (index === 1) {
      // The ruled line under the address block (a paragraph border in the form).
      renderer.y += 3;
      doc.setDrawColor(0);
      doc.setLineWidth(0.75);
      doc.line(MARGIN_L, renderer.y, MARGIN_L + CONTENT_W, renderer.y);
    }
  });
}

function drawPageFurniture(doc: JsPdf, logoDataUrl?: string) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    if (logoDataUrl) {
      // Header picture: 0.686 × 0.375 in, 2.975 in right of the left margin.
      try {
        doc.addImage(logoDataUrl, "PNG", MARGIN_L + 214.2, MARGIN_T - 40, 49.4, 27);
      } catch {
        // A missing logo never stops the form.
      }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(0);
    const baseline = PAGE_H - 36;
    doc.text("QF", MARGIN_L, baseline, { horizontalScale: 1 });
    doc.text(`${page} / ${pages}`, PAGE_W - MARGIN_R, baseline, {
      align: "right",
      horizontalScale: 1,
    });
  }
}

export async function loadQfLogo(url = "/qf/profab-logo.png") {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

/** The filled-in Qualification Form as a PDF document. */
export async function buildQualificationFormPdf(form: QualificationForm101, meta: QfPdfMeta) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
    orientation: "portrait",
    compress: meta.compress ?? true,
  });
  doc.setProperties({
    title: `Qualification Form [${QF_PDF_STEP}] — ${meta.projectName}`,
    subject: "PROFAB Qualification Form",
    creator: "Falcon Process Building System",
  });
  render(doc, formBlocks(form, meta));
  drawPageFurniture(doc, meta.logoDataUrl);
  return doc;
}

/** File name in the form's own naming: S_1.01_QF_<job no.>_<project>_rev<#>.pdf */
export function qualificationFormPdfName(
  form: QualificationForm101,
  meta: Pick<QfPdfMeta, "projectName" | "jobNumber">,
) {
  const clean = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  const parts = [
    `S_${QF_PDF_STEP}_QF`,
    // Most project names already start with the Job number.
    meta.jobNumber && !meta.projectName.trim().startsWith(meta.jobNumber)
      ? clean(meta.jobNumber)
      : "",
    clean(meta.projectName) || "Project",
    form.revision.trim() ? `rev${clean(form.revision)}` : "",
  ].filter(Boolean);
  return `${parts.join("_")}.pdf`;
}

/** The PDF as a Blob, for sharing or saving. */
export async function qualificationFormPdfBlob(form: QualificationForm101, meta: QfPdfMeta) {
  const doc = await buildQualificationFormPdf(form, meta);
  return doc.output("blob");
}
