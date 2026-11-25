"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Handle, Position } from "@xyflow/react";
import { Calculator, CheckCircle2, LockKeyhole, X } from "lucide-react";
import { estimateSummary, preliminaryEstimationReady } from "@/lib/preliminary-estimation";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { NodeDepartmentField } from "./node-department-field";

const money = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);

type Draft = {
  totalProjectBudget: string;
  moduleBudget: string;
  basePrice: string;
  optionsAndCredits: string;
  preparedBy: string;
};

function draftOf(node: DomainNode): Draft {
  const fields = node.customFields;
  return {
    totalProjectBudget: String(fields.estimationTotalProjectBudget ?? ""),
    moduleBudget: String(fields.estimationModuleBudget ?? ""),
    basePrice: String(fields.estimationBasePrice ?? ""),
    optionsAndCredits: String(fields.estimationOptionsAndCredits ?? ""),
    preparedBy: String(fields.estimationPreparedBy ?? ""),
  };
}

function EstimateDialog({
  node,
  qualification,
  onClose,
}: {
  node: DomainNode;
  qualification?: DomainNode;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(node));
  const [calculated, setCalculated] = useState(false);
  const validAmounts =
    draft.basePrice.trim() !== "" &&
    Number.isFinite(Number(draft.basePrice)) &&
    Number(draft.basePrice) > 0 &&
    [draft.totalProjectBudget, draft.moduleBudget].every(
      (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0),
    ) &&
    (draft.optionsAndCredits === "" || Number.isFinite(Number(draft.optionsAndCredits)));
  const previewNode: DomainNode = {
    ...node,
    customFields: {
      ...node.customFields,
      estimationTotalProjectBudget: draft.totalProjectBudget,
      estimationModuleBudget: draft.moduleBudget,
      estimationBasePrice: draft.basePrice,
      estimationOptionsAndCredits: draft.optionsAndCredits,
      estimationPreparedBy: draft.preparedBy,
      estimationReviewed: false,
    },
  };
  const preview = estimateSummary(previewNode, qualification);
  const canConfirm =
    calculated && validAmounts && draft.preparedBy.trim() !== "" && preview.budgetFits !== false;
  const field = (label: string, key: keyof Draft, type = "number") => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <input
        aria-label={label}
        type={type}
        min={type === "number" && key !== "optionsAndCredits" ? 0 : undefined}
        value={draft[key]}
        onChange={(event) => {
          setDraft((current) => ({ ...current, [key]: event.target.value }));
          setCalculated(false);
        }}
        className="nodrag rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-teal-500"
      />
    </label>
  );
  const confirm = () => {
    if (!canConfirm) return;
    const store = useWorkflowStore.getState();
    const current = store.file.graph.nodes.find((item) => item.id === node.id) ?? node;
    store.updateNode(node.id, {
      customFields: {
        ...current.customFields,
        estimationTotalProjectBudget: draft.totalProjectBudget,
        estimationModuleBudget: draft.moduleBudget,
        estimationBasePrice: draft.basePrice,
        estimationOptionsAndCredits: draft.optionsAndCredits,
        estimationPreparedBy: draft.preparedBy.trim(),
        estimationReviewed: true,
      },
    });
    onClose();
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[100]" />
      <Dialog.Content className="liquid-glass-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none">
        <div className="liquid-glass-header flex items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <Dialog.Title className="flex items-center gap-2 text-base font-bold">
              <Calculator className="size-4 text-teal-600" /> Preliminary Estimation [1.06]
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              Enter amounts in CAD before tax, calculate, then confirm the estimate.
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close Estimate"
              className="rounded-lg border p-2 hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </Dialog.Close>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          <div className="rounded-lg bg-muted/60 p-3 text-xs">
            <div className="font-semibold">From Qualification [1.01]</div>
            <div className="mt-1">{preview.projectName || "Project name pending"}</div>
            <div className="text-muted-foreground">
              {preview.projectAddress || "Project address pending"}
            </div>
            <div className="text-muted-foreground">
              {preview.grossAreaSqFt
                ? preview.grossAreaSqFt.toLocaleString() + " sq. ft."
                : "Area pending"}{" "}
              · {preview.client || "Client pending"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("Total project budget", "totalProjectBudget")}
            {field("Module budget", "moduleBudget")}
            {field("Base price", "basePrice")}
            {field("Options / credits", "optionsAndCredits")}
          </div>
          {field("Prepared by", "preparedBy", "text")}
          {calculated && (
            <div
              data-estimation-preview
              className="grid grid-cols-2 gap-3 rounded-xl border border-teal-300 bg-teal-50 p-4 text-sm dark:border-teal-800 dark:bg-teal-950/30"
            >
              <div>
                <div className="text-xs text-muted-foreground">Estimate total</div>
                <div className="font-bold text-teal-700 dark:text-teal-300">
                  {money(preview.total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Per sq. ft.</div>
                <div className="font-bold">
                  {preview.perSqFt === undefined ? "—" : money(preview.perSqFt)}
                </div>
              </div>
            </div>
          )}
          {calculated && preview.budgetFits === false && (
            <p className="text-xs text-rose-600">Estimate exceeds the module budget.</p>
          )}
          {calculated && !draft.preparedBy.trim() && (
            <p className="text-xs text-amber-700">Enter who prepared the estimate to confirm it.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={() => setCalculated(true)}
            disabled={!validAmounts}
            className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Calculate
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export function EstimationNode({
  node,
  selected,
  reached,
}: {
  node: DomainNode;
  selected: boolean;
  reached: boolean;
}) {
  const [open, setOpen] = useState(false);
  const qualification = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "qualification"),
  );
  const estimate = estimateSummary(node, qualification);
  const saved = preliminaryEstimationReady(node);
  const ready = reached && saved;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div
        data-estimation-node
        className={`relative h-full overflow-visible rounded-xl border-2 bg-card p-4 shadow-md ${selected ? "ring-2 ring-offset-2 ring-offset-background" : ""}`}
        style={{ borderColor: reached ? node.color || "#0f766e" : "#94a3b8" }}
      >
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          className={`!left-[-6px] !size-3 !border-2 !border-background ${reached ? "commercial-route-handle-active" : ""}`}
          style={{ backgroundColor: reached ? "#0f766e" : "#94a3b8" }}
        />
        <Handle type="source" id="out" position={Position.Right} />
        <div className="flex items-start justify-between gap-2 border-b pb-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Calculator
                className={`size-4 ${reached ? "text-teal-600" : "text-muted-foreground"}`}
              />
              {node.title || "Estimation"}
            </div>
            <div className="text-[11px] text-muted-foreground">S [1.06] · CAD before tax</div>
            {node.description ? (
              <p data-node-description className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {node.description}
              </p>
            ) : null}
            <NodeDepartmentField node={node} />
          </div>
          <span
            data-estimation-status
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${ready ? "bg-emerald-100 text-emerald-700" : reached ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}
          >
            {ready ? "Reviewed" : reached ? "Draft" : "Waiting for agreement"}
          </span>
        </div>
        <Dialog.Trigger asChild>
          <button
            type="button"
            disabled={!reached}
            className="nodrag mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            <Calculator className="size-4" />
            Estimate
          </button>
        </Dialog.Trigger>
        {saved ? (
          <div
            data-estimation-result
            className={`mt-4 rounded-lg p-3 text-sm ${ready ? "bg-teal-50 dark:bg-teal-950/30" : "bg-muted"}`}
          >
            <div
              className={`flex items-center gap-1 text-xs ${ready ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground"}`}
            >
              {ready ? <CheckCircle2 className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
              {ready ? "Confirmed estimate" : "Saved estimate · awaiting agreement"}
            </div>
            <div className="mt-1 font-bold">{money(estimate.total)}</div>
            <div className="text-xs text-muted-foreground">
              {estimate.perSqFt === undefined
                ? "Per sq. ft. —"
                : money(estimate.perSqFt) + " / sq. ft."}
            </div>
          </div>
        ) : !reached ? (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
            <LockKeyhole className="size-3.5" />
            Complete Qualification and the selected agreement first.
          </div>
        ) : null}
      </div>
      {open && reached && (
        <EstimateDialog node={node} qualification={qualification} onClose={() => setOpen(false)} />
      )}
    </Dialog.Root>
  );
}
