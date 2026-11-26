"use client";

import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  createContext,
  useContext,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, CheckCircle2, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FormStepId } from "./steps";
import {
  qualificationCase,
  qualificationFormRouteAnswers,
  qualificationPartyIssue,
} from "@/lib/qualification";
import {
  ANNEX_1_CATEGORIES,
  ANNEX_2_BY_DISCIPLINE,
  DISCIPLINE_DEFINITIONS,
  DRAWING_ISSUE_STATUS_SUGGESTIONS,
  FORM_101_MAX_SCORE,
  FORM_101_PASS_SCORE,
  OCCUPANCY_GROUPS,
  PROJECT_DOCUMENT_DEFINITIONS,
  PROJECT_PARTY_ROLES,
  SUPPLY_SCOPE_OPTIONS,
  TARGET_DATE_FIELDS,
  qualificationBudgetComplete,
  type DisciplineKey,
  type LatestDrawingEntry,
  type QualificationForm101,
  type SpecialProductItem,
  type TechnicalRfiItem,
  consultantAnswered,
} from "@/lib/qualification-form-101";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

const cellInputCls =
  "w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/25";

const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

/** Questions the latest Sales update changed, and the tag to show on them. */
export const UpdatedQuestionsContext = createContext<{ ids: ReadonlySet<string>; tag: string }>({
  ids: new Set(),
  tag: "",
});

function UpdatedTag({ question }: { question: string }) {
  const { ids, tag } = useContext(UpdatedQuestionsContext);
  if (!ids.has(question)) return null;
  return (
    <span
      data-updated-question={question}
      className="ml-1.5 inline-flex items-center rounded-full bg-violet-500/15 px-1.5 py-0.5 align-middle text-[10px] font-bold text-violet-700 dark:text-violet-300"
    >
      {tag}
    </span>
  );
}

function QuestionCard({
  id,
  number,
  title,
  hint,
  complete,
  children,
}: {
  id?: string;
  number: string;
  title: string;
  hint?: string;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-4 rounded-xl border bg-card/60 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground leading-snug">
            <span className="mr-1.5 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
              {number}
            </span>
            {title}
            {id ? <UpdatedTag question={id.replace(/^q101-/, "")} /> : null}
          </p>
          {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        {complete !== undefined ? (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              complete
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {complete ? <CheckCircle2 className="size-3" /> : null}
            {complete ? "Complete" : "Pending"}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
  label,
  disabled,
}: {
  value?: "yes" | "no";
  onChange: (next: "yes" | "no" | undefined, button: HTMLButtonElement) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex gap-1" role="group" aria-label={label}>
      {(["yes", "no"] as const).map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={(event) => onChange(active ? undefined : option, event.currentTarget)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function routeImpactReason(
  clientCategory: ReturnType<typeof qualificationFormRouteAnswers>["clientCategory"],
  customerCase: ReturnType<typeof qualificationCase>,
) {
  if (!clientCategory) return "Enter project party information in Q3 to determine the route.";
  if (clientCategory === "ProFab")
    return "The Our client (PROFAB) row in Q3 has information, so the project goes directly to LOI.";
  const partyReason =
    clientCategory === "GC"
      ? "The General Contractor row in Q3 has information, so the GC route applies."
      : "Only the Owner row in Q3 has information, so the Owner route applies.";
  if (!customerCase)
    return `${partyReason} In Q12, answer whether the latest architectural drawing set is available.`;
  if (customerCase.route === "CSA" && customerCase.handoff)
    return `${partyReason} Q12 indicates no drawings, so the Owner starts with CSA for consultation, then finds a General Contractor, who carries on with PCS.`;
  if (customerCase.route === "CSA")
    return `${partyReason} Q12 indicates no drawings, so the project starts with CSA for consultation, then moves to PCS.`;
  if (customerCase.handoff)
    return `${partyReason} Q12 indicates drawings are available, so the Owner hands the project over to a General Contractor for PCS.`;
  return `${partyReason} Q12 indicates drawings are available, so the GC proceeds directly to PCS.`;
}

export function SectionAIntake({
  form,
  onChange,
  isLoi,
  workflowTitleHint,
  questions,
  onAdvance,
  onApplyRoute,
  salesMode = false,
}: {
  form: QualificationForm101;
  onChange: (updater: (prev: QualificationForm101) => QualificationForm101) => void;
  isLoi: boolean;
  workflowTitleHint?: string;
  questions: readonly FormStepId[];
  onAdvance?: () => void;
  onApplyRoute?: () => void;
  /** Sales site: no route-impact pop-ups (they explain internal routing and scores). */
  salesMode?: boolean;
}) {
  const { sectionA } = form;
  const occupancyRadioName = useId();
  const [routeImpactOpen, setRouteImpactOpen] = useState(false);
  const routeQuestionRef = useRef<HTMLElement | null>(null);
  const initialPartyValue = useRef("");
  const routeAnswers = qualificationFormRouteAnswers(sectionA);
  const customerCase = qualificationCase(routeAnswers);
  const showRouteImpact = (question: HTMLElement) => {
    if (salesMode) return;
    routeQuestionRef.current = question;
    setRouteImpactOpen(true);
  };
  const partyInputEvents = {
    onFocus: (event: React.FocusEvent<HTMLInputElement>) => {
      initialPartyValue.current = event.currentTarget.value.trim();
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
      if (event.currentTarget.value.trim() !== initialPartyValue.current)
        showRouteImpact(event.currentTarget);
    },
  };
  const show = (step: FormStepId) => questions.includes(step);
  const handleEnterAdvance = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && onAdvance) {
      event.preventDefault();
      onAdvance();
    }
  };

  const patchA = (
    updater: (prevA: QualificationForm101["sectionA"]) => QualificationForm101["sectionA"],
  ) =>
    onChange((prev) => ({
      ...prev,
      sectionA: updater(prev.sectionA),
    }));

  const addDrawingRow = () => {
    const emptyRow: LatestDrawingEntry = {
      id: uid(),
      drawingName: "",
      revisionNumber: "",
      revisionDate: "",
      issueStatus: "",
      exactLocation: "",
    };
    patchA((prevA) => ({ ...prevA, latestDrawings: [...prevA.latestDrawings, emptyRow] }));
  };

  const updateDrawingRow = (id: string, patch: Partial<LatestDrawingEntry>) => {
    patchA((prevA) => ({
      ...prevA,
      latestDrawings: prevA.latestDrawings.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  };

  const removeDrawingRow = (id: string) => {
    patchA((prevA) => ({
      ...prevA,
      latestDrawings: prevA.latestDrawings.filter((row) => row.id !== id),
    }));
  };

  const partyIssue = qualificationPartyIssue(sectionA.parties);
  const contactComplete = [
    sectionA.mainContact.name,
    sectionA.mainContact.companyRole,
    sectionA.mainContact.email,
    sectionA.mainContact.phone,
  ].every((v) => v.trim().length > 0);
  const consultantsComplete = DISCIPLINE_DEFINITIONS.every((d) =>
    consultantAnswered(sectionA.consultants[d.key]),
  );
  const datesComplete = TARGET_DATE_FIELDS.every((f) => sectionA.targetDates[f.key].trim());
  const drawingsComplete =
    sectionA.documents.archDrawings.available === "no" ||
    sectionA.latestDrawings.some(
      (row) =>
        row.drawingName.trim() &&
        (row.revisionNumber.trim() || row.revisionDate.trim()) &&
        row.issueStatus.trim() &&
        row.exactLocation.trim(),
    );

  const hasUnansweredDocs = PROJECT_DOCUMENT_DEFINITIONS.some(
    (doc) => !sectionA.documents[doc.key].available,
  );

  return (
    <div className="space-y-4">
      <Dialog.Root open={routeImpactOpen} onOpenChange={setRouteImpactOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              routeQuestionRef.current?.focus();
            }}
          >
            <Dialog.Title className="text-base font-bold">Route impact</Dialog.Title>
            <p className="rounded-md bg-muted px-3 py-2 text-sm font-semibold">
              {customerCase
                ? [customerCase.client, ...customerCase.steps].join(" → ")
                : "Route pending"}
            </p>
            <Dialog.Description className="text-sm text-muted-foreground">
              {partyIssue || routeImpactReason(routeAnswers.clientCategory, customerCase)}
            </Dialog.Description>
            {customerCase?.route === "LOI" && (
              <p className="text-sm">Q9 is exempt because LOI does not require a deposit.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Save the form to apply the route. Qualification still needs {FORM_101_PASS_SCORE}/
              {FORM_101_MAX_SCORE} points to proceed.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {onApplyRoute && (
                <Button type="button" size="sm" variant="secondary" onClick={onApplyRoute}>
                  Save &amp; apply route
                </Button>
              )}
              <Dialog.Close asChild>
                <Button type="button" size="sm">
                  Continue
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Subsection: Project information (Q1-Q7) */}
      {(["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const).some(show) ? (
        <div className="space-y-3">
          {show("q1") || show("q2") ? (
            <div className="grid gap-3 md:grid-cols-2">
              {show("q1") ? (
                <QuestionCard
                  id="q101-q1"
                  number="Q1"
                  title="What is the project name?"
                  complete={Boolean(sectionA.projectName.trim())}
                >
                  <div className="flex gap-2">
                    <input
                      aria-label="Project name"
                      value={sectionA.projectName}
                      onChange={(e) => patchA((p) => ({ ...p, projectName: e.target.value }))}
                      onKeyDown={handleEnterAdvance}
                      placeholder="Enter project name"
                      className={inputCls}
                    />
                    {!sectionA.projectName.trim() && workflowTitleHint ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-[11px]"
                        onClick={() => patchA((p) => ({ ...p, projectName: workflowTitleHint }))}
                      >
                        Use title
                      </Button>
                    ) : null}
                  </div>
                </QuestionCard>
              ) : null}

              {show("q2") ? (
                <QuestionCard
                  id="q101-q2"
                  number="Q2"
                  title="What is the full project address?"
                  complete={Boolean(sectionA.projectAddress.trim())}
                >
                  <input
                    aria-label="Full project address"
                    value={sectionA.projectAddress}
                    onChange={(e) => patchA((p) => ({ ...p, projectAddress: e.target.value }))}
                    onKeyDown={handleEnterAdvance}
                    placeholder="Street, city, province/state, postal code"
                    className={inputCls}
                  />
                </QuestionCard>
              ) : null}
            </div>
          ) : null}

          {show("q3") ? (
            <QuestionCard
              id="q101-q3"
              number="Q3"
              title="Who are the project parties?"
              hint="Enter at least one company. Add a contact for each company you enter."
              complete={!partyIssue}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="max-sm:hidden">
                    <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 pr-2">Role</th>
                      <th className="py-1.5 px-2">Company</th>
                      <th className="py-1.5 pl-2">Contact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {PROJECT_PARTY_ROLES.map((role) => (
                      <tr
                        key={role.key}
                        className="max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:py-2"
                      >
                        <td className="max-sm:p-0 py-1.5 pr-2 font-medium whitespace-nowrap">
                          {role.label}
                        </td>
                        <td className="max-sm:p-0 py-1.5 px-2">
                          <input
                            aria-label={`${role.label} company`}
                            value={sectionA.parties[role.key].company}
                            {...partyInputEvents}
                            onChange={(e) =>
                              patchA((p) => ({
                                ...p,
                                parties: {
                                  ...p.parties,
                                  [role.key]: { ...p.parties[role.key], company: e.target.value },
                                },
                              }))
                            }
                            placeholder="Company name"
                            className={cellInputCls}
                          />
                        </td>
                        <td className="max-sm:p-0 py-1.5 pl-2">
                          <input
                            aria-label={`${role.label} contact`}
                            value={sectionA.parties[role.key].contact}
                            aria-required={Boolean(sectionA.parties[role.key].company.trim())}
                            {...partyInputEvents}
                            onChange={(e) =>
                              patchA((p) => ({
                                ...p,
                                parties: {
                                  ...p.parties,
                                  [role.key]: { ...p.parties[role.key], contact: e.target.value },
                                },
                              }))
                            }
                            placeholder="Name, email or phone"
                            className={cellInputCls}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QuestionCard>
          ) : null}

          {show("q4") ? (
            <QuestionCard
              id="q101-q4"
              number="Q4"
              title="Who is the main project contact?"
              complete={contactComplete}
            >
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-[11px]">
                  <span className="font-medium text-muted-foreground">Name</span>
                  <input
                    aria-label="Main contact name"
                    value={sectionA.mainContact.name}
                    onChange={(e) =>
                      patchA((p) => ({
                        ...p,
                        mainContact: { ...p.mainContact, name: e.target.value },
                      }))
                    }
                    placeholder="Full name"
                    className={inputCls}
                  />
                </label>
                <label className="space-y-1 text-[11px]">
                  <span className="font-medium text-muted-foreground">Company &amp; role</span>
                  <input
                    aria-label="Main contact company and role"
                    value={sectionA.mainContact.companyRole}
                    onChange={(e) =>
                      patchA((p) => ({
                        ...p,
                        mainContact: { ...p.mainContact, companyRole: e.target.value },
                      }))
                    }
                    placeholder="Company / role"
                    className={inputCls}
                  />
                </label>
                <label className="space-y-1 text-[11px]">
                  <span className="font-medium text-muted-foreground">Email</span>
                  <input
                    aria-label="Main contact email"
                    type="email"
                    value={sectionA.mainContact.email}
                    onChange={(e) =>
                      patchA((p) => ({
                        ...p,
                        mainContact: { ...p.mainContact, email: e.target.value },
                      }))
                    }
                    placeholder="email@example.com"
                    className={inputCls}
                  />
                </label>
                <label className="space-y-1 text-[11px]">
                  <span className="font-medium text-muted-foreground">Phone</span>
                  <input
                    aria-label="Main contact phone"
                    value={sectionA.mainContact.phone}
                    onChange={(e) =>
                      patchA((p) => ({
                        ...p,
                        mainContact: { ...p.mainContact, phone: e.target.value },
                      }))
                    }
                    placeholder="000.000.0000"
                    className={inputCls}
                  />
                </label>
              </div>
            </QuestionCard>
          ) : null}

          {show("q5") || show("q6") ? (
            <div className="grid gap-3">
              {show("q5") ? (
                <div>
                  <QuestionCard
                    id="q101-q5"
                    number="Q5"
                    title="What is the main occupancy group of the building?"
                    hint={
                      sectionA.occupancyGroups.length > 1
                        ? "Multiple groups were saved. Select the one main occupancy group."
                        : "Select one main occupancy group."
                    }
                    complete={sectionA.occupancyGroups.length === 1}
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      {OCCUPANCY_GROUPS.map((group) => {
                        const checked =
                          sectionA.occupancyGroups.length === 1 &&
                          sectionA.occupancyGroups[0] === group.code;
                        return (
                          <label
                            key={group.code}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                              checked
                                ? "border-primary bg-primary/10 font-medium"
                                : "hover:bg-muted/50",
                            )}
                          >
                            <input
                              type="radio"
                              name={occupancyRadioName}
                              checked={checked}
                              onChange={() =>
                                patchA((previous) => ({
                                  ...previous,
                                  occupancyGroups: [group.code],
                                }))
                              }
                              className="size-3.5 accent-primary"
                            />
                            <span>{group.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </QuestionCard>
                </div>
              ) : null}

              {show("q6") ? (
                <QuestionCard
                  id="q101-q6"
                  number="Q6"
                  title="Approximate gross building area"
                  hint="Sum of the floor areas of all levels [sq. ft]."
                  complete={Boolean(sectionA.grossAreaSqFt.trim())}
                >
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Gross area sq ft"
                      value={sectionA.grossAreaSqFt}
                      onChange={(e) => patchA((p) => ({ ...p, grossAreaSqFt: e.target.value }))}
                      onKeyDown={handleEnterAdvance}
                      placeholder="e.g. 24,500"
                      className={inputCls}
                    />
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      sq. ft
                    </span>
                  </div>
                </QuestionCard>
              ) : null}
            </div>
          ) : null}

          {show("q7") ? (
            <QuestionCard
              id="q101-q7"
              number="Q7"
              title="Who are the responsible consultants for each discipline?"
              complete={consultantsComplete}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="max-sm:hidden">
                    <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-1.5 pr-2">Discipline</th>
                      <th className="py-1.5 px-2">Name</th>
                      <th className="py-1.5 px-2">Company</th>
                      <th className="py-1.5 pl-2">Contact</th>
                      <th className="py-1.5 pl-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {DISCIPLINE_DEFINITIONS.map((discipline) => (
                      <tr
                        key={discipline.key}
                        className="max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:py-2"
                      >
                        <td className="max-sm:p-0 py-1.5 pr-2 font-medium whitespace-nowrap">
                          {discipline.consultantLabel}
                        </td>
                        {(["name", "company", "contact"] as const).map((fieldKey) => (
                          <td key={fieldKey} className="max-sm:p-0 py-1.5 px-1.5">
                            <input
                              aria-label={`${discipline.consultantLabel} consultant ${fieldKey}`}
                              value={sectionA.consultants[discipline.key][fieldKey]}
                              disabled={Boolean(sectionA.consultants[discipline.key].status)}
                              onChange={(e) =>
                                patchA((p) => ({
                                  ...p,
                                  consultants: {
                                    ...p.consultants,
                                    [discipline.key]: {
                                      ...p.consultants[discipline.key],
                                      [fieldKey]: e.target.value,
                                    },
                                  },
                                }))
                              }
                              placeholder={
                                fieldKey === "name"
                                  ? "Consultant name"
                                  : fieldKey === "company"
                                    ? "Firm"
                                    : "Email / phone"
                              }
                              className={cn(cellInputCls, "disabled:opacity-45")}
                            />
                          </td>
                        ))}
                        <td className="max-sm:p-0 py-1.5 pl-1.5">
                          <select
                            aria-label={`${discipline.consultantLabel} consultant status`}
                            value={sectionA.consultants[discipline.key].status ?? ""}
                            onChange={(e) =>
                              patchA((p) => {
                                const next = { ...p.consultants[discipline.key] };
                                if (e.target.value === "unknown" || e.target.value === "na")
                                  next.status = e.target.value;
                                else delete next.status;
                                return {
                                  ...p,
                                  consultants: { ...p.consultants, [discipline.key]: next },
                                };
                              })
                            }
                            className={cn(cellInputCls, "min-w-20")}
                          >
                            <option value="">—</option>
                            <option value="unknown">Unknown</option>
                            <option value="na">N/A</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </QuestionCard>
          ) : null}
        </div>
      ) : null}

      {/* Subsection: Commercial status and schedule (Q8, Q9, Q11) */}
      {show("q8") || show("q9") || show("q11") ? (
        <div className="space-y-3">
          {show("q8") || show("q9") ? (
            <div className="grid gap-3 md:grid-cols-2">
              {show("q8") ? (
                <QuestionCard
                  id="q101-q8"
                  number="Q8"
                  title="Has a project budget been established?"
                  hint="If yes, enter the total project budget in CAD."
                  complete={qualificationBudgetComplete(sectionA)}
                >
                  <YesNoToggle
                    label="Project budget established"
                    value={sectionA.budgetEstablished}
                    onChange={(next) =>
                      patchA((p) => ({
                        ...p,
                        budgetEstablished: next,
                        projectBudgetCad: next === "yes" ? p.projectBudgetCad : undefined,
                      }))
                    }
                  />
                  {sectionA.budgetEstablished === "yes" && (
                    <label className="mt-2 block max-w-xs space-y-1 text-xs font-medium">
                      <span>Project budget amount (CAD)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-required="true"
                        className={inputCls}
                        placeholder="e.g. 1,250,000.00"
                        value={sectionA.projectBudgetCad ?? ""}
                        onChange={(event) =>
                          patchA((p) => ({ ...p, projectBudgetCad: event.target.value }))
                        }
                        onKeyDown={handleEnterAdvance}
                      />
                    </label>
                  )}
                </QuestionCard>
              ) : null}

              {show("q9") ? (
                <QuestionCard
                  id="q101-q9"
                  number="Q9"
                  title="Has a deposit been received under a CSA or a PCS?"
                  hint="No deposit for an LOI."
                  complete={isLoi || Boolean(sectionA.depositReceived)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <YesNoToggle
                      label="CSA or PCS deposit received"
                      value={sectionA.depositReceived}
                      onChange={(next) => patchA((p) => ({ ...p, depositReceived: next }))}
                    />
                    {isLoi ? (
                      <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        LOI path selected — No deposit required (Exempted)
                      </span>
                    ) : null}
                  </div>
                </QuestionCard>
              ) : null}
            </div>
          ) : null}

          {show("q11") ? (
            <QuestionCard
              id="q101-q11"
              number="Q11"
              title="What are the project target dates?"
              hint="Format: yyyy.mm.dd"
              complete={datesComplete}
            >
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {TARGET_DATE_FIELDS.map((field) => (
                  <label key={field.key} className="space-y-1 text-[11px]">
                    <span className="font-medium text-muted-foreground">{field.label}</span>
                    <input
                      aria-label={`Target date: ${field.label}`}
                      value={sectionA.targetDates[field.key]}
                      onChange={(e) =>
                        patchA((p) => ({
                          ...p,
                          targetDates: { ...p.targetDates, [field.key]: e.target.value },
                        }))
                      }
                      placeholder="yyyy.mm.dd"
                      className={inputCls}
                    />
                  </label>
                ))}
              </div>
            </QuestionCard>
          ) : null}
        </div>
      ) : null}

      {/* Subsection: Project documents (Q12-Q13) */}
      {show("q12") || show("q13") ? (
        <div className="space-y-3">
          {show("q12") ? (
            <QuestionCard
              id="q101-q12"
              number="Q12"
              title="Which project documents are available?"
              hint="Provide the file location or email date when available."
              complete={!hasUnansweredDocs}
            >
              <div className="space-y-2">
                {hasUnansweredDocs ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-muted-foreground"
                      onClick={(event) => {
                        patchA((p) => {
                          const nextDocs = { ...p.documents };
                          for (const doc of PROJECT_DOCUMENT_DEFINITIONS) {
                            if (!nextDocs[doc.key].available) {
                              nextDocs[doc.key] = { ...nextDocs[doc.key], available: "no" };
                            }
                          }
                          return { ...p, documents: nextDocs };
                        });
                        if (!sectionA.documents.archDrawings.available)
                          showRouteImpact(event.currentTarget);
                      }}
                    >
                      Mark unanswered as No
                    </Button>
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="max-sm:hidden">
                      <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="py-1.5 pr-2">Document</th>
                        <th className="py-1.5 px-2">Available?</th>
                        <th className="py-1.5 pl-2">File location / email date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {PROJECT_DOCUMENT_DEFINITIONS.map((doc) => {
                        const entry = sectionA.documents[doc.key];
                        return (
                          <tr
                            key={doc.key}
                            className="max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:py-2"
                          >
                            <td className="max-sm:p-0 py-1.5 pr-2 font-medium">{doc.label}</td>
                            <td className="max-sm:p-0 py-1.5 px-2 whitespace-nowrap">
                              <YesNoToggle
                                label={`${doc.label} available`}
                                value={entry.available}
                                onChange={(next, button) => {
                                  patchA((p) => ({
                                    ...p,
                                    documents: {
                                      ...p.documents,
                                      [doc.key]: { ...p.documents[doc.key], available: next },
                                    },
                                  }));
                                  if (doc.key === "archDrawings") showRouteImpact(button);
                                }}
                              />
                            </td>
                            <td className="max-sm:p-0 py-1.5 pl-2">
                              <input
                                aria-label={`${doc.label} file location or email date`}
                                value={entry.locationOrDate}
                                onChange={(e) =>
                                  patchA((p) => ({
                                    ...p,
                                    documents: {
                                      ...p.documents,
                                      [doc.key]: {
                                        ...p.documents[doc.key],
                                        locationOrDate: e.target.value,
                                      },
                                    },
                                  }))
                                }
                                placeholder="Optional: SharePoint path, folder link, or email date"
                                className={cellInputCls}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </QuestionCard>
          ) : null}

          {show("q13") ? (
            <QuestionCard
              id="q101-q13"
              number="Q13"
              title="Latest drawings details"
              hint="Provide drawing names, revision numbers, revision dates, issue status (e.g. Issued for Permit or Issued for Construction), and exact location."
              complete={drawingsComplete}
            >
              <div className="space-y-2">
                {sectionA.latestDrawings.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                    No drawing sets recorded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sectionA.latestDrawings.map((row, idx) => (
                      <div
                        key={row.id}
                        className="grid gap-2 rounded-lg border bg-background/70 p-2.5 sm:grid-cols-6"
                      >
                        <input
                          aria-label={`Drawing ${idx + 1} name`}
                          value={row.drawingName}
                          onChange={(e) =>
                            updateDrawingRow(row.id, { drawingName: e.target.value })
                          }
                          placeholder="Drawing name / set"
                          className={cn(cellInputCls, "sm:col-span-2")}
                        />
                        <input
                          aria-label={`Drawing ${idx + 1} revision number`}
                          value={row.revisionNumber}
                          onChange={(e) =>
                            updateDrawingRow(row.id, { revisionNumber: e.target.value })
                          }
                          placeholder="Rev #"
                          className={cellInputCls}
                        />
                        <input
                          aria-label={`Drawing ${idx + 1} revision date`}
                          value={row.revisionDate}
                          onChange={(e) =>
                            updateDrawingRow(row.id, { revisionDate: e.target.value })
                          }
                          placeholder="Rev date (yyyy.mm.dd)"
                          className={cellInputCls}
                        />
                        <input
                          list="drawing-issue-status-list"
                          aria-label={`Drawing ${idx + 1} issue status`}
                          value={row.issueStatus}
                          onChange={(e) =>
                            updateDrawingRow(row.id, { issueStatus: e.target.value })
                          }
                          placeholder="Issue status"
                          className={cellInputCls}
                        />
                        <div className="flex gap-1 sm:col-span-6">
                          <input
                            aria-label={`Drawing ${idx + 1} exact location`}
                            value={row.exactLocation}
                            onChange={(e) =>
                              updateDrawingRow(row.id, { exactLocation: e.target.value })
                            }
                            placeholder="Exact folder / link / email location"
                            className={cellInputCls}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-destructive hover:bg-destructive/10"
                            aria-label={`Delete drawing row ${idx + 1}`}
                            onClick={() => removeDrawingRow(row.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <datalist id="drawing-issue-status-list">
                  {DRAWING_ISSUE_STATUS_SUGGESTIONS.map((status) => (
                    <option key={status} value={status} />
                  ))}
                </datalist>
                <Button type="button" variant="outline" size="sm" onClick={addDrawingRow}>
                  <Plus className="mr-1 size-3.5" />
                  Add drawing set
                </Button>
              </div>
            </QuestionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SectionBIntake({
  form,
  onChange,
  hideHeader,
  onlyStep,
  onAdvance,
}: {
  form: QualificationForm101;
  onChange: (updater: (prev: QualificationForm101) => QualificationForm101) => void;
  hideHeader?: boolean;
  onlyStep?: FormStepId;
  onAdvance?: () => void;
}) {
  const [openAnnexFor, setOpenAnnexFor] = useState<DisciplineKey | "special" | null>(null);
  const { sectionB } = form;
  const visibleDisciplines = onlyStep
    ? DISCIPLINE_DEFINITIONS.filter((d) => onlyStep === `b-${d.key}`)
    : DISCIPLINE_DEFINITIONS;
  const showSpecial = !onlyStep || onlyStep === "b-special";

  const patchDiscipline = (
    key: DisciplineKey,
    updater: (
      sec: QualificationForm101["sectionB"]["disciplines"][DisciplineKey],
    ) => QualificationForm101["sectionB"]["disciplines"][DisciplineKey],
  ) => {
    onChange((prev) => ({
      ...prev,
      sectionB: {
        ...prev.sectionB,
        disciplines: {
          ...prev.sectionB.disciplines,
          [key]: updater(prev.sectionB.disciplines[key]),
        },
      },
    }));
  };

  const patchSpecial = (
    updater: (
      sec: QualificationForm101["sectionB"]["specialProducts"],
    ) => QualificationForm101["sectionB"]["specialProducts"],
  ) => {
    onChange((prev) => ({
      ...prev,
      sectionB: {
        ...prev.sectionB,
        specialProducts: updater(prev.sectionB.specialProducts),
      },
    }));
  };

  return (
    <div id="q101-section-b" className="scroll-mt-4 space-y-4">
      {!onlyStep ? (
        <div>
          {!hideHeader && (
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
              B. Customer Intake by Discipline
            </h3>
          )}
          <p className="text-[11px] text-muted-foreground">
            Special items or conditions discussed with the client, one concise line per item,
            including what the client is still considering. Use Annex quick-pick examples or mark a
            discipline as reviewed with no special items.
          </p>
        </div>
      ) : null}

      {visibleDisciplines.map((discipline) => {
        const sec = sectionB.disciplines[discipline.key];
        const hasRows = sec.items.some((row) => row.item.trim().length > 0);
        const complete = Boolean(sec.reviewedNone || hasRows);
        const showAnnex = openAnnexFor === discipline.key;

        return (
          <div
            key={discipline.key}
            id={`q101-b-${discipline.key}`}
            className="scroll-mt-4 rounded-xl border bg-card/60 p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-foreground">
                  {discipline.sectionTitle}
                  <UpdatedTag question={`b-${discipline.key}`} />
                </p>
                {"note" in discipline && discipline.note ? (
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    {discipline.note}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(sec.reviewedNone)}
                    onChange={(e) =>
                      patchDiscipline(discipline.key, (s) => ({
                        ...s,
                        reviewedNone: e.target.checked,
                      }))
                    }
                    className="size-3.5 accent-primary"
                  />
                  <span>Reviewed · No special items</span>
                </label>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    complete
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {complete ? <CheckCircle2 className="size-3" /> : null}
                  {complete ? "Reviewed" : "Pending"}
                </span>
              </div>
            </div>

            {sec.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="max-sm:hidden">
                    <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="py-1 pr-2 w-1/2">Item</th>
                      <th className="py-1 px-2">Remark</th>
                      <th className="py-1 pl-1 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sec.items.map((row, idx) => (
                      <tr
                        key={row.id}
                        className="max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:py-2"
                      >
                        <td className="max-sm:p-0 py-1 pr-2">
                          <input
                            aria-label={`${discipline.sectionTitle} item ${idx + 1}`}
                            value={row.item}
                            onChange={(e) =>
                              patchDiscipline(discipline.key, (s) => ({
                                ...s,
                                reviewedNone: false,
                                items: s.items.map((it) =>
                                  it.id === row.id ? { ...it, item: e.target.value } : it,
                                ),
                              }))
                            }
                            placeholder="Special item or condition"
                            className={cellInputCls}
                          />
                        </td>
                        <td className="max-sm:p-0 py-1 px-2">
                          <input
                            aria-label={`${discipline.sectionTitle} remark ${idx + 1}`}
                            value={row.remark}
                            onChange={(e) =>
                              patchDiscipline(discipline.key, (s) => ({
                                ...s,
                                items: s.items.map((it) =>
                                  it.id === row.id ? { ...it, remark: e.target.value } : it,
                                ),
                              }))
                            }
                            placeholder="Details / client consideration"
                            className={cellInputCls}
                          />
                        </td>
                        <td className="max-sm:p-0 max-sm:text-left py-1 pl-1 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:bg-destructive/10"
                            aria-label={`Delete ${discipline.sectionTitle} row ${idx + 1}`}
                            onClick={() =>
                              patchDiscipline(discipline.key, (s) => ({
                                ...s,
                                items: s.items.filter((it) => it.id !== row.id),
                              }))
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  patchDiscipline(discipline.key, (s) => ({
                    ...s,
                    reviewedNone: false,
                    items: [...s.items, { id: uid(), item: "", remark: "" }],
                  }))
                }
              >
                <Plus className="mr-1 size-3.5" />
                Add item
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpenAnnexFor(showAnnex ? null : discipline.key)}
              >
                <Sparkles className="mr-1 size-3.5 text-primary" />
                {showAnnex ? "Hide Annex 2 examples" : "Pick from Annex 2"}
              </Button>
              {onlyStep && onAdvance && !hasRows ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    patchDiscipline(discipline.key, (s) => ({ ...s, reviewedNone: true }));
                    onAdvance();
                  }}
                >
                  No special items
                  <ArrowRight className="ml-1 size-3.5" />
                </Button>
              ) : null}
            </div>

            {showAnnex ? (
              <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Annex 2 examples — click to insert into {discipline.sectionTitle}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ANNEX_2_BY_DISCIPLINE[discipline.key].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() =>
                        patchDiscipline(discipline.key, (s) => ({
                          ...s,
                          reviewedNone: false,
                          items: [...s.items, { id: uid(), item: example, remark: "" }],
                        }))
                      }
                      className="rounded-md border bg-background px-2 py-1 text-left text-[11px] hover:border-primary hover:bg-primary/5"
                    >
                      + {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* B.8 Special products and items */}
      {showSpecial ? (
        <div id="q101-b8" className="scroll-mt-4 rounded-xl border bg-card/60 p-3.5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="max-w-2xl space-y-1">
              <p className="text-xs font-bold text-foreground">
                8. Special products and items (all disciplines)
                <UpdatedTag question="b-special" />
              </p>
              <p className="text-[11px] text-muted-foreground">
                Is there anything special, by us or by others, that impacts the PROFAB scope? This
                list must match the options entered in the Preliminary Estimation (PE).
              </p>
              <p className="text-[10px] text-muted-foreground">
                SI = supplied &amp; installed by PROFAB · S = supplied only by PROFAB · SIO =
                supplied &amp; installed by others
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] font-medium">
              <input
                type="checkbox"
                checked={Boolean(sectionB.specialProducts.reviewedNone)}
                onChange={(e) => patchSpecial((s) => ({ ...s, reviewedNone: e.target.checked }))}
                className="size-3.5 accent-primary"
              />
              <span>Reviewed · No special items</span>
            </label>
          </div>

          {sectionB.specialProducts.items.length > 0 ? (
            <div className="space-y-2">
              {sectionB.specialProducts.items.map((row, idx) => (
                <div
                  key={row.id}
                  className="grid gap-2 rounded-lg border bg-background/70 p-2.5 md:grid-cols-12"
                >
                  <input
                    aria-label={`Special product ${idx + 1} item`}
                    value={row.item}
                    onChange={(e) =>
                      patchSpecial((s) => ({
                        ...s,
                        reviewedNone: false,
                        items: s.items.map((it) =>
                          it.id === row.id ? { ...it, item: e.target.value } : it,
                        ),
                      }))
                    }
                    placeholder="Item"
                    className={cn(cellInputCls, "md:col-span-3")}
                  />
                  <input
                    aria-label={`Special product ${idx + 1} description`}
                    value={row.description}
                    onChange={(e) =>
                      patchSpecial((s) => ({
                        ...s,
                        items: s.items.map((it) =>
                          it.id === row.id ? { ...it, description: e.target.value } : it,
                        ),
                      }))
                    }
                    placeholder="Specification / description"
                    className={cn(cellInputCls, "md:col-span-4")}
                  />
                  <div
                    className="flex flex-wrap items-center gap-1 md:col-span-3"
                    role="radiogroup"
                    aria-label={`Special product ${idx + 1} supply scope`}
                  >
                    {SUPPLY_SCOPE_OPTIONS.map((opt) => {
                      const active = row.supply === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          title={opt.description}
                          onClick={() =>
                            patchSpecial((s) => ({
                              ...s,
                              items: s.items.map((it) =>
                                it.id === row.id
                                  ? { ...it, supply: active ? undefined : opt.code }
                                  : it,
                              ),
                            }))
                          }
                          className={cn(
                            "rounded border px-2 py-1 text-[10px] font-bold transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 md:col-span-2">
                    <input
                      aria-label={`Special product ${idx + 1} related files`}
                      value={row.relatedFiles}
                      onChange={(e) =>
                        patchSpecial((s) => ({
                          ...s,
                          items: s.items.map((it) =>
                            it.id === row.id ? { ...it, relatedFiles: e.target.value } : it,
                          ),
                        }))
                      }
                      placeholder="Related files"
                      className={cellInputCls}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-destructive hover:bg-destructive/10"
                      aria-label={`Delete special product ${idx + 1}`}
                      onClick={() =>
                        patchSpecial((s) => ({
                          ...s,
                          items: s.items.filter((it) => it.id !== row.id),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                patchSpecial((s) => ({
                  ...s,
                  reviewedNone: false,
                  items: [
                    ...s.items,
                    {
                      id: uid(),
                      item: "",
                      description: "",
                      supply: undefined,
                      relatedFiles: "",
                    } satisfies SpecialProductItem,
                  ],
                }))
              }
            >
              <Plus className="mr-1 size-3.5" />
              Add special product
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpenAnnexFor(openAnnexFor === "special" ? null : "special")}
            >
              <Sparkles className="mr-1 size-3.5 text-primary" />
              {openAnnexFor === "special" ? "Hide Annex 1 examples" : "Pick from Annex 1"}
            </Button>
            {onlyStep &&
            onAdvance &&
            !sectionB.specialProducts.items.some((r) => r.item.trim().length > 0) ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  patchSpecial((s) => ({ ...s, reviewedNone: true }));
                  onAdvance();
                }}
              >
                No special items
                <ArrowRight className="ml-1 size-3.5" />
              </Button>
            ) : null}
          </div>

          {openAnnexFor === "special" ? (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Annex 1 examples — click any item to add to B.8
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {ANNEX_1_CATEGORIES.map((group) => (
                  <div key={group.category} className="space-y-1">
                    <p className="text-[11px] font-bold text-foreground">{group.category}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.items.map((itemLabel) => (
                        <button
                          key={itemLabel}
                          type="button"
                          onClick={() =>
                            patchSpecial((s) => ({
                              ...s,
                              reviewedNone: false,
                              items: [
                                ...s.items,
                                {
                                  id: uid(),
                                  item: itemLabel,
                                  description: "",
                                  supply: undefined,
                                  relatedFiles: "",
                                },
                              ],
                            }))
                          }
                          className="rounded border bg-background px-2 py-0.5 text-left text-[11px] hover:border-primary hover:bg-primary/5"
                        >
                          + {itemLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SectionCIntake({
  form,
  onChange,
  hideHeader,
}: {
  form: QualificationForm101;
  onChange: (updater: (prev: QualificationForm101) => QualificationForm101) => void;
  hideHeader?: boolean;
}) {
  const { rfis } = form.sectionC;

  const patchRfis = (updater: (rows: TechnicalRfiItem[]) => TechnicalRfiItem[]) => {
    onChange((prev) => ({
      ...prev,
      sectionC: { ...prev.sectionC, rfis: updater(prev.sectionC.rfis) },
    }));
  };

  return (
    <div id="q101-section-c" className="scroll-mt-4 space-y-3">
      {!hideHeader ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
            C. Technical Intake Summary
          </h3>
          <p className="text-[11px] text-muted-foreground">
            1. Missing information and next actions (RFIs are tracked for follow-up without
            distorting completeness score).
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card/60 p-3.5 space-y-2.5">
        {rfis.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
            No open RFIs or follow-up actions recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="max-sm:hidden">
                <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="py-1.5 pr-2 w-24">RFI #</th>
                  <th className="py-1.5 px-2">Discipline / Issue</th>
                  <th className="py-1.5 px-2 w-40">Sent by</th>
                  <th className="py-1.5 px-2 w-32">Due date</th>
                  <th className="py-1.5 pl-1 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rfis.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="max-sm:grid max-sm:grid-cols-1 max-sm:gap-1.5 max-sm:py-2"
                  >
                    <td className="max-sm:p-0 py-1.5 pr-2">
                      <input
                        aria-label={`RFI ${idx + 1} number`}
                        value={row.rfiNo}
                        onChange={(e) =>
                          patchRfis((rows) =>
                            rows.map((r) =>
                              r.id === row.id ? { ...r, rfiNo: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder={`RFI-${idx + 1}`}
                        className={cellInputCls}
                      />
                    </td>
                    <td className="max-sm:p-0 py-1.5 px-2">
                      <input
                        aria-label={`RFI ${idx + 1} discipline or issue`}
                        value={row.disciplineOrIssue}
                        onChange={(e) =>
                          patchRfis((rows) =>
                            rows.map((r) =>
                              r.id === row.id ? { ...r, disciplineOrIssue: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="Missing drawing, spec or decision needed"
                        className={cellInputCls}
                      />
                    </td>
                    <td className="max-sm:p-0 py-1.5 px-2">
                      <input
                        aria-label={`RFI ${idx + 1} sent by`}
                        value={row.sentBy}
                        onChange={(e) =>
                          patchRfis((rows) =>
                            rows.map((r) =>
                              r.id === row.id ? { ...r, sentBy: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="Owner / rep"
                        className={cellInputCls}
                      />
                    </td>
                    <td className="max-sm:p-0 py-1.5 px-2">
                      <input
                        aria-label={`RFI ${idx + 1} due date`}
                        value={row.dueDate}
                        onChange={(e) =>
                          patchRfis((rows) =>
                            rows.map((r) =>
                              r.id === row.id ? { ...r, dueDate: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="yyyy.mm.dd"
                        className={cellInputCls}
                      />
                    </td>
                    <td className="max-sm:p-0 max-sm:text-left py-1.5 pl-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:bg-destructive/10"
                        aria-label={`Delete RFI row ${idx + 1}`}
                        onClick={() => patchRfis((rows) => rows.filter((r) => r.id !== row.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            patchRfis((rows) => [
              ...rows,
              {
                id: uid(),
                rfiNo: `RFI-${rows.length + 1}`,
                disciplineOrIssue: "",
                sentBy: "",
                dueDate: "",
              },
            ])
          }
        >
          <Plus className="mr-1 size-3.5" />
          Add RFI / next action
        </Button>
      </div>
    </div>
  );
}

export function AnnexReferenceTab({
  canInsert,
  onInsertSpecial,
  onInsertDiscipline,
}: {
  canInsert: (stepId: FormStepId) => boolean;
  onInsertSpecial: (item: string) => void;
  onInsertDiscipline: (key: DisciplineKey, item: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card/60 p-3.5 space-y-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
            Annex 1 — Special Item Examples
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Click any item to append it directly to Section B.8 (Special products and items).
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {ANNEX_1_CATEGORIES.map((group) => (
            <div
              key={group.category}
              className="rounded-lg border bg-background/70 p-2.5 space-y-1.5"
            >
              <p className="text-xs font-bold text-foreground">{group.category}</p>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      disabled={!canInsert("b-special")}
                      onClick={() => onInsertSpecial(item)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-primary/10 hover:text-primary"
                    >
                      <span>{item}</span>
                      <Plus className="size-3 shrink-0 opacity-60" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card/60 p-3.5 space-y-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
            Annex 2 — Examples by Discipline
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Click any item to append it directly to the corresponding discipline in Section B.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {DISCIPLINE_DEFINITIONS.map((discipline) => (
            <div
              key={discipline.key}
              className="rounded-lg border bg-background/70 p-2.5 space-y-1.5"
            >
              <p className="text-xs font-bold text-foreground">{discipline.sectionTitle}</p>
              <ul className="space-y-1">
                {ANNEX_2_BY_DISCIPLINE[discipline.key].map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      disabled={!canInsert(`b-${discipline.key}`)}
                      onClick={() => onInsertDiscipline(discipline.key, item)}
                      className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] hover:bg-primary/10 hover:text-primary"
                    >
                      <span>{item}</span>
                      <Plus className="size-3 shrink-0 opacity-60" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
