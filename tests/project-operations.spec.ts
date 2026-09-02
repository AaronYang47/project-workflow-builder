import { expect, test } from "playwright/test";
import { createDefaultDetailedLifecycle } from "../src/lib/detailed-workflow";
import {
  buildStitchList,
  buildWeeklyReport,
  calculateClassD,
  classifyClientPath,
  convertClientToProject,
  createDefaultProjectOperations,
  createEstimateVersion,
  designBoundaryReady,
  estimateMaturityReady,
  evaluateGateOne,
  evaluatePaymentRelease,
  invoicePaidAmount,
  operationsGateStatus,
  parseIcsTimeEntries,
  paymentMilestoneAmount,
  procurementUnlockReady,
  productionReadiness,
  requiredApprovalRole,
  roleCanApprove,
  scheduleWarranty,
  secondaryGateReady,
  timeBudgetStatus,
  validateGpfName,
  warrantyFollowUpStatus,
} from "../src/lib/project-operations";
import { createProjectWorkflow } from "../src/lib/project-template";
import {
  getWorkflowProgress,
  nodeReleaseReady,
  nodeStatusLabel,
} from "../src/lib/workflow-progress";
import { useWorkflowStore } from "../src/store/workflow-store";
import type {
  ApprovalRequest,
  BimObjectResponsibility,
  EstimateClass,
  ProjectOperations,
  SecondaryGate,
} from "../src/types/project-operations";

const FIXED_NOW = new Date("2026-08-31T14:30:00.000Z");

function freshOperations() {
  return createDefaultProjectOperations("Stable rule fixture", "", FIXED_NOW);
}

function answerAllQualificationQuestions(operations: ProjectOperations) {
  operations.qualification = operations.qualification.map((question) => ({
    ...question,
    answer: "Yes",
    evidence: `Controlled evidence for ${question.id}`,
  }));
}

function applyClassifiedPath(
  operations: ProjectOperations,
  type: ProjectOperations["clientPath"]["clientType"] = "P3",
) {
  operations.clientPath = {
    ...operations.clientPath,
    clientType: type,
    selectedSubGates: ["Controlled sub-gate"],
    classificationReason: "Stable test classification",
    classifiedAt: "2026-08-31T12:00:00.000Z",
    classifiedBy: "Test Coordinator",
  };
}

function applyPaidCommercialEvidence(
  operations: ProjectOperations,
  options: { released?: boolean; invoiceEvidence?: boolean } = {},
) {
  const { released = true, invoiceEvidence = true } = options;
  operations.commercial = {
    ...operations.commercial,
    engagementType: "Paid Feasibility",
    agreementStatus: "Executed",
    agreementReference: "AGR-2026-0042",
    executedDate: "2026-08-28",
    contractValue: 100_000,
    paymentPlan: operations.commercial.paymentPlan.map((milestone) =>
      milestone.id === "deposit-25"
        ? { ...milestone, invoiceId: "invoice-deposit", status: "Paid" }
        : milestone,
    ),
    invoices: [
      {
        id: "invoice-deposit",
        invoiceNumber: "INV-2026-0042",
        milestoneId: "deposit-25",
        issuedDate: "2026-08-28",
        dueDate: "2026-08-29",
        amount: 25_000,
        status: "Paid",
        evidenceReference: invoiceEvidence ? "docs/invoices/INV-2026-0042.pdf" : "",
      },
    ],
    receipts: [
      {
        id: "receipt-deposit",
        receiptNumber: "RCPT-2026-0042",
        invoiceId: "invoice-deposit",
        receivedDate: "2026-08-29",
        amount: 25_000,
        method: "EFT",
        evidenceReference: "bank/EFT-2026-0042.pdf",
        verifiedBy: "Finance Controller",
      },
    ],
    paymentRelease: {
      ...operations.commercial.paymentRelease,
      status: released ? "Released" : "Ready",
      releasedAt: released ? "2026-08-30T10:00:00.000Z" : "",
      releasedBy: released ? "Finance Controller" : "",
      approverRole: released ? "Finance" : "",
      evidence: released ? "INV-2026-0042 + RCPT-2026-0042" : "",
      reasons: [],
    },
  };
}

function gateOneReadyOperations() {
  const operations = freshOperations();
  answerAllQualificationQuestions(operations);
  applyClassifiedPath(operations);
  applyPaidCommercialEvidence(operations);
  return operations;
}

function approvalRequest(
  patch: Partial<ApprovalRequest> & Pick<ApprovalRequest, "kind">,
): ApprovalRequest {
  return {
    id: "approval-stable",
    kind: patch.kind,
    reference: "REQ-0042",
    amount: 0,
    contractPercent: 0,
    cumulativeCreditAmount: 0,
    requiredRole: "Project Manager",
    requestedBy: "Requester",
    requestedAt: "2026-08-30T09:00:00.000Z",
    status: "Pending",
    decidedBy: "",
    decidedByRole: "",
    decidedAt: "",
    evidence: "Controlled request evidence",
    reason: "Stable test request",
    ...patch,
  };
}

function approveEstimateClasses(
  operations: ProjectOperations,
  through: EstimateClass,
) {
  const order: EstimateClass[] = ["D", "C", "B", "A"];
  const targetIndex = order.indexOf(through);
  for (const estimateClass of order.slice(0, targetIndex + 1)) {
    const created = createEstimateVersion(
      operations,
      estimateClass,
      1_000_000 + order.indexOf(estimateClass) * 100_000,
      "Estimator",
      `REV-${estimateClass}`,
      FIXED_NOW,
    );
    operations.estimating.versions.push({
      ...created,
      status: "Approved",
      assumptions: [`Controlled Class ${estimateClass} basis`],
      approvedAt: "2026-08-31T13:00:00.000Z",
      approvedBy: "Authorized Estimator",
    });
  }
  operations.estimating.convergenceTasks = operations.estimating.convergenceTasks.map(
    (task, index) =>
      index < targetIndex
        ? {
            ...task,
            status: "Complete",
            evidence: `${task.fromClass} to ${task.toClass} controlled evidence`,
            owner: "Estimating Lead",
          }
        : task,
  );
}

function applyAcceptedDesignBoundary(
  operations: ProjectOperations,
  deliveryModel: ProjectOperations["designBoundary"]["deliveryModel"] =
    "Client Design / ProFab Consultation",
) {
  operations.designBoundary = {
    deliveryModel,
    architectOfRecord: "Client Architect Inc.",
    profabScope: "Modular consultation and manufacturability review only",
    clientConsultantScope: "Design authority, code compliance, and sealed documents",
    exclusions: "ProFab is not the architect or engineer of record",
    boundaryAccepted: true,
    acceptedByClient: "Client Executive",
    acceptedAt: "2026-08-31T13:00:00.000Z",
    agreementReference: "CSA-BOUNDARY-0042",
  };
}

function passedSecondaryGate(
  gate: SecondaryGate,
  patch: Partial<SecondaryGate> = {},
): SecondaryGate {
  return {
    ...gate,
    ownerParty: "Client",
    responsiblePerson: "Site Lead",
    requiredEvidence: ["Signed readiness checklist"],
    evidenceReferences: [`evidence/${gate.id}.pdf`],
    targetDate: "2026-09-15",
    status: "Passed",
    approvedBy: "Project Manager",
    approvedAt: "2026-09-14T16:00:00.000Z",
    ...patch,
  };
}

function applyProductionPlan(operations: ProjectOperations) {
  operations.production = {
    ...operations.production,
    procurementUnlocked: true,
    procurementUnlockedAt: "2026-08-30T15:00:00.000Z",
    procurementUnlockedBy: "Procurement Lead",
    productionStartAuthorized: true,
    productionStartAuthorizedAt: "2026-08-31T15:00:00.000Z",
    productionStartAuthorizedBy: "CRO",
    mpsRevision: "MPS-R04",
    factoryWeeklyCapacityHours: 1_000,
    committedWeeklyCapacityHours: 800,
    activities: [
      {
        id: "frame-line",
        name: "Frame line",
        owner: "Factory Planner",
        predecessorIds: [],
        baselineStart: "2026-09-01",
        baselineFinish: "2026-09-05",
        forecastStart: "2026-09-01",
        forecastFinish: "2026-09-05",
        actualStart: "",
        actualFinish: "",
        percentComplete: 0,
        capacityHours: 500,
        requiredHours: 420,
        critical: true,
        status: "Ready",
      },
      {
        id: "finish-line",
        name: "Finish line",
        owner: "Factory Planner",
        predecessorIds: ["frame-line"],
        baselineStart: "2026-09-06",
        baselineFinish: "2026-09-10",
        forecastStart: "2026-09-06",
        forecastFinish: "2026-09-10",
        actualStart: "",
        actualFinish: "",
        percentComplete: 0,
        capacityHours: 500,
        requiredHours: 380,
        critical: true,
        status: "Not Started",
      },
    ],
    blockers: [],
  };
}

test.describe("Gate 1 qualification and paid commercial release", () => {
  test("ships exactly ten explicit Yes/No questions and requires Yes plus evidence for each", () => {
    const operations = freshOperations();
    expect(operations.qualification).toHaveLength(10);
    expect(operations.qualification.map((question) => question.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(new Set(operations.qualification.map((question) => question.id)).size).toBe(10);
    expect(operations.qualification.every((question) => question.gateRequired)).toBe(true);

    answerAllQualificationQuestions(operations);
    applyClassifiedPath(operations);
    applyPaidCommercialEvidence(operations);
    expect(evaluateGateOne(operations).passed).toBe(true);

    operations.qualification[7].answer = "No";
    expect(evaluateGateOne(operations)).toEqual(
      expect.objectContaining({
        passed: false,
        checks: expect.arrayContaining([
          expect.objectContaining({ id: "qualification", passed: false }),
        ]),
      }),
    );

    operations.qualification[7].answer = "Yes";
    operations.qualification[7].evidence = "";
    expect(evaluateGateOne(operations).passed).toBe(false);
  });

  test("cannot pass when one of the ten controlled questions is absent", () => {
    const operations = gateOneReadyOperations();
    operations.qualification = operations.qualification.slice(0, 9);
    const qualification = evaluateGateOne(operations).checks.find(
      (check) => check.id === "qualification",
    );
    expect(qualification?.passed).toBe(false);
    expect(qualification?.reason).toContain("10");
  });

  test("uses a 25/25/25/25 plan totaling 100 percent", () => {
    const operations = freshOperations();
    expect(operations.commercial.paymentPlan.map((milestone) => milestone.percent)).toEqual([
      25, 25, 25, 25,
    ]);
    expect(
      operations.commercial.paymentPlan.reduce(
        (sum, milestone) => sum + milestone.percent,
        0,
      ),
    ).toBe(100);

    operations.commercial.contractValue = 123_456.78;
    expect(paymentMilestoneAmount(operations, operations.commercial.paymentPlan[0])).toBe(
      30_864.2,
    );
  });

  test("blocks an invalid plan, a missing invoice, a short deposit, and missing receipt proof", () => {
    const operations = freshOperations();
    operations.commercial.agreementStatus = "Executed";
    operations.commercial.agreementReference = "AGR-0042";
    operations.commercial.executedDate = "2026-08-28";
    operations.commercial.contractValue = 100_000;

    operations.commercial.paymentPlan[3].percent = 20;
    expect(evaluatePaymentRelease(operations).reasons).toContain(
      "Payment milestone percentages must total 100%.",
    );

    operations.commercial.paymentPlan[3].percent = 25;
    operations.commercial.paymentPlan[0].invoiceId = "missing-invoice";
    expect(evaluatePaymentRelease(operations).reasons).toContain(
      "A released deposit invoice is required.",
    );

    applyPaidCommercialEvidence(operations, { released: false });
    operations.commercial.receipts[0].amount = 20_000;
    expect(evaluatePaymentRelease(operations).reasons.join(" ")).toContain(
      "short by 5000 CAD",
    );

    operations.commercial.receipts[0].amount = 25_000;
    operations.commercial.receipts[0].verifiedBy = "";
    expect(evaluatePaymentRelease(operations).reasons).toContain(
      "Verified deposit receipt evidence is missing.",
    );
  });

  test("requires controlled invoice evidence as well as a verified receipt", () => {
    const operations = freshOperations();
    applyPaidCommercialEvidence(operations, {
      released: false,
      invoiceEvidence: false,
    });
    const result = evaluatePaymentRelease(operations);
    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ").toLowerCase()).toContain("invoice evidence");
  });

  test("sums receipt evidence by invoice and requires an explicit Payment Release decision", () => {
    const operations = freshOperations();
    applyPaidCommercialEvidence(operations, { released: false });
    operations.commercial.receipts = [
      { ...operations.commercial.receipts[0], id: "receipt-a", amount: 10_000 },
      { ...operations.commercial.receipts[0], id: "receipt-b", amount: 15_000 },
      {
        ...operations.commercial.receipts[0],
        id: "receipt-other",
        invoiceId: "another-invoice",
        amount: 99_999,
      },
    ];
    expect(invoicePaidAmount(operations, "invoice-deposit")).toBe(25_000);
    expect(evaluatePaymentRelease(operations).ready).toBe(true);

    const gate = operationsGateStatus("payment-release", operations);
    expect(gate.ready).toBe(false);
    expect(gate.blockers.join(" ").toLowerCase()).toContain("payment release");

    operations.commercial.paymentRelease.status = "Released";
    operations.commercial.paymentRelease.releasedAt = "2026-08-30T10:00:00.000Z";
    operations.commercial.paymentRelease.releasedBy = "Finance Controller";
    operations.commercial.paymentRelease.approverRole = "Finance";
    operations.commercial.paymentRelease.evidence = "Controlled release record";
    expect(operationsGateStatus("payment-release", operations).ready).toBe(true);
  });
});

test.describe("approval authority and threshold control", () => {
  test("allows only CEO or CRO to approve an LOI and enforces that approval at Gate 1", () => {
    const operations = gateOneReadyOperations();
    operations.clientPath.clientType = "Special LOI";
    operations.commercial.engagementType = "LOI";

    expect(requiredApprovalRole(operations, approvalRequest({ kind: "LOI" }))).toBe("CRO");
    expect(roleCanApprove("Project Manager", "CRO", "LOI")).toBe(false);
    expect(roleCanApprove("Finance", "CRO", "LOI")).toBe(false);
    expect(roleCanApprove("CRO", "CRO", "LOI")).toBe(true);
    expect(roleCanApprove("CEO", "CRO", "LOI")).toBe(true);
    expect(evaluateGateOne(operations).passed).toBe(false);

    operations.approvals.requests.push(
      approvalRequest({
        kind: "LOI",
        requiredRole: "CRO",
        status: "Approved",
        decidedBy: "Chief Executive",
        decidedByRole: "CEO",
        decidedAt: "2026-08-30T14:00:00.000Z",
      }),
    );
    expect(evaluateGateOne(operations).passed).toBe(true);
  });

  test("escalates Change requests at CRO and CEO percentage thresholds", () => {
    const operations = freshOperations();
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Change", contractPercent: 4.99 }),
      ),
    ).toBe("Project Manager");
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Change", contractPercent: 5 }),
      ),
    ).toBe("CRO");
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Change", contractPercent: 10 }),
      ),
    ).toBe("CEO");
  });

  test("escalates individual and cumulative Credits at the configured thresholds", () => {
    const operations = freshOperations();
    operations.commercial.contractValue = 1_000_000;
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Credit", amount: 4_999, cumulativeCreditAmount: 4_999 }),
      ),
    ).toBe("Finance");
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Credit", amount: 5_000, cumulativeCreditAmount: 5_000 }),
      ),
    ).toBe("CRO");
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Credit", amount: 25_000, cumulativeCreditAmount: 25_000 }),
      ),
    ).toBe("CEO");
    expect(
      requiredApprovalRole(
        operations,
        approvalRequest({ kind: "Credit", amount: 1_000, cumulativeCreditAmount: 20_000 }),
      ),
    ).toBe("CEO");
  });
});

test.describe("client classification and controlled numbering", () => {
  test("classifies stable inputs into P1 through P5 and Special LOI fixed paths", () => {
    const cases: Array<{
      expected: ProjectOperations["clientPath"]["clientType"];
      patch: Partial<ProjectOperations["clientPath"]>;
      subGate: string;
    }> = [
      {
        expected: "P1",
        patch: { designMaturity: "IFC", siteMaturity: "Ready", fundingMaturity: "Secured" },
        subGate: "Production capacity reservation",
      },
      {
        expected: "P2",
        patch: { designMaturity: "Permit", siteMaturity: "Controlled", fundingMaturity: "In Process" },
        subGate: "Responsibility matrix",
      },
      {
        expected: "P3",
        patch: { designMaturity: "Preliminary", siteMaturity: "Controlled" },
        subGate: "D to C convergence",
      },
      {
        expected: "P4",
        patch: { designMaturity: "Concept", siteMaturity: "Candidate" },
        subGate: "Consultation scope",
      },
      {
        expected: "P5",
        patch: { designMaturity: "None", siteMaturity: "No Site", fundingMaturity: "Unknown" },
        subGate: "Client pre-qualification",
      },
      {
        expected: "Special LOI",
        patch: {
          clientType: "Special LOI",
          relationship: "Strategic",
          designMaturity: "Concept",
        },
        subGate: "Executive LOI approval",
      },
    ];

    for (const { expected, patch, subGate } of cases) {
      const operations = freshOperations();
      operations.clientPath = { ...operations.clientPath, ...patch };
      const result = classifyClientPath(operations);
      expect(result.type, JSON.stringify(patch)).toBe(expected);
      expect(result.subGates, expected).toContain(subGate);
      expect(result.reason.length, expected).toBeGreaterThan(20);
    }
  });

  test("keeps Client/Lead identity before G1 and allocates Development → Project → Building → Module after G1", () => {
    const blocked = freshOperations();
    expect(blocked.identity.projectNumber).toBe("");
    expect(blocked.identity.clientId).toMatch(/^CL-26-\d{4}$/);
    expect(blocked.identity.leadId).toMatch(/^LD-26-\d{4}$/);
    expect(() =>
      convertClientToProject(blocked, 7, "Project Manager", "G1-DECISION", 2, 3, FIXED_NOW),
    ).toThrow(/Gate 1 is not released/);

    const operations = gateOneReadyOperations();
    const converted = convertClientToProject(
      operations,
      7,
      "Project Manager",
      "G1-DECISION",
      2,
      3,
      FIXED_NOW,
    );
    expect(converted.identity.clientId).toBe(operations.identity.clientId);
    expect(converted.identity.developmentNumber).toBe("D-26-007");
    expect(converted.identity.projectNumber).toBe("P-26-007");
    expect(converted.identity.legacyJobNumber).toBe("26007");
    expect(converted.identity.conversionGateDecisionId).toBe("G1-DECISION");
    expect(converted.identity.buildings.map((building) => building.buildingNumber)).toEqual([
      "P-26-007-B01",
      "P-26-007-B02",
    ]);
    expect(
      converted.identity.buildings.flatMap((building) =>
        building.modules.map((module) => module.moduleNumber),
      ),
    ).toEqual([
      "P-26-007-B01-M001",
      "P-26-007-B01-M002",
      "P-26-007-B01-M003",
      "P-26-007-B02-M001",
      "P-26-007-B02-M002",
      "P-26-007-B02-M003",
    ]);
    expect(converted.identity.numberHistory.map((record) => record.level)).toEqual(
      expect.arrayContaining(["Client", "Development", "Project", "Building", "Module"]),
    );
    expect(() =>
      convertClientToProject(converted, 8, "Project Manager", "G1-SECOND", 1, 1, FIXED_NOW),
    ).toThrow(/already has an active project number/);
  });
});

test.describe("Class D calculator and D/C/B/A maturity", () => {
  test("calculates Class D from area factor, openings, roof, assemblies, waste, and adjustment factors", () => {
    const operations = freshOperations();
    operations.estimating.inputs = {
      storeys: 4,
      grossSquareFeet: 1_000,
      fixedFactorPerSquareFoot: 100,
      windowCount: 10,
      windowUnitRate: 500,
      exteriorDoorCount: 2,
      exteriorDoorUnitRate: 1_000,
      roofSquareFeet: 500,
      roofRate: 20,
      complexityFactor: 1.1,
      locationFactor: 1.05,
    };
    operations.estimating.assemblies = [
      {
        id: "assembly-wall",
        assembly: "Exterior wall",
        masterFormat: "07 42 00",
        unit: "sq.ft.",
        quantity: 100,
        rate: 10,
        wastePercent: 10,
        included: true,
      },
      {
        id: "assembly-excluded",
        assembly: "Excluded option",
        masterFormat: "12 00 00",
        unit: "allowance",
        quantity: 1,
        rate: 999_999,
        wastePercent: 0,
        included: false,
      },
    ];
    expect(calculateClassD(operations)).toBe(136_405.5);
  });

  test("creates distinct class versions with controlled basis, ranges, and per-class version numbers", () => {
    const operations = freshOperations();
    const expected = {
      D: { basis: "Concept", low: -30, high: 50, contingency: 20 },
      C: { basis: "Preliminary", low: -20, high: 30, contingency: 15 },
      B: { basis: "Permit", low: -10, high: 15, contingency: 10 },
      A: { basis: "IFC", low: -5, high: 10, contingency: 5 },
    } as const;
    for (const estimateClass of ["D", "C", "B", "A"] as const) {
      const version = createEstimateVersion(
        operations,
        estimateClass,
        1_234_567.891,
        "Estimator",
        `REV-${estimateClass}`,
        FIXED_NOW,
      );
      expect(version.id).toMatch(new RegExp(`^estimate-${estimateClass.toLowerCase()}-`));
      expect(version.version).toBe(1);
      expect(version.amount).toBe(1_234_567.89);
      expect(version.basisStage).toBe(expected[estimateClass].basis);
      expect(version.accuracyRangeLowPercent).toBe(expected[estimateClass].low);
      expect(version.accuracyRangeHighPercent).toBe(expected[estimateClass].high);
      expect(version.contingencyPercent).toBe(expected[estimateClass].contingency);
      expect(version.createdAt).toBe(FIXED_NOW.toISOString());
      operations.estimating.versions.push(version);
    }
    const secondClassD = createEstimateVersion(
      operations,
      "D",
      1_300_000,
      "Estimator",
      "REV-D2",
      FIXED_NOW,
    );
    expect(secondClassD.version).toBe(2);
  });

  test("requires approved sequential versions and completed convergence evidence", () => {
    const operations = freshOperations();
    approveEstimateClasses(operations, "C");
    expect(estimateMaturityReady(operations, "C")).toEqual({ ready: true, missing: [] });
    expect(estimateMaturityReady(operations, "B")).toEqual(
      expect.objectContaining({
        ready: false,
        missing: expect.arrayContaining(["Approved Class B version"]),
      }),
    );

    operations.estimating.convergenceTasks[0].evidence = "";
    expect(estimateMaturityReady(operations, "C").missing).toContain(
      "D→C convergence evidence",
    );

    const mature = freshOperations();
    approveEstimateClasses(mature, "A");
    expect(estimateMaturityReady(mature, "A")).toEqual({ ready: true, missing: [] });
  });
});

test.describe("design boundary, site gates, purchasing, and production capacity", () => {
  test("does not treat client-design consultation as ProFab design authority", () => {
    const operations = freshOperations();
    applyAcceptedDesignBoundary(operations);
    expect(designBoundaryReady(operations)).toBe(true);

    operations.designBoundary.architectOfRecord = "";
    expect(designBoundaryReady(operations)).toBe(false);

    operations.designBoundary.architectOfRecord = "Client Architect Inc.";
    operations.designBoundary.clientConsultantScope = "";
    expect(designBoundaryReady(operations)).toBe(false);
  });

  test("requires evidence and authorization for every secondary gate, including N/A disposition", () => {
    const operations = freshOperations();
    const foundation = operations.siteReadiness.gates.find(
      (gate) => gate.id === "foundation",
    )!;
    expect(secondaryGateReady(foundation)).toBe(false);
    expect(secondaryGateReady(passedSecondaryGate(foundation))).toBe(true);
    expect(
      secondaryGateReady(
        passedSecondaryGate(foundation, { evidenceReferences: [""] }),
      ),
    ).toBe(false);
    expect(
      secondaryGateReady({
        ...foundation,
        status: "Not Applicable",
        naReason: "No separate foundation scope in this delivery model",
        approvedBy: "Technical Director",
      }),
    ).toBe(true);
    expect(
      secondaryGateReady({
        ...foundation,
        status: "Not Applicable",
        naReason: "",
        approvedBy: "Technical Director",
      }),
    ).toBe(false);
  });

  test("unlocks purchasing only after Class C, accepted boundary, and payment release", () => {
    const operations = freshOperations();
    approveEstimateClasses(operations, "C");
    applyAcceptedDesignBoundary(operations);
    expect(procurementUnlockReady(operations)).toEqual(
      expect.objectContaining({ ready: false, blockers: expect.arrayContaining(["Payment release"]) }),
    );
    operations.commercial.paymentRelease.status = "Released";
    expect(procurementUnlockReady(operations)).toEqual({ ready: true, blockers: [] });
  });

  test("blocks overcommitted factory capacity, activity capacity, and broken dependencies", () => {
    const operations = freshOperations();
    approveEstimateClasses(operations, "B");
    applyAcceptedDesignBoundary(operations);
    applyProductionPlan(operations);
    expect(productionReadiness(operations)).toEqual({ ready: true, blockers: [] });

    operations.production.committedWeeklyCapacityHours = 1_001;
    operations.production.activities[0].requiredHours = 501;
    operations.production.activities[1].predecessorIds = ["missing-activity"];
    const blocked = productionReadiness(operations);
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers).toEqual(
      expect.arrayContaining([
        "Committed factory hours exceed weekly capacity.",
        "Frame line exceeds assigned capacity.",
        "Finish line has an unknown predecessor.",
      ]),
    );
  });

  test("does not release the G3 production gate before purchasing and production-start authorization", () => {
    const operations = freshOperations();
    approveEstimateClasses(operations, "B");
    applyAcceptedDesignBoundary(operations);
    applyProductionPlan(operations);
    operations.production.procurementUnlocked = false;
    operations.production.productionStartAuthorized = false;

    expect(operationsGateStatus("production-readiness", operations).ready).toBe(true);
    const gate = operationsGateStatus("gate-g3-production-authorization", operations);
    expect(gate.ready).toBe(false);
    expect(gate.blockers.join(" ").toLowerCase()).toContain("procurement");
    expect(gate.blockers.join(" ").toLowerCase()).toContain("production start");

    operations.production.procurementUnlocked = true;
    operations.production.productionStartAuthorized = true;
    expect(operationsGateStatus("gate-g3-production-authorization", operations).ready).toBe(true);
  });
});

test.describe("Warranty Day 0 and 30/60/90 follow-up control", () => {
  test("starts a variable warranty term and schedules deterministic 30/60/90 follow-ups", () => {
    const operations = freshOperations();
    const scheduled = scheduleWarranty(
      operations,
      "2026-01-15",
      18,
      "Warranty Coordinator",
      "Signed completion certificate",
    );
    expect(scheduled.identity.lifecycleState).toBe("Warranty");
    expect(scheduled.warranty.expiryDate).toBe("2027-07-15");
    expect(scheduled.warranty.followUps.map((followUp) => followUp.offsetDays)).toEqual([
      30, 60, 90,
    ]);
    expect(scheduled.warranty.followUps.map((followUp) => followUp.dueDate)).toEqual([
      "2026-02-14",
      "2026-03-16",
      "2026-04-15",
    ]);
    expect(
      scheduled.warranty.followUps.every(
        (followUp) =>
          followUp.owner === "Warranty Coordinator" &&
          followUp.escalationOwner === "Project Manager",
      ),
    ).toBe(true);
  });

  test("moves follow-ups from Scheduled to Due, Overdue, and Complete using an injected clock", () => {
    expect(
      warrantyFollowUpStatus(
        "2026-09-30",
        "",
        new Date("2026-09-20T12:00:00.000Z"),
      ),
    ).toBe("Scheduled");
    expect(
      warrantyFollowUpStatus(
        "2026-09-30",
        "",
        new Date("2026-09-24T12:00:00.000Z"),
      ),
    ).toBe("Due");
    expect(
      warrantyFollowUpStatus(
        "2026-09-30",
        "",
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toBe("Overdue");
    expect(
      warrantyFollowUpStatus(
        "2026-09-30",
        "2026-09-28T15:00:00.000Z",
        new Date("2026-10-01T00:00:00.000Z"),
      ),
    ).toBe("Complete");
  });

  test("holds completion until civil/foundation/utilities/site/pre-delivery and Day 0 evidence are ready", () => {
    const operations = freshOperations();
    let status = operationsGateStatus("delivery-project-completion", operations);
    expect(status.ready).toBe(false);
    expect(status.blockers).toEqual(
      expect.arrayContaining([
        "Civil design and site works readiness",
        "Foundation readiness",
        "Utility responsibility and connection readiness",
        "Site access, crane, laydown, and safety readiness",
        "Pre-delivery site check",
        "Warranty Day 0 trigger evidence",
      ]),
    );

    operations.siteReadiness.gates = operations.siteReadiness.gates.map((gate) =>
      passedSecondaryGate(gate),
    );
    operations.warranty.dayZeroDate = "2026-10-01";
    operations.warranty.triggerEvidence = "Signed completion certificate";
    status = operationsGateStatus("delivery-project-completion", operations);
    expect(status).toEqual({ ready: true, blockers: [] });
  });
});

test.describe("ICS time, weekly reporting, MasterFormat/GPF, and Stitch List", () => {
  test("imports ICS events with stable durations and computes warning/critical budget levels", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:event-1",
      "DTSTART:20260824T090000Z",
      "DTEND:20260824T103000Z",
      "SUMMARY:Design coordination",
      "DESCRIPTION:Permit and modular review",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:event-2",
      "DTSTART;TZID=America/Toronto:20260826T130000",
      "DTEND;TZID=America/Toronto:20260826T150000",
      "SUMMARY:Client workshop",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:event-without-duration",
      "DTSTART:20260827T090000Z",
      "SUMMARY:Ignored open event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const entries = parseIcsTimeEntries(
      ics,
      "Taylor Planner",
      "P-26-007",
      "calendar-2026-w35.ics",
    );
    expect(entries).toHaveLength(2);
    expect(entries.map(({ date, activity, hours, source, projectNumber }) => ({
      date,
      activity,
      hours,
      source,
      projectNumber,
    }))).toEqual([
      {
        date: "2026-08-24",
        activity: "Design coordination",
        hours: 1.5,
        source: "ICS",
        projectNumber: "P-26-007",
      },
      {
        date: "2026-08-26",
        activity: "Client workshop",
        hours: 2,
        source: "ICS",
        projectNumber: "P-26-007",
      },
    ]);
    expect(entries.every((entry) => /^time-ics-/.test(entry.id))).toBe(true);

    const operations = freshOperations();
    operations.timeBudget.budgetHours = 4;
    operations.timeBudget.warningThresholdPercent = 80;
    operations.timeBudget.criticalThresholdPercent = 100;
    operations.timeBudget.entries = entries;
    expect(timeBudgetStatus(operations)).toEqual({
      usedHours: 3.5,
      percent: 87.5,
      level: "Warning",
    });
    operations.timeBudget.entries.push({ ...entries[0], id: "manual-extra", hours: 0.5 });
    expect(timeBudgetStatus(operations).level).toBe("Critical");
  });

  test("weekly report includes all seven calendar days, including the first day", () => {
    const operations = freshOperations();
    operations.identity.projectNumber = "P-26-007";
    operations.timeBudget.budgetHours = 40;
    operations.timeBudget.entries = [
      {
        id: "monday-entry",
        user: "Taylor Planner",
        date: "2026-08-24",
        projectNumber: "P-26-007",
        activity: "Monday planning",
        hours: 2,
        billable: true,
        source: "Manual",
        sourceReference: "TIMESHEET-35",
        notes: "",
      },
      {
        id: "sunday-entry",
        user: "Taylor Planner",
        date: "2026-08-30",
        projectNumber: "P-26-007",
        activity: "Sunday close",
        hours: 1,
        billable: true,
        source: "Manual",
        sourceReference: "TIMESHEET-35",
        notes: "",
      },
      {
        id: "prior-sunday-entry",
        user: "Taylor Planner",
        date: "2026-08-23",
        projectNumber: "P-26-007",
        activity: "Prior week",
        hours: 8,
        billable: true,
        source: "Manual",
        sourceReference: "TIMESHEET-34",
        notes: "",
      },
    ];
    const report = buildWeeklyReport(operations, "2026-08-30");
    expect(report).toContain("Recorded time: 3h");
    expect(report).toContain("Taylor Planner: 3h");
    expect(report).not.toContain("11h");
  });

  test("validates GPF names and produces a deterministic MasterFormat/CNMS Stitch List", () => {
    const operations = freshOperations();
    expect(validateGpfName(operations, "ARCH-0042-WALL01")).toBe(true);
    expect(validateGpfName(operations, "arch 42 wall")).toBe(false);

    const base = {
      discipline: "Architectural" as const,
      designOwner: "Architect",
      procurementOwner: "Purchasing",
      productionOwner: "Factory",
      installOwner: "Site Contractor",
      status: "Approved" as const,
    };
    const objects: BimObjectResponsibility[] = [
      {
        ...base,
        id: "object-window",
        objectName: "Window",
        masterFormatCode: "08 50 00",
        cnmsCode: "CNMS-WIN",
        gpfName: "ARCH-0042-WIN01",
        modelReference: "revit://model/window-01",
        navisworksSet: "SET-WINDOWS",
        stitchSequence: 20,
      },
      {
        ...base,
        id: "object-door",
        objectName: "Door",
        masterFormatCode: "08 10 00",
        cnmsCode: "CNMS-DOOR",
        gpfName: "ARCH-0042-DOOR01",
        modelReference: "revit://model/door-01",
        navisworksSet: "SET-DOORS",
        stitchSequence: 10,
      },
      {
        ...base,
        id: "object-canopy",
        objectName: "Canopy",
        masterFormatCode: "05 50 00",
        cnmsCode: "CNMS-CAN",
        gpfName: "ARCH-0042-CAN01",
        modelReference: "revit://model/canopy-01",
        navisworksSet: "SET-CANOPY",
        stitchSequence: 10,
      },
    ];
    const stitch = buildStitchList(objects);
    expect(stitch.map((row) => [row.sequence, row.gpfName])).toEqual([
      [1, "ARCH-0042-CAN01"],
      [2, "ARCH-0042-DOOR01"],
      [3, "ARCH-0042-WIN01"],
    ]);
    expect(stitch[0]).toEqual(
      expect.objectContaining({
        masterFormatCode: "05 50 00",
        cnmsCode: "CNMS-CAN",
        modelReference: "revit://model/canopy-01",
        navisworksSet: "SET-CANOPY",
        owner: "Factory",
      }),
    );

    operations.bim.gpfPattern = "[";
    expect(validateGpfName(operations, "ARCH-0042-WALL01")).toBe(false);
  });
});

test.describe("L1/L2 operational gate and store wiring", () => {
  test("lets a Client/Lead ID satisfy Project Start before a project number exists", () => {
    const file = createProjectWorkflow("Pre-G1 lead");
    const projectStart = file.graph.nodes.find((node) => node.id === "project-start")!;
    expect(file.operations?.identity.clientId).toBeTruthy();
    expect(file.operations?.identity.projectNumber).toBe("");
    expect(
      nodeReleaseReady(
        projectStart,
        projectStart,
        file.execution?.items,
        file.operations,
      ),
    ).toBe(true);

    const progress = getWorkflowProgress(
      file.graph.nodes,
      file.graph.edges,
      file.execution?.items,
      file.operations,
    );
    expect(progress.reachedNodeIds.has("gate-g1-qualified")).toBe(true);
  });

  test("propagates operations blocking through the linked L2 gate and its L1 status", () => {
    const lifecycle = createDefaultDetailedLifecycle();
    const projectStart = lifecycle.graph.nodes.find((node) => node.id === "project-start")!;
    const gate = lifecycle.graph.nodes.find((node) => node.id === "gate-g1-qualified")!;
    const checklistCompleteGate = {
      ...gate,
      conditions: gate.conditions.map((condition) => ({
        ...condition,
        linkedExecutionItemId: undefined,
        checked: true,
      })),
    };
    const linkedL1 = lifecycle.highLevel.graph.nodes.find(
      (node) => node.id === "high-level-3",
    )!;
    expect(linkedL1.linkedLayer2NodeIds).toEqual([
      "gate-g1-qualified",
    ]);

    const blockedOperations = freshOperations();
    expect(
      nodeReleaseReady(checklistCompleteGate, projectStart, [], blockedOperations),
    ).toBe(false);
    expect(
      nodeStatusLabel(checklistCompleteGate, projectStart, [], blockedOperations),
    ).not.toBe("Ready");

    const readyOperations = gateOneReadyOperations();
    expect(nodeReleaseReady(checklistCompleteGate, projectStart, [], readyOperations)).toBe(
      true,
    );
    expect(nodeStatusLabel(checklistCompleteGate, projectStart, [], readyOperations)).toBe(
      "Ready",
    );
  });

  test("store enforces payment authority, records release approval, and mirrors conversion identity into Project Start", () => {
    const file = createProjectWorkflow("Store integration fixture");
    const operations = gateOneReadyOperations();
    operations.commercial.paymentRelease = {
      ...operations.commercial.paymentRelease,
      status: "Ready",
      releasedAt: "",
      releasedBy: "",
      approverRole: "",
      evidence: "Verified invoice and receipt package",
    };
    file.operations = operations;
    useWorkflowStore.setState({ file, past: [], future: [], dirty: false });

    expect(
      useWorkflowStore.getState().releasePaymentGate("Project Manager", "Project Manager"),
    ).toContain("not authorized");
    expect(useWorkflowStore.getState().file.operations?.commercial.paymentRelease.status).toBe(
      "Ready",
    );

    expect(
      useWorkflowStore.getState().releasePaymentGate("Finance Controller", "Finance"),
    ).toBeUndefined();
    const released = useWorkflowStore.getState().file.operations!;
    expect(released.commercial.paymentRelease).toEqual(
      expect.objectContaining({
        status: "Released",
        releasedBy: "Finance Controller",
        approverRole: "Finance",
      }),
    );
    expect(released.commercial.paymentRelease.releasedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(released.approvals.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "Payment Release",
          status: "Approved",
          decidedByRole: "Finance",
        }),
      ]),
    );

    const projectNumber = useWorkflowStore.getState().convertClientRecord({
      sequence: 42,
      actor: "Project Manager",
      gateDecisionId: "G1-STORE-0042",
      buildingCount: 1,
      modulesPerBuilding: 2,
    });
    expect(projectNumber).toMatch(/^P-\d{2}-042$/);
    const convertedFile = useWorkflowStore.getState().file;
    const start = convertedFile.graph.nodes.find((node) => node.id === "project-start")!;
    expect(start.customFields.projectId).toBe(projectNumber);
    expect(start.customFields.clientId).toBe(operations.identity.clientId);
    expect(convertedFile.operations?.identity.projectNumber).toBe(projectNumber);
    expect(convertedFile.operations?.identity.buildings[0].modules).toHaveLength(2);
  });

  test("store classification, Class D recalculation, and Warranty Day 0 update their linked operations", () => {
    const file = createProjectWorkflow("Store operations fixture");
    const operations = freshOperations();
    operations.clientPath.designMaturity = "IFC";
    operations.clientPath.siteMaturity = "Ready";
    operations.clientPath.fundingMaturity = "Secured";
    operations.estimating.inputs.grossSquareFeet = 10_000;
    operations.estimating.inputs.fixedFactorPerSquareFoot = 250;
    file.operations = operations;
    useWorkflowStore.setState({ file, past: [], future: [], dirty: false });

    useWorkflowStore.getState().classifyOperationsClient("Coordinator");
    expect(useWorkflowStore.getState().file.operations?.clientPath).toEqual(
      expect.objectContaining({
        clientType: "P1",
        classifiedBy: "Coordinator",
        selectedSubGates: expect.arrayContaining(["Production capacity reservation"]),
      }),
    );

    expect(useWorkflowStore.getState().recalculateClassD("Estimator", "CONCEPT-R03")).toBe(
      2_500_000,
    );
    expect(useWorkflowStore.getState().file.operations?.estimating).toEqual(
      expect.objectContaining({
        calculatedClassDAmount: 2_500_000,
        versions: expect.arrayContaining([
          expect.objectContaining({
            estimateClass: "D",
            version: 1,
            sourceRevision: "CONCEPT-R03",
          }),
        ]),
      }),
    );

    expect(
      useWorkflowStore.getState().startWarranty({
        dayZeroDate: "2026-10-01",
        durationMonths: 24,
        owner: "Warranty Coordinator",
        triggerEvidence: "Completion certificate CC-0042",
        actor: "Project Manager",
      }),
    ).toBeUndefined();
    expect(useWorkflowStore.getState().file.operations?.warranty).toEqual(
      expect.objectContaining({
        dayZeroDate: "2026-10-01",
        expiryDate: "2028-10-01",
        owner: "Warranty Coordinator",
        followUps: expect.arrayContaining([
          expect.objectContaining({ offsetDays: 30, dueDate: "2026-10-31" }),
          expect.objectContaining({ offsetDays: 60, dueDate: "2026-11-30" }),
          expect.objectContaining({ offsetDays: 90, dueDate: "2026-12-30" }),
        ]),
      }),
    );
    expect(useWorkflowStore.getState().file.operations?.identity.lifecycleState).toBe(
      "Warranty",
    );
  });
});
