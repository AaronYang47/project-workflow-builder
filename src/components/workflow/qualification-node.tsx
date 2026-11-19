"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { ClipboardCheck, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMMERCIAL_PATHS,
  QUALIFICATION_FIELDS,
  qualificationOf,
  qualificationRoute,
  type Qualification,
} from "@/lib/qualification";
import {
  FORM_101_CODE,
  FORM_101_VERSION,
  evaluateQualificationForm101,
  type QualificationForm101,
} from "@/lib/qualification-form-101";
import { QualificationForm101Dialog, gradeToneClasses } from "./qualification-form-101-dialog";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const ACCENT = "#2563a9";

/** A left-to-right arrow drawn inside the node, so exports keep it. */
function Arrow({ active, label }: { active: boolean; label?: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1" aria-hidden="true">
      {label ? (
        <span
          className={cn(
            "mb-0.5 text-[10px] font-bold uppercase",
            active ? "text-foreground" : "text-muted-foreground/60",
          )}
        >
          {label}
        </span>
      ) : null}
      <svg width="34" height="12" viewBox="0 0 34 12">
        <path d="M0 6 H26" stroke={active ? ACCENT : "#94a3b8"} strokeWidth="2" />
        <path d="M24 1 L33 6 L24 11 Z" fill={active ? ACCENT : "#94a3b8"} />
      </svg>
    </div>
  );
}

/**
 * L2 Qualification: who the client is, then "Plans Available?". With plans the
 * project goes LOI / CSA / PCS; without plans it goes to CSA (Concept
 * Consultation). Both routes continue into the existing workflow. Nothing here
 * blocks the project (a pending GC can go on), and every choice can change later.
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
    if (!nextForm) {
      const rest = { ...qualification };
      delete rest.form101;
      writeQualification(rest);
      return;
    }
    writeQualification({ ...qualification, form101: nextForm });
  };
  const plans = qualification.plansAvailable;
  const route = qualificationRoute(qualification);
  const formEval = evaluateQualificationForm101(qualification);
  const choice = (active: boolean) =>
    cn(
      "nodrag rounded-md border px-2 py-1 text-[11px] font-bold transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "bg-background text-muted-foreground hover:bg-muted",
    );

  return (
    <div
      data-qualification-node
      className={cn(
        "workflow-node l2-node-card flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-[0_6px_18px_rgba(37,99,169,.12)]",
        selected && "ring-2 ring-primary/80 ring-offset-2 ring-offset-background",
      )}
      style={{ borderColor: `${ACCENT}55` }}
    >
      <div
        data-node-header
        className="flex h-12 shrink-0 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing"
        style={{ background: `color-mix(in srgb, ${ACCENT} 14%, transparent)` }}
      >
        <span
          className="flex size-8 items-center justify-center rounded-lg text-white"
          style={{ background: ACCENT }}
        >
          <ClipboardCheck className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Qualification
          </p>
          <p className="truncate text-sm font-bold">{node.title || "Qualification"}</p>
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

      <div className="flex min-h-0 flex-1 items-stretch gap-1 px-3 py-2.5">
        {/* 1. Qualification */}
        <section
          aria-label="Qualification details"
          className="grid w-56 shrink-0 gap-1.5 rounded-xl border bg-background/70 p-2"
        >
          {QUALIFICATION_FIELDS.map((field) => (
            <label key={field.key} className="grid gap-0.5 text-[10px] font-semibold">
              <span className="text-muted-foreground">{field.label}</span>
              <select
                aria-label={field.label}
                value={qualification[field.key] ?? ""}
                onChange={(event) =>
                  update({ [field.key]: event.target.value || undefined } as Partial<Qualification>)
                }
                className="nodrag h-7 rounded-md border bg-background px-1.5 text-xs font-normal print:hidden"
              >
                <option value="">Choose…</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {/* Printed copies lose a select's value, so the PDF shows it as text. */}
              <span
                data-qualification-print-value={field.key}
                className="hidden h-7 items-center rounded-md border bg-background px-1.5 text-xs font-normal print:flex"
              >
                {qualification[field.key] ?? "Not set"}
              </span>
            </label>
          ))}
          {qualification.gcStatus && qualification.gcStatus !== "Confirmed" ? (
            <p data-gc-pending className="text-[10px] leading-snug text-muted-foreground">
              GC not confirmed yet — the project can still go ahead with the early steps.
            </p>
          ) : null}
        </section>

        <Arrow active />

        {/* 2. Plans Available? */}
        <section
          aria-label="Plans Available?"
          className="flex w-36 shrink-0 flex-col items-center justify-center gap-6"
        >
          <div className="flex size-20 rotate-45 items-center justify-center rounded-lg border-2 border-primary/50 bg-primary/10">
            <span className="-rotate-45 text-center text-[11px] font-bold leading-tight">
              Plans
              <br />
              Available?
            </span>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-pressed={plans === "yes"}
              onClick={() => update({ plansAvailable: plans === "yes" ? undefined : "yes" })}
              className={choice(plans === "yes")}
            >
              Yes
            </button>
            <button
              type="button"
              aria-pressed={plans === "no"}
              onClick={() => update({ plansAvailable: plans === "no" ? undefined : "no" })}
              className={choice(plans === "no")}
            >
              No
            </button>
          </div>
        </section>

        {/* 3. The two routes */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <div
            data-qualification-branch="yes"
            className={cn("flex items-center", plans === "no" && "opacity-40")}
          >
            <Arrow active={plans === "yes"} label="Yes" />
            <section
              aria-label="With plans"
              className={cn(
                "flex-1 rounded-xl border p-2",
                plans === "yes" ? "border-primary bg-primary/[0.06]" : "bg-background/70",
              )}
            >
              <p className="text-[11px] font-bold">Plans available → choose the path</p>
              <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Commercial path">
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
                    className={choice(qualification.commercialPath === path)}
                  >
                    {path}
                  </button>
                ))}
              </div>
            </section>
          </div>
          <div
            data-qualification-branch="no"
            className={cn("flex items-center", plans === "yes" && "opacity-40")}
          >
            <Arrow active={plans === "no"} label="No" />
            <section
              aria-label="Without plans"
              className={cn(
                "flex-1 rounded-xl border p-2",
                plans === "no" ? "border-primary bg-primary/[0.06]" : "bg-background/70",
              )}
            >
              <p className="text-[11px] font-bold">No plans → CSA (Concept Consultation)</p>
              <p className="text-[10px] text-muted-foreground">
                Concept consultation before plans exist.
              </p>
            </section>
          </div>
        </div>

        <Arrow active={Boolean(route)} />
        <div className="flex w-24 shrink-0 items-center justify-center rounded-xl border border-dashed p-2 text-center text-[10px] font-semibold leading-tight text-muted-foreground">
          Continue to the existing workflow
        </div>
      </div>

      {/* Form [1.01] Completeness & Client Score Bar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-background/60 px-3 py-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <span className="font-bold uppercase tracking-wider text-foreground">
              Form [{FORM_101_CODE}]
            </span>
            <span className="text-muted-foreground">
              v{FORM_101_VERSION}
              {qualification.form101?.revision ? ` · Rev ${qualification.form101.revision}` : ""}
            </span>
            <span className="font-semibold text-foreground tabular-nums">
              {formEval.gradeLabel}
            </span>
            <span className="text-muted-foreground tabular-nums">
              A1 {formEval.sections[0].score}/{formEval.sections[0].maxScore} · A2{" "}
              {formEval.sections[1].score}/{formEval.sections[1].maxScore} · A3{" "}
              {formEval.sections[2].score}/{formEval.sections[2].maxScore} · B{" "}
              {formEval.sections[3].score}/{formEval.sections[3].maxScore}
            </span>
            {formEval.openRfiCount > 0 ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-800 dark:text-amber-300 tabular-nums">
                RFIs: {formEval.openRfiCount}
              </span>
            ) : null}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${formEval.totalScore}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="nodrag print:hidden inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
        >
          <FileSpreadsheet className="size-3.5" />
          Open Form [1.01]
        </button>
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
