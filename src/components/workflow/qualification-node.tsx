"use client";

import { useState, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Check,
  ClipboardCheck,
  FileSpreadsheet,
  GitBranch,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMMERCIAL_PATHS,
  QUALIFICATION_FIELDS,
  qualificationOf,
  qualificationRoute,
  type Qualification,
  type QualificationTechReview,
} from "@/lib/qualification";
import {
  FORM_101_CODE,
  FORM_101_PASS_SCORE,
  FORM_101_VERSION,
  evaluateQualificationForm101,
  evaluateQualificationGate,
  type QualificationForm101,
  type QualificationGateState,
} from "@/lib/qualification-form-101";
import { QualificationForm101Dialog, gradeToneClasses } from "./qualification-form-101-dialog";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const ACCENT = "#2563a9";

function gateBadgeTone(state: QualificationGateState) {
  if (state === "passed") {
    return "border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  }
  if (state === "pending_review") {
    return "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-300";
  }
  return "border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-300";
}

/** Directional arrow connecting two internal sub-nodes left-to-right. */
function SubNodeArrow({ completed, active }: { completed: boolean; active: boolean }) {
  const stroke = completed ? "#059669" : active ? ACCENT : "#94a3b8";
  return (
    <div
      data-qualification-flow-arrow
      className="flex shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <svg width="26" height="14" viewBox="0 0 26 14" className="overflow-visible">
        <path
          d="M0 7 H18"
          stroke={stroke}
          strokeWidth={completed || active ? "2.2" : "1.8"}
          strokeLinecap="round"
        />
        <path d="M16 2.5 L25 7 L16 11.5 Z" fill={stroke} />
      </svg>
    </div>
  );
}

/** Internal sub-node card styled like a mini L2 workflow node. */
function InternalStepNode({
  stepId,
  stepNumber,
  title,
  icon,
  statusLabel,
  statusTone,
  done,
  current,
  hasIncoming,
  hasOutgoing,
  ariaLabel,
  dataAttr,
  children,
}: {
  stepId: string;
  stepNumber: number;
  title: string;
  icon: ReactNode;
  statusLabel: string;
  statusTone: "emerald" | "amber" | "rose" | "muted";
  done: boolean;
  current: boolean;
  hasIncoming?: boolean;
  hasOutgoing?: boolean;
  ariaLabel: string;
  dataAttr?: Record<string, string | boolean>;
  children: ReactNode;
}) {
  const accentColor = done ? "#059669" : statusTone === "rose" ? "#e11d48" : ACCENT;
  const badgeCls =
    statusTone === "emerald"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : statusTone === "rose"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
        : statusTone === "amber"
          ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
          : "bg-muted text-muted-foreground";

  return (
    <section
      aria-label={ariaLabel}
      data-qualification-flow-step={stepId}
      {...dataAttr}
      className={cn(
        "relative flex min-w-0 flex-1 flex-col rounded-xl border bg-card shadow-[0_2px_10px_rgba(15,23,42,.07)] transition-all",
        done
          ? "border-emerald-500/45"
          : current
            ? "border-primary/60 ring-2 ring-primary/20"
            : "border-border/90",
      )}
    >
      {/* Mini left/right connector dots matching L2 node handles */}
      {hasIncoming ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-[5px] top-1/2 z-10 size-2.5 -translate-y-1/2 rounded-full border-2 border-card bg-slate-400"
        />
      ) : null}
      {hasOutgoing ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-[5px] top-1/2 z-10 size-2.5 -translate-y-1/2 rounded-full border-2 border-card"
          style={{ backgroundColor: accentColor }}
        />
      ) : null}

      {/* Sub-node Header (mirrors GeneralNode header) */}
      <div
        className="flex h-10 shrink-0 items-center gap-2 rounded-t-[11px] border-b px-2.5"
        style={{
          backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
          borderColor: `color-mix(in srgb, ${accentColor} 24%, transparent)`,
        }}
      >
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-white shadow-xs"
          style={{ backgroundColor: accentColor }}
        >
          {done ? <Check className="size-3.5" /> : icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            Step {stepNumber}
          </p>
          <p className="truncate text-xs font-bold text-foreground leading-tight">{title}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
            badgeCls,
          )}
        >
          {statusLabel}
        </span>
      </div>

      {/* Sub-node Body */}
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-2.5">{children}</div>
    </section>
  );
}

/**
 * L2 Qualification container holding 4 arrow-connected internal sub-nodes
 * styled like regular L2 workflow nodes:
 * 1. Basics -> 2. Plans & Route -> 3. Form [1.01] -> 4. Tech Review.
 */
export function QualificationNode({ node, selected }: { node: DomainNode; selected: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const workflowTitle = useWorkflowStore((state) => state.file.graph.metadata.name);
  const qualification = qualificationOf(node);

  const writeQualification = (next: Qualification) =>
    useWorkflowStore.getState().updateNode(node.id, {
      config: { ...node.config, qualification: next },
    });
  const update = (patch: Partial<Qualification>) =>
    writeQualification({ ...qualification, ...patch });

  const saveForm101 = (nextForm: QualificationForm101 | undefined) => {
    const nextEval = evaluateQualificationForm101({ ...qualification, form101: nextForm });
    const resetApproved =
      nextEval.totalScore < FORM_101_PASS_SCORE && qualification.techReview?.status === "approved";
    const nextQualification: Qualification = { ...qualification };
    if (!nextForm) delete nextQualification.form101;
    else nextQualification.form101 = nextForm;
    if (resetApproved && qualification.techReview) {
      nextQualification.techReview = { ...qualification.techReview, status: "pending" };
    }
    writeQualification(nextQualification);
  };

  const updateTechReview = (patch: Partial<QualificationTechReview>) => {
    const current: QualificationTechReview = qualification.techReview ?? { status: "pending" };
    if (patch.status === "approved" && !gate.scorePassed) return;
    const nextReview: QualificationTechReview = {
      ...current,
      ...patch,
      ...(patch.status && patch.status !== "pending"
        ? { reviewedAt: new Date().toISOString().slice(0, 10) }
        : {}),
    };
    writeQualification({ ...qualification, techReview: nextReview });
  };

  const plans = qualification.plansAvailable;
  const route = qualificationRoute(qualification);
  const formEval = evaluateQualificationForm101(qualification);
  const gate = evaluateQualificationGate(qualification);
  const review = qualification.techReview ?? { status: "pending" as const };

  const basicsFilled = QUALIFICATION_FIELDS.filter((f) => Boolean(qualification[f.key])).length;
  const basicsDone = basicsFilled === QUALIFICATION_FIELDS.length;
  const routeDone =
    plans === "no" || (plans === "yes" && Boolean(qualification.commercialPath));
  const formDone = gate.scorePassed;
  const reviewDone = gate.passed;

  // Highlight the first incomplete step so the user always sees what's next.
  const currentStep = !basicsDone ? 1 : !routeDone ? 2 : !formDone ? 3 : !reviewDone ? 4 : 0;

  const choice = (active: boolean) =>
    cn(
      "nodrag rounded-md border px-2.5 py-1 text-[11px] font-bold transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background text-muted-foreground hover:bg-muted",
    );

  return (
    <div
      data-qualification-node
      className={cn(
        "workflow-node l2-node-card flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 bg-card/95 shadow-[0_6px_18px_rgba(37,99,169,.12)]",
        selected && "ring-2 ring-primary/80 ring-offset-2 ring-offset-background",
      )}
      style={{ borderColor: `${ACCENT}55` }}
    >
      {/* Container Header */}
      <div
        data-node-header
        className="flex h-12 shrink-0 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing"
        style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-xs"
          style={{ background: ACCENT }}
        >
          <ClipboardCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            Qualification
          </p>
          <p className="truncate text-sm font-bold leading-tight">
            {node.title || "Qualification"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            data-qualification-score
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
              gradeToneClasses(formEval.grade),
            )}
          >
            Score: {formEval.totalScore}/100 ({formEval.grade})
          </span>
          <span
            data-qualification-gate-status
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold",
              gateBadgeTone(gate.state),
            )}
          >
            {gate.statusLabel}
          </span>
          {route ? (
            <span
              data-qualification-route
              className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
            >
              Route: {route}
            </span>
          ) : null}
        </div>
      </div>

      {/* 4 Internal Sub-Nodes Connected by Arrows */}
      <div
        data-qualification-internal-flow
        className="flex min-h-0 flex-1 items-stretch gap-1 bg-muted/20 p-3"
      >
        {/* Sub-node 1: Basics */}
        <InternalStepNode
          stepId="basics"
          stepNumber={1}
          title="Basics"
          icon={<UserCheck className="size-3.5" />}
          statusLabel={basicsDone ? "Done" : `${basicsFilled}/4`}
          statusTone={basicsDone ? "emerald" : "muted"}
          done={basicsDone}
          current={currentStep === 1}
          hasOutgoing
          ariaLabel="Qualification details"
        >
          <div className="grid gap-1.5">
            {QUALIFICATION_FIELDS.map((field) => (
              <label key={field.key} className="grid gap-0.5 text-[10px] font-semibold">
                <span className="text-muted-foreground">{field.label}</span>
                <select
                  aria-label={field.label}
                  value={qualification[field.key] ?? ""}
                  onChange={(event) =>
                    update({
                      [field.key]: event.target.value || undefined,
                    } as Partial<Qualification>)
                  }
                  className="nodrag h-7 rounded-md border bg-background px-1.5 text-xs font-normal outline-none focus:border-primary print:hidden"
                >
                  <option value="">Choose…</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <span
                  data-qualification-print-value={field.key}
                  className="hidden h-7 items-center rounded-md border bg-background px-1.5 text-xs font-normal print:flex"
                >
                  {qualification[field.key] ?? "Not set"}
                </span>
              </label>
            ))}
          </div>
          {qualification.gcStatus && qualification.gcStatus !== "Confirmed" ? (
            <p
              data-gc-pending
              className="rounded-md bg-amber-500/10 px-2 py-1 text-[10px] leading-snug text-amber-800 dark:text-amber-300"
            >
              GC not confirmed yet — the project can still go ahead with the early steps.
            </p>
          ) : null}
        </InternalStepNode>

        <SubNodeArrow completed={basicsDone} active={currentStep === 2} />

        {/* Sub-node 2: Plans & Route */}
        <InternalStepNode
          stepId="route"
          stepNumber={2}
          title="Plans & Route"
          icon={<GitBranch className="size-3.5" />}
          statusLabel={routeDone ? "Set" : "Pending"}
          statusTone={routeDone ? "emerald" : "muted"}
          done={routeDone}
          current={currentStep === 2}
          hasIncoming
          hasOutgoing
          ariaLabel="Plans Available?"
        >
          <div className="space-y-2.5">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-foreground">Plans Available?</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-pressed={plans === "yes"}
                  onClick={() => update({ plansAvailable: plans === "yes" ? undefined : "yes" })}
                  className={cn(choice(plans === "yes"), "flex-1")}
                >
                  Yes
                </button>
                <button
                  type="button"
                  aria-pressed={plans === "no"}
                  onClick={() => update({ plansAvailable: plans === "no" ? undefined : "no" })}
                  className={cn(choice(plans === "no"), "flex-1")}
                >
                  No
                </button>
              </div>
            </div>

            {plans === "yes" ? (
              <div
                data-qualification-branch="yes"
                className="rounded-lg border border-primary/35 bg-primary/[0.06] p-2 space-y-1.5"
              >
                <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
                  Choose path
                </p>
                <div className="flex gap-1" role="radiogroup" aria-label="Commercial path">
                  {COMMERCIAL_PATHS.map((path) => (
                    <button
                      key={path}
                      type="button"
                      role="radio"
                      aria-checked={qualification.commercialPath === path}
                      onClick={() =>
                        update({
                          plansAvailable: "yes",
                          commercialPath: qualification.commercialPath === path ? undefined : path,
                        })
                      }
                      className={cn(choice(qualification.commercialPath === path), "flex-1 px-1.5")}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
            ) : plans === "no" ? (
              <div
                data-qualification-branch="no"
                className="rounded-lg border border-primary/35 bg-primary/[0.06] p-2 space-y-0.5"
              >
                <p className="text-[11px] font-bold text-foreground">CSA (Concept Consultation)</p>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Concept consultation before plans exist.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed px-2 py-3 text-center text-[10px] text-muted-foreground">
                Answer Yes or No to select the route.
              </p>
            )}
          </div>

          <p className="text-[10px] font-medium text-muted-foreground">
            Route:{" "}
            <span className="font-bold text-foreground">{route ?? "Not selected"}</span>
          </p>
        </InternalStepNode>

        <SubNodeArrow completed={routeDone} active={currentStep === 3} />

        {/* Sub-node 3: Form [1.01] */}
        <InternalStepNode
          stepId="form101"
          stepNumber={3}
          title={`Form [${FORM_101_CODE}]`}
          icon={<FileSpreadsheet className="size-3.5" />}
          statusLabel={`${formEval.totalScore}%`}
          statusTone={formDone ? "emerald" : "rose"}
          done={formDone}
          current={currentStep === 3}
          hasIncoming
          hasOutgoing
          ariaLabel="Form 1.01"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-muted-foreground">
                v{FORM_101_VERSION}
                {qualification.form101?.revision ? ` · Rev ${qualification.form101.revision}` : ""}
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-bold tabular-nums",
                  formDone
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
                )}
              >
                Min {FORM_101_PASS_SCORE}%
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold tabular-nums">
                <span>Grade {formEval.grade}</span>
                <span>{formEval.totalScore}/100</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    formDone ? "bg-emerald-600" : "bg-primary",
                  )}
                  style={{ width: `${formEval.totalScore}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground tabular-nums">
              {formEval.sections.map((section) => (
                <div
                  key={section.id}
                  className="flex items-center justify-between rounded border bg-background/70 px-1.5 py-0.5"
                >
                  <span className="font-bold text-foreground">{section.id}</span>
                  <span>
                    {section.score}/{section.maxScore}
                  </span>
                </div>
              ))}
            </div>

            {formEval.openRfiCount > 0 ? (
              <p className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 tabular-nums">
                Open RFIs: {formEval.openRfiCount}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nodrag print:hidden inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            <FileSpreadsheet className="size-3.5" />
            Open Form [{FORM_101_CODE}]
          </button>
        </InternalStepNode>

        <SubNodeArrow completed={formDone} active={currentStep === 4} />

        {/* Sub-node 4: Tech Review Gate */}
        <InternalStepNode
          stepId="review"
          stepNumber={4}
          title="Tech Review"
          icon={
            gate.passed ? (
              <ShieldCheck className="size-3.5" />
            ) : (
              <ShieldAlert className="size-3.5" />
            )
          }
          statusLabel={gate.passed ? "Passed" : !gate.scorePassed ? "< 70%" : review.status}
          statusTone={gate.passed ? "emerald" : !gate.scorePassed ? "rose" : "amber"}
          done={reviewDone}
          current={currentStep === 4}
          hasIncoming
          ariaLabel="Tech review"
          dataAttr={{ "data-tech-review-panel": true }}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border bg-background/80 px-2 py-1 text-[10px]">
              <span className="font-medium text-muted-foreground">Eligibility</span>
              <span
                className={cn(
                  "font-bold tabular-nums",
                  gate.scorePassed
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-rose-700 dark:text-rose-300",
                )}
              >
                {gate.totalScore}% · {gate.scorePassed ? "Eligible" : "Auto-Fail"}
              </span>
            </div>

            <label className="grid gap-0.5 text-[10px] font-semibold print:hidden">
              <span className="text-muted-foreground">Reviewer</span>
              <input
                aria-label="Tech reviewer"
                value={review.reviewer ?? ""}
                onChange={(event) => updateTechReview({ reviewer: event.target.value })}
                placeholder="Reviewer name"
                className="nodrag h-7 rounded-md border bg-background px-2 text-xs font-normal outline-none focus:border-primary"
              />
            </label>

            <div className="flex gap-1.5 print:hidden">
              <button
                type="button"
                aria-pressed={gate.reviewStatus === "approved" && gate.scorePassed}
                disabled={!gate.scorePassed}
                title={
                  gate.scorePassed
                    ? "Approve Tech Review to unlock next step"
                    : `Form [${FORM_101_CODE}] score must be at least ${FORM_101_PASS_SCORE}%`
                }
                onClick={() =>
                  updateTechReview({
                    status: review.status === "approved" ? "pending" : "approved",
                  })
                }
                className={cn(
                  "nodrag flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors",
                  gate.passed
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "bg-background text-foreground hover:bg-muted",
                  !gate.scorePassed && "cursor-not-allowed opacity-45 hover:bg-background",
                )}
              >
                <Check className="size-3" />
                Approve
              </button>
              <button
                type="button"
                aria-pressed={review.status === "rejected"}
                onClick={() =>
                  updateTechReview({
                    status: review.status === "rejected" ? "pending" : "rejected",
                  })
                }
                className={cn(
                  "nodrag flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors",
                  review.status === "rejected"
                    ? "border-rose-600 bg-rose-600 text-white"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                <X className="size-3" />
                Reject
              </button>
            </div>

            <div className="hidden text-[10px] text-muted-foreground print:block">
              Reviewer: {review.reviewer || "Unassigned"} · {gate.statusLabel}
            </div>
          </div>

          <p
            data-tech-review-hint
            className={cn(
              "text-[10px] font-semibold leading-tight",
              gate.passed
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300",
            )}
          >
            {gate.passed
              ? "Cleared — next step unlocked."
              : !gate.scorePassed
                ? `Cannot pass: score is below ${FORM_101_PASS_SCORE}%.`
                : review.status === "rejected"
                  ? "Blocked: Tech Review rejected."
                  : "Blocked until Tech Review approves."}
          </p>
        </InternalStepNode>
      </div>

      <QualificationForm101Dialog
        open={formOpen}
        onOpenChange={setFormOpen}
        qualification={qualification}
        workflowTitleHint={workflowTitle}
        onSave={saveForm101}
      />

      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-slate-500"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: ACCENT }}
      />
    </div>
  );
}
