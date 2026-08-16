"use client";

import { Fragment } from "react";
import { Check, FilePenLine, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ComponentNoteButton } from "./component-note-button";
import {
  GATE_PANEL_WIDTH,
  type GateLayoutMetrics,
} from "@/lib/gate-layout";
import { GATE_SERVICE_TYPES, getGateServiceType } from "@/lib/gate-service-types";
import { projectNodeUuid } from "@/lib/project-id";
import {
  requirementApplies,
  signatureFieldsComplete as signatureIsComplete,
} from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import { stopBubble, textareaRows } from "./node-utils";
import { RuleSignatureCard } from "./rule-signature-card";
import type {
  DomainNode,
  GateRule,
  GateSignatureRequirement,
  RequirementType,
} from "@/types/workflow";

export interface ConditionsPanelText {
  conditionsTitle: string;
  conditionsSubtitle: string;
  checklistTitle: string;
  checklistHint: string;
  conditionLabel: string;
  addConditionLabel: string;
  documentsLabel: string;
  addDocumentLabel: string;
}

export interface ConditionsPanelStyle {
  card: string;
  header: string;
  accent: string;
  label: string;
}

export interface ApprovalConditionsPanelProps {
  node: DomainNode;
  rules: GateRule[];
  conditionState: string;
  conditionStyle: ConditionsPanelStyle;
  conditionProgress: { completed: number; total: number };
  interfaceText: ConditionsPanelText;
  metrics: GateLayoutMetrics & { conditionsLeft: number };
  saveRules: (nextRules: GateRule[]) => void;
  updateSignature: (
    ruleId: string,
    signatureId: string,
    patch: Partial<GateSignatureRequirement>,
  ) => void;
}

/**
 * Approval conditions card: list of editable GateRules, each with a stack of
 * required `RuleSignatureCard` documents.
 */
export function ApprovalConditionsPanel({
  node,
  rules,
  conditionState,
  conditionStyle,
  conditionProgress,
  interfaceText,
  metrics,
  saveRules,
  updateSignature,
}: ApprovalConditionsPanelProps) {
  const projectStartNode = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "projectStart"),
  );
  const nodeUuid = projectNodeUuid(node, projectStartNode);
  return (
    <Fragment>
    <section
      data-completion-state={conditionState}
      aria-label="Approval conditions card"
      className={cn(
        "absolute overflow-hidden rounded-2xl border shadow-[0_8px_28px_rgba(15,23,42,.11)] transition-colors",
        conditionStyle.card,
      )}
      style={{
        left: metrics.conditionsLeft,
        top: metrics.conditionsTop,
        width: GATE_PANEL_WIDTH,
        height: metrics.conditionsHeight,
      }}
    >
      <div
        className={cn(
          "flex h-12 items-center border-b px-4",
          conditionStyle.header,
        )}
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg text-white shadow-sm",
            conditionStyle.accent,
          )}
        >
          <ShieldCheck className="size-3.5" />
        </span>
        <span className="ml-2">
          <span
            data-inspector-target="config.conditionsTitle"
            className="block text-[9px] font-black uppercase tracking-[0.13em] text-foreground"
          >
            {interfaceText.conditionsTitle}
          </span>
          <span
            data-inspector-target="config.conditionsSubtitle"
            className="mt-0.5 block text-[7px] font-medium text-muted-foreground"
          >
            {conditionProgress.completed} of {conditionProgress.total}{" "}
            {interfaceText.conditionsSubtitle}
          </span>
        </span>
        <ComponentNoteButton
          nodeId={node.id}
          noteKey="approval-conditions"
          label={`${node.title} approval conditions`}
          className="ml-auto"
        />
        <span className="ml-2 rounded-full border bg-background/75 px-2 py-1 text-[7px] font-black uppercase text-foreground">
          {conditionStyle.label}
        </span>
      </div>
      <div data-conditions-content className="nodrag px-4 py-3">
        <div className="mb-2 flex h-7 items-center">
          <span
            data-inspector-target="config.checklistTitle"
            className="text-[8px] font-black uppercase tracking-[0.11em] text-muted-foreground"
          >
            {interfaceText.checklistTitle}
          </span>
          <span
            data-inspector-target="config.checklistHint"
            className="ml-2 text-[7px] text-muted-foreground"
          >
            {interfaceText.checklistHint}
          </span>
          <button
            aria-label="Add decision condition"
            data-inspector-target="config.addConditionLabel"
            onClick={stopBubble(() =>
              saveRules([
                ...rules,
                {
                  id: `rule-${crypto.randomUUID().slice(0, 6)}`,
                  label: "New condition",
                  checked: false,
                  requirementType: "Required",
                  signatures: [],
                },
              ])
            )}
            className="ml-auto flex h-6 items-center gap-1 rounded-md border bg-background px-2 text-[8px] font-bold text-primary shadow-sm hover:bg-primary/5"
          >
            <Plus className="size-3" />
            {interfaceText.addConditionLabel}
          </button>
        </div>
        <div className="space-y-2">
          {rules.map((rule, index) => {
            const signatures = rule.signatures || [];
            const activeSignatures = signatures.filter(requirementApplies);
            const signaturesReady =
              !activeSignatures.length ||
              activeSignatures.every(
                (signature) =>
                  signature.checked && signatureIsComplete(signature),
              );
            const updateSignatures = (next: GateSignatureRequirement[]) =>
              saveRules(
                rules.map((item) =>
                  item.id === rule.id
                    ? {
                        ...item,
                        signatures: next,
                        checked:
                          item.checked &&
                          (!next.filter(requirementApplies).length ||
                            next
                              .filter(requirementApplies)
                              .every(
                                (signature) =>
                                  signature.checked &&
                                  signatureIsComplete(signature),
                              )),
                      }
                    : item,
                ),
              );
            const requirementType = rule.requirementType || "Required";
            return (
              <ConditionRow
                key={rule.id}
                rule={rule}
                index={index}
                signatures={signatures}
                requirementType={requirementType}
                signaturesReady={signaturesReady}
                interfaceText={interfaceText}
                nodeId={node.id}
                onToggleChecked={() =>
                  saveRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? { ...item, checked: !item.checked }
                        : item,
                    ),
                  )
                }
                onChangeRequirementType={(value) =>
                  saveRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? {
                            ...item,
                            requirementType: value as RequirementType,
                          }
                        : item,
                    ),
                  )
                }
                onLabelBlur={(value) =>
                  saveRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? {
                            ...item,
                            label: value || item.label,
                          }
                        : item,
                    ),
                  )
                }
                onDelete={() =>
                  saveRules(rules.filter((item) => item.id !== rule.id))
                }
                onChangeServiceType={(value) =>
                  saveRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? {
                            ...item,
                            serviceTypeId: value || undefined,
                          }
                        : item,
                    ),
                  )
                }
                onChangeBuildingCode={(value) =>
                  saveRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? { ...item, buildingCode: value }
                        : item,
                    ),
                  )
                }
                onChangeModuleCode={(value) =>
                  saveRules(
                    rules.map((item) =>
                      item.id === rule.id
                        ? { ...item, moduleCode: value }
                        : item,
                    ),
                  )
                }
                onAddDocument={() =>
                  updateSignatures([
                    ...signatures,
                    {
                      id: `signature-${crypto.randomUUID().slice(0, 6)}`,
                      abbreviation: "DOC",
                      fullName: "Required agreement",
                      department: "",
                      signedBy: "",
                      checked: false,
                      requirementType: "Required",
                      status: "Draft",
                      revisionControlled: true,
                      revisions: [],
                    },
                  ])
                }
                onUpdateSignature={(signatureId, patch) =>
                  updateSignature(rule.id, signatureId, patch)
                }
                onRemoveSignature={(signatureId) =>
                  updateSignatures(
                    signatures.filter((item) => item.id !== signatureId),
                  )
                }
              />
            );
          })}
        </div>
      </div>
    </section>
    {nodeUuid ? (
      <div
        className="nodrag pointer-events-none absolute z-10"
        style={{
          top: metrics.conditionsTop + metrics.conditionsHeight + 6,
          left: metrics.conditionsLeft + GATE_PANEL_WIDTH,
          transform: "translateX(-100%)",
        }}
      >
        <span
          title={nodeUuid}
          className="whitespace-nowrap rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-tight text-muted-foreground shadow-sm"
        >
          UUID {nodeUuid.slice(0, 8)}
        </span>
      </div>
    ) : null}
    </Fragment>
  );
}

interface ConditionRowProps {
  rule: GateRule;
  index: number;
  signatures: GateSignatureRequirement[];
  requirementType: string;
  signaturesReady: boolean;
  interfaceText: ConditionsPanelText;
  nodeId: string;
  onToggleChecked: () => void;
  onChangeRequirementType: (value: string) => void;
  onLabelBlur: (value: string) => void;
  onDelete: () => void;
  onChangeServiceType: (value: string) => void;
  onChangeBuildingCode: (value: string) => void;
  onChangeModuleCode: (value: string) => void;
  onAddDocument: () => void;
  onUpdateSignature: (
    signatureId: string,
    patch: Partial<GateSignatureRequirement>,
  ) => void;
  onRemoveSignature: (signatureId: string) => void;
}

function ConditionRow({
  rule,
  index,
  signatures,
  requirementType,
  signaturesReady,
  interfaceText,
  nodeId,
  onToggleChecked,
  onChangeRequirementType,
  onLabelBlur,
  onDelete,
  onChangeServiceType,
  onChangeBuildingCode,
  onChangeModuleCode,
  onAddDocument,
  onUpdateSignature,
  onRemoveSignature,
}: ConditionRowProps) {
  return (
    <div
      data-rule-card
      className={cn(
        "rounded-2xl border-0 bg-muted/15 p-2 shadow-sm",
        !requirementApplies(rule) && "opacity-65",
      )}
    >
      <div className="grid min-w-0 grid-cols-[22px_78px_94px_minmax(0,1fr)_24px_22px] items-stretch gap-2">
        <button
          aria-label={`Condition ${index + 1} satisfied`}
          aria-pressed={rule.checked}
          disabled={!signaturesReady}
          title={
            signaturesReady
              ? "Mark condition complete"
              : "Complete every applicable required document first"
          }
          onClick={stopBubble(onToggleChecked)}
          className={cn(
            "mt-[18px] flex size-5 items-center justify-center self-start rounded-md border",
            rule.checked
              ? "border-emerald-600 bg-emerald-600 text-white"
              : signaturesReady
                ? "bg-background"
                : "cursor-not-allowed bg-muted",
          )}
        >
          <Check
            className={cn("size-3.5", !rule.checked && "opacity-0")}
          />
        </button>
        <span
          data-inspector-target="config.conditionLabel"
          className="flex min-h-14 items-center justify-center self-stretch whitespace-normal rounded bg-slate-900 px-2 py-1.5 text-center text-[7px] font-black uppercase leading-4 text-white dark:bg-slate-100 dark:text-slate-900"
        >
          {interfaceText.conditionLabel} {index + 1}
        </span>
        <span className="min-w-0 self-stretch">
          <select
            aria-label={`Condition ${index + 1} requirement type`}
            value={requirementType}
            onChange={(event) => onChangeRequirementType(event.target.value)}
            className="h-full min-h-14 w-full min-w-0 rounded border bg-background px-1.5 py-1 text-[7px] font-bold leading-4"
          >
            <option>Required</option>
            <option>Optional</option>
          </select>
        </span>
        <textarea
          aria-label={`Decision condition ${index + 1}`}
          defaultValue={rule.label}
          rows={textareaRows(rule.label, 58, 2)}
          onBlur={(event) => onLabelBlur(event.target.value.trim())}
          className="min-h-14 w-full min-w-0 resize-none overflow-hidden rounded-md border bg-card px-2.5 py-2 text-[9px] font-semibold leading-4 outline-none focus:border-primary"
        />
        <ComponentNoteButton
          nodeId={nodeId}
          noteKey={`rule:${rule.id}`}
          label={`Condition ${index + 1}`}
          className="mt-4 self-start"
        />
        <button
          aria-label={`Delete decision condition ${index + 1}`}
          onClick={stopBubble(onDelete)}
          className="mt-4 self-start rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1">
        <span
          data-inspector-target="config.documentsLabel"
          className="mr-auto self-center text-[7px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          {interfaceText.documentsLabel}
        </span>
        <label
          className="group relative mr-1 flex h-7 max-w-[160px] items-center gap-1.5 rounded-md border bg-background px-2 shadow-sm"
          title={
            getGateServiceType(rule.serviceTypeId)?.description ||
            "Select a service type"
          }
        >
          <span
            className="size-3 shrink-0 rounded-full border border-background shadow-sm"
            style={{
              backgroundColor:
                getGateServiceType(rule.serviceTypeId)?.color || "#cbd5e1",
            }}
          />
          <select
            aria-label={`Condition ${index + 1} service type`}
            value={rule.serviceTypeId || ""}
            onChange={(event) => onChangeServiceType(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent text-[7px] font-bold outline-none"
          >
            <option value="">Service type</option>
            {GATE_SERVICE_TYPES.map((serviceType) => (
              <option key={serviceType.id} value={serviceType.id}>
                {serviceType.label}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label={`Add signed document to Condition ${index + 1}`}
          data-inspector-target="config.addDocumentLabel"
          title="Add signed document"
          onClick={stopBubble(onAddDocument)}
          className="flex h-7 items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 text-[8px] font-bold text-primary hover:bg-primary/10"
        >
          <FilePenLine className="size-3" />
          {interfaceText.addDocumentLabel}
        </button>
      </div>
      {rule.serviceTypeId === "paid" ? (
        <div className="nodrag mt-2 grid grid-cols-2 gap-2">
          <label className="block rounded-md border bg-background px-2 py-1.5">
            <span className="block text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Building <span className="text-destructive">(B-XX)</span>
            </span>
            <input
              aria-label={`Condition ${index + 1} building code`}
              value={rule.buildingCode || ""}
              onChange={(event) =>
                onChangeBuildingCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^BM0-9-]/g, "")
                    .slice(0, 4),
                )
              }
              placeholder="B-XX"
              className="h-5 w-full border-0 bg-transparent p-0 font-mono text-[9px] font-bold outline-none placeholder:text-muted-foreground/60"
            />
          </label>
          <label className="block rounded-md border bg-background px-2 py-1.5">
            <span className="block text-[7px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Module <span className="text-destructive">(M-XXX)</span>
            </span>
            <input
              aria-label={`Condition ${index + 1} module code`}
              value={rule.moduleCode || ""}
              onChange={(event) =>
                onChangeModuleCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^BM0-9-]/g, "")
                    .slice(0, 5),
                )
              }
              placeholder="M-XXX"
              className="h-5 w-full border-0 bg-transparent p-0 font-mono text-[9px] font-bold outline-none placeholder:text-muted-foreground/60"
            />
          </label>
        </div>
      ) : null}
      {signatures.length ? (
        <div
          data-signature-rail
          data-rail-type={requirementType}
          data-rail-state={
            signaturesReady ? "complete" : "pending"
          }
          className={cn(
            "rail ml-2 mt-2 space-y-2 rounded-lg border-l-2 pl-3",
            signaturesReady
              ? "border-emerald-300 dark:border-emerald-700"
              : requirementType === "Conditional"
                ? "border-amber-300 dark:border-amber-700"
                : requirementType === "Optional"
                  ? "border-blue-300 dark:border-blue-700"
                  : "border-orange-300 dark:border-orange-600",
          )}
        >
          {signatures.map((signature, signatureIndex) => (
            <RuleSignatureCard
              key={signature.id}
              nodeId={nodeId}
              signature={signature}
              ruleIndex={index}
              signatureIndex={signatureIndex}
              update={(patch) => onUpdateSignature(signature.id, patch)}
              remove={() => onRemoveSignature(signature.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}