"use client";

import { Handle, Position } from "@xyflow/react";
import { Calculator, CheckCircle2, LockKeyhole } from "lucide-react";
import { estimateSummary, preliminaryEstimationReady } from "@/lib/preliminary-estimation";
import { qualificationOf, qualificationRoute } from "@/lib/qualification";
import { qualificationNodeReady } from "@/lib/workflow-progress";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const money = (value: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);

export function EstimationNode({ node, selected }: { node: DomainNode; selected: boolean }) {
  const qualification = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "qualification"),
  );
  const sourcePassed = qualification ? qualificationNodeReady(qualification) : false;
  const route = qualification ? qualificationRoute(qualificationOf(qualification)) : undefined;
  const estimate = estimateSummary(node, qualification);
  const ready = preliminaryEstimationReady(node);
  const update = (key: string, value: string | boolean) =>
    useWorkflowStore.getState().updateNode(node.id, {
      customFields: {
        ...node.customFields,
        [key]: value,
        estimationReviewed: key === "estimationReviewed" ? value : false,
      },
    });
  const input = (label: string, key: string, value: number | string, type = "number") => (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      {label}
      <input
        key={`${key}-${String(value)}`}
        aria-label={label}
        type={type}
        min={type === "number" && key !== "estimationOptionsAndCredits" ? 0 : undefined}
        defaultValue={value || ""}
        disabled={!sourcePassed}
        onBlur={(event) => {
          if (event.target.value !== String(value || "")) update(key, event.target.value);
        }}
        className="nodrag rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-teal-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
  return (
    <div
      data-estimation-node
      className={`relative h-full overflow-visible rounded-xl border-2 bg-white shadow-md dark:bg-slate-900 ${selected ? "border-teal-500" : "border-teal-600/50"}`}
    >
      {(["CSA", "PCS", "LOI"] as const).map((path, index) => (
        <div
          key={path}
          className="pointer-events-none absolute left-0 z-20"
          style={{ top: `${32 + index * 18}%` }}
        >
          <Handle
            type="target"
            id={path}
            position={Position.Left}
            className="!left-[-6px] !size-3 !border-2 !border-white"
            style={{ backgroundColor: sourcePassed && route === path ? "#059669" : "#94a3b8" }}
          />
          <span className="absolute left-4 -translate-y-1/2 rounded bg-white px-1 text-[9px] font-bold text-slate-500 dark:bg-slate-900">
            {path}
          </span>
        </div>
      ))}
      <Handle type="source" id="out" position={Position.Right} />
      <div className="h-full overflow-auto rounded-[inherit] p-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
          <div>
            <div className="flex items-center gap-2 text-base font-bold">
              <Calculator className="size-5 text-teal-600" /> Estimation
            </div>
            <div className="text-xs text-slate-500">
              S [1.06] · Preliminary Estimation · CAD before tax
            </div>
          </div>
          <span
            data-estimation-status
            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${ready ? "bg-emerald-100 text-emerald-700" : sourcePassed ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}
          >
            {ready ? "Reviewed" : sourcePassed ? "Draft" : "Waiting for Qualification"}
          </span>
        </div>
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
          <div className="font-semibold">From Qualification [1.01]</div>
          <div className="mt-1 truncate">{estimate.projectName || "Project name pending"}</div>
          <div className="truncate text-slate-500">
            {estimate.projectAddress || "Project address pending"}
          </div>
          <div className="mt-1 text-slate-500">
            {estimate.grossAreaSqFt
              ? `${estimate.grossAreaSqFt.toLocaleString()} sq. ft.`
              : "Area pending"}{" "}
            · {estimate.client || "Client pending"}
          </div>
        </div>
        {!sourcePassed && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
            <LockKeyhole className="size-3.5" /> Score at least 52/84 and select the CSA, PCS or LOI
            route.
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {input(
            "Total project budget",
            "estimationTotalProjectBudget",
            estimate.totalProjectBudget,
          )}
          {input("Module budget", "estimationModuleBudget", estimate.moduleBudget)}
          {input("Base price", "estimationBasePrice", estimate.basePrice)}
          {input("Options / credits", "estimationOptionsAndCredits", estimate.optionsAndCredits)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-teal-50 p-2 text-xs dark:bg-teal-950/30">
          <div>
            <span className="text-slate-500">Estimate total</span>
            <div className="font-bold text-teal-700 dark:text-teal-300">
              {money(estimate.total)}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Per sq. ft.</span>
            <div className="font-bold">
              {estimate.perSqFt === undefined ? "—" : money(estimate.perSqFt)}
            </div>
          </div>
        </div>
        {estimate.budgetFits === false && (
          <p className="mt-1 text-xs text-rose-600">Estimate exceeds the module budget.</p>
        )}
        <div className="mt-2">
          {input("Prepared by", "estimationPreparedBy", estimate.preparedBy, "text")}
        </div>
        <label className="nodrag mt-3 flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={estimate.reviewed}
            disabled={
              !sourcePassed ||
              estimate.basePrice <= 0 ||
              !estimate.preparedBy ||
              estimate.budgetFits === false
            }
            onChange={(event) => update("estimationReviewed", event.target.checked)}
          />
          <span className="flex items-center gap-1">
            {ready && <CheckCircle2 className="size-3.5 text-emerald-600" />} Reviewed for
            budgeting; not a price or offer.
          </span>
        </label>
      </div>
    </div>
  );
}
