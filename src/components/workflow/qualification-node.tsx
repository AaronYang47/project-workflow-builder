"use client";

import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { ClipboardCheck, FileDown, FileSpreadsheet, History, Megaphone, X } from "lucide-react";
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
  normalizeQualificationForm101,
  type QualificationForm101,
} from "@/lib/qualification-form-101";
import { QualificationForm101Dialog, gradeToneClasses } from "./qualification-form-101-dialog";
import { ScoreExplanation } from "./qualification-form-101/score-explanation";
import { COMMERCIAL_ROUTE_STYLE } from "@/lib/commercial-routes";
import { useWorkflowStore } from "@/store/workflow-store";
import { salesHistoryOf, salesSubmissionOf } from "@/lib/sales-intake";
import { describeChange } from "@/lib/qf-changes";
import * as Dialog from "@radix-ui/react-dialog";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import { loadQfLogo, qualificationFormPdfBlob, qualificationFormPdfName } from "@/lib/qf-pdf";
import { DepartmentHeaderBar } from "./node-department-field";
import type { DomainNode } from "@/types/workflow";

export function QualificationNode({ node, selected }: { node: DomainNode; selected: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const workflowTitle = useWorkflowStore((state) => state.file.graph.metadata.name);
  const qualification = qualificationOf(node);
  const score = evaluateQualificationForm101(qualification);
  const gate = evaluateQualificationGate(qualification);
  const route = qualificationRoute(qualification);
  const salesSubmission = salesSubmissionOf(qualification);
  const salesHistory = salesHistoryOf(qualification);
  const latestEntry = salesHistory.at(-1);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      const file = useWorkflowStore.getState().file;
      const form = normalizeQualificationForm101(qualification.form101);
      const meta = {
        projectName: file.graph.metadata.name || "Project",
        jobNumber: workflowLegacyJobNumber(file),
      };
      const blob = await qualificationFormPdfBlob(form, {
        ...meta,
        revisions: salesHistory,
        logoDataUrl: await loadQfLogo(),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = qualificationFormPdfName(form, meta);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      setPdfBusy(false);
    }
  };

  const update = (patch: Partial<Qualification>) => {
    const next = { ...qualification, ...patch };
    const derived = qualificationRoute(next);
    next.commercialPath = derived;
    useWorkflowStore.getState().updateNode(node.id, {
      config: { ...node.config, qualification: next },
    });
  };
  const saveForm = (form101: QualificationForm101 | undefined) =>
    update({
      form101,
      clientCategory: undefined,
      customerTier: undefined,
      customerHistory: undefined,
      plansAvailable: undefined,
      commercialPath: undefined,
    });

  return (
    <div
      data-qualification-node
      className={cn(
        "workflow-node l2-node-card relative flex h-full w-full flex-col overflow-visible rounded-2xl border-2 bg-card/95 shadow-[0_6px_18px_rgba(37,99,169,.12)]",
        selected && "ring-2 ring-primary/80 ring-offset-2 ring-offset-background",
      )}
      style={{ borderColor: node.color || "#2563a9" }}
    >
      <DepartmentHeaderBar
        node={node}
        icon={ClipboardCheck}
        color={node.color || "#2563a9"}
        className="shrink-0 rounded-t-2xl"
      />
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Qualification
          </p>
          <p className="truncate text-sm font-bold">{node.title || "Qualification"}</p>
        </div>
        <ScoreExplanation
          score={score}
          className="nodrag"
          align="right"
          targetClassName={cn(
            "rounded-full border px-2 py-1 text-[10px] font-bold tabular-nums",
            gradeToneClasses(score.grade),
          )}
        >
          <span data-qualification-score>
            {score.totalScore}/{FORM_101_MAX_SCORE} ·{" "}
            {Math.round((score.totalScore / FORM_101_MAX_SCORE) * 100)}%
          </span>
        </ScoreExplanation>
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
        className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 bg-muted/20 p-3"
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
            <ScoreExplanation score={score} className="nodrag">
              {score.totalScore} / {FORM_101_MAX_SCORE} points
            </ScoreExplanation>
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
            Grade {score.grade} · {score.scoreStage.label}
          </p>
          {salesSubmission ? (
            <p
              data-sales-submission
              className="mb-3 mt-2 flex items-start gap-1.5 rounded-lg border border-violet-500/35 bg-violet-500/10 px-2 py-1.5 text-[11px] font-semibold text-violet-800 dark:text-violet-200"
              title={salesSubmission.email}
            >
              <Megaphone className="mt-px size-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                Submitted by Sales: {salesSubmission.by} ·{" "}
                {new Date(salesSubmission.at).toLocaleDateString()} · Rev {salesSubmission.revision}
                {latestEntry && !latestEntry.first
                  ? ` · ${latestEntry.changes.length} ${
                      latestEntry.changes.length === 1 ? "change" : "changes"
                    }`
                  : ""}
              </span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="nodrag mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
          >
            <FileSpreadsheet className="size-4" /> Open Form [{FORM_101_CODE}]
          </button>
          <div
            className={cn("mt-2.5 grid gap-2", salesHistory.length ? "grid-cols-2" : "grid-cols-1")}
          >
            {salesHistory.length ? (
              <button
                type="button"
                data-sales-history-open
                onClick={() => setHistoryOpen(true)}
                className="nodrag inline-flex items-center justify-center gap-1.5 rounded-lg border border-violet-500/35 px-2 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-500/10 dark:text-violet-200"
              >
                <History className="size-3.5" /> History ({salesHistory.length})
              </button>
            ) : null}
            <button
              type="button"
              data-qualification-pdf
              disabled={pdfBusy}
              onClick={() => void downloadPdf()}
              className="nodrag inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold hover:bg-muted disabled:opacity-60"
            >
              <FileDown className="size-3.5" /> {pdfBusy ? "Making PDF…" : "Download PDF"}
            </button>
          </div>
        </section>
      </div>

      <Dialog.Root open={historyOpen} onOpenChange={setHistoryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[70]" />
          <Dialog.Content
            data-sales-history
            className="liquid-glass-panel fixed left-1/2 top-1/2 z-[71] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl outline-none"
          >
            <div className="mb-3 flex items-center">
              <Dialog.Title className="text-lg font-bold">Sales update history</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              Each Sales submission and what it changed.
            </Dialog.Description>
            <ol className="space-y-3">
              {[...salesHistory].reverse().map((entry) => (
                <li key={`${entry.revision}-${entry.at}`} className="rounded-xl border p-3">
                  <p className="text-sm font-semibold">
                    Rev {entry.revision} · {entry.by} · {new Date(entry.at).toLocaleString()}
                  </p>
                  {entry.first ? (
                    <p className="mt-1 text-xs text-muted-foreground">First submission</p>
                  ) : entry.changes.length ? (
                    <ul className="mt-1.5 space-y-1 text-xs">
                      {entry.changes.map((change, index) => (
                        <li key={`${change.label}-${index}`} className="leading-snug">
                          {describeChange(change)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No changes</p>
                  )}
                </li>
              ))}
            </ol>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
      {/* One way out: on to Route Selection, which displays the derived route. */}
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className={`!size-3 !border-2 !border-background ${route && gate.passed ? "commercial-route-handle-active" : ""}`}
        style={{
          backgroundColor: route && gate.passed ? COMMERCIAL_ROUTE_STYLE[route].color : "#94a3b8",
        }}
      />
    </div>
  );
}
