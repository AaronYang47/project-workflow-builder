"use client";

import { clone } from "@/lib/clone";
import { appendOperationsAudit, calculateClassD, classifyClientPath, convertClientToProject, createEstimateVersion, evaluatePaymentRelease, normalizeProjectOperations, roleCanApprove, scheduleWarranty } from "@/lib/project-operations";
import type { ProjectOperations } from "@/types/project-operations";
import { withOperationalIdentity } from "@/store/workflow-store-helpers";
import type { StoreGet, StoreSet, WorkflowState } from "@/store/workflow-store-types";

export type OperationsSlice = Pick<
  WorkflowState,
  | "updateOperations"
  | "classifyOperationsClient"
  | "releasePaymentGate"
  | "approveOperationsRequest"
  | "convertClientRecord"
  | "recalculateClassD"
  | "startWarranty"
>;

/** Project operations: client path, payments, approvals, estimates, warranty. */
export function createOperationsSlice(set: StoreSet, get: StoreGet): OperationsSlice {
  return {
    updateOperations: (updater, audit) => {
      get().commit((file) => {
        const current = normalizeProjectOperations(
          file.operations,
          file.graph.metadata.name,
          String(
            file.graph.nodes.find((node) => node.type === "projectStart")
              ?.customFields.legacyJobNumber || "",
          ),
        );
        let operations = updater(clone(current));
        operations = {
          ...operations,
          updatedAt: new Date().toISOString(),
        };
        if (audit) {
          operations = appendOperationsAudit(operations, {
            actor: audit.actor || "Unknown",
            actorRole: audit.actorRole || "System",
            action: audit.action,
            entityType: audit.entityType || "ProjectOperations",
            entityId: audit.entityId || operations.identity.projectNumber || operations.identity.clientId,
            summary: audit.summary,
          });
        }
        return withOperationalIdentity(file, operations);
      });
    },
    classifyOperationsClient: (actor) => {
      const operations = normalizeProjectOperations(
        get().file.operations,
        get().file.graph.metadata.name,
      );
      const classification = classifyClientPath(operations);
      get().updateOperations(
        (current) => ({
          ...current,
          clientPath: {
            ...current.clientPath,
            clientType: classification.type,
            selectedSubGates: classification.subGates,
            classificationReason: classification.reason,
            classifiedAt: new Date().toISOString(),
            classifiedBy: actor,
          },
        }),
        {
          actor,
          actorRole: "Coordinator",
          action: "CLASSIFY_CLIENT_PATH",
          entityType: "ClientPath",
          entityId: operations.identity.clientId,
          summary: `${classification.type} selected with ${classification.subGates.length} fixed sub-gates.`,
        },
      );
    },
    releasePaymentGate: (actor, role) => {
      const operations = normalizeProjectOperations(
        get().file.operations,
        get().file.graph.metadata.name,
      );
      const evaluation = evaluatePaymentRelease(operations);
      if (!evaluation.ready) return evaluation.reasons.join(" ");
      if (!roleCanApprove(role, "Finance", "Payment Release")) {
        return `${role} is not authorized to release a payment gate.`;
      }
      const timestamp = new Date().toISOString();
      get().updateOperations(
        (current) => ({
          ...current,
          commercial: {
            ...current.commercial,
            paymentRelease: {
              ...current.commercial.paymentRelease,
              status: "Released",
              releasedAt: timestamp,
              releasedBy: actor,
              approverRole: role,
              reasons: [],
            },
          },
          approvals: {
            ...current.approvals,
            requests: [
              ...current.approvals.requests,
              {
                id: `approval-payment-${crypto.randomUUID()}`,
                kind: "Payment Release",
                reference: current.commercial.paymentRelease.id,
                amount: current.commercial.receipts.reduce((sum, receipt) => sum + receipt.amount, 0),
                contractPercent: current.commercial.contractValue > 0
                  ? current.commercial.receipts.reduce((sum, receipt) => sum + receipt.amount, 0) / current.commercial.contractValue * 100
                  : 0,
                cumulativeCreditAmount: 0,
                requiredRole: "Finance",
                requestedBy: actor,
                requestedAt: timestamp,
                status: "Approved",
                decidedBy: actor,
                decidedByRole: role,
                decidedAt: timestamp,
                evidence: current.commercial.paymentRelease.evidence,
                reason: "Invoice and verified receipt evidence satisfied the payment release gate.",
              },
            ],
          },
        }),
        {
          actor,
          actorRole: role,
          action: "RELEASE_PAYMENT_GATE",
          entityType: "PaymentRelease",
          entityId: operations.commercial.paymentRelease.id,
          summary: `Payment release authorized by ${role}.`,
        },
      );
      return undefined;
    },
    approveOperationsRequest: (requestId, actor, role, approve) => {
      const operations = normalizeProjectOperations(
        get().file.operations,
        get().file.graph.metadata.name,
      );
      const request = operations.approvals.requests.find((item) => item.id === requestId);
      if (!request) return "Approval request was not found.";
      if (request.status !== "Pending") return "Only a pending request can be decided.";
      if (!roleCanApprove(role, request.requiredRole, request.kind)) {
        return `${role} cannot decide a request requiring ${request.requiredRole}.`;
      }
      const timestamp = new Date().toISOString();
      get().updateOperations(
        (current) => ({
          ...current,
          approvals: {
            ...current.approvals,
            requests: current.approvals.requests.map((item) =>
              item.id === requestId
                ? {
                    ...item,
                    status: approve ? "Approved" : "Rejected",
                    decidedBy: actor,
                    decidedByRole: role,
                    decidedAt: timestamp,
                  }
                : item,
            ),
          },
        }),
        {
          actor,
          actorRole: role,
          action: approve ? "APPROVE_REQUEST" : "REJECT_REQUEST",
          entityType: "ApprovalRequest",
          entityId: requestId,
          summary: `${request.kind} ${request.reference || request.id} ${approve ? "approved" : "rejected"} by ${role}.`,
        },
      );
      return undefined;
    },
    convertClientRecord: ({
      sequence,
      actor,
      gateDecisionId,
      buildingCount = 1,
      modulesPerBuilding = 0,
    }) => {
      const current = normalizeProjectOperations(
        get().file.operations,
        get().file.graph.metadata.name,
      );
      try {
        const converted = convertClientToProject(
          current,
          sequence,
          actor,
          gateDecisionId,
          buildingCount,
          modulesPerBuilding,
        );
        get().updateOperations(() => converted);
        return converted.identity.projectNumber;
      } catch (error) {
        return error instanceof Error ? error.message : "Client-to-project conversion failed.";
      }
    },
    recalculateClassD: (actor, sourceRevision) => {
      const current = normalizeProjectOperations(
        get().file.operations,
        get().file.graph.metadata.name,
      );
      const amount = calculateClassD(current);
      const version = createEstimateVersion(
        current,
        "D",
        amount,
        actor,
        sourceRevision,
      );
      get().updateOperations(
        (operations) => ({
          ...operations,
          estimating: {
            ...operations.estimating,
            calculatedClassDAmount: amount,
            versions: [
              ...operations.estimating.versions.map((item) =>
                item.estimateClass === "D" && item.status === "Draft"
                  ? { ...item, status: "Superseded" as const }
                  : item,
              ),
              version,
            ],
          },
        }),
        {
          actor,
          actorRole: "Estimator",
          action: "CALCULATE_CLASS_D",
          entityType: "EstimateVersion",
          entityId: version.id,
          summary: `Class D v${version.version} calculated at ${amount.toFixed(2)} ${current.commercial.currency}.`,
        },
      );
      return amount;
    },
    startWarranty: ({ dayZeroDate, durationMonths, owner, triggerEvidence, actor }) => {
      const current = normalizeProjectOperations(
        get().file.operations,
        get().file.graph.metadata.name,
      );
      try {
        const scheduled = scheduleWarranty(
          current,
          dayZeroDate,
          durationMonths,
          owner,
          triggerEvidence,
        );
        get().updateOperations(
          () => scheduled,
          {
            actor,
            actorRole: "Project Manager",
            action: "START_WARRANTY_DAY_ZERO",
            entityType: "Warranty",
            entityId: scheduled.identity.projectNumber || scheduled.identity.clientId,
            summary: `Warranty started ${dayZeroDate}; ${durationMonths} months with 30/60/90-day follow-ups.`,
          },
        );
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : "Warranty could not be started.";
      }
    },
  };
}
