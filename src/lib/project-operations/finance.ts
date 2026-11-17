import type {
  ApprovalRole,
  ApprovalRequest,
  PaymentMilestone,
  ProjectOperations,
} from "@/types/project-operations";
import { newId, number, round2, text } from "./shared";

/** Payments, invoices, Class D estimate, approvals, audit trail and client path. */
export function paymentMilestoneAmount(operations: ProjectOperations, milestone: PaymentMilestone) {
  return round2((number(operations.commercial.contractValue) * number(milestone.percent)) / 100);
}

export function invoicePaidAmount(operations: ProjectOperations, invoiceId: string) {
  return round2(
    (operations.commercial.receipts || [])
      .filter((receipt) => text(receipt.invoiceId) === text(invoiceId))
      .reduce((sum, receipt) => sum + number(receipt.amount), 0),
  );
}

export function calculateClassD(operations: ProjectOperations) {
  const inputs = operations.estimating?.inputs || {};
  const direct = number(inputs.total || inputs.baseCost || inputs.classD);
  if (direct > 0) return round2(direct);

  const area = number(inputs.grossSquareFeet ?? inputs.grossFloorArea ?? inputs.area);
  const fixedFactor = number(inputs.fixedFactorPerSquareFoot ?? inputs.costPerSqFt ?? inputs.rate);
  const windowCost = number(inputs.windowCount) * number(inputs.windowUnitRate);
  const doorCost =
    number(inputs.exteriorDoorCount ?? inputs.doorCount) *
    number(inputs.exteriorDoorUnitRate ?? inputs.doorUnitRate);
  const roofCost = number(inputs.roofSquareFeet) * number(inputs.roofRate);
  const assemblies = (operations.estimating.assemblies || [])
    .filter((assembly) => assembly.included !== false)
    .reduce(
      (sum, assembly) =>
        sum +
        number(assembly.quantity) *
          number(assembly.rate) *
          (1 + number(assembly.wastePercent) / 100),
      0,
    );
  const base = area * fixedFactor + windowCost + doorCost + roofCost + assemblies;
  if (base <= 0) return 0;
  return round2(base * number(inputs.complexityFactor || 1) * number(inputs.locationFactor || 1));
}

export function requiredApprovalRole(
  _operations: ProjectOperations,
  input: Pick<ApprovalRequest, "kind" | "amount" | "contractPercent" | "cumulativeCreditAmount">,
): ApprovalRole {
  const kind = text(input.kind).toLowerCase();
  const amount = number(input.amount);
  const percent = number(input.contractPercent);
  const cumulativeCredit = number(input.cumulativeCreditAmount);

  if (kind === "loi") return "CRO";
  if (kind === "payment release" || kind === "paymentrelease") return "Finance";
  if (kind === "credit") {
    if (amount >= 25_000 || cumulativeCredit >= 20_000) return "CEO";
    if (amount >= 5_000 || cumulativeCredit >= 5_000) return "CRO";
    return "Finance";
  }
  if (kind === "change") {
    if (amount >= 100_000 || percent >= 10) return "CEO";
    if (amount >= 25_000 || percent >= 5) return "CRO";
    return "Project Manager";
  }
  if (amount >= 100_000 || percent >= 10) return "CEO";
  if (amount >= 25_000 || percent >= 5) return "CRO";
  return "Project Manager";
}

export function appendOperationsAudit(
  operations: ProjectOperations,
  entry: Record<string, unknown>,
) {
  return {
    ...operations,
    audit: [
      ...(operations.audit || []),
      { id: newId("audit"), createdAt: new Date().toISOString(), ...entry },
    ],
  };
}

export function classifyClientPath(operations: ProjectOperations) {
  const path = operations.clientPath || ({} as ProjectOperations["clientPath"]);
  const design = text(path.designMaturity).toLowerCase();
  const site = text(path.siteMaturity).toLowerCase();
  const funding = text(path.fundingMaturity).toLowerCase();
  const special =
    text(path.clientType).toLowerCase() === "special loi" ||
    text(path.relationship).toLowerCase() === "strategic";

  if (special) {
    return {
      type: "Special LOI",
      subGates: ["Executive LOI approval", "Controlled scope boundary", "Gate 1 decision"],
      reason:
        "Strategic or expressly governed LOI route requires executive approval and a bounded scope before Gate 1.",
    };
  }
  if (design === "ifc" && site === "ready" && funding === "secured") {
    return {
      type: "P1",
      subGates: ["Production capacity reservation", "IFC package validation", "Gate 1 release"],
      reason:
        "IFC design, ready site, and secured funding support the shortest controlled path to production capacity.",
    };
  }
  if (
    design === "permit" &&
    site === "controlled" &&
    (funding === "in process" || funding === "secured")
  ) {
    return {
      type: "P2",
      subGates: ["Responsibility matrix", "Permit/interface validation", "Commercial release"],
      reason:
        "Permit-level design and a controlled site support a defined responsibility and commercial pathway.",
    };
  }
  if (design === "preliminary" && site === "controlled") {
    return {
      type: "P3",
      subGates: ["D to C convergence", "Responsibility matrix", "Feasibility closure"],
      reason:
        "Preliminary design with a controlled site requires structured D-to-C convergence before technical commitment.",
    };
  }
  if (design === "concept" && site === "candidate") {
    return {
      type: "P4",
      subGates: ["Consultation scope", "Site feasibility", "Client funding plan"],
      reason:
        "Concept design and a candidate site call for bounded consultation and feasibility work before commitment.",
    };
  }
  return {
    type: "P5",
    subGates: ["Client pre-qualification", "Site and design discovery", "Funding evidence"],
    reason:
      "The available evidence is not yet mature enough for a faster pathway, so pre-qualification remains the controlled route.",
  };
}

function evidencePresent(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => text(item));
  return Boolean(text(value));
}

export function evaluatePaymentRelease(operations: ProjectOperations) {
  const commercial = operations.commercial;
  const reasons: string[] = [];
  const plan = commercial.paymentPlan || [];
  const totalPercent = plan.reduce((sum, milestone) => sum + number(milestone.percent), 0);
  if (Math.abs(totalPercent - 100) > 0.001) {
    reasons.push("Payment milestone percentages must total 100%.");
  }

  const deposit = plan.find((milestone) => milestone.id === "deposit-25") || plan[0];
  const invoiceId = text(deposit?.invoiceId);
  const invoice = (commercial.invoices || []).find((item) => item.id === invoiceId);
  if (!deposit || !invoiceId || !invoice) {
    reasons.push("A released deposit invoice is required.");
  } else {
    if (!evidencePresent(invoice.evidenceReference)) {
      reasons.push("Controlled deposit invoice evidence is missing.");
    }
    if (!["Paid", "Partially Paid", "Settled"].includes(text(invoice.status))) {
      reasons.push("The deposit invoice must be marked Paid before release.");
    }
    const expected = paymentMilestoneAmount(operations, deposit);
    const paid = invoicePaidAmount(operations, invoice.id);
    if (paid + 0.005 < expected) {
      reasons.push(
        `Verified deposit receipt is short by ${round2(expected - paid)} ${commercial.currency || "CAD"}.`,
      );
    }
    const matchingReceipts = (commercial.receipts || []).filter(
      (receipt) => text(receipt.invoiceId) === invoice.id,
    );
    if (
      !matchingReceipts.length ||
      matchingReceipts.some((receipt) => !evidencePresent(receipt.evidenceReference))
    ) {
      reasons.push("Verified deposit receipt evidence is missing.");
    }
    if (!matchingReceipts.length || matchingReceipts.some((receipt) => !text(receipt.verifiedBy))) {
      reasons.push("Verified deposit receipt evidence is missing.");
    }
  }
  const release =
    commercial.paymentRelease || ({} as ProjectOperations["commercial"]["paymentRelease"]);
  if (text(release.status).toLowerCase() === "released") {
    if (!evidencePresent(release.evidence)) reasons.push("Payment release evidence is required.");
    if (!text(release.releasedBy)) reasons.push("Payment release approver is required.");
    if (!text(release.approverRole)) reasons.push("Payment release authority is required.");
  }
  return { ready: reasons.length === 0, reasons };
}
