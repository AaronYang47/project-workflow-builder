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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FORM_101_GROUPS,
  form101GroupIndex,
  isForm101GroupComplete,
  type FormGroup,
  type FormStepId,
} from "@/components/workflow/qualification-form-101/steps";
import {
  SectionAIntake,
  SectionBIntake,
  SectionCIntake,
} from "@/components/workflow/qualification-form-101/sections";
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

type Draft = { projectName: string; jobNumber: string; form101: QualificationForm101 };
type SaveState = "idle" | "saving" | "saved" | "offline";

const FIELD =
  "h-12 w-full rounded-xl border bg-background px-3.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

/** Step 0 is the project (name, Job number); then the Form 1.01 groups; then Review. */
const STEPS = [
  { id: "project", title: "Project" },
  ...FORM_101_GROUPS.map((group) => ({ id: group.id, title: group.title })),
  { id: "review", title: "Review & submit" },
] as const;
const REVIEW = STEPS.length - 1;

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

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span
      data-sales-save-state={state}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs",
        state === "offline" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
      )}
    >
      {state === "saving" ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : state === "offline" ? (
        <CloudOff className="size-3.5" />
      ) : (
        <Check className="size-3.5" />
      )}
      {state === "saving" ? "Saving" : state === "offline" ? "Saved on this phone" : "Saved"}
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
        <Button
          data-sales-generate-pdf
          variant={primary ? "default" : "outline"}
          className="h-12 w-full rounded-xl text-base"
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? (
            <LoaderCircle className="size-5 animate-spin" />
          ) : (
            <FileText className="size-5" />
          )}
          {busy ? "Making PDF…" : "Generate PDF"}
        </Button>
      ) : (
        <>
          <p className="truncate text-center text-xs text-muted-foreground" data-sales-pdf-name>
            {file.name}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              data-sales-share-pdf
              className="h-12 rounded-xl text-base"
              onClick={() => (canShare ? void share() : download())}
            >
              <Share2 className="size-5" /> Share
            </Button>
            <Button variant="outline" className="h-12 rounded-xl text-base" onClick={download}>
              <Download className="size-5" /> Save
            </Button>
          </div>
          <button
            type="button"
            className="w-full text-xs text-muted-foreground underline"
            onClick={() => void generate()}
          >
            Make it again
          </button>
        </>
      )}
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
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
        const start = useBackup
          ? { ...backup.draft, form101: normalizeQualificationForm101(backup.draft.form101) }
          : server;
        // Nothing to save until something changes (an empty new form leaves no draft).
        lastSaved.current = server;
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
      <main className="sales-site min-h-dvh bg-background px-4 py-6 text-foreground">
        <div className="mx-auto max-w-md space-y-3">
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
          >
            {loadError}
          </p>
          <Button className="h-12 w-full rounded-xl" onClick={onClose}>
            Back to projects
          </Button>
        </div>
      </main>
    );
  if (!data || !draft)
    return (
      <main className="sales-site flex min-h-dvh justify-center bg-background pt-24">
        <LoaderCircle className="size-7 animate-spin text-muted-foreground" />
      </main>
    );

  const projectName = data.isNew ? draft.projectName.trim() : data.projectName;
  const setForm = (updater: (prev: QualificationForm101) => QualificationForm101) =>
    setDraft((current) => (current ? { ...current, form101: updater(current.form101) } : current));
  const isLoi = qualificationRoute({ form101: draft.form101 }) === "LOI";
  const jobNumberValid = isValidJobNumberInput(draft.jobNumber);
  const nameMissing = data.isNew && !draft.projectName.trim();
  const missing = evaluateQualificationForm101({ form101: draft.form101 }).missingItems;
  const goTo = (index: number) => {
    setStep(Math.max(0, Math.min(REVIEW, index)));
    window.scrollTo({ top: 0 });
  };

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
      <main
        data-sales-submitted
        className="sales-site min-h-dvh bg-background px-4 py-8 text-foreground"
      >
        <div className="mx-auto max-w-md space-y-5">
          <div className="rounded-2xl border bg-card p-6 text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
              <Check className="size-8" />
            </div>
            <h1 className="text-xl font-bold">Submitted</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {submitted.projectName} · Rev {submitted.submission.revision}
            </p>
            <p className="mt-3 text-sm">
              The technical team can see it now. Make the PDF to send it by email.
            </p>
          </div>
          <PdfActions
            draft={{ ...draft, jobNumber: submitted.jobNumber || draft.jobNumber }}
            projectName={submitted.projectName}
            revision={submitted.submission.revision}
            primary
          />
          <Button variant="ghost" className="h-12 w-full rounded-xl text-base" onClick={onClose}>
            Back to projects
          </Button>
        </div>
      </main>
    );

  const renderGroup = (group: FormGroup) =>
    group.section === "a" ? (
      <SectionAIntake
        form={draft.form101}
        onChange={setForm}
        isLoi={isLoi}
        workflowTitleHint={projectName}
        questions={group.questions}
        salesMode
      />
    ) : group.section === "b" ? (
      <SectionBIntake form={draft.form101} onChange={setForm} hideHeader />
    ) : (
      <SectionCIntake form={draft.form101} onChange={setForm} hideHeader />
    );

  const current = STEPS[step];
  const group = step > 0 && step < REVIEW ? FORM_101_GROUPS[step - 1] : null;
  const stepDone = (index: number) => {
    if (index === 0) return !nameMissing && jobNumberValid && Boolean(draft.jobNumber.trim());
    if (index === REVIEW) return false;
    return isForm101GroupComplete(FORM_101_GROUPS[index - 1], draft.form101, isLoi);
  };

  return (
    <main data-sales-form={formKey} className="sales-site min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur [padding-top:env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-2 py-2">
          <button
            type="button"
            aria-label="Back to projects"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl active:bg-muted"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold leading-tight" data-sales-form-title>
              {projectName || "New project"}
            </p>
            <p className="text-xs text-muted-foreground">
              Qualification Form [1.01] · Step {step + 1} of {STEPS.length}
            </p>
          </div>
          <SaveBadge state={saveState} />
        </div>
        <div
          ref={stepsRef}
          className="scroll-thin mx-auto flex max-w-2xl snap-x snap-mandatory scroll-px-3 gap-1.5 overflow-x-auto overscroll-x-contain px-3 pb-2"
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
                "inline-flex h-9 shrink-0 snap-start items-center gap-1 rounded-full border px-3 text-xs font-semibold",
                index === step
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground",
              )}
            >
              {stepDone(index) && index !== step ? <Check className="size-3.5" /> : null}
              {item.title}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-32 pt-4" data-sales-step={current.id}>
        {data.submission && step === 0 ? (
          <p className="mb-4 rounded-xl border bg-muted/40 px-3.5 py-3 text-sm">
            Last submitted by {data.submission.by} on{" "}
            {new Date(data.submission.at).toLocaleDateString()} (Rev {data.submission.revision}).
            Changes you submit become the next revision.
          </p>
        ) : null}

        {step === 0 ? (
          <section className="space-y-5">
            {data.isNew ? (
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Project name</span>
                <input
                  data-sales-project-name
                  value={draft.projectName}
                  maxLength={200}
                  onChange={(event) => setDraft({ ...draft, projectName: event.target.value })}
                  placeholder="e.g. Maison Laurier — Phase 2"
                  className={FIELD}
                />
                <span className="block text-xs text-muted-foreground">
                  The new project is made from your team&apos;s template when you submit.
                </span>
              </label>
            ) : (
              <div className="space-y-1.5">
                <span className="text-sm font-semibold">Project</span>
                <p className="rounded-xl border bg-muted/40 px-3.5 py-3 text-base">
                  {data.projectName}
                </p>
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Job number</span>
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
                  FIELD,
                  "font-mono tracking-widest",
                  !jobNumberValid && "border-destructive",
                )}
              />
              <span
                className={cn(
                  "block text-xs",
                  jobNumberValid ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {jobNumberValid
                  ? "Leave it empty if there is no job number yet."
                  : "The Job number has 5 digits."}
              </span>
            </label>
            <p className="rounded-xl bg-primary/8 px-3.5 py-3 text-sm text-muted-foreground">
              Answer what you know and leave the rest empty. Everything saves as you type, so you
              can stop and come back any time. Nothing is sent until you press Submit.
            </p>
          </section>
        ) : group ? (
          <section className="space-y-3">
            <h2 className="text-base font-bold">{group.title}</h2>
            {renderGroup(group)}
          </section>
        ) : (
          <section className="space-y-5">
            <h2 className="text-base font-bold">Review &amp; submit</h2>
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-sm">
                <span className="font-semibold">{projectName || "New project"}</span>
                {draft.jobNumber ? ` · Job ${draft.jobNumber}` : ""}
              </p>
              {missing.length ? (
                <>
                  <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <AlertCircle className="size-4" /> {missing.length}{" "}
                    {missing.length === 1 ? "answer" : "answers"} still empty
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can submit now and fill them in later. Tap one to go to it.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5" data-sales-missing>
                    {missing.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          const index = form101GroupIndex(item.id as FormStepId);
                          if (index >= 0) goTo(index + 1);
                        }}
                        className="min-h-9 rounded-lg border border-amber-500/40 bg-amber-500/8 px-2.5 py-1 text-left text-xs"
                      >
                        {item.label.replace(/^Q\d+\s*/, "")}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  <Check className="size-4" /> Every answer is filled in.
                </p>
              )}
            </div>
            {nameMissing ? (
              <p className="text-sm text-destructive">Enter the project name on the first step.</p>
            ) : null}
            {!jobNumberValid ? (
              <p className="text-sm text-destructive">Fix the Job number on the first step.</p>
            ) : null}
            {submitError ? (
              <div
                role="alert"
                className="space-y-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <p>{submitError.message}</p>
                {submitError.projectId ? (
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => onOpenProject(submitError.projectId!)}
                  >
                    Open that project
                  </Button>
                ) : null}
              </div>
            ) : null}
            <Button
              data-sales-submit
              className="h-14 w-full rounded-2xl text-base"
              disabled={submitting || nameMissing || !jobNumberValid}
              onClick={() => void submit()}
            >
              {submitting ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <Send className="size-5" />
              )}
              {submitting ? "Submitting…" : "Submit to the technical team"}
            </Button>
            <div className="border-t pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
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
          className="data-[hidden]:max-sm:hidden fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto flex max-w-2xl gap-2 px-4 py-3">
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-xl text-base"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            >
              <ChevronLeft className="size-5" /> Back
            </Button>
            <Button
              data-sales-next
              className="h-12 flex-[2] rounded-xl text-base"
              onClick={() => goTo(step + 1)}
            >
              {step === REVIEW - 1 ? "Review" : "Next"} <ChevronRight className="size-5" />
            </Button>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
