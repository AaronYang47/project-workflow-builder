"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Building2, ChevronDown, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type FalconCustomerProfile,
  customerLocation,
  fetchFalconCustomerProfile,
  searchFalconCustomers,
} from "@/lib/falcon-customer-intelligence";
import {
  QUALIFICATION_DROPDOWNS,
  QUALIFICATION_FILL_FIELDS,
  evaluateSalesQualification,
  normalizeSalesQualificationAnswers,
  requiredConditionalFields,
  salesQualificationIsComplete,
  type SalesQualificationAnswers,
} from "@/lib/sales-qualification";

export type CustomerFormAnswers = SalesQualificationAnswers;

export type CustomerSelectionResult = {
  customerCategory: string;
  customerName: string;
  customerProfile: FalconCustomerProfile;
  customerForm: CustomerFormAnswers;
};

export function customerFormIsComplete(
  profile: FalconCustomerProfile | null | undefined,
  answers: CustomerFormAnswers | null | undefined,
): boolean {
  return salesQualificationIsComplete(Boolean(profile?.organizationName), answers);
}

const fieldClass =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-background px-3.5 py-2.5 text-xs font-medium text-foreground shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function FormSection({
  panelId,
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  panelId: string;
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-muted/10 p-4 space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 text-left cursor-pointer rounded-lg -m-1 p-1 hover:bg-muted/40 transition-colors"
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="inline-flex items-center gap-1 shrink-0 mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {open ? "Hide" : "Show"}
          <ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        </span>
      </button>
      {open ? <div id={panelId}>{children}</div> : null}
    </section>
  );
}

function statusTone(status: string) {
  if (status === "No-Go") return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  if (status === "Hold" || status === "Incomplete") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  if (status === "Qualified with Risk") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
}

export function CustomerSelectionForm({
  open,
  initialName = "",
  initialProfile,
  initialAnswers,
  leadNumber = "",
  onClose,
  onSave,
}: {
  open: boolean;
  initialName?: string;
  initialProfile?: FalconCustomerProfile;
  initialAnswers?: CustomerFormAnswers;
  leadNumber?: string;
  onClose: () => void;
  onSave: (selection: CustomerSelectionResult) => void;
}) {
  const [query, setQuery] = useState(initialName);
  const [matches, setMatches] = useState<FalconCustomerProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<FalconCustomerProfile | null>(
    initialProfile || null,
  );
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [answers, setAnswers] = useState<CustomerFormAnswers>(
    normalizeSalesQualificationAnswers(initialAnswers),
  );
  const [mounted, setMounted] = useState(false);
  const [showCriteria, setShowCriteria] = useState(true);
  const [showDetails, setShowDetails] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(initialName);
    setProfile(initialProfile || null);
    setAnswers(normalizeSalesQualificationAnswers(initialAnswers));
    setShowCriteria(true);
    setShowDetails(true);
  }, [open]);

  useEffect(() => {
    if (!open || !leadNumber) return;
    let cancelled = false;
    void fetch(`/api/falcon/leads/${encodeURIComponent(leadNumber)}`, {
      credentials: "include",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const data = payload as {
          exists?: boolean;
          customer?: FalconCustomerProfile;
          form?: CustomerFormAnswers;
        } | null;
        if (cancelled || !data?.exists) return;
        if (data.customer) {
          setProfile(data.customer);
          setQuery(data.customer.organizationName || initialName);
        }
        if (data.form) {
          setAnswers(normalizeSalesQualificationAnswers(data.form));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, leadNumber, initialName]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (profile && q === profile.organizationName) {
      setMatches([]);
      setSearching(false);
      return;
    }
    if (q.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchFalconCustomers(q).then((results) => {
        if (cancelled) return;
        setMatches(results);
        setSearching(false);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, profile]);

  const location = useMemo(
    () => (profile ? customerLocation(profile) : ""),
    [profile],
  );
  const extras = requiredConditionalFields(answers);
  const qualification = evaluateSalesQualification(answers);
  const canSave = customerFormIsComplete(profile, answers);

  if (!open || !mounted) return null;

  const patchAnswers = (patch: Partial<CustomerFormAnswers>) => {
    setAnswers((current) => ({ ...current, ...patch }));
  };

  const selectCompany = async (company: FalconCustomerProfile) => {
    setQuery(company.organizationName);
    setMatches([]);
    setProfile(company);
    setLoadingProfile(true);
    const full = await fetchFalconCustomerProfile(company);
    setProfile(full);
    setLoadingProfile(false);
    if (!answers.siteMunicipality.trim()) {
      patchAnswers({ siteMunicipality: customerLocation(full) });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-card shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Building2 className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Form</h2>
              <p className="text-[11px] text-muted-foreground">
                Sales qualification. Select the customer, then complete the customer profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 scroll-thin">
          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Customer
            </p>
            <label
              htmlFor="falcon-customer-name-search"
              className="block text-xs font-semibold text-foreground"
            >
              Company name <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="falcon-customer-name-search"
                aria-label="Company name"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (profile && event.target.value !== profile.organizationName) {
                    setProfile(null);
                  }
                }}
                placeholder="Search existing customer database"
                className={`${fieldClass} pl-10`}
                autoComplete="off"
              />
              {query.trim().length >= 2 && matches.length > 0 ? (
                <div
                  role="listbox"
                  aria-label="Customer search results"
                  className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xl scroll-thin"
                >
                  {matches.map((company) => (
                    <button
                      key={company.companyId || company.organizationName}
                      type="button"
                      role="option"
                      onClick={() => void selectCompany(company)}
                      className="flex w-full flex-col items-start gap-0.5 border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60 cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-foreground">
                        {company.organizationName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {[company.category, customerLocation(company)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {searching ? (
              <p className="text-[10px] text-muted-foreground">Searching…</p>
            ) : null}
            {profile ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-muted/10 px-3 py-2">
                <span className="text-xs font-semibold text-foreground">
                  {profile.organizationName}
                </span>
                {profile.category ? (
                  <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                    {profile.category}
                  </span>
                ) : null}
                {location ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MapPin className="size-3" />
                    {location}
                  </span>
                ) : null}
                {loadingProfile ? (
                  <span className="text-[10px] text-muted-foreground">Loading record…</span>
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Choose a customer from the database first.
              </p>
            )}
          </section>

          <FormSection
            panelId="sales-qualification-criteria"
            title="1 · Qualification criteria"
            hint="Decision, site, design, budget, funding, and commercial standing."
            open={showCriteria}
            onToggle={() => setShowCriteria((current) => !current)}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {QUALIFICATION_DROPDOWNS.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`sales-${field.key}`}
                    className="block text-xs font-semibold text-foreground mb-1.5"
                  >
                    {field.label} <span className="text-destructive">*</span>
                  </label>
                  <select
                    id={`sales-${field.key}`}
                    aria-label={field.label}
                    value={answers[field.key]}
                    onChange={(event) => patchAnswers({ [field.key]: event.target.value })}
                    className={fieldClass}
                  >
                    <option value="">Select {field.label.toLowerCase()}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection
            panelId="sales-customer-project-details"
            title="2 · Customer & project details"
            hint="Decision maker, site, building size, and budget. A red * is required for the current path."
            open={showDetails}
            onToggle={() => setShowDetails((current) => !current)}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {QUALIFICATION_FILL_FIELDS.map((field) => {
                const required = extras.some((item) => item.key === field.key);
                return (
                  <div key={field.key}>
                    <label
                      htmlFor={`sales-${field.key}`}
                      className="block text-xs font-semibold text-foreground mb-1.5"
                    >
                      {field.label}
                      {required ? <span className="text-destructive"> *</span> : null}
                    </label>
                    <input
                      id={`sales-${field.key}`}
                      aria-label={field.label}
                      value={answers[field.key]}
                      onChange={(event) => patchAnswers({ [field.key]: event.target.value })}
                      className={fieldClass}
                      placeholder={field.placeholder}
                    />
                  </div>
                );
              })}
            </div>
          </FormSection>

          <section className={`rounded-xl border p-4 space-y-3 ${statusTone(qualification.qualificationStatus)}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider">
              System output · Hard Rules first
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider opacity-80">Recommended Service</p>
                <p className="mt-0.5 text-sm font-bold">{qualification.recommendedService}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider opacity-80">Qualification Status</p>
                <p className="mt-0.5 text-sm font-bold">{qualification.qualificationStatus}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider opacity-80">Project Readiness</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums">{qualification.readinessScore}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider opacity-80">Hard Rule</p>
                <p className="mt-0.5 text-sm font-bold">{qualification.hardRuleApplied ? "Yes" : "No"}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider opacity-80">Missing Information</p>
              <p className="mt-0.5 text-xs">
                {qualification.missingInformation.length
                  ? qualification.missingInformation.join(" · ")
                  : "None"}
              </p>
            </div>
            {qualification.reasons[0] ? (
              <p className="text-[11px] leading-relaxed">{qualification.reasons[0]}</p>
            ) : null}
            {qualification.risks.length ? (
              <p className="text-[11px] leading-relaxed">
                Risk: {qualification.risks.join(" ")}
              </p>
            ) : null}
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-muted/20">
          <p className="text-[10px] text-muted-foreground">
            {canSave
              ? "Save the qualification, then check the L3 box."
              : "Required: customer, qualification criteria, and any extra details this path needs."}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs cursor-pointer">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!profile || !canSave) return;
                onSave({
                  customerCategory: profile.category,
                  customerName: profile.organizationName,
                  customerProfile: profile,
                  customerForm: answers,
                });
              }}
              disabled={!canSave}
              className="h-8 text-xs font-bold cursor-pointer"
            >
              Save Form
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
