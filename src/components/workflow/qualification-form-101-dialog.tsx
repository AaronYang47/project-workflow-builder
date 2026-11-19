"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, ChevronDown, ClipboardCheck, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { qualificationRoute, type Qualification } from "@/lib/qualification";
import {
  FORM_101_CODE,
  FORM_101_ORGANIZATION,
  FORM_101_VERSION,
  compactQualificationForm101,
  createEmptyQualificationForm101,
  evaluateQualificationForm101,
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

type FormTab = "all" | "a" | "b" | "c" | "annex";

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
  const [activeTab, setActiveTab] = useState<FormTab>("all");
  const [showMissing, setShowMissing] = useState(false);

  const previewQualification: Qualification = { ...qualification, form101: draft };
  const evaluation = evaluateQualificationForm101(previewQualification);
  const route = qualificationRoute(qualification);
  const isLoi = qualification.commercialPath === "LOI";

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
  };

  const jumpToSection = (section: "A1" | "A2" | "A3" | "B", anchorId: string) => {
    const targetTab: FormTab = section === "B" ? "b" : "a";
    if (activeTab !== "all" && activeTab !== targetTab) {
      setActiveTab(targetTab);
    }
    requestAnimationFrame(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
    setActiveTab("b");
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
    setActiveTab("b");
  };

  const tabs: Array<{ id: FormTab; label: string }> = [
    { id: "all", label: "All Sections" },
    { id: "a", label: `A. Sales Intake (${evaluation.sectionACompletedCount}/13)` },
    { id: "b", label: `B. Discipline Intake (${evaluation.sectionBCompletedCount}/8)` },
    { id: "c", label: `C. RFIs (${evaluation.openRfiCount})` },
    { id: "annex", label: "Annex 1 & 2 Examples" },
  ];

  return (
    <Dialog.Content
      onKeyDown={(event) => {
        if (["Backspace", "Delete"].includes(event.key)) {
          event.stopPropagation();
        }
      }}
      className="liquid-glass-panel fixed inset-3 z-[71] mx-auto flex max-w-6xl min-h-0 flex-col overflow-hidden rounded-2xl border outline-none sm:inset-6"
    >
      {/* Header + Score Strip */}
      <div className="liquid-glass-header shrink-0 border-b px-4 py-3 sm:px-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="size-4 text-primary" />
              <Dialog.Title className="text-sm font-bold text-foreground sm:text-base">
                Qualification Form [{FORM_101_CODE}]
              </Dialog.Title>
              <span className="rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Version {FORM_101_VERSION}
              </span>
              <label className="inline-flex items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <span>Rev</span>
                <input
                  aria-label="Form revision"
                  value={draft.revision}
                  onChange={(e) => setDraft((prev) => ({ ...prev, revision: e.target.value }))}
                  placeholder="#"
                  className="w-8 bg-transparent text-center font-bold text-foreground outline-none"
                />
              </label>
              <span className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                Route: {route ?? "Pending"}
              </span>
            </div>
            <Dialog.Description className="text-[11px] text-muted-foreground">
              {FORM_101_ORGANIZATION}
            </Dialog.Description>
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

        {/* Completeness Score Summary */}
        <div data-form101-score-panel className="rounded-xl border bg-background/80 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                data-form101-grade
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold tabular-nums",
                  gradeToneClasses(evaluation.grade),
                )}
              >
                <span>Score: {evaluation.totalScore}/100</span>
                <span>·</span>
                <span>
                  Grade {evaluation.grade} ({evaluation.gradeLabel})
                </span>
              </span>
              <span className="rounded-md border bg-muted/50 px-2 py-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
                Open RFIs: {evaluation.openRfiCount}
              </span>
              {evaluation.q9DepositExempt ? (
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Q9 Deposit exempt (LOI)
                </span>
              ) : null}
            </div>

            {evaluation.missingItems.length > 0 ? (
              <button
                type="button"
                aria-expanded={showMissing}
                onClick={() => setShowMissing((current) => !current)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
              >
                <AlertCircle className="size-3.5" />
                <span>{evaluation.missingItems.length} missing items</span>
                <ChevronDown
                  className={cn("size-3.5 transition-transform", showMissing && "rotate-180")}
                />
              </button>
            ) : (
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                100% intake completeness achieved
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {evaluation.sections.map((section) => {
              const pct = Math.round((section.score / section.maxScore) * 100);
              return (
                <div key={section.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold">
                    <span className="truncate text-muted-foreground">
                      {section.id} · {section.label}
                    </span>
                    <span className="tabular-nums text-foreground">
                      {section.score}/{section.maxScore}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {showMissing && evaluation.missingItems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-t pt-2">
              {evaluation.missingItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => jumpToSection(item.section, item.anchorId)}
                  className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Section Tabs */}
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Form 1.01 sections">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-6">
        {activeTab === "all" || activeTab === "a" ? (
          <SectionAIntake
            form={draft}
            onChange={setDraft}
            isLoi={isLoi}
            workflowTitleHint={workflowTitleHint}
          />
        ) : null}
        {activeTab === "all" || activeTab === "b" ? (
          <SectionBIntake form={draft} onChange={setDraft} />
        ) : null}
        {activeTab === "all" || activeTab === "c" ? (
          <SectionCIntake form={draft} onChange={setDraft} />
        ) : null}
        {activeTab === "annex" ? (
          <AnnexReferenceTab
            onInsertSpecial={insertSpecialItem}
            onInsertDiscipline={insertDisciplineItem}
          />
        ) : null}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1 size-3.5" />
            Reset Form
          </Button>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            Score and customer grade update live and persist on save.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave}>
            Save Form
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
