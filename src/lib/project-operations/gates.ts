import type {
  ApprovalRole,
  EstimateClass,
  EstimateVersion,
  ProjectOperations,
  SecondaryGate,
} from "@/types/project-operations";
import {
  APPROVAL_RANK,
  ESTIMATE_METADATA,
  ESTIMATE_ORDER,
  clone,
  newId,
  number,
  round2,
  text,
  type GateCheck,
  type GateStatus,
} from "./shared";
import { canonicalProjectNumber, yearSuffix } from "./defaults";
import { appendOperationsAudit, evaluatePaymentRelease } from "./finance";

/** Gate One, client-to-project conversion, estimates and the readiness of every operations gate. */
function loiApprovalReady(operations: ProjectOperations) {
  if (
    text(operations.clientPath.clientType).toLowerCase() !== "special loi" &&
    text(operations.commercial.engagementType).toLowerCase() !== "loi"
  ) {
    return true;
  }
  return (operations.approvals.requests || []).some(
    (request) =>
      text(request.kind).toLowerCase() === "loi" &&
      request.status === "Approved" &&
      Boolean(request.decidedByRole) &&
      roleCanApprove(request.decidedByRole as ApprovalRole, "CRO", "LOI"),
  );
}

export function evaluateGateOne(operations: ProjectOperations) {
  const qualification = operations.qualification || [];
  const qualificationPassed =
    qualification.length === 10 &&
    qualification.every(
      (question) =>
        question.gateRequired === false ||
        (question.answer === "Yes" && Boolean(text(question.evidence))),
    );
  const classification = operations.clientPath || ({} as ProjectOperations["clientPath"]);
  const classificationPassed =
    Boolean(text(classification.clientType)) &&
    text(classification.clientType).toLowerCase() !== "unclassified" &&
    (classification.selectedSubGates || []).some((gate) => text(gate));
  const commercial = operations.commercial;
  const commercialPassed =
    text(commercial.engagementType) !== "" &&
    text(commercial.agreementStatus).toLowerCase() === "executed" &&
    Boolean(text(commercial.agreementReference)) &&
    Boolean(text(commercial.executedDate));
  const payment = evaluatePaymentRelease(operations);
  const paymentPassed =
    payment.ready && text(commercial.paymentRelease.status).toLowerCase() === "released";
  const checks: GateCheck[] = [
    {
      id: "qualification",
      label: "Ten controlled qualification questions are answered Yes with evidence",
      passed: qualificationPassed,
      reason: qualificationPassed
        ? "All ten qualification questions are complete."
        : `Gate 1 requires all 10 qualification questions to be answered Yes with evidence. ${qualification.length}/10 are present.`,
    },
    {
      id: "classification",
      label: "Client pathway and sub-gates are classified",
      passed: classificationPassed,
      reason: classificationPassed
        ? "A controlled client pathway is assigned."
        : "Assign a controlled P1–P5 or Special LOI pathway and at least one sub-gate.",
    },
    {
      id: "commercial-engagement",
      label: "Bounded commercial engagement is executed",
      passed: commercialPassed,
      reason: commercialPassed
        ? "The commercial instrument is executed and referenced."
        : "Record an executed agreement or paid engagement with reference and date.",
    },
    {
      id: "payment-release",
      label: "Deposit invoice, verified receipt, and payment release are controlled",
      passed: paymentPassed,
      reason: paymentPassed
        ? "Deposit evidence and the explicit Payment Release decision are complete."
        : payment.reasons.join(" ") || "Payment Release must be explicitly released.",
    },
    {
      id: "loi-approval",
      label: "Special LOI route has CRO/CEO approval",
      passed: loiApprovalReady(operations),
      reason: loiApprovalReady(operations)
        ? "LOI approval is not required or has been authorized."
        : "Special LOI requires an approved request decided by CRO or CEO.",
    },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export function roleCanApprove(role: ApprovalRole, required: ApprovalRole, kind: string) {
  if (text(kind).toLowerCase() === "loi") return role === "CRO" || role === "CEO";
  if (required === "CEO") return role === "CEO";
  if (required === "CRO") return role === "CRO" || role === "CEO";
  return APPROVAL_RANK[role] >= APPROVAL_RANK[required];
}

export function convertClientToProject(
  operations: ProjectOperations,
  sequence: number,
  actor: string,
  gateDecisionId: string,
  buildingCount = 1,
  modulesPerBuilding = 0,
  now = new Date(),
) {
  if (canonicalProjectNumber(operations.identity.projectNumber)) {
    throw new Error("Client already has an active project number.");
  }
  if (!evaluateGateOne(operations).passed) {
    throw new Error(
      "Gate 1 is not released; complete qualification, commercial, payment, and approval evidence first.",
    );
  }
  const yy = yearSuffix(now);
  const normalizedSequence = Math.max(1, Math.min(999, Math.floor(number(sequence) || 0)));
  const sequenceText = String(normalizedSequence).padStart(3, "0");
  const projectNumber = `P-${yy}-${sequenceText}`;
  const developmentNumber = `D-${yy}-${sequenceText}`;
  const legacyJobNumber = `${yy}${sequenceText}`;
  const safeBuildingCount = Math.max(1, Math.floor(number(buildingCount) || 1));
  const safeModulesPerBuilding = Math.max(0, Math.floor(number(modulesPerBuilding) || 0));
  const buildings = Array.from({ length: safeBuildingCount }, (_, buildingIndex) => {
    const buildingNumber = `${projectNumber}-B${String(buildingIndex + 1).padStart(2, "0")}`;
    return {
      buildingNumber,
      modules: Array.from({ length: safeModulesPerBuilding }, (_, moduleIndex) => ({
        moduleNumber: `${buildingNumber}-M${String(moduleIndex + 1).padStart(3, "0")}`,
        status: "Planned",
      })),
    };
  });
  const history = Array.isArray(operations.identity.numberHistory)
    ? clone(operations.identity.numberHistory)
    : [];
  history.push(
    {
      level: "Development",
      number: developmentNumber,
      assignedAt: now.toISOString(),
      assignedBy: actor,
    },
    { level: "Project", number: projectNumber, assignedAt: now.toISOString(), assignedBy: actor },
    ...buildings.map((building) => ({
      level: "Building",
      number: building.buildingNumber,
      assignedAt: now.toISOString(),
      assignedBy: actor,
    })),
    ...buildings.flatMap((building) =>
      building.modules.map((module: { moduleNumber: string }) => ({
        level: "Module",
        number: module.moduleNumber,
        assignedAt: now.toISOString(),
        assignedBy: actor,
      })),
    ),
  );
  return appendOperationsAudit(
    {
      ...clone(operations),
      identity: {
        ...operations.identity,
        projectNumber,
        developmentNumber,
        legacyJobNumber,
        lifecycleState: "Project",
        convertedBy: actor,
        conversionGateDecisionId: gateDecisionId,
        buildings,
        numberHistory: history,
      },
    },
    {
      actor,
      action: "CONVERT_CLIENT_TO_PROJECT",
      entityType: "ProjectIdentity",
      entityId: projectNumber,
      summary: `Client ${operations.identity.clientId} converted through Gate 1 to ${projectNumber}.`,
      gateDecisionId,
    },
  );
}

export function createEstimateVersion(
  operations: ProjectOperations,
  estimateClass: string,
  amount: number,
  actor: string,
  sourceRevision: string,
  now = new Date(),
): EstimateVersion {
  const normalizedClass = text(estimateClass).toUpperCase() as EstimateClass;
  const metadata = ESTIMATE_METADATA[normalizedClass] || ESTIMATE_METADATA.D;
  const version =
    (operations.estimating.versions || [])
      .filter((item) => text(item.estimateClass).toUpperCase() === normalizedClass)
      .reduce((max, item) => Math.max(max, number(item.version)), 0) + 1;
  return {
    id: newId(`estimate-${normalizedClass.toLowerCase()}`),
    version,
    estimateClass: normalizedClass,
    amount: round2(amount),
    status: "Draft",
    createdBy: actor,
    sourceRevision,
    createdAt: now.toISOString(),
    basisStage: metadata.basis,
    accuracyRangeLowPercent: metadata.low,
    accuracyRangeHighPercent: metadata.high,
    contingencyPercent: metadata.contingency,
    assumptions: [],
  };
}

export function estimateMaturityReady(operations: ProjectOperations, estimateClass: EstimateClass) {
  const target = text(estimateClass).toUpperCase() as EstimateClass;
  const targetIndex = ESTIMATE_ORDER.indexOf(target);
  const missing: string[] = [];
  if (targetIndex < 0)
    return { ready: false, missing: [`Unknown estimate class ${estimateClass}.`] };
  for (const [index, currentClass] of ESTIMATE_ORDER.slice(0, targetIndex + 1).entries()) {
    const approved = (operations.estimating.versions || []).some(
      (version) =>
        text(version.estimateClass).toUpperCase() === currentClass && version.status === "Approved",
    );
    if (!approved) missing.push(`Approved Class ${currentClass} version`);
    if (index > 0) {
      const prior = ESTIMATE_ORDER[index - 1];
      const task = (operations.estimating.convergenceTasks || []).find(
        (item) => item.fromClass === prior && item.toClass === currentClass,
      );
      if (!task || task.status !== "Complete" || !text(task.evidence)) {
        missing.push(`${prior}→${currentClass} convergence evidence`);
      }
    }
  }
  return { ready: missing.length === 0, missing };
}

export function designBoundaryReady(operations: ProjectOperations) {
  const boundary = operations.designBoundary;
  return Boolean(
    boundary &&
    boundary.boundaryAccepted &&
    text(boundary.deliveryModel) !== "Unselected" &&
    text(boundary.architectOfRecord) &&
    text(boundary.profabScope) &&
    text(boundary.clientConsultantScope) &&
    text(boundary.exclusions) &&
    text(boundary.acceptedByClient) &&
    text(boundary.acceptedAt) &&
    text(boundary.agreementReference),
  );
}

export function secondaryGateReady(gate: SecondaryGate) {
  if (gate.status === "Not Applicable") {
    return Boolean(text(gate.naReason) && text(gate.approvedBy));
  }
  if (!["Passed", "Ready"].includes(gate.status)) return false;
  if (!text(gate.approvedBy)) return false;
  const requiredEvidence = gate.requiredEvidence || [];
  const evidence = gate.evidenceReferences || [];
  return requiredEvidence.every((_, index) => Boolean(text(evidence[index])));
}

export function procurementUnlockReady(operations: ProjectOperations): GateStatus {
  const blockers: string[] = [];
  if (!estimateMaturityReady(operations, "C").ready)
    blockers.push("Approved Class C estimate and convergence evidence");
  if (!designBoundaryReady(operations))
    blockers.push("Accepted design and responsibility boundary");
  if (text(operations.commercial.paymentRelease.status).toLowerCase() !== "released")
    blockers.push("Payment release");
  return { ready: blockers.length === 0, blockers };
}

export function productionReadiness(operations: ProjectOperations): GateStatus {
  const blockers: string[] = [];
  if (!estimateMaturityReady(operations, "B").ready)
    blockers.push("Approved Class B estimate and convergence evidence");
  if (!designBoundaryReady(operations))
    blockers.push("Accepted design and responsibility boundary");
  const capacity = number(operations.production.factoryWeeklyCapacityHours);
  const committed = number(operations.production.committedWeeklyCapacityHours);
  if (capacity > 0 && committed > capacity)
    blockers.push("Committed factory hours exceed weekly capacity.");
  const activities = operations.production.activities || [];
  const activityIds = new Set(activities.map((activity) => activity.id));
  for (const activity of activities) {
    if (
      number(activity.capacityHours) > 0 &&
      number(activity.requiredHours) > number(activity.capacityHours)
    ) {
      blockers.push(`${activity.name} exceeds assigned capacity.`);
    }
    if ((activity.predecessorIds || []).some((predecessorId) => !activityIds.has(predecessorId))) {
      blockers.push(`${activity.name} has an unknown predecessor.`);
    }
  }
  return { ready: blockers.length === 0, blockers };
}

function allSiteGatesReady(operations: ProjectOperations) {
  const blockers: string[] = [];
  for (const gate of operations.siteReadiness.gates || []) {
    if (!secondaryGateReady(gate)) blockers.push(gate.label);
  }
  return blockers;
}

function completionReadiness(operations: ProjectOperations) {
  const blockers = allSiteGatesReady(operations);
  if (!text(operations.warranty.dayZeroDate) || !text(operations.warranty.triggerEvidence)) {
    blockers.push("Warranty Day 0 trigger evidence");
  }
  return { ready: blockers.length === 0, blockers };
}

export function operationsGateStatus(gateId: string, operations: ProjectOperations): GateStatus {
  const id = text(gateId).toLowerCase();
  if (["gate-1", "gate-g1-qualified", "gate1", "qualification"].includes(id)) {
    const evaluation = evaluateGateOne(operations);
    return {
      ready: evaluation.passed,
      blockers: evaluation.checks.filter((check) => !check.passed).map((check) => check.reason),
    };
  }
  if (["payment-release", "commercial"].includes(id)) {
    const evaluation = evaluatePaymentRelease(operations);
    const blockers = evaluation.reasons.slice();
    if (text(operations.commercial.paymentRelease.status).toLowerCase() !== "released")
      blockers.push("Payment release decision is not released.");
    return { ready: blockers.length === 0, blockers };
  }
  if (["gate-g2-technical-commitment", "gate-g2", "technical-commitment"].includes(id)) {
    const blockers: string[] = [];
    if (!estimateMaturityReady(operations, "C").ready) blockers.push("Class C technical basis");
    if (!designBoundaryReady(operations))
      blockers.push("Accepted design and responsibility boundary");
    return { ready: blockers.length === 0, blockers };
  }
  if (["procurement", "procurement-unlock"].includes(id)) return procurementUnlockReady(operations);
  if (id === "production-readiness") return productionReadiness(operations);
  if (["gate-g3-production-authorization", "gate-g3", "production-authorization"].includes(id)) {
    const blockers = productionReadiness(operations).blockers.slice();
    if (!operations.production.procurementUnlocked) blockers.push("Procurement is not unlocked.");
    if (!operations.production.productionStartAuthorized)
      blockers.push("Production start authorization is missing.");
    return { ready: blockers.length === 0, blockers };
  }
  if (["gate-g4-factory-release", "gate-g4", "factory-release"].includes(id)) {
    const blockers: string[] = [];
    const activityBlockers = (operations.production.activities || [])
      .filter(
        (activity) =>
          number(activity.percentComplete) < 100 ||
          !["Complete", "Released"].includes(text(activity.status)),
      )
      .map((activity) => `${activity.name} factory completion`);
    blockers.push(...activityBlockers);
    if (!text(operations.production.factoryReleaseEvidence))
      blockers.push("Factory completion and release evidence");
    return { ready: blockers.length === 0, blockers };
  }
  if (["delivery-project-completion", "delivery-completion", "site-readiness"].includes(id)) {
    return completionReadiness(operations);
  }
  if (["gate-g5-warranty-start", "gate-g5", "warranty-start"].includes(id)) {
    const completion = completionReadiness(operations);
    const blockers = completion.blockers.slice();
    if (!text(operations.warranty.owner)) blockers.push("Warranty owner");
    if (!(number(operations.warranty.durationMonths) > 0)) blockers.push("Warranty duration");
    return { ready: blockers.length === 0, blockers };
  }
  if (["commissioning-warranty", "commissioning"].includes(id)) {
    const blockers: string[] = [];
    if (!text(operations.warranty.dayZeroDate) || !text(operations.warranty.triggerEvidence))
      blockers.push("Warranty Day 0 trigger evidence");
    const incomplete = (operations.warranty.followUps || []).filter(
      (followUp) => followUp.status !== "Complete",
    );
    if (incomplete.length) blockers.push("Warranty 30/60/90 follow-ups");
    return { ready: blockers.length === 0, blockers };
  }
  if (["close-out", "closeout", "final-close"].includes(id)) {
    const blockers: string[] = [];
    if ((operations.warranty.followUps || []).some((followUp) => followUp.status !== "Complete"))
      blockers.push("Warranty follow-ups");
    if (operations.identity.lifecycleState !== "Closed") blockers.push("Project closeout status");
    if (
      operations.spec &&
      Array.isArray(operations.spec.openObligations) &&
      operations.spec.openObligations.length
    )
      blockers.push("Outstanding project obligations");
    return { ready: blockers.length === 0, blockers };
  }
  return { ready: false, blockers: [`Unknown operations gate: ${gateId}.`] };
}
