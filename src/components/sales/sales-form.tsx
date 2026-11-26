"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Download,
  FileText,
  LoaderCircle,
  Send,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isForm101StepComplete } from "@/components/workflow/qualification-form-101/steps";
import { qualificationRoute } from "@/lib/qualification";
import {
  evaluateQualificationForm101,
  normalizeQualificationForm101,
  type QualificationForm101,
} from "@/lib/qualification-form-101";
import { isValidJobNumberInput } from "@/lib/sales-intake";
import { loadQfLogo, qualificationFormPdfBlob, qualificationFormPdfName } from "@/lib/qf-pdf";
import {
  SalesApiError,
  salesEndpoints,
  type SalesForm as SalesFormData,
  type SubmitResult,
} from "./sales-api";
import { INPUT, SALES_FORM_STEPS, salesStepOf } from "./sales-questions";

type Draft = { projectName: string; jobNumber: string; form101: QualificationForm101 };
type SaveState = "idle" | "saving" | "saved" | "offline";

/** Step 0 is the project (name, Job number); then the form topics; then Review. */
const STEPS = [
  { id: "project", title: "Project" },
  ...SALES_FORM_STEPS.map((step) => ({ id: step.id, title: step.title })),
  { id: "review", title: "Review" },
] as const;
const REVIEW = STEPS.length - 1;

const PRIMARY_BUTTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#245e9b] px-4 text-base font-semibold text-white shadow-sm active:bg-[#1d4f84] disabled:opacity-45";
const SECONDARY_BUTTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#d5dbe4] bg-white px-4 text-base font-semibold text-[#344054] active:bg-[#f2f4f7] disabled:opacity-45";

const backupKey = (key: string) => `sales-draft-backup:${key}`;

function readBackup(key: string): { draft: Draft; at: string } | null {
  try {
    const raw = localStorage.getItem(backupKey(key));
    return raw ? (JSON.parse(raw) as { draft: Draft; at: string }) : null;
  } catch {
    return null;
  }
}

function writeBackup(key: string, draft: Draft | null) {
  try {
    if (draft)
      localStorage.setItem(backupKey(key), JSON.stringify({ draft, at: new Date().toISOString() }));
    else localStorage.removeItem(backupKey(key));
  } catch {
    // A phone with storage turned off still saves to the server.
  }
}

/** Q1 starts as the project's own name (without the Job number in front). */
function withFormProjectName(draft: Draft, projectName: string): Draft {
  const name = projectName.replace(/^\s*\d{5}[\s_-]*/, "").trim();
  if (draft.form101.sectionA.projectName.trim() || !name) return draft;
  return {
    ...draft,
    form101: {
      ...draft.form101,
      sectionA: { ...draft.form101.sectionA, projectName: name },
    },
  };
}

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span
      data-sales-save-state={state}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
        state === "offline" ? "bg-[#fffaeb] text-[#b54708]" : "text-[#667085]",
      )}
    >
      {state === "saving" ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : state === "offline" ? (
        <CloudOff className="size-3.5" />
      ) : (
        <Check className="size-3.5 text-emerald-600" />
      )}
      {state === "saving" ? "Saving" : state === "offline" ? "On this phone" : "Saved"}
    </span>
  );
}

/** Generate the PDF, then share it with the phone's own share sheet (or download). */
function PdfActions({
  draft,
  projectName,
  revision,
  primary = false,
}: {
  draft: Draft;
  projectName: string;
  revision?: string;
  primary?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const form = revision === undefined ? draft.form101 : { ...draft.form101, revision };
  const meta = { projectName, jobNumber: draft.jobNumber.trim() };
  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await qualificationFormPdfBlob(form, {
        ...meta,
        logoDataUrl: await loadQfLogo(),
      });
      setFile(new File([blob], qualificationFormPdfName(form, meta), { type: "application/pdf" }));
    } catch {
      setError("Could not make the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const canShare =
    Boolean(file) &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare({ files: [file!] }));
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({
        files: [file],
        title: file.name,
        text: `Qualification Form [1.01] — ${projectName}`,
      });
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      download();
    }
  };
  return (
    <div className="space-y-2">
      {!file ? (
        <button
          type="button"
          data-sales-generate-pdf
          className={cn(primary ? PRIMARY_BUTTON : SECONDARY_BUTTON, "w-full")}
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <FileText className="size-5" />
          )}
          {busy ? "Making the PDF…" : "Generate PDF"}
        </button>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-[#e3e8ef] bg-white p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#fef3f2] text-[#b42318]">
              <FileText className="size-5" />
            </div>
            <p className="min-w-0 flex-1 truncate text-sm text-[#344054]" data-sales-pdf-name>
              {file.name}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-sales-share-pdf
              className={PRIMARY_BUTTON}
              onClick={() => (canShare ? void share() : download())}
            >
              <Share2 className="size-5" /> Share
            </button>
            <button type="button" className={SECONDARY_BUTTON} onClick={download}>
              <Download className="size-5" /> Save
            </button>
          </div>
          <button
            type="button"
            className="h-10 w-full text-sm text-[#667085] underline"
            onClick={() => void generate()}
          >
            Make it again
          </button>
        </>
      )}
      {error ? <p className="text-center text-sm text-[#b42318]">{error}</p> : null}
    </div>
  );
}

export function SalesForm({
  formKey,
  onClose,
  onOpenProject,
  onNeedsCode,
}: {
  formKey: string;
  onClose: () => void;
  onOpenProject: (key: string) => void;
  onNeedsCode: () => void;
}) {
  const [data, setData] = useState<SalesFormData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; projectId?: string } | null>(
    null,
  );
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const lastSaved = useRef<Draft | null>(null);
  // While the phone keyboard is up, the Back / Next bar steps aside.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.matches("textarea, select") ||
        (target instanceof HTMLInputElement &&
          !["checkbox", "radio", "button", "submit"].includes(target.type)));
    const onIn = (event: FocusEvent) => setTyping(isField(event.target));
    const onOut = () => setTyping(false);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    salesEndpoints
      .form(formKey)
      .then((result) => {
        if (!active) return;
        const server: Draft = {
          projectName: result.projectName,
          jobNumber: result.jobNumber,
          form101: normalizeQualificationForm101(result.form101),
        };
        // Keep what was typed on this phone if the server never got it.
        const backup = readBackup(formKey);
        const useBackup =
          backup &&
          (!result.draftSavedAt || backup.at > result.draftSavedAt) &&
          !sameDraft(backup.draft, server);
        const base = useBackup
          ? { ...backup.draft, form101: normalizeQualificationForm101(backup.draft.form101) }
          : server;
        const start = withFormProjectName(base, result.projectName);
        // Nothing to save until something changes (an empty new form leaves no draft).
        lastSaved.current = withFormProjectName(server, result.projectName);
        setData(result);
        setDraft(start);
      })
      .catch((caught: unknown) => {
        if (caught instanceof SalesApiError && caught.code === "NEEDS_ACCESS_CODE") onNeedsCode();
        else setLoadError(caught instanceof Error ? caught.message : "Could not open the form.");
      });
    return () => {
      active = false;
    };
  }, [formKey, onNeedsCode]);

  // Save a draft a moment after typing stops (and on this phone at once).
  useEffect(() => {
    if (!draft || submitted) return;
    if (lastSaved.current && sameDraft(draft, lastSaved.current)) return;
    writeBackup(formKey, draft);
    setSaveState("saving");
    const timer = setTimeout(() => {
      salesEndpoints
        .saveDraft(formKey, draft)
        .then(() => {
          lastSaved.current = draft;
          setSaveState("saved");
        })
        .catch(() => setSaveState("offline"));
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, formKey, submitted]);

  useEffect(() => {
    stepsRef.current
      ?.querySelector<HTMLElement>(`[data-step-index="${step}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [step]);

  if (loadError)
    return (
      <main className="sales-site min-h-dvh px-4 py-6">
        <div className="mx-auto max-w-md space-y-3">
          <p role="alert" className="rounded-xl bg-[#fef3f2] px-3.5 py-3 text-sm text-[#b42318]">
            {loadError}
          </p>
          <button type="button" className={cn(PRIMARY_BUTTON, "w-full")} onClick={onClose}>
            Back to projects
          </button>
        </div>
      </main>
    );
  if (!data || !draft)
    return (
      <main className="sales-site flex min-h-dvh justify-center pt-24">
        <LoaderCircle className="size-7 animate-spin text-[#98a2b3]" />
      </main>
    );

  const projectName = data.isNew ? draft.projectName.trim() : data.projectName;
  const setForm = (updater: (prev: QualificationForm101) => QualificationForm101) =>
    setDraft((current) => (current ? { ...current, form101: updater(current.form101) } : current));
  const isLoi = qualificationRoute({ form101: draft.form101 }) === "LOI";
  const jobNumberValid = isValidJobNumberInput(draft.jobNumber);
  const nameMissing = data.isNew && !draft.projectName.trim();
  const missing = evaluateQualificationForm101({ form101: draft.form101 }).missingItems;
  const goTo = (index: number, anchor?: string) => {
    setStep(Math.max(0, Math.min(REVIEW, index)));
    requestAnimationFrame(() => {
      const target = anchor ? document.getElementById(anchor) : null;
      if (target) target.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0 });
    });
  };
  const stepDone = (index: number) => {
    if (index === 0) return !nameMissing && jobNumberValid && Boolean(draft.jobNumber.trim());
    if (index === REVIEW) return false;
    return SALES_FORM_STEPS[index - 1].questions.every((id) =>
      isForm101StepComplete(id, draft.form101, isLoi),
    );
  };
  const doneCount = STEPS.slice(0, REVIEW).filter((_, index) => stepDone(index)).length;

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await salesEndpoints.submit(formKey, {
        projectName: draft.projectName,
        jobNumber: draft.jobNumber,
        form101: draft.form101,
      });
      writeBackup(formKey, null);
      setSubmitted(result);
      setSaveState("idle");
      window.scrollTo({ top: 0 });
    } catch (caught) {
      setSubmitError({
        message: caught instanceof Error ? caught.message : "Could not submit.",
        projectId:
          caught instanceof SalesApiError && caught.code === "NAME_TAKEN"
            ? String(caught.body?.projectId ?? "")
            : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted)
    return (
      <main data-sales-submitted className="sales-site min-h-dvh px-4 py-10">
        <div className="mx-auto max-w-md space-y-5">
          <div className="rounded-3xl border border-[#e3e8ef] bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Check className="size-9" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold text-[#172033]">Submitted</h1>
            <p className="mt-1 text-[#667085]">
              {submitted.projectName} · Rev {submitted.submission.revision}
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-[#344054]">
              The technical team can see it now. Make the PDF to send it by email.
            </p>
          </div>
          <PdfActions
            draft={{ ...draft, jobNumber: submitted.jobNumber || draft.jobNumber }}
            projectName={submitted.projectName}
            revision={submitted.submission.revision}
            primary
          />
          <button type="button" className={cn(SECONDARY_BUTTON, "w-full")} onClick={onClose}>
            Back to projects
          </button>
        </div>
      </main>
    );

  const current = STEPS[step];
  const topic = step > 0 && step < REVIEW ? SALES_FORM_STEPS[step - 1] : null;

  return (
    <main data-sales-form={formKey} className="sales-site min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-[#e3e8ef] bg-white/95 backdrop-blur [padding-top:env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-1 px-2 pt-2">
          <button
            type="button"
            aria-label="Back to projects"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#344054] active:bg-[#f2f4f7]"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[15px] font-semibold leading-tight text-[#172033]"
              data-sales-form-title
            >
              {projectName || "New project"}
            </p>
            <p className="text-xs text-[#667085]">Qualification Form [1.01]</p>
          </div>
          <SaveBadge state={saveState} />
        </div>
        <div className="mx-auto max-w-2xl px-4 pb-2 pt-2">
          <div className="mb-1 flex justify-between text-xs text-[#667085]">
            <span>
              Step {step + 1} of {STEPS.length} · {current.title}
            </span>
            <span>
              {doneCount}/{REVIEW} done
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#eef1f5]">
            <div
              className="h-full rounded-full bg-[#245e9b] transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
        <div
          ref={stepsRef}
          className="scroll-thin mx-auto flex max-w-2xl snap-x snap-mandatory scroll-px-3 gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-2.5"
          role="tablist"
          aria-label="Form steps"
        >
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-step-index={index}
              aria-selected={index === step}
              onClick={() => goTo(index)}
              className={cn(
                "inline-flex h-8 shrink-0 snap-start items-center gap-1 rounded-full px-3 text-[13px] font-medium",
                index === step
                  ? "bg-[#245e9b] text-white"
                  : stepDone(index)
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-[#f2f4f7] text-[#475467]",
              )}
            >
              {stepDone(index) && index !== step ? <Check className="size-3.5" /> : null}
              {item.title}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-4 pb-32 pt-4" data-sales-step={current.id}>
        {data.submission && step === 0 ? (
          <p className="rounded-2xl border border-[#d1e0f0] bg-[#f5f8fc] px-4 py-3 text-sm text-[#344054]">
            Last submitted by <b>{data.submission.by}</b> on{" "}
            {new Date(data.submission.at).toLocaleDateString()} (Rev {data.submission.revision}).
            What you submit now becomes the next revision.
          </p>
        ) : null}

        {step === 0 ? (
          <>
            <section className="space-y-4 rounded-2xl border border-[#e3e8ef] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              {data.isNew ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-[#344054]">Project name</span>
                  <input
                    data-sales-project-name
                    value={draft.projectName}
                    maxLength={200}
                    onChange={(event) => {
                      // Q1 follows the new project's name until it is changed by hand.
                      const followsName =
                        draft.form101.sectionA.projectName === draft.projectName.trim();
                      const next = { ...draft, projectName: event.target.value };
                      setDraft(
                        followsName
                          ? {
                              ...next,
                              form101: {
                                ...next.form101,
                                sectionA: {
                                  ...next.form101.sectionA,
                                  projectName: event.target.value.trim(),
                                },
                              },
                            }
                          : next,
                      );
                    }}
                    placeholder="e.g. Maison Laurier — Phase 2"
                    className={INPUT}
                  />
                  <span className="block text-xs text-[#667085]">
                    The project is created from your team&apos;s template when you submit.
                  </span>
                </label>
              ) : (
                <div>
                  <p className="text-sm font-medium text-[#344054]">Project</p>
                  <p className="mt-1 text-lg font-semibold text-[#172033]">{data.projectName}</p>
                </div>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-[#344054]">Job number</span>
                <input
                  data-sales-job-number
                  value={draft.jobNumber}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      jobNumber: event.target.value.replace(/\D/g, "").slice(0, 5),
                    })
                  }
                  placeholder="5 digits, e.g. 26014"
                  className={cn(
                    INPUT,
                    "font-mono text-lg tracking-[0.2em]",
                    !jobNumberValid && "border-[#f04438]",
                  )}
                />
                <span
                  className={cn(
                    "block text-xs",
                    jobNumberValid ? "text-[#667085]" : "text-[#b42318]",
                  )}
                >
                  {jobNumberValid
                    ? "Leave it empty if there is no job number yet."
                    : "The Job number has 5 digits."}
                </span>
              </label>
            </section>
            <div className="rounded-2xl bg-[#f5f8fc] px-4 py-3 text-sm leading-relaxed text-[#475467]">
              Answer what you know and leave the rest empty. Everything saves as you type, so you
              can stop and come back any time. Nothing reaches the team until you press Submit.
            </div>
          </>
        ) : topic ? (
          <topic.Step form={draft.form101} patch={setForm} isLoi={isLoi} />
        ) : (
          <section className="space-y-4">
            <div className="rounded-2xl border border-[#e3e8ef] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <p className="text-lg font-semibold text-[#172033]">{projectName || "New project"}</p>
              <p className="text-sm text-[#667085]">
                {draft.jobNumber ? `Job ${draft.jobNumber}` : "No Job number yet"}
              </p>
              <div className="mt-4 space-y-1">
                {STEPS.slice(1, REVIEW).map((item, offset) => {
                  const index = offset + 1;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => goTo(index)}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left active:bg-[#f9fafb]"
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border",
                          stepDone(index)
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-[#cfd6e0]",
                        )}
                      >
                        {stepDone(index) ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="flex-1 text-[15px] text-[#344054]">{item.title}</span>
                      <ChevronRight className="size-4 text-[#98a2b3]" />
                    </button>
                  );
                })}
              </div>
            </div>
            {missing.length ? (
              <div className="rounded-2xl border border-[#fedf89] bg-[#fffcf5] p-4">
                <p className="flex items-center gap-1.5 font-semibold text-[#b54708]">
                  <AlertCircle className="size-4" /> {missing.length}{" "}
                  {missing.length === 1 ? "answer" : "answers"} still empty
                </p>
                <p className="mt-1 text-sm text-[#667085]">
                  You can submit now and fill them in later. Tap one to go to it.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5" data-sales-missing>
                  {missing.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        const index = salesStepOf(item.id);
                        if (index >= 0) goTo(index + 1, `sales-${item.id}`);
                      }}
                      className="min-h-9 rounded-xl border border-[#fedf89] bg-white px-3 py-1.5 text-left text-sm text-[#93370d]"
                    >
                      {item.label.replace(/^Q\d+\s*/, "")}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-700">
                <Check className="size-5" /> Every answer is filled in.
              </p>
            )}
            {nameMissing ? (
              <p className="text-sm text-[#b42318]">Enter the project name on the first step.</p>
            ) : null}
            {!jobNumberValid ? (
              <p className="text-sm text-[#b42318]">Fix the Job number on the first step.</p>
            ) : null}
            {submitError ? (
              <div
                role="alert"
                className="space-y-2 rounded-2xl bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]"
              >
                <p>{submitError.message}</p>
                {submitError.projectId ? (
                  <button
                    type="button"
                    className={SECONDARY_BUTTON}
                    onClick={() => onOpenProject(submitError.projectId!)}
                  >
                    Open that project
                  </button>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              data-sales-submit
              className={cn(PRIMARY_BUTTON, "h-14 w-full rounded-2xl text-[17px]")}
              disabled={submitting || nameMissing || !jobNumberValid}
              onClick={() => void submit()}
            >
              {submitting ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Send className="size-5" />
              )}
              {submitting ? "Submitting…" : "Submit to the technical team"}
            </button>
            <div className="border-t border-[#e3e8ef] pt-4">
              <p className="mb-2 text-sm text-[#667085]">
                Want to check the PDF first? It shows what you have filled in so far.
              </p>
              <PdfActions draft={draft} projectName={projectName || "New project"} />
            </div>
          </section>
        )}
      </div>

      {step < REVIEW ? (
        <nav
          data-sales-nav
          data-hidden={typing || undefined}
          className="fixed inset-x-0 bottom-0 z-20 border-t border-[#e3e8ef] bg-white/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)] data-[hidden]:max-sm:hidden"
        >
          <div className="mx-auto flex max-w-2xl gap-2 px-4 py-3">
            <button
              type="button"
              className={cn(SECONDARY_BUTTON, "flex-1")}
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            >
              <ChevronLeft className="size-5" /> Back
            </button>
            <button
              type="button"
              data-sales-next
              className={cn(PRIMARY_BUTTON, "flex-[2]")}
              onClick={() => goTo(step + 1)}
            >
              {step === REVIEW - 1 ? "Review" : "Next"} <ChevronRight className="size-5" />
            </button>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
