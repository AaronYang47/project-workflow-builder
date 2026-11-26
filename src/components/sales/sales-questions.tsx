"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { qualificationPartyIssue } from "@/lib/qualification";
import {
  ANNEX_1_CATEGORIES,
  ANNEX_2_BY_DISCIPLINE,
  DISCIPLINE_DEFINITIONS,
  DRAWING_ISSUE_STATUS_SUGGESTIONS,
  OCCUPANCY_GROUPS,
  PROJECT_DOCUMENT_DEFINITIONS,
  TARGET_DATE_FIELDS,
  qualificationBudgetComplete,
  type DisciplineKey,
  type QualificationForm101,
  type SupplyScopeCode,
} from "@/lib/qualification-form-101";
import {
  isForm101StepComplete,
  type FormStepId,
} from "@/components/workflow/qualification-form-101/steps";

/**
 * The Sales site's own, phone-first version of the Qualification Form [1.01]:
 * the same questions and the same saved data as the form in the app, laid out
 * for a thumb — one topic per step, big choices, the phone's own date, email
 * and number keyboards, and the form's own examples a tap away.
 */

type Form = QualificationForm101;
type Patch = (updater: (prev: Form) => Form) => void;
type SectionA = Form["sectionA"];

const uid = () => crypto.randomUUID().slice(0, 12);

/* ------------------------------------------------------------ primitives */

export const INPUT =
  "h-12 w-full rounded-xl border border-[#d5dbe4] bg-white px-3.5 text-base text-[#172033] shadow-[0_1px_0_rgba(16,24,40,0.03)] outline-none placeholder:text-[#9aa4b2] focus:border-[#245e9b] focus:ring-4 focus:ring-[#245e9b]/12";

function Question({
  id,
  title,
  hint,
  done,
  children,
}: {
  id: FormStepId | string;
  title: string;
  hint?: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={`sales-${id}`}
      data-sales-question={id}
      className="scroll-mt-36 rounded-2xl border border-[#e3e8ef] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
    >
      <div className="mb-3 flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-[#172033]">
          {title}
        </h3>
        <span
          aria-label={done ? "Answered" : "Not answered yet"}
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
            done ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#cfd6e0] bg-white",
          )}
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </div>
      {hint ? <p className="-mt-2 mb-3 text-sm leading-relaxed text-[#667085]">{hint}</p> : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-[#344054]">{label}</span>
      {children}
      {note ? <span className="block text-xs text-[#667085]">{note}</span> : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(INPUT, props.className)}
    />
  );
}

/** Two big buttons; tapping the chosen one again clears it. */
function YesNo({
  value,
  onChange,
  label,
  yes = "Yes",
  no = "No",
}: {
  value?: "yes" | "no";
  onChange: (value: "yes" | "no" | undefined) => void;
  label: string;
  yes?: string;
  no?: string;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2">
      {(
        [
          ["yes", yes],
          ["no", no],
        ] as const
      ).map(([option, text]) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? undefined : option)}
            className={cn(
              "h-12 rounded-xl border text-base font-semibold transition-colors active:scale-[0.99]",
              active
                ? option === "yes"
                  ? "border-[#245e9b] bg-[#245e9b] text-white"
                  : "border-[#475467] bg-[#475467] text-white"
                : "border-[#d5dbe4] bg-white text-[#344054]",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

function Chip({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-xl border px-3 py-1.5 text-left text-sm leading-snug",
        active
          ? "border-[#245e9b] bg-[#245e9b]/10 font-semibold text-[#1d4f84]"
          : "border-[#d5dbe4] bg-white text-[#344054] active:bg-[#f2f4f7]",
      )}
    >
      {children}
    </button>
  );
}

function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#9db7d5] bg-[#f5f8fc] text-base font-semibold text-[#245e9b] active:bg-[#eaf1f9]"
    >
      <Plus className="size-5" /> {children}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#b42318] active:bg-[#fef3f2]"
    >
      <Trash2 className="size-5" />
    </button>
  );
}

/** A section that opens on tap, with a one-line summary when closed. */
function Disclosure({
  title,
  summary,
  done,
  children,
  defaultOpen = false,
  testId,
}: {
  title: string;
  summary: string;
  done: boolean;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      data-sales-disclosure={testId}
      className="overflow-hidden rounded-xl border border-[#e3e8ef] bg-white"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-[#f9fafb]"
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border",
            done ? "border-emerald-500 bg-emerald-500 text-white" : "border-[#cfd6e0]",
          )}
        >
          {done ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[#172033]">{title}</span>
          <span className="block truncate text-sm text-[#667085]">{summary}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-[#667085] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? <div className="space-y-3 border-t border-[#eef1f5] p-3.5">{children}</div> : null}
    </div>
  );
}

/** The form keeps dates as yyyy.mm.dd; the phone's date picker uses yyyy-mm-dd. */
const toPicker = (value: string) => {
  const match = value.trim().match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};
const fromPicker = (value: string) => value.replaceAll("-", ".");

function DateInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={toPicker(value)}
      onChange={(event) => onChange(fromPicker(event.target.value))}
      className={cn(INPUT, "appearance-none", !value && "text-[#9aa4b2]")}
    />
  );
}

const patchSectionA = (patch: Patch) => (updater: (prev: SectionA) => SectionA) =>
  patch((prev) => ({ ...prev, sectionA: updater(prev.sectionA) }));

const done = (form: Form, id: FormStepId, isLoi: boolean) => isForm101StepComplete(id, form, isLoi);

/* ------------------------------------------------------------------ steps */

const OCCUPANCY_TEXT: Record<string, { title: string; text: string }> = {
  A: { title: "Assembly", text: "Group A — places where people gather" },
  C: { title: "Residential", text: "Group C — homes, apartments" },
  D: { title: "Business & personal services", text: "Group D — offices, services" },
  E: { title: "Mercantile", text: "Group E — stores, retail" },
};

export function BuildingStep({ form, patch, isLoi }: StepProps) {
  const a = form.sectionA;
  const patchA = patchSectionA(patch);
  return (
    <>
      <Question id="q1" title="Project name" done={done(form, "q1", isLoi)}>
        <TextInput
          aria-label="Project name on the form"
          value={a.projectName}
          onChange={(projectName) => patchA((p) => ({ ...p, projectName }))}
          placeholder="Name used by the client"
        />
      </Question>
      <Question id="q2" title="Full project address" done={done(form, "q2", isLoi)}>
        <textarea
          aria-label="Full project address"
          rows={2}
          value={a.projectAddress}
          onChange={(event) => patchA((p) => ({ ...p, projectAddress: event.target.value }))}
          placeholder="Street, city, province, postal code"
          autoComplete="street-address"
          className={cn(INPUT, "h-auto min-h-12 resize-none py-3 leading-snug")}
        />
      </Question>
      <Question
        id="q5"
        title="Main use of the building"
        hint="Pick the one main occupancy group."
        done={done(form, "q5", isLoi)}
      >
        <div role="radiogroup" aria-label="Main occupancy group" className="grid gap-2">
          {OCCUPANCY_GROUPS.map((group) => {
            const active = a.occupancyGroups.length === 1 && a.occupancyGroups[0] === group.code;
            const text = OCCUPANCY_TEXT[group.code];
            return (
              <button
                key={group.code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => patchA((p) => ({ ...p, occupancyGroups: [group.code] }))}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left",
                  active ? "border-[#245e9b] bg-[#245e9b]/8" : "border-[#d5dbe4] bg-white",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                    active ? "border-[#245e9b]" : "border-[#cfd6e0]",
                  )}
                >
                  {active ? <span className="size-2.5 rounded-full bg-[#245e9b]" /> : null}
                </span>
                <span>
                  <span className="block font-semibold text-[#172033]">{text.title}</span>
                  <span className="block text-sm text-[#667085]">{text.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Question>
      <Question
        id="q6"
        title="Approximate gross floor area"
        hint="All levels together."
        done={done(form, "q6", isLoi)}
      >
        <div className="relative">
          <TextInput
            aria-label="Gross area sq ft"
            inputMode="numeric"
            value={a.grossAreaSqFt}
            onChange={(grossAreaSqFt) => patchA((p) => ({ ...p, grossAreaSqFt }))}
            placeholder="e.g. 24,500"
            className="pr-16"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-[#667085]">
            sq. ft.
          </span>
        </div>
      </Question>
    </>
  );
}

export function PeopleStep({ form, patch, isLoi }: StepProps) {
  const a = form.sectionA;
  const patchA = patchSectionA(patch);
  const partyIssue = qualificationPartyIssue(a.parties);
  const roles = [
    ["owner", "Owner"],
    ["gc", "General contractor"],
    ["client", "Our client (PROFAB)"],
  ] as const;
  const contact = (key: keyof SectionA["mainContact"], value: string) =>
    patchA((p) => ({ ...p, mainContact: { ...p.mainContact, [key]: value } }));
  return (
    <>
      <Question
        id="q3"
        title="Who are the project parties?"
        hint="At least one company, with a contact for each company you enter."
        done={done(form, "q3", isLoi)}
      >
        {roles.map(([key, label]) => (
          <fieldset key={key} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3">
            <legend className="sr-only">{label}</legend>
            <p className="text-sm font-semibold text-[#344054]">{label}</p>
            <TextInput
              aria-label={`${label} company`}
              value={a.parties[key].company}
              onChange={(company) =>
                patchA((p) => ({
                  ...p,
                  parties: { ...p.parties, [key]: { ...p.parties[key], company } },
                }))
              }
              placeholder="Company"
              autoComplete="organization"
            />
            <TextInput
              aria-label={`${label} contact`}
              value={a.parties[key].contact}
              onChange={(value) =>
                patchA((p) => ({
                  ...p,
                  parties: { ...p.parties, [key]: { ...p.parties[key], contact: value } },
                }))
              }
              placeholder="Contact: name, email or phone"
            />
          </fieldset>
        ))}
        {partyIssue && a.parties.owner.company + a.parties.gc.company + a.parties.client.company ? (
          <p className="text-sm text-[#b54708]">{partyIssue}</p>
        ) : null}
      </Question>
      <Question id="q4" title="Main contact for the project" done={done(form, "q4", isLoi)}>
        <Field label="Name">
          <TextInput
            aria-label="Main contact name"
            value={a.mainContact.name}
            onChange={(value) => contact("name", value)}
            autoComplete="name"
          />
        </Field>
        <Field label="Company & role">
          <TextInput
            aria-label="Main contact company and role"
            value={a.mainContact.companyRole}
            onChange={(value) => contact("companyRole", value)}
            placeholder="e.g. Laurier inc. — owner's rep"
          />
        </Field>
        <Field label="Email">
          <TextInput
            aria-label="Main contact email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={a.mainContact.email}
            onChange={(value) => contact("email", value)}
          />
        </Field>
        <Field label="Phone">
          <TextInput
            aria-label="Main contact phone"
            type="tel"
            inputMode="tel"
            value={a.mainContact.phone}
            onChange={(value) => contact("phone", value)}
          />
        </Field>
      </Question>
    </>
  );
}

export function ConsultantsStep({ form, patch, isLoi }: StepProps) {
  const a = form.sectionA;
  const patchA = patchSectionA(patch);
  const set = (key: DisciplineKey, field: "name" | "company" | "contact", value: string) =>
    patchA((p) => ({
      ...p,
      consultants: { ...p.consultants, [key]: { ...p.consultants[key], [field]: value } },
    }));
  return (
    <Question
      id="q7"
      title="Responsible consultants"
      hint="For each discipline: a name or company, and how to reach them. Tap to open."
      done={done(form, "q7", isLoi)}
    >
      <div className="space-y-2">
        {DISCIPLINE_DEFINITIONS.map((discipline) => {
          const entry = a.consultants[discipline.key];
          const filled = Boolean(
            (entry.name.trim() || entry.company.trim()) && entry.contact.trim(),
          );
          const summary =
            [entry.name, entry.company].filter((value) => value.trim()).join(" · ") ||
            "Not filled in";
          return (
            <Disclosure
              key={discipline.key}
              testId={`consultant-${discipline.key}`}
              title={discipline.consultantLabel}
              summary={summary}
              done={filled}
            >
              <TextInput
                aria-label={`${discipline.consultantLabel} consultant name`}
                value={entry.name}
                onChange={(value) => set(discipline.key, "name", value)}
                placeholder="Name"
              />
              <TextInput
                aria-label={`${discipline.consultantLabel} consultant company`}
                value={entry.company}
                onChange={(value) => set(discipline.key, "company", value)}
                placeholder="Company"
              />
              <TextInput
                aria-label={`${discipline.consultantLabel} consultant contact`}
                value={entry.contact}
                onChange={(value) => set(discipline.key, "contact", value)}
                placeholder="Email or phone"
              />
            </Disclosure>
          );
        })}
      </div>
    </Question>
  );
}

export function CommercialStep({ form, patch, isLoi }: StepProps) {
  const a = form.sectionA;
  const patchA = patchSectionA(patch);
  const budgetAmountBad =
    a.budgetEstablished === "yes" &&
    Boolean(a.projectBudgetCad?.trim()) &&
    !qualificationBudgetComplete(a);
  return (
    <>
      <Question id="q8" title="Is there a project budget?" done={done(form, "q8", isLoi)}>
        <YesNo
          label="Project budget established"
          value={a.budgetEstablished}
          onChange={(budgetEstablished) => patchA((p) => ({ ...p, budgetEstablished }))}
        />
        {a.budgetEstablished === "yes" ? (
          <Field
            label="Total budget (CAD)"
            note={budgetAmountBad ? "Use numbers only, e.g. 1,250,000" : undefined}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#667085]">
                $
              </span>
              <TextInput
                aria-label="Project budget CAD"
                inputMode="decimal"
                value={a.projectBudgetCad ?? ""}
                onChange={(projectBudgetCad) => patchA((p) => ({ ...p, projectBudgetCad }))}
                placeholder="1,250,000"
                className="pl-8"
              />
            </div>
          </Field>
        ) : null}
      </Question>
      <Question
        id="q9"
        title="Deposit received (CSA or PCS)?"
        hint={isLoi ? "This project goes through an LOI, which has no deposit." : undefined}
        done={done(form, "q9", isLoi)}
      >
        <YesNo
          label="CSA or PCS deposit received"
          value={a.depositReceived}
          onChange={(depositReceived) => patchA((p) => ({ ...p, depositReceived }))}
        />
      </Question>
      <Question
        id="q11"
        title="Target dates"
        hint="Best guess is fine. Tap a date to pick it."
        done={done(form, "q11", isLoi)}
      >
        <div className="grid gap-3">
          {TARGET_DATE_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              <DateInput
                label={`Target date: ${field.label}`}
                value={a.targetDates[field.key]}
                onChange={(value) =>
                  patchA((p) => ({ ...p, targetDates: { ...p.targetDates, [field.key]: value } }))
                }
              />
            </Field>
          ))}
        </div>
      </Question>
    </>
  );
}

const DOCUMENT_TEXT: Record<string, string> = {
  permit: "Permit",
  archDrawings: "Architectural drawings (with site plan)",
  bylawsZoning: "Municipal bylaws / zoning",
  productSpecs: "Product requirements / specs",
  classEstimate: "Class estimate (CEC)",
  existingRfis: "Existing RFIs",
  priorCorrespondence: "Earlier emails / instructions",
};

export function DocumentsStep({ form, patch, isLoi }: StepProps) {
  const a = form.sectionA;
  const patchA = patchSectionA(patch);
  const unanswered = PROJECT_DOCUMENT_DEFINITIONS.some((doc) => !a.documents[doc.key].available);
  const updateDrawing = (id: string, change: Partial<SectionA["latestDrawings"][number]>) =>
    patchA((p) => ({
      ...p,
      latestDrawings: p.latestDrawings.map((row) => (row.id === id ? { ...row, ...change } : row)),
    }));
  return (
    <>
      <Question
        id="q12"
        title="Which documents do you have?"
        hint="Where a document is, add the folder, link or email date."
        done={done(form, "q12", isLoi)}
      >
        {PROJECT_DOCUMENT_DEFINITIONS.map((doc) => {
          const entry = a.documents[doc.key];
          return (
            <div key={doc.key} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3">
              <p className="text-sm font-semibold text-[#344054]">
                {DOCUMENT_TEXT[doc.key] ?? doc.label}
              </p>
              <YesNo
                label={`${doc.label} available`}
                yes="Have it"
                no="Not yet"
                value={entry.available}
                onChange={(available) =>
                  patchA((p) => ({
                    ...p,
                    documents: {
                      ...p.documents,
                      [doc.key]: { ...p.documents[doc.key], available },
                    },
                  }))
                }
              />
              {entry.available === "yes" ? (
                <TextInput
                  aria-label={`${doc.label} file location or email date`}
                  value={entry.locationOrDate}
                  onChange={(locationOrDate) =>
                    patchA((p) => ({
                      ...p,
                      documents: {
                        ...p.documents,
                        [doc.key]: { ...p.documents[doc.key], locationOrDate },
                      },
                    }))
                  }
                  placeholder="Folder, link or email date"
                />
              ) : null}
            </div>
          );
        })}
        {unanswered ? (
          <button
            type="button"
            onClick={() =>
              patchA((p) => {
                const documents = { ...p.documents };
                for (const doc of PROJECT_DOCUMENT_DEFINITIONS)
                  if (!documents[doc.key].available)
                    documents[doc.key] = { ...documents[doc.key], available: "no" };
                return { ...p, documents };
              })
            }
            className="h-11 w-full rounded-xl text-sm font-semibold text-[#245e9b] active:bg-[#eaf1f9]"
          >
            Mark the rest as “Not yet”
          </button>
        ) : null}
      </Question>
      {a.documents.archDrawings.available !== "no" ? (
        <Question
          id="q13"
          title="Latest drawings"
          hint="Name, revision, issue status and where to find them."
          done={done(form, "q13", isLoi)}
        >
          {a.latestDrawings.map((row, index) => (
            <div key={row.id} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[#344054]">Drawing set {index + 1}</p>
                <RemoveButton
                  label={`Delete drawing set ${index + 1}`}
                  onClick={() =>
                    patchA((p) => ({
                      ...p,
                      latestDrawings: p.latestDrawings.filter((item) => item.id !== row.id),
                    }))
                  }
                />
              </div>
              <TextInput
                aria-label={`Drawing ${index + 1} name`}
                value={row.drawingName}
                onChange={(drawingName) => updateDrawing(row.id, { drawingName })}
                placeholder="Drawing name / set"
              />
              <div className="grid grid-cols-[6rem_1fr] gap-2">
                <TextInput
                  aria-label={`Drawing ${index + 1} revision number`}
                  value={row.revisionNumber}
                  onChange={(revisionNumber) => updateDrawing(row.id, { revisionNumber })}
                  placeholder="Rev #"
                />
                <DateInput
                  label={`Drawing ${index + 1} revision date`}
                  value={row.revisionDate}
                  onChange={(revisionDate) => updateDrawing(row.id, { revisionDate })}
                />
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                aria-label={`Drawing ${index + 1} issue status`}
              >
                {DRAWING_ISSUE_STATUS_SUGGESTIONS.map((status) => (
                  <Chip
                    key={status}
                    active={row.issueStatus === status}
                    onClick={() =>
                      updateDrawing(row.id, {
                        issueStatus: row.issueStatus === status ? "" : status,
                      })
                    }
                  >
                    {status}
                  </Chip>
                ))}
              </div>
              <TextInput
                aria-label={`Drawing ${index + 1} exact location`}
                value={row.exactLocation}
                onChange={(exactLocation) => updateDrawing(row.id, { exactLocation })}
                placeholder="Exact folder, link or email"
              />
            </div>
          ))}
          <AddButton
            onClick={() =>
              patchA((p) => ({
                ...p,
                latestDrawings: [
                  ...p.latestDrawings,
                  {
                    id: uid(),
                    drawingName: "",
                    revisionNumber: "",
                    revisionDate: "",
                    issueStatus: "",
                    exactLocation: "",
                  },
                ],
              }))
            }
          >
            Add a drawing set
          </AddButton>
        </Question>
      ) : null}
    </>
  );
}

/** "1.2. Foundation plan: dimensioned…" → "Foundation plan" */
const shortExample = (example: string) =>
  example
    .replace(/^\d+\.\d+\.\s*/, "")
    .split(/[:?]/)[0]
    .trim();

const SUPPLY_TEXT: Record<SupplyScopeCode, string> = {
  "FI/SI": "PROFAB supplies & installs",
  "F/S": "PROFAB supplies only",
  "FIA/SIO": "Others supply & install",
};

export function TechnicalStep({ form, patch }: StepProps) {
  const b = form.sectionB;
  const patchDiscipline = (
    key: DisciplineKey,
    updater: (section: Form["sectionB"]["disciplines"][DisciplineKey]) => typeof section,
  ) =>
    patch((prev) => ({
      ...prev,
      sectionB: {
        ...prev.sectionB,
        disciplines: {
          ...prev.sectionB.disciplines,
          [key]: updater(prev.sectionB.disciplines[key]),
        },
      },
    }));
  const patchSpecial = (
    updater: (section: Form["sectionB"]["specialProducts"]) => Form["sectionB"]["specialProducts"],
  ) =>
    patch((prev) => ({
      ...prev,
      sectionB: { ...prev.sectionB, specialProducts: updater(prev.sectionB.specialProducts) },
    }));
  const special = b.specialProducts;
  const specialDone = Boolean(special.reviewedNone || special.items.some((row) => row.item.trim()));
  return (
    <>
      <Question
        id="b-disciplines"
        title="What did the client mention, by discipline?"
        hint="One short line per item, including what the client is still considering. Tap a suggestion to add it."
        done={DISCIPLINE_DEFINITIONS.every((d) => {
          const sec = b.disciplines[d.key];
          return Boolean(sec.reviewedNone || sec.items.some((row) => row.item.trim()));
        })}
      >
        <div className="space-y-2">
          {DISCIPLINE_DEFINITIONS.map((discipline) => {
            const sec = b.disciplines[discipline.key];
            const items = sec.items;
            const sectionDone = Boolean(sec.reviewedNone || items.some((row) => row.item.trim()));
            const used = new Set(items.map((row) => row.item));
            return (
              <Disclosure
                key={discipline.key}
                testId={`discipline-${discipline.key}`}
                title={discipline.sectionTitle.replace(/^\d+\.\s*/, "")}
                summary={
                  sec.reviewedNone
                    ? "Nothing to note"
                    : items.length
                      ? `${items.length} item${items.length === 1 ? "" : "s"}`
                      : "Not filled in"
                }
                done={sectionDone}
              >
                {"note" in discipline && discipline.note ? (
                  <p className="rounded-lg bg-[#fffaeb] px-3 py-2 text-sm text-[#93370d]">
                    {discipline.note}
                  </p>
                ) : null}
                <label className="flex min-h-11 items-center gap-3 text-base">
                  <input
                    type="checkbox"
                    checked={Boolean(sec.reviewedNone)}
                    onChange={(event) =>
                      patchDiscipline(discipline.key, (s) => ({
                        ...s,
                        reviewedNone: event.target.checked,
                      }))
                    }
                    className="size-5 accent-[#245e9b]"
                  />
                  Nothing to note for {discipline.consultantLabel.toLowerCase()}
                </label>
                {!sec.reviewedNone ? (
                  <>
                    {items.map((row, index) => (
                      <div key={row.id} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3">
                        <div className="flex items-start gap-2">
                          <TextInput
                            aria-label={`${discipline.sectionTitle} item ${index + 1}`}
                            value={row.item}
                            onChange={(value) =>
                              patchDiscipline(discipline.key, (s) => ({
                                ...s,
                                items: s.items.map((it) =>
                                  it.id === row.id ? { ...it, item: value } : it,
                                ),
                              }))
                            }
                            placeholder="Item"
                          />
                          <RemoveButton
                            label={`Delete ${discipline.sectionTitle} item ${index + 1}`}
                            onClick={() =>
                              patchDiscipline(discipline.key, (s) => ({
                                ...s,
                                items: s.items.filter((it) => it.id !== row.id),
                              }))
                            }
                          />
                        </div>
                        <textarea
                          aria-label={`${discipline.sectionTitle} remark ${index + 1}`}
                          rows={2}
                          value={row.remark}
                          onChange={(event) =>
                            patchDiscipline(discipline.key, (s) => ({
                              ...s,
                              items: s.items.map((it) =>
                                it.id === row.id ? { ...it, remark: event.target.value } : it,
                              ),
                            }))
                          }
                          placeholder="Details, or what the client is still considering"
                          className={cn(INPUT, "h-auto min-h-12 resize-none py-3 leading-snug")}
                        />
                      </div>
                    ))}
                    <AddButton
                      onClick={() =>
                        patchDiscipline(discipline.key, (s) => ({
                          reviewedNone: false,
                          items: [...s.items, { id: uid(), item: "", remark: "" }],
                        }))
                      }
                    >
                      Add an item
                    </AddButton>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#667085]">
                        Suggestions
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ANNEX_2_BY_DISCIPLINE[discipline.key]
                          .map(shortExample)
                          .filter((example) => !used.has(example))
                          .map((example) => (
                            <Chip
                              key={example}
                              onClick={() =>
                                patchDiscipline(discipline.key, (s) => ({
                                  reviewedNone: false,
                                  items: [...s.items, { id: uid(), item: example, remark: "" }],
                                }))
                              }
                            >
                              + {example}
                            </Chip>
                          ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </Disclosure>
            );
          })}
        </div>
      </Question>

      <Question
        id="b-special"
        title="Special products and items"
        hint="Anything that changes PROFAB's scope, by us or by others. Must match the options in the Preliminary Estimation."
        done={specialDone}
      >
        <label className="flex min-h-11 items-center gap-3 text-base">
          <input
            type="checkbox"
            checked={Boolean(special.reviewedNone)}
            onChange={(event) =>
              patchSpecial((s) => ({ ...s, reviewedNone: event.target.checked }))
            }
            className="size-5 accent-[#245e9b]"
          />
          No special products or items
        </label>
        {!special.reviewedNone ? (
          <>
            {special.items.map((row, index) => (
              <div key={row.id} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3">
                <div className="flex items-start gap-2">
                  <TextInput
                    aria-label={`Special item ${index + 1}`}
                    value={row.item}
                    onChange={(item) =>
                      patchSpecial((s) => ({
                        ...s,
                        items: s.items.map((it) => (it.id === row.id ? { ...it, item } : it)),
                      }))
                    }
                    placeholder="Item"
                  />
                  <RemoveButton
                    label={`Delete special item ${index + 1}`}
                    onClick={() =>
                      patchSpecial((s) => ({
                        ...s,
                        items: s.items.filter((it) => it.id !== row.id),
                      }))
                    }
                  />
                </div>
                <TextInput
                  aria-label={`Special item ${index + 1} description`}
                  value={row.description}
                  onChange={(description) =>
                    patchSpecial((s) => ({
                      ...s,
                      items: s.items.map((it) => (it.id === row.id ? { ...it, description } : it)),
                    }))
                  }
                  placeholder="Description (make, model, spec)"
                />
                <div
                  role="radiogroup"
                  aria-label={`Special item ${index + 1} supply`}
                  className="grid gap-1.5"
                >
                  {(Object.keys(SUPPLY_TEXT) as SupplyScopeCode[]).map((code) => {
                    const active = row.supply === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          patchSpecial((s) => ({
                            ...s,
                            items: s.items.map((it) =>
                              it.id === row.id ? { ...it, supply: active ? undefined : code } : it,
                            ),
                          }))
                        }
                        className={cn(
                          "flex min-h-11 items-center justify-between rounded-xl border px-3.5 text-left text-sm",
                          active
                            ? "border-[#245e9b] bg-[#245e9b]/8 font-semibold text-[#1d4f84]"
                            : "border-[#d5dbe4] bg-white text-[#344054]",
                        )}
                      >
                        {SUPPLY_TEXT[code]}
                        <span className="text-xs text-[#667085]">{code}</span>
                      </button>
                    );
                  })}
                </div>
                <TextInput
                  aria-label={`Special item ${index + 1} related files`}
                  value={row.relatedFiles}
                  onChange={(relatedFiles) =>
                    patchSpecial((s) => ({
                      ...s,
                      items: s.items.map((it) => (it.id === row.id ? { ...it, relatedFiles } : it)),
                    }))
                  }
                  placeholder="Related files (optional)"
                />
              </div>
            ))}
            <AddButton
              onClick={() =>
                patchSpecial((s) => ({
                  reviewedNone: false,
                  items: [
                    ...s.items,
                    { id: uid(), item: "", description: "", supply: undefined, relatedFiles: "" },
                  ],
                }))
              }
            >
              Add a special item
            </AddButton>
            <div className="space-y-2">
              {ANNEX_1_CATEGORIES.map((category) => (
                <div key={category.category}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#667085]">
                    {category.category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {category.items
                      .map((example) => example.split(" — ")[0].split(" (")[0].trim())
                      .filter((example) => !special.items.some((row) => row.item === example))
                      .map((example) => (
                        <Chip
                          key={example}
                          onClick={() =>
                            patchSpecial((s) => ({
                              reviewedNone: false,
                              items: [
                                ...s.items,
                                {
                                  id: uid(),
                                  item: example,
                                  description: "",
                                  supply: undefined,
                                  relatedFiles: "",
                                },
                              ],
                            }))
                          }
                        >
                          + {example}
                        </Chip>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Question>
    </>
  );
}

export function OpenQuestionsStep({ form, patch, isLoi }: StepProps) {
  const rfis = form.sectionC.rfis;
  const patchRfis = (updater: (rows: Form["sectionC"]["rfis"]) => Form["sectionC"]["rfis"]) =>
    patch((prev) => ({
      ...prev,
      sectionC: { ...prev.sectionC, rfis: updater(prev.sectionC.rfis) },
    }));
  const update = (id: string, change: Partial<Form["sectionC"]["rfis"][number]>) =>
    patchRfis((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  return (
    <Question
      id="c-rfis"
      title="Missing information and next actions"
      hint="What is still missing, who asked for it and by when."
      done={done(form, "c-rfis", isLoi)}
    >
      {rfis.map((row, index) => (
        <div key={row.id} className="space-y-2 rounded-xl bg-[#f7f9fc] p-3">
          <div className="flex items-center gap-2">
            <TextInput
              aria-label={`RFI ${index + 1} number`}
              value={row.rfiNo}
              onChange={(rfiNo) => update(row.id, { rfiNo })}
              placeholder="RFI #"
              className="w-28"
            />
            <span className="flex-1" />
            <RemoveButton
              label={`Delete RFI ${index + 1}`}
              onClick={() => patchRfis((rows) => rows.filter((item) => item.id !== row.id))}
            />
          </div>
          <textarea
            aria-label={`RFI ${index + 1} discipline or issue`}
            rows={2}
            value={row.disciplineOrIssue}
            onChange={(event) => update(row.id, { disciplineOrIssue: event.target.value })}
            placeholder="What is missing (drawing, spec, decision…)"
            className={cn(INPUT, "h-auto min-h-12 resize-none py-3 leading-snug")}
          />
          <div className="grid grid-cols-2 gap-2">
            <TextInput
              aria-label={`RFI ${index + 1} sent by`}
              value={row.sentBy}
              onChange={(sentBy) => update(row.id, { sentBy })}
              placeholder="Sent by"
            />
            <DateInput
              label={`RFI ${index + 1} due date`}
              value={row.dueDate}
              onChange={(dueDate) => update(row.id, { dueDate })}
            />
          </div>
        </div>
      ))}
      <AddButton
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
        Add a missing item
      </AddButton>
    </Question>
  );
}

export type StepProps = { form: Form; patch: Patch; isLoi: boolean };

/** The Sales steps, each with the Form 1.01 questions it holds. */
export const SALES_FORM_STEPS = [
  { id: "building", title: "Building", questions: ["q1", "q2", "q5", "q6"], Step: BuildingStep },
  { id: "people", title: "People", questions: ["q3", "q4"], Step: PeopleStep },
  { id: "consultants", title: "Consultants", questions: ["q7"], Step: ConsultantsStep },
  {
    id: "commercial",
    title: "Budget & dates",
    questions: ["q8", "q9", "q11"],
    Step: CommercialStep,
  },
  { id: "documents", title: "Documents", questions: ["q12", "q13"], Step: DocumentsStep },
  {
    id: "technical",
    title: "Technical notes",
    questions: [...DISCIPLINE_DEFINITIONS.map((d) => `b-${d.key}` as const), "b-special"],
    Step: TechnicalStep,
  },
  { id: "open", title: "Open items", questions: ["c-rfis"], Step: OpenQuestionsStep },
] as const satisfies readonly {
  id: string;
  title: string;
  questions: readonly FormStepId[];
  Step: (props: StepProps) => ReactNode;
}[];

/** Which Sales step holds a Form 1.01 question. */
export const salesStepOf = (questionId: string) =>
  SALES_FORM_STEPS.findIndex(
    (step) =>
      (step.questions as readonly string[]).includes(questionId) ||
      (questionId.startsWith("b-") && step.id === "technical"),
  );
