import { expect, test } from "playwright/test";
import { qualificationRoute, type Qualification } from "../src/lib/qualification";
import {
  DISCIPLINE_DEFINITIONS,
  PROJECT_DOCUMENT_DEFINITIONS,
  PROJECT_PARTY_ROLES,
  TARGET_DATE_FIELDS,
  createEmptyQualificationForm101,
  evaluateQualificationForm101,
  evaluateQualificationGate,
} from "../src/lib/qualification-form-101";
import { validateWorkflow } from "../src/lib/validation";
import { releaseConditionBlocker, sequentialExecutionBlocker } from "../src/lib/workflow-progress";
import { createDomainNode } from "../src/lib/create-domain-node";
import { ensureEstimationWorkflow } from "../src/lib/estimation-workflow";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

test("Plans Available? decides the route after Qualification", () => {
  expect(qualificationRoute({})).toBeUndefined();
  expect(qualificationRoute({ plansAvailable: "no" })).toBe("CSA (Concept Consultation)");
  expect(qualificationRoute({ plansAvailable: "yes" })).toBe("LOI / CSA / PCS (choose one)");
  expect(qualificationRoute({ plansAvailable: "yes", commercialPath: "PCS" })).toBe("PCS");
});

test("SALES (Project Start) is a normal Department: anything may lead into it", () => {
  const file = createE2EWorkflow();
  const start = file.graph.nodes.find((node) => node.type === "projectStart")!;
  const qualification = createDomainNode("qualification", "qualification-1");
  file.graph.nodes.push(qualification);
  const edge = (source: string) => ({
    id: `edge-${source}`,
    source,
    target: start.id,
    type: "normal" as const,
    lineStyle: "solid" as const,
    arrowStyle: "closed" as const,
    customFields: {},
  });
  file.graph.edges.push(edge(qualification.id));
  const other = file.graph.nodes.find((node) => node.type === "general")!;
  file.graph.edges.push(edge(other.id));
  const codes = validateWorkflow(file).map((issue) => issue.code);
  expect(codes).not.toContain("PROJECT_START_INCOMING");
  // A project without a Project Start node is fine too.
  file.graph.nodes = file.graph.nodes.filter((node) => node.id !== start.id);
  expect(validateWorkflow(file).map((issue) => issue.code)).not.toContain("PROJECT_START_COUNT");
});

test("Qualification is added from the L2 library at the far left, linked to Project Start", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key, file }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, file: createE2EWorkflow() },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  const libraryItem = page.getByRole("button", { name: /^Qualification/ });
  // The library starts with Qualification; Project Start is no longer offered.
  await expect(page.getByRole("button", { name: /^Project Start/ })).toHaveCount(0);
  await libraryItem.dblclick();
  const node = page.locator("[data-qualification-node]");
  await expect(node).toBeVisible();
  await expect(node.locator("[data-qualification-flow-step]")).toHaveCount(4);
  await expect(node.locator("[data-qualification-flow-arrow]")).toHaveCount(3);
  // Only one per project.
  await expect(libraryItem).toBeDisabled();

  // Qualification remains first, followed by [1.06] Estimation and Project Start.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"));
        const lefts = nodes.map((element) => element.getBoundingClientRect().left);
        const own = document
          .querySelector("[data-qualification-node]")!
          .getBoundingClientRect().left;
        return own <= Math.min(...lefts) + 1;
      }),
    )
    .toBe(true);

  await page.getByRole("button", { name: /fit view/i }).click();
  await page.waitForTimeout(400);
  // Step 1: Basics (client, GC pending still allowed).
  await node.getByLabel("Client Type").selectOption("GC");
  await node.getByLabel("GC Status").selectOption("Pending");
  await expect(node.locator("[data-gc-pending]")).toContainText("can still go ahead");
  await node.getByLabel("Contracting Client").selectOption("TBD");
  await node.getByLabel("Project Type").selectOption("FOB Yard");

  // Step 2: Plans & Route (all 4 internal sub-nodes are visible side-by-side).
  await node.getByRole("button", { name: "No", exact: true }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText(
    "Route: CSA (Concept Consultation)",
  );
  await node.getByRole("button", { name: "Yes", exact: true }).click();
  await node.getByRole("radio", { name: "PCS" }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText("Route: PCS");
  // Every choice can be changed later.
  await node.getByRole("radio", { name: "LOI" }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText("Route: LOI");
  await node.getByLabel("GC Status").selectOption("Confirmed");
  await expect(node.locator("[data-gc-pending]")).toHaveCount(0);

  // Saved with the project.
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const file = JSON.parse(localStorage.getItem(key)!).state.file;
        const qualification = file.graph.nodes.find(
          (item: { type: string }) => item.type === "qualification",
        );
        const start = file.graph.nodes.find(
          (item: { type: string }) => item.type === "projectStart",
        );
        const estimation = file.graph.nodes.find(
          (item: { type: string }) => item.type === "estimation",
        );
        return {
          route: qualification?.config.qualification,
          linked: file.graph.edges.some(
            (edge: { source: string; target: string }) =>
              edge.source === qualification?.id && edge.target === estimation?.id,
          ) && file.graph.edges.some(
            (edge: { source: string; target: string }) =>
              edge.source === estimation?.id && edge.target === start?.id,
          ),
        };
      }, WORKFLOW_STORAGE_KEY),
    )
    .toEqual({
      route: {
        clientType: "GC",
        gcStatus: "Confirmed",
        contractingClient: "TBD",
        projectType: "FOB Yard",
        plansAvailable: "yes",
        commercialPath: "LOI",
      },
      linked: true,
    });
  // Printed (L2 PDF) copies show the choices as text.
  await expect(node.locator('[data-qualification-print-value="clientType"]')).toHaveText("GC");
  await expect(node.locator('[data-qualification-print-value="projectType"]')).toHaveText(
    "FOB Yard",
  );
});

test("Form [1.01] completeness scoring handles LOI exemption, Q12 evidence, Annex rules, and absolute plans score", () => {
  const emptyEval = evaluateQualificationForm101({});
  expect(emptyEval.totalScore).toBe(0);
  expect(emptyEval.grade).toBe("D");

  // LOI path exempts Q9 (CSA/PCS deposit), and Option 1 keeps missing drawings unscaled.
  const loiEmpty = evaluateQualificationForm101({
    plansAvailable: "yes",
    commercialPath: "LOI",
  });
  expect(loiEmpty.q9DepositExempt).toBe(true);
  expect(loiEmpty.totalScore).toBe(4);

  const form = createEmptyQualificationForm101();
  form.revision = "1";
  form.sectionA.projectName = "St-Apollinaire Duplex";
  form.sectionA.projectAddress = "294 rue Laurier, St-Apollinaire, QC";
  for (const role of PROJECT_PARTY_ROLES) {
    form.sectionA.parties[role.key] = { company: "PROFAB", contact: "Alex 418-555-0100" };
  }
  form.sectionA.mainContact = {
    name: "Jane Doe",
    companyRole: "Owner / PM",
    email: "jane@example.com",
    phone: "418.555.0199",
  };
  form.sectionA.occupancyGroups = ["C"];
  form.sectionA.grossAreaSqFt = "18500";
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    form.sectionA.consultants[discipline.key] = {
      name: "Lead Eng",
      company: "ABC Eng",
      contact: "eng@example.com",
    };
  }
  form.sectionA.budgetEstablished = "yes";
  form.sectionA.permitStatus = "Submitted for review";
  for (const field of TARGET_DATE_FIELDS) {
    form.sectionA.targetDates[field.key] = "2026.12.15";
  }
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    form.sectionA.documents[doc.key] = { available: "no", locationOrDate: "" };
  }
  // Choosing "yes" without locationOrDate gives partial (1/2) credit for that document.
  form.sectionA.documents.permit = { available: "yes", locationOrDate: "" };

  for (const discipline of DISCIPLINE_DEFINITIONS) {
    form.sectionB.disciplines[discipline.key].reviewedNone = true;
  }
  form.sectionB.specialProducts.items = [
    {
      id: "sp-1",
      item: "Custom windows",
      description: "Triple pane",
      supply: undefined,
      relatedFiles: "Spec 08.1",
    },
  ];
  // RFI rows track follow-ups separately without inflating completeness score.
  form.sectionC.rfis = [
    { id: "rfi-1", rfiNo: "RFI-1", disciplineOrIssue: "Permit location", sentBy: "", dueDate: "" },
  ];

  const partial = evaluateQualificationForm101({
    plansAvailable: "no",
    form101: form,
  });
  expect(partial.q9DepositExempt).toBe(false);
  // Missing Q9 (4), 1 pt on permit location (1), Q13 drawings (9), B8 supply code (3) => 100 - 17 = 83
  expect(partial.totalScore).toBe(83);
  expect(partial.grade).toBe("B");
  expect(partial.openRfiCount).toBe(1);
  expect(partial.incompleteRfiCount).toBe(1);

  // Switch to LOI + supply Q12 permit path + Q13 drawing set + B8 supply scope => 100/100 Grade A.
  form.sectionA.documents.permit = {
    available: "yes",
    locationOrDate: "SharePoint/Permits/2026-11-10",
  };
  form.sectionA.latestDrawings = [
    {
      id: "dwg-1",
      drawingName: "A-100 Architectural Set",
      revisionNumber: "Rev 2",
      revisionDate: "2026.11.01",
      issueStatus: "Issued for Permit",
      exactLocation: "BIM360/Arch/Rev2",
    },
  ];
  form.sectionB.specialProducts.items[0].supply = "FI/SI";

  const fullLoi: Qualification = {
    plansAvailable: "yes",
    commercialPath: "LOI",
    form101: form,
  };
  const fullEval = evaluateQualificationForm101(fullLoi);
  expect(fullEval.totalScore).toBe(100);
  expect(fullEval.grade).toBe("A");
  expect(fullEval.missingItems).toHaveLength(0);
});

test("Qualification Form [1.01] opens inside QualificationNode, computes live score, and persists with LOI/CSA/PCS", async ({
  page,
}) => {
  const file = createE2EWorkflow();
  const qNode = createDomainNode("qualification", "qualification-1");
  file.graph.nodes.unshift(qNode);
  file.layout.nodes[qNode.id] = { nodeId: qNode.id, x: -1100, y: 0, width: 1000, height: 430 };

  await page.addInitScript(
    ({ key, workflow }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();

  const node = page.locator("[data-qualification-node]");
  await expect(node).toBeVisible();
  await page.getByRole("button", { name: /fit view/i }).click();
  await page.waitForTimeout(300);
  await expect(node.locator("[data-qualification-score]")).toContainText("Score: 0/100 (D)");

  // Select LOI path first on Step 2 (Plans & Route).
  await node.getByRole("button", { name: "Yes", exact: true }).click();
  await node.getByRole("radio", { name: "LOI" }).click();
  await expect(node.locator("[data-qualification-route]")).toHaveText("Route: LOI");
  await expect(node.locator("[data-qualification-score]")).toContainText("Score: 4/100 (D)");

  // Open Form [1.01] from inside the Qualification node (opens in step-by-step wizard).
  await node.getByRole("button", { name: "Open Form [1.01]" }).click();
  const dialog = page.getByRole("dialog", { name: "Qualification Form [1.01]" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Q9 Deposit exempt (LOI)")).toBeVisible();
  await expect(dialog.locator('[data-form101-wizard-step="q1"]')).toBeVisible();

  await dialog.getByRole("textbox", { name: "Form revision" }).fill("2");
  await dialog.getByRole("textbox", { name: "Project name" }).fill("Montréal Residence");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.locator('[data-form101-wizard-step="q2"]')).toBeVisible();
  await dialog.getByRole("textbox", { name: "Full project address" }).fill("100 Rue Principale");

  // Jump to Q5, then Next to Q6.
  await dialog.getByRole("button", { name: "Q5", exact: true }).click();
  await dialog.getByRole("checkbox", { name: /Group C — residential/ }).check();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await dialog.getByRole("textbox", { name: "Gross area sq ft" }).fill("24000");

  // Jump to Section B (lands on B1 Civil) and pick one Annex 2 Civil item.
  await dialog.getByRole("button", { name: /^B\. Disciplines/ }).click();
  await dialog.getByRole("button", { name: "Pick from Annex 2" }).first().click();
  await dialog.getByRole("button", { name: /\+ 1\.1\. Current site plan/ }).click();

  await expect(dialog.locator("[data-form101-grade]")).not.toContainText("Score: 4/100");
  await dialog.getByRole("button", { name: "Save Form" }).click();
  await expect(dialog).toHaveCount(0);

  // Node retains LOI route and reflects updated Form [1.01] score & revision.
  await expect(node.locator("[data-qualification-route]")).toHaveText("Route: LOI");
  await expect(node).toContainText("Rev 2");
  await expect(node.locator("[data-qualification-score]")).not.toContainText("Score: 4/100");

  const stored = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!).state.file;
    return saved.graph.nodes.find((item: { type: string }) => item.type === "qualification")?.config
      .qualification;
  }, WORKFLOW_STORAGE_KEY);
  expect(stored.commercialPath).toBe("LOI");
  expect(stored.form101.revision).toBe("2");
  expect(stored.form101.sectionA.projectName).toBe("Montréal Residence");
  expect(stored.form101.sectionB.disciplines.civil.items[0].item).toContain(
    "1.1. Current site plan",
  );
});

function build83PercentForm101() {
  const form = createEmptyQualificationForm101();
  form.revision = "1";
  form.sectionA.projectName = "St-Apollinaire Duplex";
  form.sectionA.projectAddress = "294 rue Laurier";
  for (const role of PROJECT_PARTY_ROLES) {
    form.sectionA.parties[role.key] = { company: "PROFAB", contact: "Alex 418-555-0100" };
  }
  form.sectionA.mainContact = {
    name: "Jane Doe",
    companyRole: "Owner / PM",
    email: "jane@example.com",
    phone: "418.555.0199",
  };
  form.sectionA.occupancyGroups = ["C"];
  form.sectionA.grossAreaSqFt = "18500";
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    form.sectionA.consultants[discipline.key] = {
      name: "Lead Eng",
      company: "ABC Eng",
      contact: "eng@example.com",
    };
  }
  form.sectionA.budgetEstablished = "yes";
  form.sectionA.permitStatus = "Submitted";
  for (const field of TARGET_DATE_FIELDS) {
    form.sectionA.targetDates[field.key] = "2026.12.15";
  }
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    form.sectionA.documents[doc.key] = { available: "no", locationOrDate: "" };
  }
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    form.sectionB.disciplines[discipline.key].reviewedNone = true;
  }
  form.sectionB.specialProducts.reviewedNone = true;
  return form;
}

test("scores below 70% auto-fail, and >= 70% requires Tech Review approval to unlock downstream steps", () => {
  // Below 70% cannot pass even if techReview.status was previously marked approved.
  const lowGate = evaluateQualificationGate({
    plansAvailable: "yes",
    commercialPath: "PCS",
    techReview: { status: "approved", reviewer: "Marc" },
  });
  expect(lowGate.totalScore).toBe(0);
  expect(lowGate.scorePassed).toBe(false);
  expect(lowGate.techReviewApproved).toBe(false);
  expect(lowGate.passed).toBe(false);
  expect(lowGate.state).toBe("failed_score");

  const passingForm = build83PercentForm101();
  const pendingGate = evaluateQualificationGate({
    plansAvailable: "yes",
    commercialPath: "PCS",
    form101: passingForm,
  });
  expect(pendingGate.totalScore).toBeGreaterThanOrEqual(70);
  expect(pendingGate.scorePassed).toBe(true);
  expect(pendingGate.passed).toBe(false);
  expect(pendingGate.state).toBe("pending_review");

  const rejectedGate = evaluateQualificationGate({
    plansAvailable: "yes",
    commercialPath: "PCS",
    form101: passingForm,
    techReview: { status: "rejected", reviewer: "Marc" },
  });
  expect(rejectedGate.passed).toBe(false);
  expect(rejectedGate.state).toBe("rejected");

  const file = createE2EWorkflow();
  const qNode = createDomainNode("qualification", "qualification-1");
  const startNode = file.graph.nodes.find((node) => node.type === "projectStart")!;
  file.graph.nodes.unshift(qNode);
  file.graph.edges.unshift({
    id: "qual-to-start",
    source: qNode.id,
    target: startNode.id,
    sourceHandle: "out",
    targetHandle: "in",
    type: "normal",
    label: "",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: {},
  });

  // 1. Score < 70% blocks Project Start steps.
  expect(sequentialExecutionBlocker(file, startNode.id)).toContain("minimum 70% required");
  expect(releaseConditionBlocker(file, startNode.id, 1)?.title).toBe(
    "Complete Qualification first",
  );

  // 2. Score >= 70% without Tech Review approval still blocks Project Start steps.
  qNode.config.qualification = {
    plansAvailable: "yes",
    commercialPath: "PCS",
    form101: passingForm,
    techReview: { status: "pending" },
  };
  expect(sequentialExecutionBlocker(file, startNode.id)).toContain("Approve Tech Review");

  // 3. Approved Tech Review with >= 70% score unlocks downstream steps.
  qNode.config.qualification = {
    plansAvailable: "yes",
    commercialPath: "PCS",
    form101: passingForm,
    techReview: { status: "approved", reviewer: "Marc T." },
  };
  expect(sequentialExecutionBlocker(file, startNode.id)).toBeUndefined();
});

test("Tech Review gate in QualificationNode blocks next step below 70% and unlocks upon >= 70% + approval", async ({
  page,
}) => {
  const file = createE2EWorkflow();
  const qNode = createDomainNode("qualification", "qualification-1");
  const startNode = file.graph.nodes.find((node) => node.type === "projectStart")!;
  startNode.conditions = [
    { id: "project-id-required", label: "Job Number is entered", required: false, checked: false },
    { id: "nda-edat", label: "NDA & EDAT", required: true, checked: false },
  ];
  // Remove L3 forms on startNode step 2 so we can test direct L2 checkbox unlocking cleanly.
  delete startNode.customFields["customerDocuments::release-condition::nda-edat"];
  delete startNode.customFields["legalDocuments::release-condition::nda-edat"];

  qNode.config.qualification = {
    plansAvailable: "yes",
    commercialPath: "CSA",
    form101: build83PercentForm101(),
  };
  file.graph.nodes.unshift(qNode);
  file.layout.nodes[qNode.id] = { nodeId: qNode.id, x: -1350, y: 0, width: 1180, height: 445 };
  file.graph.edges.unshift({
    id: "qual-to-start",
    source: qNode.id,
    target: startNode.id,
    sourceHandle: "out",
    targetHandle: "in",
    type: "normal",
    label: "",
    lineStyle: "solid",
    arrowStyle: "closed",
    customFields: {},
  });

  const estimationFile = ensureEstimationWorkflow(file);
  const estimation = estimationFile.graph.nodes.find((node) => node.type === "estimation")!;
  estimation.customFields = {
    estimationBasePrice: 2400000,
    estimationModuleBudget: 5000000,
    estimationPreparedBy: "Sales",
    estimationReviewed: true,
  };

  await page.addInitScript(
    ({ key, workflow }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      ),
    { key: WORKFLOW_STORAGE_KEY, workflow: estimationFile },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page.getByRole("button", { name: /fit view/i }).click();
  await page.waitForTimeout(300);

  const qualCard = page.locator("[data-qualification-node]");
  const salesCard = page.locator(`.react-flow__node[data-id="${startNode.id}"]`);
  const reviewPanel = qualCard.locator("[data-tech-review-panel]");

  // Even with >= 70% score, pending Tech Review blocks ticking SALES step 2.
  await expect(qualCard.locator("[data-qualification-gate-status]")).toHaveText(
    "Awaiting Tech Review",
  );
  await salesCard.getByRole("button", { name: "Check step 2" }).click();
  const blocker = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(blocker.getByText("Complete Qualification first")).toBeVisible();
  await expect(blocker).toContainText("Approve Tech Review");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(salesCard.getByRole("button", { name: "Check step 2" })).toBeVisible();

  // Approve Tech Review on QualificationNode -> clears gate and unlocks SALES step 2.
  await reviewPanel.getByRole("textbox", { name: "Tech reviewer" }).fill("Marc T.");
  await reviewPanel.getByRole("button", { name: "Approve" }).click();
  await expect(qualCard.locator("[data-qualification-gate-status]")).toHaveText(
    "Tech Review Passed",
  );
  await salesCard.getByRole("button", { name: "Check step 2" }).click();
  await expect(salesCard.getByRole("button", { name: "Uncheck step 2" })).toBeVisible();

  // Lowering Form [1.01] below 70% automatically disables Approve and re-locks the gate.
  await qualCard.getByRole("button", { name: "Open Form [1.01]" }).click();
  const dialog = page.getByRole("dialog", { name: "Qualification Form [1.01]" });
  await dialog.getByRole("button", { name: "Reset Form" }).click();
  await expect(dialog.locator("[data-form101-gate-badge]")).toContainText("Cannot Pass");
  await dialog.getByRole("button", { name: "Save Form" }).click();

  await expect(qualCard.locator("[data-qualification-gate-status]")).toHaveText(
    "Auto-Fail (< 70%)",
  );
  await expect(reviewPanel.getByRole("button", { name: "Approve" })).toBeDisabled();
});
