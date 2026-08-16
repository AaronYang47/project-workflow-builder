import assert from "node:assert/strict";
import { test } from "node:test";
import type { DomainNode, GateRule, GateSignatureRequirement } from "@/types/workflow";
import {
  conditionDisplaySatisfied,
  conditionIsSatisfied,
  gateApprovalReady,
  gateChecklistSatisfied,
  getGateConditionProgress,
  nodeHasPaidService,
  nodeStatusLabel,
  ruleComplete,
  signatureComplete,
  workflowHasPaidService,
} from "@/lib/workflow-progress";

const signature = (
  patch: Partial<GateSignatureRequirement> = {},
): GateSignatureRequirement => ({
  id: "sig-1",
  abbreviation: "DRW",
  fullName: "Drawing",
  department: "Engineering",
  signedBy: "Ada",
  checked: true,
  requirementType: "Required",
  ...patch,
});

const rule = (patch: Partial<GateRule> = {}): GateRule => ({
  id: "rule-1",
  label: "Scope complete",
  checked: true,
  requirementType: "Required",
  signatures: [],
  ...patch,
});

const node = (
  patch: Partial<DomainNode> & Pick<DomainNode, "id" | "type">,
): DomainNode => ({
  title: patch.title ?? patch.id,
  description: "",
  metadata: {},
  conditions: [],
  documents: [],
  criteria: [],
  customFields: {},
  config: {},
  ...patch,
});

test("empty and all-optional rules satisfy the gate checklist so YES can open", () => {
  const empty = node({ id: "g1", type: "gate" });
  assert.equal(gateChecklistSatisfied(empty), true);
  assert.equal(getGateConditionProgress(empty).state, "complete");

  const optionalOnly = node({
    id: "g2",
    type: "gate",
    config: { gateRules: [rule({ requirementType: "Optional", checked: false })] },
  });
  assert.equal(gateChecklistSatisfied(optionalOnly), true);
  assert.equal(getGateConditionProgress(optionalOnly).state, "complete");
});

test("gate progress and YES use the same signature-complete formula", () => {
  const incompleteSignature = signature({
    checked: true,
    signedBy: "",
    department: "",
  });
  assert.equal(signatureComplete(incompleteSignature), false);
  const incompleteRule = rule({ signatures: [incompleteSignature] });
  assert.equal(ruleComplete(incompleteRule), false);

  const gate = node({
    id: "g3",
    type: "gate",
    config: {
      gateRules: [incompleteRule],
      approvedDepartment: "Engineering",
      approvedBy: "Ada",
    },
  });
  const progress = getGateConditionProgress(gate);
  assert.equal(progress.state, "partial");
  assert.equal(gateChecklistSatisfied(gate), false);
  assert.equal(gateApprovalReady(gate), false);
  assert.equal(nodeStatusLabel(gate), "In Progress");
});

test("ticking a rule is not enough when required signature fields are empty", () => {
  const gate = node({
    id: "g4",
    type: "gate",
    config: {
      gateRules: [
        rule({
          checked: true,
          signatures: [signature({ checked: true, abbreviation: "", fullName: "" })],
        }),
      ],
    },
  });
  assert.equal(gateChecklistSatisfied(gate), false);
  assert.equal(getGateConditionProgress(gate).completed, 0);
});

test("Project Start Yes/No follows computed Project ID, not stored checked", () => {
  const start = node({
    id: "start",
    type: "projectStart",
    customFields: { projectId: "L-26-001" },
    conditions: [
      { id: "project-id-required", required: true, checked: false, label: "Project ID" },
    ],
  });
  assert.equal(
    conditionIsSatisfied(start.conditions[0], start, start),
    true,
  );
  assert.equal(
    conditionDisplaySatisfied(start.conditions[0], start, start),
    true,
  );

  const invalid = node({
    ...start,
    customFields: { projectId: "not-an-id" },
  });
  assert.equal(
    conditionDisplaySatisfied(invalid.conditions[0], invalid, invalid),
    false,
  );
});

test("paid building/module conditions read Project Start fields", () => {
  const start = node({
    id: "start",
    type: "projectStart",
    config: { buildingCode: "B-12", moduleCode: "M-003" },
  });
  const general = node({
    id: "n1",
    type: "general",
    conditions: [
      { id: "paid-building-required", required: true, checked: false },
      { id: "paid-module-required", required: true, checked: false },
    ],
  });
  assert.equal(
    conditionIsSatisfied(general.conditions[0], general, start),
    true,
  );
  assert.equal(
    conditionIsSatisfied(general.conditions[1], general, start),
    true,
  );
});

test("Paid Service presence is project-wide, not per-gate", () => {
  const current = node({
    id: "g-current",
    type: "gate",
    config: { gateRules: [rule({ serviceTypeId: "standard" })] },
  });
  const other = node({
    id: "g-other",
    type: "gate",
    config: { gateRules: [rule({ id: "paid-rule", serviceTypeId: "paid" })] },
  });
  assert.equal(nodeHasPaidService(current), false);
  assert.equal(
    workflowHasPaidService([current, other], current.id, current.config.gateRules),
    true,
  );
  assert.equal(
    workflowHasPaidService(
      [current, other],
      other.id,
      [rule({ id: "paid-rule", serviceTypeId: "standard" })],
    ),
    false,
  );
});
