"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  Gauge,
  Globe,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type FalconCustomerProfile,
  customerLocation,
  fetchFalconCustomerProfile,
  formatCustomerScore,
  searchFalconCustomers,
} from "@/lib/falcon-customer-intelligence";

export type CustomerFormAnswers = {
  contactName: string;
  contactTitle: string;
  contactInfo: string;
  siteLocation: string;
  projectType: string;
  estimatedScope: string;
  engagementStatus: string;
  notes: string;
};

export type CustomerSelectionResult = {
  customerCategory: string;
  customerName: string;
  customerProfile: FalconCustomerProfile;
  customerForm: CustomerFormAnswers;
};

const PROJECT_TYPES = [
  "Multi-family / Residential",
  "Affordable / Social Housing",
  "Seniors / Long-Term Care",
  "Education",
  "Healthcare",
  "Commercial / Mixed-use",
  "Other",
];

const ENGAGEMENT_STATUSES = [
  "Lead",
  "Qualified Opportunity",
  "Active Project",
  "Repeat Customer",
];

const emptyAnswers = (): CustomerFormAnswers => ({
  contactName: "",
  contactTitle: "",
  contactInfo: "",
  siteLocation: "",
  projectType: "",
  estimatedScope: "",
  engagementStatus: "",
  notes: "",
});

export function customerFormIsComplete(
  profile: FalconCustomerProfile | null | undefined,
  answers: CustomerFormAnswers | null | undefined,
): boolean {
  if (!profile?.organizationName) return false;
  if (!answers) return false;
  return Boolean(
    answers.contactName.trim() &&
      answers.siteLocation.trim() &&
      answers.projectType.trim(),
  );
}

const fieldClass =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-background px-3.5 py-2.5 text-xs font-medium text-foreground shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

function ScoreCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-muted/20 p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-extrabold tabular-nums text-foreground">
        {formatCustomerScore(value)}
      </div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

export function CustomerSelectionForm({
  open,
  initialName = "",
  initialProfile,
  initialAnswers,
  onClose,
  onSave,
}: {
  open: boolean;
  initialName?: string;
  initialProfile?: FalconCustomerProfile;
  initialAnswers?: CustomerFormAnswers;
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
    initialAnswers || emptyAnswers(),
  );

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
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
  }, [open, query]);

  const location = useMemo(
    () => (profile ? customerLocation(profile) : ""),
    [profile],
  );
  const canSave = customerFormIsComplete(profile, answers);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
    if (!answers.siteLocation.trim()) {
      patchAnswers({ siteLocation: customerLocation(full) });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-card shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Building2 className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Form</h2>
              <p className="text-[11px] text-muted-foreground">
                Complete all required fields. Company lookup is one item in this form.
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
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                1 of 4 · Company
              </p>
              <label
                htmlFor="falcon-customer-name-search"
                className="block text-xs font-semibold text-foreground mt-1 mb-1.5"
              >
                Company name <span className="text-destructive">*</span>
              </label>
            </div>
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
                placeholder="Search company name or acronym"
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
              <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-muted/10 p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {profile.category ? (
                    <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      {profile.category}
                    </span>
                  ) : null}
                  {location ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                      <MapPin className="size-3" />
                      {location}
                    </span>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {profile.organizationName}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Legal Name: {profile.legalName || profile.organizationName}
                  </p>
                </div>
                {profile.intelligenceSummary ? (
                  <p className="text-xs leading-relaxed text-foreground/90">
                    {profile.intelligenceSummary}
                  </p>
                ) : null}
                <div className="rounded-xl border border-emerald-500/20 bg-background p-3 space-y-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    <Gauge className="size-3.5" />
                    Scoring
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <ScoreCard label="Fit" value={profile.customerQualityScore} hint="ICP × modular × scale" />
                    <ScoreCard label="Opportunity" value={profile.opportunityScore} hint="Win path × urgency" />
                    <ScoreCard label="Confidence" value={profile.confidenceScore} hint="Evidence on record" />
                  </div>
                </div>
                {profile.website || profile.domain ? (
                  <a
                    href={profile.website || `https://${profile.domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                  >
                    <Globe className="size-3.5" />
                    {profile.domain || profile.website}
                  </a>
                ) : null}
                {loadingProfile ? (
                  <p className="text-[10px] text-muted-foreground">Loading company record…</p>
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Select a company to load verified records and scores.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              2 of 4 · Project contact
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="customer-contact-name" className="block text-xs font-semibold text-foreground mb-1.5">
                  Contact name <span className="text-destructive">*</span>
                </label>
                <input
                  id="customer-contact-name"
                  aria-label="Contact name"
                  value={answers.contactName}
                  onChange={(event) => patchAnswers({ contactName: event.target.value })}
                  className={fieldClass}
                  placeholder="Primary decision maker"
                />
              </div>
              <div>
                <label htmlFor="customer-contact-title" className="block text-xs font-semibold text-foreground mb-1.5">
                  Title / role
                </label>
                <input
                  id="customer-contact-title"
                  aria-label="Title / role"
                  value={answers.contactTitle}
                  onChange={(event) => patchAnswers({ contactTitle: event.target.value })}
                  className={fieldClass}
                  placeholder="e.g. Project Manager"
                />
              </div>
            </div>
            <div>
              <label htmlFor="customer-contact-info" className="block text-xs font-semibold text-foreground mb-1.5">
                Email or phone
              </label>
              <input
                id="customer-contact-info"
                aria-label="Email or phone"
                value={answers.contactInfo}
                onChange={(event) => patchAnswers({ contactInfo: event.target.value })}
                className={fieldClass}
                placeholder="name@company.com or phone"
              />
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              3 of 4 · Project
            </p>
            <div>
              <label htmlFor="customer-site-location" className="block text-xs font-semibold text-foreground mb-1.5">
                Site / project location <span className="text-destructive">*</span>
              </label>
              <input
                id="customer-site-location"
                aria-label="Site / project location"
                value={answers.siteLocation}
                onChange={(event) => patchAnswers({ siteLocation: event.target.value })}
                className={fieldClass}
                placeholder="City, province"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="customer-project-type" className="block text-xs font-semibold text-foreground mb-1.5">
                  Project type <span className="text-destructive">*</span>
                </label>
                <select
                  id="customer-project-type"
                  aria-label="Project type"
                  value={answers.projectType}
                  onChange={(event) => patchAnswers({ projectType: event.target.value })}
                  className={fieldClass}
                >
                  <option value="">Select project type</option>
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="customer-estimated-scope" className="block text-xs font-semibold text-foreground mb-1.5">
                  Estimated scope
                </label>
                <input
                  id="customer-estimated-scope"
                  aria-label="Estimated scope"
                  value={answers.estimatedScope}
                  onChange={(event) => patchAnswers({ estimatedScope: event.target.value })}
                  className={fieldClass}
                  placeholder="e.g. 48 units / 2 wings"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              4 of 4 · Status & notes
            </p>
            <div>
              <label htmlFor="customer-engagement-status" className="block text-xs font-semibold text-foreground mb-1.5">
                Engagement status
              </label>
              <select
                id="customer-engagement-status"
                aria-label="Engagement status"
                value={answers.engagementStatus}
                onChange={(event) => patchAnswers({ engagementStatus: event.target.value })}
                className={fieldClass}
              >
                <option value="">Select status</option>
                {ENGAGEMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="customer-form-notes" className="block text-xs font-semibold text-foreground mb-1.5">
                Additional notes
              </label>
              <textarea
                id="customer-form-notes"
                aria-label="Additional notes"
                rows={3}
                value={answers.notes}
                onChange={(event) => patchAnswers({ notes: event.target.value })}
                className={fieldClass}
                placeholder="Scope, constraints, or next action"
              />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-muted/20">
          <p className="text-[10px] text-muted-foreground">
            {canSave
              ? "Form is complete. Save, then check the L3 box."
              : "Required: company, contact name, site location, and project type."}
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
