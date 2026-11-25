"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LayoutList,
  ListChecks,
  RotateCcw,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { qualificationRoute, type Qualification } from "@/lib/qualification";
import {
  FORM_101_CODE,
  FORM_101_ORGANIZATION,
  FORM_101_PASS_SCORE,
  FORM_101_MAX_SCORE,
  FORM_101_PASS_PERCENT,
  FORM_101_VERSION,
  QUALIFICATION_SCORE_STAGES,
  compactQualificationForm101,
  createEmptyQualificationForm101,
  evaluateQualificationForm101,
  evaluateQualificationGate,
  normalizeQualificationForm101,
  type DisciplineKey,
  type QualificationForm101,
  type QualificationGrade,
} from "@/lib/qualification-form-101";
import {
  AnnexReferenceTab,
  SectionAIntake,
  SectionBIntake,
  SectionCIntake,
} from "./qualification-form-101/sections";
import {
  FORM_101_GROUPS,
  firstUnfinishedGroup,
  form101GroupIndex,
  isForm101GroupComplete,
  type FormGroup,
  type FormGroupId,
  type FormStepId,
} from "./qualification-form-101/steps";

import { ScoreExplanation } from "./qualification-form-101/score-explanation";

type ViewMode = "wizard" | "all" | "annex";

function newAnnexItemId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}

export function gradeToneClasses(grade: QualificationGrade) {
  if (grade === "A") {
    return "border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  }
  if (grade === "B") {
    return "border-sky-500/40 bg-sky-500/12 text-sky-700 dark:text-sky-300";
  }
  if (grade === "C") {
    return "border-amber-500/40 bg-amber-500/12 text-amber-800 dark:text-amber-300";
  }
  return "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300";
}

function QualificationForm101DialogBody({
  qualification,
  workflowTitleHint,
  onSave,
  onClose,
}: {
  qualification: Qualification;
  workflowTitleHint?: string;
  onSave: (nextForm: QualificationForm101 | undefined) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<QualificationForm101>(() =>
    normalizeQualificationForm101(qualification.form101),
  );
  const previewQualification: Qualification = { ...qualification, form101: draft };
  const route = qualificationRoute(previewQualification);
  const isLoi = route === "LOI";
  const [viewMode, setViewMode] = useState<ViewMode>("wizard");
  const [skippedSteps, setSkippedSteps] = useState<ReadonlySet<FormGroupId>>(() => new Set());
  const unlockedStep = firstUnfinishedGroup(draft, isLoi, skippedSteps);
  const [requestedStep, setStepIndex] = useState(unlockedStep);
  const stepIndex = Math.min(requestedStep, unlockedStep);
  const [showMissing, setShowMissing] = useState(false);

  const evaluation = evaluateQualificationForm101(previewQualification);
  const gate = evaluateQualificationGate(previewQualification);

  const scrollRef = useRef<HTMLDivElement>(null);
  const totalSteps = FORM_101_GROUPS.length;
  const currentStep = FORM_101_GROUPS[stepIndex];
  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const isLastStep = stepIndex === totalSteps - 1;
  const currentStepDone = isForm101GroupComplete(currentStep, draft, isLoi);
  const nextBlocked = currentStep.section === "a" && !currentStepDone;
  const stepIsUnlocked = (id: FormStepId) => {
    const target = form101GroupIndex(id);
    return target >= 0 && target <= unlockedStep;
  };

  const handleSave = () => {
    const compacted = compactQualificationForm101(draft);
    const compactedEval = evaluateQualificationForm101({ ...qualification, form101: compacted });
    if (!compactedEval.hasAnyInput) {
      onSave(undefined);
    } else {
      onSave({ ...compacted, updatedAt: new Date().toISOString() });
    }
    onClose();
  };

  const handleReset = () => {
    setDraft(createEmptyQualificationForm101());
    setSkippedSteps(new Set());
    setStepIndex(0);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const goToGroup = (index: number, anchorId?: string) => {
    setStepIndex(index);
    setViewMode("wizard");
    requestAnimationFrame(() => {
      const anchor = anchorId ? document.getElementById(anchorId) : null;
      if (anchor) anchor.scrollIntoView({ block: "start" });
      else scrollRef.current?.scrollTo({ top: 0 });
    });
  };

  const goPrev = () => goToGroup(Math.max(0, stepIndex - 1));
  const goNext = () => {
    if (nextBlocked || isLastStep) return;
    if (!currentStepDone) setSkippedSteps((previous) => new Set([...previous, currentStep.id]));
    // Skipping the current optional group unlocks the following group in the same update.
    goToGroup(stepIndex + 1);
  };

  const jumpToMissingItem = (anchorId: string, itemId: string) => {
    const target = form101GroupIndex(itemId as FormStepId);
    if (target >= 0)
      goToGroup(Math.min(unlockedStep, target), target <= unlockedStep ? anchorId : undefined);
    setShowMissing(false);
  };

  const insertDisciplineItem = (key: DisciplineKey, itemLabel: string) => {
    if (!stepIsUnlocked(`b-${key}`)) return;
    const id = newAnnexItemId();
    setDraft((prev) => ({
      ...prev,
      sectionB: {
        ...prev.sectionB,
        disciplines: {
          ...prev.sectionB.disciplines,
          [key]: {
            reviewedNone: false,
            items: [...prev.sectionB.disciplines[key].items, { id, item: itemLabel, remark: "" }],
          },
        },
      },
    }));
    goToGroup(form101GroupIndex(`b-${key}`), `q101-b-${key}`);
  };

  const insertSpecialItem = (itemLabel: string) => {
    if (!stepIsUnlocked("b-special")) return;
    const id = newAnnexItemId();
    setDraft((prev) => ({
      ...prev,
      sectionB: {
        ...prev.sectionB,
        specialProducts: {
          reviewedNone: false,
          items: [
            ...prev.sectionB.specialProducts.items,
            { id, item: itemLabel, description: "", supply: undefined, relatedFiles: "" },
          ],
        },
      },
    }));
    goToGroup(form101GroupIndex("b-special"), "q101-b8");
  };

  const renderGroup = (group: FormGroup, editable: boolean) => (
    <section key={group.id} className="space-y-3">
      <h2 className="text-sm font-bold text-primary">{group.title}</h2>
      {group.section === "a" ? (
        <SectionAIntake
          form={draft}
          onChange={setDraft}
          isLoi={isLoi}
          workflowTitleHint={workflowTitleHint}
          questions={group.questions}
          onAdvance={editable ? goNext : undefined}
        />
      ) : group.section === "b" ? (
        <SectionBIntake form={draft} onChange={setDraft} hideHeader />
      ) : (
        <SectionCIntake form={draft} onChange={setDraft} hideHeader />
      )}
    </section>
  );

  return (
    <Dialog.Content
      onKeyDown={(event) => {
        if (["Backspace", "Delete"].includes(event.key)) {
          event.stopPropagation();
        }
      }}
      className="liquid-glass-panel fixed inset-3 z-[71] mx-auto flex max-w-4xl min-h-0 flex-col overflow-hidden rounded-2xl border outline-none sm:inset-6"
    >
      {/* Compact Header */}
      <div className="liquid-glass-header shrink-0 border-b px-4 py-3 sm:px-5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex flex-wrap items-center gap-2">
            <ClipboardCheck className="size-4 text-primary" />
            <Dialog.Title className="text-sm font-bold text-foreground sm:text-base">
              Qualification Form [{FORM_101_CODE}]
            </Dialog.Title>
            <span className="rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              v{FORM_101_VERSION}
            </span>
            <label className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              <span>Rev</span>
              <input
                aria-label="Form revision"
                value={draft.revision}
                onChange={(e) => setDraft((prev) => ({ ...prev, revision: e.target.value }))}
                placeholder="#"
                className="w-7 bg-transparent text-center font-bold text-foreground outline-none"
              />
            </label>
            <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              Route: {route ?? "Pending"}
            </span>
            <Dialog.Description className="sr-only">{FORM_101_ORGANIZATION}</Dialog.Description>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className="inline-flex rounded-lg border bg-background/80 p-0.5"
              role="tablist"
              aria-label="Form view mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "wizard"}
                onClick={() => setViewMode("wizard")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                  viewMode === "wizard"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ListChecks className="size-3" />
                Step-by-step
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "all"}
                onClick={() => setViewMode("all")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                  viewMode === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutList className="size-3" />
                All
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "annex"}
                onClick={() => setViewMode("annex")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                  viewMode === "annex"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <BookOpen className="size-3" />
                Annex
              </button>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Close Qualification Form"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
        </div>

        {/* Compact Score Strip */}
        <div
          data-form101-score-panel
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background/80 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ScoreExplanation
              score={evaluation}
              className="max-w-full"
              targetClassName={cn(
                "inline-flex flex-wrap items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums",
                gradeToneClasses(evaluation.grade),
              )}
            >
              <span data-form101-grade>
                {evaluation.totalScore}/{FORM_101_MAX_SCORE} ·{" "}
                {Math.round((evaluation.totalScore / FORM_101_MAX_SCORE) * 100)}% · Grade{" "}
                {evaluation.grade} · {evaluation.scoreStage.label}
              </span>
            </ScoreExplanation>
            <span
              data-form101-gate-badge
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                gate.scorePassed
                  ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-300",
              )}
            >
              {gate.scorePassed
                ? `≥ ${FORM_101_PASS_SCORE}/${FORM_101_MAX_SCORE} (${FORM_101_PASS_PERCENT}%) Met`
                : `Need ${FORM_101_PASS_SCORE - evaluation.totalScore} points — Cannot Pass`}
            </span>
            {evaluation.q9DepositExempt ? (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                Q9 Deposit exempt (LOI)
              </span>
            ) : null}
          </div>

          {evaluation.missingItems.length > 0 ? (
            <button
              type="button"
              aria-expanded={showMissing}
              onClick={() => setShowMissing((current) => !current)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
            >
              <AlertCircle className="size-3" />
              <span>{evaluation.missingItems.length} missing</span>
              <ChevronDown
                className={cn("size-3 transition-transform", showMissing && "rotate-180")}
              />
            </button>
          ) : (
            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              No missing items flagged
            </span>
          )}
        </div>

        {showMissing && evaluation.missingItems.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 rounded-xl border bg-amber-500/5 p-2">
            {evaluation.missingItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => jumpToMissingItem(item.anchorId, item.id)}
                className="rounded-md border border-amber-500/35 bg-background px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-500/15 dark:text-amber-200"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {viewMode === "wizard" && (
          <div className="space-y-2">
            <nav className="flex flex-wrap items-center gap-1" aria-label="Question groups">
              {FORM_101_GROUPS.map((group, index) => {
                const active = index === stepIndex;
                const done = isForm101GroupComplete(group, draft, isLoi);
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-current={active ? "step" : undefined}
                    disabled={index > unlockedStep}
                    onClick={() => goToGroup(index)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold disabled:opacity-50",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    {done && !active && <Check className="size-2.5" aria-hidden="true" />}
                    {group.title}
                  </button>
                );
              })}
              <span className="ml-auto text-[11px] text-muted-foreground">
                Step {stepIndex + 1} / {totalSteps}
              </span>
            </nav>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Scrollable Body */}
      <div
        ref={scrollRef}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        <details className="mb-3 rounded-lg border px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold">How scores are interpreted</summary>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {QUALIFICATION_SCORE_STAGES.map((stage) => (
              <li key={stage.grade} className="rounded-md bg-muted/50 p-2">
                <p className="font-semibold">
                  {stage.grade} · {stage.min}–{stage.max} points · {stage.label}
                </p>
                <p className="mt-1 text-muted-foreground">{stage.description}</p>
              </li>
            ))}
          </ul>
        </details>
        {viewMode === "wizard" ? (
          <div data-form101-wizard-step={currentStep.id} className="mx-auto max-w-2xl">
            {renderGroup(currentStep, true)}
          </div>
        ) : viewMode === "all" ? (
          <fieldset disabled className="space-y-6">
            <legend className="text-xs text-muted-foreground">
              Review only. Use Step-by-step to fill in answers in order.
            </legend>
            {FORM_101_GROUPS.map((group) => renderGroup(group, false))}
          </fieldset>
        ) : (
          <AnnexReferenceTab
            canInsert={stepIsUnlocked}
            onInsertSpecial={insertSpecialItem}
            onInsertDiscipline={insertDisciplineItem}
          />
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1 size-3.5" />
            Reset Form
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === "wizard" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={stepIndex === 0}
                onClick={goPrev}
              >
                <ChevronLeft className="mr-1 size-3.5" />
                Previous
              </Button>
              {nextBlocked && (
                <span className="text-xs text-muted-foreground" role="status">
                  Complete the required answers in this group to continue.
                </span>
              )}
              {!isLastStep ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={goNext}
                  disabled={nextBlocked}
                >
                  {currentStep.section !== "a" && !currentStepDone ? "Skip optional" : "Next"}
                  <ChevronRight className="ml-1 size-3.5" />
                </Button>
              ) : null}
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleSave}>
            {viewMode === "wizard" && isLastStep ? "Save & Finish" : "Save Form"}
          </Button>
        </div>
      </div>
    </Dialog.Content>
  );
}

export function QualificationForm101Dialog({
  open,
  onOpenChange,
  qualification,
  workflowTitleHint,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qualification: Qualification;
  workflowTitleHint?: string;
  onSave: (nextForm: QualificationForm101 | undefined) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[70]" />
        {open ? (
          <QualificationForm101DialogBody
            qualification={qualification}
            workflowTitleHint={workflowTitleHint}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
