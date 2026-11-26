import { expect, test } from "playwright/test";
import { createDomainNode } from "../src/lib/create-domain-node";
import { createProjectWorkflow } from "../src/lib/project-template";
import { workflowLegacyJobNumber } from "../src/lib/project-id";
import { qualificationOf } from "../src/lib/qualification";
import {
  createEmptyQualificationForm101,
  evaluateQualificationForm101,
  normalizeQualificationForm101,
} from "../src/lib/qualification-form-101";
import { isForm101StepComplete } from "../src/components/workflow/qualification-form-101/steps";
import {
  applySalesIntake,
  nextSalesRevision,
  projectFromTemplate,
  readSalesIntake,
  templateFromWorkflow,
} from "../src/lib/sales-intake";
import { buildQualificationFormPdf, qualificationFormPdfName } from "../src/lib/qf-pdf";
import { changedQuestions, describeChange, formChanges } from "../src/lib/qf-changes";

const projectWithCards = () => {
  const file = createProjectWorkflow("Maison Laurier");
  const start = createDomainNode("projectStart", "start");
  const qualification = createDomainNode("qualification", "qualification");
  const other = createDomainNode("general", "sales-chapter");
  other.title = "Untouched chapter";
  file.graph.nodes = [start, qualification, other];
  file.layout.nodes = {
    start: { nodeId: "start", x: 0, y: 0, width: 200, height: 100 },
    qualification: { nodeId: "qualification", x: 0, y: 200, width: 320, height: 420 },
    "sales-chapter": { nodeId: "sales-chapter", x: 400, y: 0, width: 384, height: 400 },
  };
  return file;
};

const filledForm = () => {
  const form = createEmptyQualificationForm101();
  form.sectionA.projectName = "Maison Laurier";
  form.sectionA.projectAddress = "120 rue Principale, Lévis, QC";
  form.sectionA.occupancyGroups = ["C"];
  form.sectionA.parties.owner = { company: "Immeubles Laurier", contact: "Marie Tremblay" };
  form.sectionA.budgetEstablished = "yes";
  form.sectionA.documents.permit = { available: "yes", locationOrDate: "SharePoint" };
  form.sectionA.latestDrawings = [
    {
      id: "d1",
      drawingName: "A-100 set",
      revisionNumber: "3",
      revisionDate: "2026-11-10",
      issueStatus: "Issued for Permit",
      exactLocation: "Drive/Arch",
    },
  ];
  form.sectionA.targetDates.delivery = "2027-06-01";
  form.sectionB.disciplines.civil.items = [
    { id: "c1", item: "Foundation plan", remark: "Georeferenced plan by Dec 5" },
  ];
  form.sectionB.specialProducts.items = [
    { id: "s1", item: "Windows", description: "Triple glazing", supply: "F/S", relatedFiles: "" },
  ];
  form.sectionC.rfis = [
    { id: "r1", rfiNo: "001", disciplineOrIssue: "Module stacking", sentBy: "AY", dueDate: "" },
  ];
  return form;
};

test("a Sales submission writes only the Job number and the Qualification Form", () => {
  const before = projectWithCards();
  const submission = {
    by: "Sam Seller",
    email: "sam@example.com",
    at: "2026-11-26T12:00:00Z",
    revision: "0",
  };
  const after = applySalesIntake(before, { jobNumber: "26014", form101: filledForm() }, submission);

  expect(workflowLegacyJobNumber(after)).toBe("26014");
  const qualification = qualificationOf(
    after.graph.nodes.find((node) => node.id === "qualification")!,
  );
  expect(qualification.form101?.sectionA.parties.owner.company).toBe("Immeubles Laurier");
  expect(qualification.form101?.revision).toBe("0");
  expect(readSalesIntake(after).submission).toEqual(submission);
  // Every other card and the layout are exactly as they were.
  expect(after.graph.nodes.find((node) => node.id === "sales-chapter")).toEqual(
    before.graph.nodes.find((node) => node.id === "sales-chapter"),
  );
  expect(after.layout).toEqual(before.layout);
});

test("a project without a Qualification card gets one when Sales submit", () => {
  const file = createProjectWorkflow("Bare");
  const after = applySalesIntake(file, { jobNumber: "", form101: filledForm() });
  const node = after.graph.nodes.find((item) => item.type === "qualification");
  expect(node).toBeTruthy();
  expect(after.layout.nodes[node!.id]).toBeTruthy();
  expect(readSalesIntake(after).form101.sectionA.projectAddress).toContain("Lévis");
});

test("revisions: the first Sales submission keeps the form revision, later ones count up", () => {
  expect(nextSalesRevision(undefined, "")).toBe("0");
  expect(nextSalesRevision(undefined, "2")).toBe("2");
  const previous = { by: "A", email: "", at: "2026-11-01T00:00:00Z", revision: "2" };
  expect(nextSalesRevision(previous, "2")).toBe("3");
});

test("a template leaves out the Qualification answers, Job number and Calendar dates", () => {
  const filled = applySalesIntake(
    projectWithCards(),
    { jobNumber: "26014", form101: filledForm() },
    { by: "Sam", email: "", at: "2026-11-26T12:00:00Z", revision: "0" },
  );
  filled.calendar = { startDate: "2026-12-01", projectStartDate: "2026-11-01", shutdowns: [] };
  const template = templateFromWorkflow(filled);
  expect(workflowLegacyJobNumber(template)).toBe("");
  expect(readSalesIntake(template).submission).toBeUndefined();
  expect(readSalesIntake(template).form101.sectionA.projectAddress).toBe("");
  expect(template.calendar?.startDate).toBe("");
  expect(template.calendar?.projectStartDate).toBe("");
  expect(template.graph.nodes.map((node) => node.id)).toEqual(
    filled.graph.nodes.map((node) => node.id),
  );

  const project = projectFromTemplate(template, "Résidence Côté");
  expect(project.graph.metadata.name).toBe("Résidence Côté");
  expect(project.graph.nodes.some((node) => node.type === "qualification")).toBe(true);
});

test("the Qualification Form PDF follows the 261126 form and carries the answers", async () => {
  const form = { ...filledForm(), revision: "2" };
  const doc = await buildQualificationFormPdf(form, {
    projectName: "26014 Maison Laurier",
    jobNumber: "26014",
    compress: false,
  });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  expect([width, height]).toEqual([612, 792]);
  expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(5);
  const text = doc.output();
  // The PDF draws text word by word, so check single words.
  for (const expected of [
    "(FORMULAIRE)",
    "(QUALIFICATION)",
    "(261126)",
    "([2])",
    "(intake)",
    "(Immeubles)",
    "(A-100)",
    "(2027.06.01)",
    "(Foundation)",
    "(Triple)",
    "(stacking)",
    "(Annex)",
  ])
    expect(text, expected).toContain(expected);
  expect(
    qualificationFormPdfName(form, { projectName: "26014 Maison Laurier", jobNumber: "26014" }),
  ).toBe("S_1.01_QF_26014_Maison_Laurier_rev2.pdf");
  expect(qualificationFormPdfName(form, { projectName: "Côté", jobNumber: "26099" })).toBe(
    "S_1.01_QF_26099_Cote_rev2.pdf",
  );
});

test("an update records exactly which answers changed", () => {
  const before = filledForm();
  const after = structuredClone(before);
  after.sectionA.parties.owner.company = "Immeubles Laurier inc.";
  after.sectionA.targetDates.delivery = "2027.07.15";
  after.sectionA.documents.bylawsZoning = { available: "yes", locationOrDate: "Drive/Zoning" };
  after.sectionB.disciplines.civil.items[0].remark = "Plan received";
  after.sectionB.disciplines.plumbing.items = [{ id: "p1", item: "Water heater", remark: "" }];
  after.sectionC.rfis = [];
  const changes = formChanges(before, after, { before: "26014", after: "26015" });
  const lines = changes.map(describeChange);
  expect(lines).toEqual([
    "Job number: 26014 → 26015",
    "Owner company: Immeubles Laurier → Immeubles Laurier inc.",
    "Target date: Delivery: 2027-06-01 → 2027.07.15",
    "Applicable municipal bylaws / zoning: Yes · Drive/Zoning (added)",
    "Civil: Foundation plan: Foundation plan · Georeferenced plan by Dec 5 → Foundation plan · Plan received",
    "Plumbing: Water heater: Water heater (added)",
    "Open item: 001: 001 · Module stacking · AY (removed)",
  ]);
  expect(changedQuestions({ revision: "1", at: "", by: "", changes }).has("q11")).toBe(true);
  expect(formChanges(before, structuredClone(before))).toEqual([]);
});

test("each Sales submission is kept in the project's history; templates drop it", () => {
  const first = applySalesIntake(
    projectWithCards(),
    { jobNumber: "26014", form101: filledForm() },
    { by: "Sam", email: "", at: "2026-11-26T12:00:00Z", revision: "0" },
    { revision: "0", at: "2026-11-26T12:00:00Z", by: "Sam", first: true, changes: [] },
  );
  const changed = filledForm();
  changed.sectionA.projectAddress = "121 rue Principale";
  const second = applySalesIntake(
    first,
    { jobNumber: "26014", form101: changed },
    { by: "Sam", email: "", at: "2026-11-27T12:00:00Z", revision: "1" },
    {
      revision: "1",
      at: "2026-11-27T12:00:00Z",
      by: "Sam",
      changes: formChanges(readSalesIntake(first).form101, changed),
    },
  );
  const history = readSalesIntake(second).history;
  expect(history.map((entry) => entry.revision)).toEqual(["0", "1"]);
  expect(history[1].changes.map((change) => change.label)).toEqual(["Project address"]);
  expect(readSalesIntake(templateFromWorkflow(second)).history).toEqual([]);
});

test("the PDF's revision log lists every submission and its changes", async () => {
  const doc = await buildQualificationFormPdf(filledForm(), {
    projectName: "26014 Maison Laurier",
    compress: false,
    revisions: [
      { revision: "0", at: "2026-11-26T12:00:00Z", by: "Sam", first: true, changes: [] },
      {
        revision: "1",
        at: "2026-11-27T12:00:00Z",
        by: "Sam",
        changes: [
          { question: "q2", label: "Project address", before: "120 rue", after: "121 rue" },
        ],
      },
    ],
  });
  const text = doc.output();
  for (const word of ["(Journal)", "(Revision)", "(First)", "(address:)", "(»)", "(2026.11.27)"])
    expect(text, word).toContain(word);
});

test("a consultant can be Unknown or N/A", async () => {
  const form = filledForm();
  for (const key of Object.keys(
    form.sectionA.consultants,
  ) as (keyof typeof form.sectionA.consultants)[])
    form.sectionA.consultants[key] = { name: "", company: "", contact: "", status: "na" };
  form.sectionA.consultants.structural = { name: "", company: "", contact: "", status: "unknown" };
  // Kept through a save, and the question counts as answered.
  const saved = normalizeQualificationForm101(JSON.parse(JSON.stringify(form)));
  expect(saved.sectionA.consultants.structural.status).toBe("unknown");
  expect(isForm101StepComplete("q7", saved, false)).toBe(true);
  const evaluation = evaluateQualificationForm101({ form101: saved });
  expect(evaluation.missingItems.map((item) => item.id)).not.toContain("q7");
  // N/A scores in full, Unknown scores nothing.
  const allNa = structuredClone(saved);
  allNa.sectionA.consultants.structural.status = "na";
  expect(evaluateQualificationForm101({ form101: allNa }).totalScore - evaluation.totalScore).toBe(
    3,
  );

  const lines = formChanges(filledForm(), saved).map(describeChange);
  expect(lines).toContain("Structural consultant: Unknown (added)");
  expect(lines).toContain("Civil consultant: N/A (added)");

  const text = (
    await buildQualificationFormPdf(saved, { projectName: "X", compress: false })
  ).output();
  expect(text).toContain("(Inconnu)");
  expect(text).toContain("(S.O.)");
});
