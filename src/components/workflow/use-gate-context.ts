"use client";

import { useMemo } from "react";
import {
  BUILDING_PATTERN,
  MODULE_PATTERN,
  PROJECT_ID_PATTERN,
  legacyJobNumberFromProjectId,
  projectIdForDisplay,
} from "@/lib/project-id";
import { getGateLayoutMetrics } from "@/lib/gate-layout";
import {
  gateApprovalReady,
  gateChecklistSatisfied,
  getGateConditionProgress,
  type GateCompletionState,
} from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { ruleHasPaidService } from "@/lib/gate-service-types";
import { statusStyles } from "./node-utils";

interface GateProjectStartInfo {
  serviceType: string;
  displayedProjectId: string;
  legacyJobNumber: string;
  buildingCode: string;
  moduleCode: string;
  paidMissingBuilding: boolean;
  paidMissingModule: boolean;
  showBadge: boolean;
}

/**
 * Aggregates everything GateRules needs to render: derived project-start
 * values, completion states, layout metrics, and user-facing labels.
 */
export function useGateContext(node: DomainNode) {
  const projectStartNode = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "projectStart"),
  );

  const projectStart = useMemo<GateProjectStartInfo>(() => {
    const config = projectStartNode?.config ?? {};
    const serviceType = String(config.serviceType ?? "Standard");
    const buildingCode = String(config.buildingCode ?? "");
    const moduleCode = String(config.moduleCode ?? "");
    const rawProjectId = String(projectStartNode?.customFields.projectId ?? "");
    const baseProjectId = projectIdForDisplay(rawProjectId, serviceType);
    // The building/module codes live on the gate rules (one pair per paid
    // condition); once both are entered, append them to the badge so the gate
    // shows the full paid-service identifier rather than just the project ID.
    const paidRule = (node.config.gateRules || []).find((rule) =>
      ruleHasPaidService(rule),
    );
    const conditionBuildingCode = String(paidRule?.buildingCode ?? "");
    const conditionModuleCode = String(paidRule?.moduleCode ?? "");
    const suffixParts: string[] = [];
    if (conditionBuildingCode) suffixParts.push(conditionBuildingCode);
    if (conditionModuleCode) suffixParts.push(conditionModuleCode);
    const displayedProjectId = suffixParts.length
      ? `${baseProjectId}-${suffixParts.join("-")}`
      : baseProjectId;
    const isPaid = serviceType === "Paid Service";
    return {
      serviceType,
      displayedProjectId,
      legacyJobNumber: legacyJobNumberFromProjectId(baseProjectId),
      buildingCode,
      moduleCode,
      paidMissingBuilding:
        isPaid && !BUILDING_PATTERN.test(buildingCode),
      paidMissingModule: isPaid && !MODULE_PATTERN.test(moduleCode),
      showBadge: PROJECT_ID_PATTERN.test(baseProjectId),
    };
  }, [projectStartNode, node.config.gateRules]);

  const interfaceText = useMemo(
    () => ({
      conditionsTitle: node.config.conditionsTitle || "Approval conditions",
      conditionsSubtitle:
        node.config.conditionsSubtitle || "requirements complete",
      checklistTitle: node.config.checklistTitle || "Conditions checklist",
      checklistHint:
        node.config.checklistHint ||
        "Every applicable required document must be complete",
      conditionLabel: node.config.conditionLabel || "Condition",
      addConditionLabel: node.config.addConditionLabel || "Add condition",
      documentsLabel:
        node.config.documentsLabel || "All applicable required documents",
      addDocumentLabel: node.config.addDocumentLabel || "Add document",
      decisionTitle: node.config.decisionTitle || "Decision",
      decisionSubtitle: node.config.decisionSubtitle || "Approval routing",
      departmentLabel: node.config.departmentLabel || "Department",
      approverLabel: node.config.approverLabel || "Approved by",
      detailsNeededLabel:
        node.config.detailsNeededLabel || "Details needed",
    }),
    [node.config],
  );

  const approvedDepartment = node.config.approvedDepartment?.trim() || "";
  const approvedBy = node.config.approvedBy?.trim() || "";

  const checklistSatisfied = gateChecklistSatisfied(node);
  const approvalReady = gateApprovalReady(node);
  const conditionProgress = getGateConditionProgress(node);
  const conditionState = conditionProgress.state;
  const decisionState: GateCompletionState =
    conditionProgress.completed === 0
      ? "none"
      : approvalReady
        ? "complete"
        : "partial";

  const metrics = useMemo(() => {
    const estimated = getGateLayoutMetrics(node);
    return estimated;
  }, [node]);

  return {
    rules: node.config.gateRules || [],
    outcomes: node.config.outcomes || [],
    projectStart,
    interfaceText,
    approvedDepartment,
    approvedBy,
    checklistSatisfied,
    approvalReady,
    conditionProgress,
    conditionStyle: statusStyles[conditionState],
    decisionStyle: statusStyles[decisionState],
    metrics,
  };
}