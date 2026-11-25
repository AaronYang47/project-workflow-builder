"use client";

import { useState } from "react";
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
  FORM_101_STEPS,
  findInitialStepIndex,
  findStepIndexForAnchor,
  isForm101StepComplete,
  type FormStepSection,
} from "./qualification-form-101/steps";

type ViewMode = "wizard" | "all" | "annex";

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
  const [draft, setDraft] = useState<QualificationForm101>(() => {
    const form = normalizeQualificationForm101(qualification.form101);
    const { clientCategory, customerTier, plansAvailable } = qualification;
    if (!form.sectionA.routeAnswers && clientCategory) {
      form.sectionA.routeAnswers = { clientCategory, customerTier, plansAvailable };
    }
    return form;
  });
  const previewQualification: Qualification = { ...qualification, form101: draft };
  const route = qualificationRoute(previewQualification);
  const isLoi = route === "LOI";
  const [viewMode, setViewMode] = useState<ViewMode>("wizard");
  const [stepIndex, setStepIndex] = useState<number>(() => findInitialStepIndex(draft, isLoi));
  const [showMissing, setShowMissing] = useState(false);

  const evaluation = evaluateQualificationForm101(previewQualification);
  const gate = evaluateQualificationGate(previewQualification);

  const totalSteps = FORM_101_STEPS.length;
  const currentStep = FORM_101_STEPS[stepIndex] ?? FORM_101_STEPS[0];
  const sectionSteps = FORM_101_STEPS.filter((step) => step.section === currentStep.section);
  const completedCount = FORM_101_STEPS.filter(
    (step) => step.section !== "c" && isForm101StepComplete(step.id, draft, isLoi),
  ).length;
  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const isLastStep = stepIndex === totalSteps - 1;

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
    const empty = createEmptyQualificationForm101();
    empty.sectionA.routeAnswers = {};
    setDraft(empty);
    setStepIndex(0);
  };

  const goPrev = () => setStepIndex((idx) => Math.max(0, idx - 1));
  const goNext = () => setStepIndex((idx) => Math.min(totalSteps - 1, idx + 1));

  const jumpToSection = (section: FormStepSection) => {
    const firstIncomplete = FORM_101_STEPS.findIndex(
      (step) => step.section === section && !isForm101StepComplete(step.id, draft, isLoi),
    );
    const firstInSection = FORM_101_STEPS.findIndex((step) => step.section === section);
    setStepIndex(firstIncomplete >= 0 ? firstIncomplete : Math.max(0, firstInSection));
    setViewMode("wizard");
  };

  const jumpToMissingItem = (anchorId: string, itemId: string) => {
    if (viewMode === "all") {
      requestAnimationFrame(() => {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } else {
      setStepIndex(findStepIndexForAnchor(anchorId, itemId));
      setViewMode("wizard");
    }
    setShowMissing(false);
  };

  const insertDisciplineItem = (key: DisciplineKey, itemLabel: string) => {
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
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
    const targetIdx = FORM_101_STEPS.findIndex((step) => step.id === `b-${key}`);
    if (targetIdx >= 0) setStepIndex(targetIdx);
    setViewMode("wizard");
  };

  const insertSpecialItem = (itemLabel: string) => {
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
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
    const targetIdx = FORM_101_STEPS.findIndex((step) => step.id === "b-special");
    if (targetIdx >= 0) setStepIndex(targetIdx);
    setViewMode("wizard");
  };

  const sectionTabs: Array<{ id: FormStepSection; label: string }> = [
    { id: "a", label: `A. Sales Intake (${evaluation.sectionACompletedCount}/13)` },
    { id: "b", label: `B. Disciplines (${evaluation.sectionBCompletedCount}/8)` },
    { id: "c", label: `C. RFIs (${evaluation.openRfiCount})` },
  ];

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
            <span
              data-form101-grade
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold tabular-nums",
                gradeToneClasses(evaluation.grade),
              )}
            >
              <span>
                Score: {evaluation.totalScore}/{FORM_101_MAX_SCORE}
              </span>
              <span>·</span>
              <span>Grade {evaluation.grade}</span>
            </span>
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
              100% complete
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

        {/* Step-by-step Navigation Bar */}
        {viewMode === "wizard" ? (
          <div className="space-y-2 pt-0.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {sectionTabs.map((tab) => {
                  const active = currentStep.section === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => jumpToSection(tab.id)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        active
                          ? "border-primary/50 bg-primary/12 text-primary"
                          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                Step {stepIndex + 1} / {totalSteps} · {completedCount}/21 done
              </span>
            </div>

            {/* Smooth Progress Line */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Compact Step Pills for Active Section */}
            <div className="flex flex-wrap gap-1" aria-label="Section questions">
              {sectionSteps.map((step) => {
                const idx = FORM_101_STEPS.findIndex((s) => s.id === step.id);
                const active = idx === stepIndex;
                const done = isForm101StepComplete(step.id, draft, isLoi);
                return (
                  <button
                    key={step.id}
                    type="button"
                    title={step.title}
                    aria-current={active ? "step" : undefined}
                    onClick={() => setStepIndex(idx)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : done
                          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {done && !active ? <Check className="size-2.5" /> : null}
                    <span>{step.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Scrollable Body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        {viewMode === "wizard" ? (
          <div data-form101-wizard-step={currentStep.id} className="mx-auto max-w-2xl space-y-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider text-primary">
                {currentStep.subsection}
              </span>
              <span className="tabular-nums">
                Question {stepIndex + 1} of {totalSteps}
              </span>
            </div>

            {currentStep.section === "a" ? (
              <SectionAIntake
                form={draft}
                onChange={setDraft}
                isLoi={isLoi}
                workflowTitleHint={workflowTitleHint}
                onlyStep={currentStep.id}
                onAdvance={goNext}
              />
            ) : currentStep.section === "b" ? (
              <SectionBIntake
                form={draft}
                onChange={setDraft}
                onlyStep={currentStep.id}
                onAdvance={goNext}
              />
            ) : (
              <SectionCIntake form={draft} onChange={setDraft} hideHeader />
            )}
          </div>
        ) : viewMode === "all" ? (
          <div className="space-y-6">
            <SectionAIntake
              form={draft}
              onChange={setDraft}
              isLoi={isLoi}
              workflowTitleHint={workflowTitleHint}
            />
            <SectionBIntake form={draft} onChange={setDraft} />
            <SectionCIntake form={draft} onChange={setDraft} />
          </div>
        ) : (
          <AnnexReferenceTab
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
              {!isLastStep ? (
                <Button type="button" variant="secondary" size="sm" onClick={goNext}>
                  Next
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
