"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { ClipboardCheck, FileSpreadsheet, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { qualificationOf, qualificationRoute, type Qualification } from "@/lib/qualification";
import {
  FORM_101_CODE,
  FORM_101_MAX_SCORE,
  FORM_101_OPTIONAL_MAX_SCORE,
  FORM_101_PASS_PERCENT,
  FORM_101_PASS_SCORE,
  FORM_101_REQUIRED_MAX_SCORE,
  FORM_101_VERSION,
  evaluateQualificationForm101,
  evaluateQualificationGate,
  type QualificationForm101,
} from "@/lib/qualification-form-101";
import { QualificationForm101Dialog, gradeToneClasses } from "./qualification-form-101-dialog";
import { COMMERCIAL_ROUTE_STYLE } from "@/lib/commercial-routes";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const routes = ["CSA", "PCS", "LOI"] as const;
const routePositions = { CSA: "16%", PCS: "50%", LOI: "84%" } as const;

export function QualificationNode({ node, selected }: { node: DomainNode; selected: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const workflowTitle = useWorkflowStore((state) => state.file.graph.metadata.name);
  const qualification = qualificationOf(node);
  const score = evaluateQualificationForm101(qualification);
  const gate = evaluateQualificationGate(qualification);
  const route = qualificationRoute(qualification);

  const update = (patch: Partial<Qualification>) => {
    const next = { ...qualification, ...patch };
    const derived = qualificationRoute(next);
    next.commercialPath = derived;
    useWorkflowStore.getState().updateNode(node.id, {
      config: { ...node.config, qualification: next },
    });
  };
  const saveForm = (form101: QualificationForm101 | undefined) => update({ form101 });

  const choiceClass = (active: boolean) =>
    cn(
      "nodrag rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5",
    );

  return (
    <div
      data-qualification-node
      className={cn(
        "workflow-node l2-node-card relative flex h-full w-full flex-col overflow-visible rounded-2xl border-2 bg-card/95 shadow-[0_6px_18px_rgba(37,99,169,.12)]",
        selected && "ring-2 ring-primary/80 ring-offset-2 ring-offset-background",
      )}
      style={{ borderColor: "#2563a955" }}
    >
      <div
        data-node-header
        className="flex h-12 shrink-0 cursor-grab items-center gap-2 rounded-t-2xl border-b bg-primary/10 px-3 active:cursor-grabbing"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ClipboardCheck className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Qualification
          </p>
          <p className="truncate text-sm font-bold">{node.title || "Qualification"}</p>
        </div>
        <span
          data-qualification-score
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-bold tabular-nums",
            gradeToneClasses(score.grade),
          )}
        >
          {score.totalScore}/{FORM_101_MAX_SCORE} ·{" "}
          {Math.round((score.totalScore / FORM_101_MAX_SCORE) * 100)}%
        </span>
        <span
          data-qualification-gate-status
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-bold",
            gate.passed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
              : gate.scorePassed
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
                : "border-rose-500/40 bg-rose-500/10 text-rose-700",
          )}
        >
          {gate.statusLabel}
        </span>
      </div>

      <div
        data-qualification-internal-flow
        className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.16fr)_1.5rem_minmax(0,.9fr)] items-stretch gap-3 bg-muted/20 p-3"
      >
        <section
          data-qualification-flow-step="form101"
          aria-label="Qualification Form 1.01"
          className="flex min-w-0 flex-col rounded-xl border bg-card p-3 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b pb-2">
            <FileSpreadsheet className="size-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Node 1</p>
              <h3 className="text-sm font-bold">Qualification Form [{FORM_101_CODE}]</h3>
            </div>
            <span className="text-[10px] text-muted-foreground">v{FORM_101_VERSION}</span>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm font-bold tabular-nums">
            <span>
              {score.totalScore} / {FORM_101_MAX_SCORE} points
            </span>
            <span className={gate.scorePassed ? "text-emerald-700" : "text-rose-700"}>
              Pass: {FORM_101_PASS_SCORE} ({FORM_101_PASS_PERCENT}%)
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                gate.scorePassed ? "bg-emerald-600" : "bg-primary",
              )}
              style={{ width: `${(score.totalScore / FORM_101_MAX_SCORE) * 100}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px]">
            {[
              {
                id: "required",
                label: "Required",
                score: score.requiredScore,
                maxScore: FORM_101_REQUIRED_MAX_SCORE,
              },
              {
                id: "optional",
                label: "Optional",
                score: score.optionalScore,
                maxScore: FORM_101_OPTIONAL_MAX_SCORE,
              },
            ].map((category) => (
              <div
                key={category.id}
                data-qualification-score-category={category.id}
                className="flex justify-between rounded border bg-background/70 px-2 py-1"
              >
                <span className="font-bold">{category.label}</span>
                <span>
                  {category.score}/{category.maxScore}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Required questions are worth 52 points; optional questions add up to 32 points. The
            complete form is worth 84 points.
          </p>
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nodrag mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            <FileSpreadsheet className="size-4" /> Open Form [{FORM_101_CODE}]
          </button>
        </section>

        <div
          data-qualification-flow-arrow
          aria-hidden="true"
          className="flex shrink-0 items-center text-xl font-bold text-slate-400"
        >
          <span className={gate.scorePassed ? "text-emerald-600" : ""}>→</span>
        </div>

        <section
          data-qualification-flow-step="route"
          aria-label="CSA PCS LOI route"
          className="flex min-w-0 flex-col rounded-xl border bg-card p-3 shadow-sm"
        >
          <div className="flex items-center gap-2 border-b pb-2">
            <GitBranch className="size-5 text-primary" />
            <div>
              <p className="text-[9px] font-bold uppercase text-muted-foreground">Node 2</p>
              <h3 className="text-sm font-bold">Choose CSA / PCS / LOI</h3>
            </div>
          </div>
          <p className="mt-3 text-[11px] font-semibold">Customer history</p>
          <div className="mt-1 flex gap-2" role="group" aria-label="Customer history">
            <button
              type="button"
              aria-pressed={qualification.customerHistory === "new"}
              onClick={() =>
                update({
                  customerHistory: "new",
                  plansAvailable: undefined,
                  commercialPath: undefined,
                })
              }
              className={choiceClass(qualification.customerHistory === "new")}
            >
              New customer
            </button>
            <button
              type="button"
              aria-pressed={qualification.customerHistory === "existing"}
              onClick={() =>
                update({
                  customerHistory: "existing",
                  plansAvailable: undefined,
                  commercialPath: undefined,
                })
              }
              className={choiceClass(qualification.customerHistory === "existing")}
            >
              Existing customer
            </button>
          </div>
          {qualification.customerHistory === "new" && (
            <>
              <p className="mt-3 text-[11px] font-semibold">Plans available?</p>
              <div className="mt-1 flex gap-2" role="group" aria-label="Plans available">
                <button
                  type="button"
                  aria-pressed={qualification.plansAvailable === "no"}
                  onClick={() => update({ plansAvailable: "no" })}
                  className={choiceClass(qualification.plansAvailable === "no")}
                >
                  No plans
                </button>
                <button
                  type="button"
                  aria-pressed={qualification.plansAvailable === "yes"}
                  onClick={() => update({ plansAvailable: "yes" })}
                  className={choiceClass(qualification.plansAvailable === "yes")}
                >
                  Has plans
                </button>
              </div>
            </>
          )}
          {qualification.customerHistory === "existing" && (
            <>
              <p className="mt-3 text-[11px] font-semibold">Choose the route</p>
              <div
                className="mt-1 grid grid-cols-3 gap-2"
                role="group"
                aria-label="Existing customer route"
              >
                {routes.map((path) => (
                  <button
                    key={path}
                    type="button"
                    aria-pressed={route === path}
                    onClick={() => update({ commercialPath: path })}
                    className={choiceClass(route === path)}
                  >
                    {path}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            New: CSA without plans or PCS with plans. Existing: CSA or PCS, with LOI as an
            additional option.
          </p>
          <p
            data-qualification-route
            className="mt-auto pt-3 text-xs font-semibold text-foreground"
          >
            Route: {route ?? "Select customer history and plans"}
          </p>
        </section>
      </div>

      <QualificationForm101Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        qualification={qualification}
        workflowTitleHint={workflowTitle}
        onSave={saveForm}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-slate-500"
      />
      {routes.map((path) => (
        <div
          key={path}
          className="pointer-events-none absolute right-0 z-20"
          style={{ top: routePositions[path] }}
        >
          <span className="absolute right-4 -translate-y-1/2 rounded bg-card/95 px-1 text-[9px] font-bold text-muted-foreground">
            {path}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={path}
            className={`!right-[-6px] !size-3 !border-2 !border-background ${route === path && gate.passed ? "commercial-route-handle-active" : ""}`}
            style={{
              backgroundColor:
                route === path && gate.passed ? COMMERCIAL_ROUTE_STYLE[path].color : "#94a3b8",
            }}
          />
        </div>
      ))}
    </div>
  );
}
