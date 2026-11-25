import { expect, test, type Page } from "playwright/test";
import {
  QUALIFICATION_CASES,
  qualificationCase,
  qualificationRoute,
  type Qualification,
} from "../src/lib/qualification";
import {
  DISCIPLINE_DEFINITIONS,
  PROJECT_DOCUMENT_DEFINITIONS,
  PROJECT_PARTY_ROLES,
  TARGET_DATE_FIELDS,
  createEmptyQualificationForm101,
  evaluateQualificationForm101,
  evaluateQualificationGate,
  qualificationScoreStage,
} from "../src/lib/qualification-form-101";
import { validateWorkflow } from "../src/lib/validation";
import { releaseConditionBlocker, sequentialExecutionBlocker } from "../src/lib/workflow-progress";
import { createDomainNode } from "../src/lib/create-domain-node";
import { ensureEstimationWorkflow } from "../src/lib/estimation-workflow";
import { createE2EWorkflow, WORKFLOW_STORAGE_KEY } from "./support/e2e-workflow";

async function dismissRouteImpact(page: Page, impact?: RegExp) {
  const popup = page.getByRole("dialog", { name: "Route impact" });
  await expect(popup).toBeVisible();
  if (impact) await expect(popup).toContainText(impact);
  await popup.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Qualification Form [1.01]" })).toBeVisible();
}

async function answerParty(page: Page, label: string, value: string, impact?: RegExp) {
  const company = page.getByRole("textbox", { name: label, exact: true });
  await company.fill(value);
  await company.press("Tab");
  await dismissRouteImpact(page, impact);
}

async function openSalesQuestion(page: Page, question: string) {
  const button = page.getByRole("button", { name: question, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole("button", { name: /^A\. Sales Intake/ }).click();
  await button.click();
}

async function answerDrawings(page: Page, value: "Yes" | "No", impact?: RegExp) {
  await openSalesQuestion(page, "Q12");
  await page
    .getByRole("group", { name: "Latest architectural drawing set available" })
    .getByRole("button", { name: value.toLowerCase(), exact: true })
    .click();
  await dismissRouteImpact(page, impact);
}

test("Qualification score stages use exact point thresholds", () => {
  for (const [points, grade] of [
    [33, "D"],
    [34, "C"],
    [51, "C"],
    [52, "B"],
    [75, "B"],
    [76, "A"],
  ] as const) {
    expect(qualificationScoreStage(points).grade).toBe(grade);
  }
});

test("client type, customer level and plans decide the route after Qualification", () => {
  expect(qualificationRoute({})).toBeUndefined();
  const routeOf = (q: Qualification) => [qualificationRoute(q), qualificationCase(q)?.steps];
  // ProFab is our own company: always LOI.
  expect(routeOf({ clientCategory: "ProFab" })).toEqual(["LOI", ["LOI"]]);
  // VIP GC and VIP Owner go through LOI.
  expect(routeOf({ clientCategory: "GC", customerTier: "vip" })).toEqual(["LOI", ["LOI"]]);
  expect(routeOf({ clientCategory: "Owner", customerTier: "vip" })).toEqual(["LOI", ["LOI"]]);
  // Regular customers without plans consult first, then PCS.
  for (const clientCategory of ["GC", "Owner"] as const)
    expect(routeOf({ clientCategory, customerTier: "regular", plansAvailable: "no" })).toEqual([
      "CSA",
      ["CSA", "PCS"],
    ]);
  // A regular GC with plans goes straight to PCS.
  expect(routeOf({ clientCategory: "GC", customerTier: "regular", plansAvailable: "yes" })).toEqual(
    ["PCS", ["PCS"]],
  );
  // An Owner with plans is handed to their GC, who contacts ProFab, then PCS.
  expect(
    routeOf({ clientCategory: "Owner", customerTier: "regular", plansAvailable: "yes" }),
  ).toEqual(["PCS", ["GC", "PCS"]]);
  // Until enough is chosen there is no route, even with an older saved path.
  expect(qualificationRoute({ clientCategory: "GC", commercialPath: "LOI" })).toBeUndefined();
  expect(qualificationRoute({ clientCategory: "Owner", customerTier: "regular" })).toBeUndefined();
  expect(QUALIFICATION_CASES.map((item) => item.id)).toEqual([
    "profab",
    "gc-vip",
    "gc-no-plans",
    "gc-plans",
    "owner-vip",
    "owner-no-plans",
    "owner-plans",
  ]);
  // Older saved answers (new or existing customer) still read.
  // New customers: no plans → CSA, plans → PCS.
  expect(qualificationRoute({ customerHistory: "new", plansAvailable: "no" })).toBe("CSA");
  expect(qualificationRoute({ customerHistory: "new", plansAvailable: "yes" })).toBe("PCS");
  expect(qualificationRoute({ customerHistory: "new" })).toBeUndefined();
  // Existing customers choose CSA, PCS or LOI.
  expect(qualificationRoute({ customerHistory: "existing", commercialPath: "LOI" })).toBe("LOI");
  expect(qualificationRoute({ customerHistory: "existing" })).toBeUndefined();
  // Older saved answers still read.
  expect(qualificationRoute({ plansAvailable: "no" })).toBe("CSA");
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
  // Form [1.01] only: the route is chosen in Route Selection next.
  await expect(node.locator("[data-qualification-flow-step]")).toHaveCount(1);
  await expect(node.locator("[data-qualification-flow-arrow]")).toHaveCount(0);
  // Only one per project.
  await expect(libraryItem).toBeDisabled();

  // Qualification stays at the far left of the flow.
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
  // The route is chosen in its own Route Selection node after Qualification.
  const routeNode = page.locator("[data-route-selection-node]");
  const route = routeNode.locator("[data-qualification-route]");
  const flow = routeNode.locator("[data-qualification-route-flow]");
  await expect(node.locator("[data-qualification-route-flow]")).toHaveCount(0);
  const chosen = flow.locator('[data-qualification-route-case][data-active="true"]');
  // Every situation is on the flowchart, each with its own branch.
  await expect(flow.locator("[data-qualification-route-case]")).toHaveCount(7);
  // Each branch that ends in a step has a way out on the right of its last box.
  await expect(flow.locator("[data-qualification-route-exit]")).toHaveCount(6);
  expect(
    await flow.locator("[data-qualification-route-case]").evaluateAll((rows) =>
      rows.flatMap((row) => {
        const exit = row.querySelector("[data-qualification-route-exit]");
        const boxes = Array.from(row.querySelectorAll("rect[x]")).slice(1);
        const last = boxes.at(-1);
        if (!exit || !last) return [];
        const right = Number(last.getAttribute("x")) + Number(last.getAttribute("width"));
        return [Math.abs(Number(exit.getAttribute("cx")) - right) < 0.5];
      }),
    ),
  ).toEqual([true, true, true, true, true, true]);
  await expect(route).toHaveText("Route: Complete Form [1.01]");
  await expect(chosen).toHaveCount(0);
  await expect(flow.getByRole("button")).toHaveCount(0);
});

test("Qualification routes use completed Q3 pairs and Q12 in sequence", async ({ page }) => {
  const file = createE2EWorkflow();
  const qualification = createDomainNode("qualification", "qualification-1");
  const intake = build83PercentForm101();
  intake.sectionA.parties = createEmptyQualificationForm101().sectionA.parties;
  qualification.config.qualification = { form101: intake };
  file.graph.nodes.unshift(qualification);
  file.layout.nodes[qualification.id] = {
    nodeId: qualification.id,
    x: -1100,
    y: 0,
    width: 520,
    height: 430,
  };
  await page.addInitScript(
    ({ key, workflow }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          state: { file: workflow, workspaceOwnerId: "dev-bypass", dirty: false },
          version: 0,
        }),
      );
    },
    { key: WORKFLOW_STORAGE_KEY, workflow: file },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "L2 · Detailed Workflow" }).click();
  await page.getByRole("button", { name: /fit view/i }).click();
  const node = page.locator("[data-qualification-node]");
  const routeNode = page.locator("[data-route-selection-node]");
  const route = routeNode.locator("[data-qualification-route]");
  const flow = routeNode.locator("[data-qualification-route-flow]");
  const chosen = flow.locator('[data-qualification-route-case][data-active="true"]');
  const openForm = async () => {
    await node.getByRole("button", { name: "Open Form [1.01]" }).click();
    return page.getByRole("dialog", { name: "Qualification Form [1.01]" });
  };
  let form = await openForm();
  await expect(form.getByRole("button", { name: "Route", exact: true })).toHaveCount(0);
  await openSalesQuestion(page, "Q3");
  await answerParty(page, "Owner company", "Example Owner", /Owner: add a contact/);
  await expect(form.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await answerParty(page, "Owner contact", "Owner rep");
  await expect(form.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await answerParty(
    page,
    "General Contractor company",
    "Example GC",
    /General Contractor: add a contact/,
  );
  await answerParty(page, "General Contractor contact", "GC rep", /GC route applies.*In Q12/);
  await form.getByRole("button", { name: "Save Form" }).click();
  await expect(route).toHaveText("Route: Complete Form [1.01]");

  form = await openForm();
  await answerDrawings(page, "No", /starts with CSA for consultation/);
  await form.getByRole("button", { name: "Save Form" }).click();
  await expect(route).toHaveText("Route: GC → CSA → PCS");
  await expect(chosen).toHaveAttribute("data-qualification-route-case", "gc-no-plans");

  form = await openForm();
  await answerDrawings(page, "Yes", /directly to PCS/);
  await form.getByRole("button", { name: "Save Form" }).click();
  await expect(route).toHaveText("Route: GC → PCS");

  form = await openForm();
  await openSalesQuestion(page, "Q3");
  await answerParty(page, "General Contractor company", "", /add a company/);
  await answerParty(page, "General Contractor contact", "", /hands the project over/);
  await form.getByRole("button", { name: "Save Form" }).click();
  await expect(route).toHaveText("Route: Owner → GC → PCS");
  await expect(flow.locator("[data-qualification-route-client]")).toHaveCount(3);
  await expect(chosen).toHaveCount(2);
  await expect(flow.locator('[data-qualification-route-handoff="owner-plans"]')).toBeVisible();

  form = await openForm();
  await openSalesQuestion(page, "Q3");
  await answerParty(page, "General Contractor company", "Example GC");
  await answerParty(page, "General Contractor contact", "GC rep");
  await answerParty(page, "Our client (PROFAB) company", "Internal");
  await answerParty(page, "Our client (PROFAB) contact", "Alex", /Q9 is exempt/);
  await form.getByRole("button", { name: "Save Form" }).click();
  await expect(route).toHaveText("Route: ProFab → LOI");
  await expect(chosen).toHaveAttribute("data-qualification-route-case", "profab");

  // Saved with the project: Qualification → CSA / PCS / LOI → Estimation → Project Start.
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const file = JSON.parse(localStorage.getItem(key)!).state.file;
        const byType = (type: string) =>
          file.graph.nodes.find((item: { type: string }) => item.type === type);
        const qualification = byType("qualification");
        const estimation = byType("estimation");
        const start = byType("projectStart");
        const group = file.graph.nodes.find(
          (item: { id: string }) => item.id === "commercial-route-group",
        );
        const linked = (source?: { id: string }, target?: { id: string }) =>
          file.graph.edges.some(
            (edge: { source: string; target: string }) =>
              edge.source === source?.id && edge.target === target?.id,
          );
        return {
          clientContact:
            qualification?.config.qualification.form101.sectionA.parties.client.contact,
          commercialPath: qualification?.config.qualification.commercialPath,
          linked:
            linked(qualification, group) && linked(group, estimation) && linked(estimation, start),
        };
      }, WORKFLOW_STORAGE_KEY),
    )
    .toEqual({ clientContact: "Alex", commercialPath: "LOI", linked: true });
});

test("Form [1.01] scores out of 84: LOI exempts Q9, partial and full forms", () => {
  const emptyEval = evaluateQualificationForm101({});
  expect(emptyEval.totalScore).toBe(0);
  expect(emptyEval.grade).toBe("D");

  // LOI exempts Q9 (CSA/PCS deposit). Q9 carries no points, so an empty form is still 0.
  const loiEmpty = evaluateQualificationForm101({
    plansAvailable: "yes",
    commercialPath: "LOI",
  });
  expect(loiEmpty.q9DepositExempt).toBe(true);
  expect(loiEmpty.totalScore).toBe(0);

  const form = createEmptyQualificationForm101();
  form.revision = "1";
  form.sectionA.projectName = "St-Apollinaire Duplex";
  form.sectionA.projectAddress = "294 rue Laurier, St-Apollinaire, QC";
  for (const role of PROJECT_PARTY_ROLES) {
    form.sectionA.parties[role.key] = {
      company: { owner: "Owner Co", gc: "GC Co", client: "" }[role.key],
      contact: role.key === "client" ? "" : "Alex 418-555-0100",
    };
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
  form.sectionA.documents.archDrawings.available = "yes";
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
  // Q9 deposit and Q13 drawings are still missing: 58/84 is a pass (52+) but not complete.
  expect(partial.totalScore).toBe(58);
  expect(partial.grade).toBe("B");
  expect(partial.missingItems.map((item) => item.id)).toEqual(["q9", "q13"]);
  expect(partial.openRfiCount).toBe(1);
  expect(partial.incompleteRfiCount).toBe(1);

  // Switch the Q3 client to ProFab, then complete the technical information.
  form.sectionA.parties.client = { company: "Internal", contact: "Alex" };
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
  expect(fullEval.totalScore).toBe(80);
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
  const score = node.locator("[data-qualification-score]");
  await expect(score).toHaveText("0/84 · 0%");
  await score.hover();
  await expect(node.getByRole("tooltip")).toContainText("Initial intake");
  await expect(node.getByRole("tooltip")).toContainText("Required 0/52 · Optional 0/32");

  await node.getByRole("button", { name: "Open Form [1.01]" }).click();
  const dialog = page.getByRole("dialog", { name: "Qualification Form [1.01]" });
  await expect(dialog.locator('[data-form101-wizard-step="q1"]')).toBeVisible();
  await dialog.locator("[data-form101-grade]").hover();
  await expect(dialog.getByRole("tooltip")).toContainText("Initial intake");
  await dialog.getByText("How scores are interpreted").click();
  await expect(dialog.getByText("A · 76–84 points · Ready for drafter review")).toBeVisible();
  await dialog.getByText("How scores are interpreted").click();

  await expect(dialog.getByRole("button", { name: "Q3", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: /^B\. Disciplines/ })).toBeDisabled();
  await dialog.getByRole("tab", { name: "All", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Full project address" })).toBeDisabled();
  await dialog.getByRole("tab", { name: "Step-by-step" }).click();

  await dialog.getByRole("textbox", { name: "Form revision" }).fill("2");
  await dialog.getByRole("textbox", { name: "Project name" }).fill("Montréal Residence");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.locator('[data-form101-wizard-step="q2"]')).toBeVisible();
  await dialog.getByRole("textbox", { name: "Full project address" }).fill("100 Rue Principale");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog.locator('[data-form101-wizard-step="q3"]')).toBeVisible();
  await answerParty(page, "Our client (PROFAB) company", "ProFab");
  await answerParty(page, "Our client (PROFAB) contact", "Alex");
  await expect(dialog.getByText("Q9 Deposit exempt (LOI)")).toBeVisible();

  await dialog.getByRole("button", { name: "Save Form" }).click();
  await expect(dialog).toHaveCount(0);

  // Node retains LOI route and reflects updated Form [1.01] score & revision.
  await expect(page.locator("[data-route-selection-node] [data-qualification-route]")).toHaveText(
    "Route: ProFab → LOI",
  );
  await expect(score).toHaveText("5/84 · 6%");
  await expect(page.locator('[data-qualification-route-case][data-active="true"]')).toHaveCount(0);
  await expect(score).not.toHaveText("0/84 · 0%");

  const stored = await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!).state.file;
    return saved.graph.nodes.find((item: { type: string }) => item.type === "qualification")?.config
      .qualification;
  }, WORKFLOW_STORAGE_KEY);
  expect(stored.commercialPath).toBe("LOI");
  expect(stored.form101.revision).toBe("2");
  expect(stored.form101.sectionA.projectName).toBe("Montréal Residence");
  expect(stored.form101.sectionA.parties.client.contact).toBe("Alex");
});

function build83PercentForm101() {
  const form = createEmptyQualificationForm101();
  form.revision = "1";
  form.sectionA.projectName = "St-Apollinaire Duplex";
  form.sectionA.projectAddress = "294 rue Laurier";
  for (const role of PROJECT_PARTY_ROLES) {
    form.sectionA.parties[role.key] = {
      company: { owner: "Owner Co", gc: "GC Co", client: "" }[role.key],
      contact: role.key === "client" ? "" : "Alex 418-555-0100",
    };
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
  form.sectionA.depositReceived = "no";
  form.sectionA.permitStatus = "Submitted";
  for (const field of TARGET_DATE_FIELDS) {
    form.sectionA.targetDates[field.key] = "2026.12.15";
  }
  for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
    form.sectionA.documents[doc.key] = { available: "no", locationOrDate: "" };
  }
  form.sectionA.documents.archDrawings.available = undefined;
  for (const discipline of DISCIPLINE_DEFINITIONS) {
    form.sectionB.disciplines[discipline.key].reviewedNone = true;
  }
  form.sectionB.specialProducts.reviewedNone = true;
  return form;
}

test("Qualification passes at 52/84 with a route; below 52 it blocks the next steps", () => {
  // Below 52 points cannot pass, even with an old Tech Review approval saved.
  const lowGate = evaluateQualificationGate({
    plansAvailable: "yes",
    commercialPath: "PCS",
    techReview: { status: "approved", reviewer: "Marc" },
  });
  expect(lowGate.totalScore).toBe(0);
  expect(lowGate.scorePassed).toBe(false);
  expect(lowGate.passed).toBe(false);
  expect(lowGate.state).toBe("failed_score");

  // 52+ points but no route yet: waiting for the route.
  const passingForm = build83PercentForm101();
  const pendingGate = evaluateQualificationGate({ form101: passingForm, commercialPath: "LOI" });
  expect(pendingGate.totalScore).toBeGreaterThanOrEqual(52);
  expect(pendingGate.scorePassed).toBe(true);
  expect(pendingGate.passed).toBe(false);
  expect(pendingGate.state).toBe("pending_route");

  // 52+ points and a route: passed, no Tech Review needed.
  const resolvedForm = structuredClone(passingForm);
  resolvedForm.sectionA.documents.archDrawings.available = "yes";
  const missingContact = structuredClone(resolvedForm);
  missingContact.sectionA.parties.gc.contact = "";
  const blockedByQ3 = evaluateQualificationGate({ form101: missingContact });
  expect(blockedByQ3.scorePassed).toBe(true);
  expect(blockedByQ3.passed).toBe(false);
  expect(blockedByQ3.state).toBe("pending_parties");

  const passedGate = evaluateQualificationGate({ form101: resolvedForm });
  expect(passedGate.passed).toBe(true);
  expect(passedGate.state).toBe("passed");
  expect(passedGate.statusLabel).toBe("PCS → Estimation");

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

  // 1. Below 52 points blocks the next steps.
  expect(sequentialExecutionBlocker(file, startNode.id)).toContain("At least 52 points");
  expect(releaseConditionBlocker(file, startNode.id, 1)?.title).toBe(
    "Complete Qualification first",
  );

  // 2. Enough points but no route still blocks.
  qNode.config.qualification = { form101: passingForm };
  expect(sequentialExecutionBlocker(file, startNode.id)).toContain(
    "Check the project parties in Q3 and the architectural drawing availability in Q12",
  );

  // 3. Enough points and a route unlocks the next steps.
  qNode.config.qualification = { form101: resolvedForm };
  expect(sequentialExecutionBlocker(file, startNode.id)).toBeUndefined();
});

test("Qualification blocks the next Department until it passes with a route, and again when the form drops", async ({
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

  // Enough points, but no route chosen yet.
  qNode.config.qualification = { form101: build83PercentForm101() };
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
  // The CSA route has its hours, so CSA → Estimation can go through.
  const group = estimationFile.graph.nodes.find((node) => node.id === "commercial-route-group")!;
  group.customFields = { ...group.customFields, commercialRouteCsaHours: 12 };
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
  const status = qualCard.locator("[data-qualification-gate-status]");

  // Enough points but no route: SALES step 2 can't be ticked yet.
  await expect(status).toHaveText("Choose route");
  await salesCard.getByRole("button", { name: "Check step 2" }).click();
  const blocker = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(blocker.getByText("Complete Qualification first")).toBeVisible();
  await expect(blocker).toContainText(
    "Check the project parties in Q3 and the architectural drawing availability in Q12",
  );
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(salesCard.getByRole("button", { name: "Check step 2" })).toBeVisible();

  // Regular GC without plans → CSA: Qualification passes and SALES opens up.
  await qualCard.getByRole("button", { name: "Open Form [1.01]" }).click();
  const dialog = page.getByRole("dialog", { name: "Qualification Form [1.01]" });
  await answerDrawings(page, "No");
  await dialog.getByRole("button", { name: "Save Form" }).click();
  await expect(status).toHaveText("CSA → Estimation");
  await salesCard.getByRole("button", { name: "Check step 2" }).click();
  await expect(salesCard.getByRole("button", { name: "Uncheck step 2" })).toBeVisible();

  // Clearing Form [1.01] drops it below 52 points and Qualification blocks again.
  await qualCard.getByRole("button", { name: "Open Form [1.01]" }).click();
  await dialog.getByRole("button", { name: "Reset Form" }).click();
  await expect(dialog.locator("[data-form101-gate-badge]")).toContainText("Cannot Pass");
  await dialog.getByRole("button", { name: "Save Form" }).click();

  await expect(status).toHaveText("Below 52/84");
});
