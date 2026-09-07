"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
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
import { cn } from "@/lib/utils";

export type CustomerSelectionResult = {
  customerCategory: string;
  customerName: string;
  customerProfile: FalconCustomerProfile;
};

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
  onClose,
  onConfirm,
}: {
  open: boolean;
  initialName?: string;
  initialProfile?: FalconCustomerProfile;
  onClose: () => void;
  onConfirm: (selection: CustomerSelectionResult) => void;
}) {
  const [query, setQuery] = useState(initialName);
  const [matches, setMatches] = useState<FalconCustomerProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<FalconCustomerProfile | null>(
    initialProfile || null,
  );
  const [loadingProfile, setLoadingProfile] = useState(false);

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

  if (!open) return null;

  const selectCompany = async (company: FalconCustomerProfile) => {
    setQuery(company.organizationName);
    setMatches([]);
    setProfile(company);
    setLoadingProfile(true);
    const full = await fetchFalconCustomerProfile(company);
    setProfile(full);
    setLoadingProfile(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-card shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Building2 className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Customer Selection Form
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Search Falcon Customer Intelligence Database by customer name
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer selection form"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 scroll-thin">
          <div className="relative">
            <label
              htmlFor="falcon-customer-name-search"
              className="block text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5"
            >
              Customer Name Lookup
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="falcon-customer-name-search"
                aria-label="Customer Name Lookup"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  if (profile && event.target.value !== profile.organizationName) {
                    setProfile(null);
                  }
                }}
                placeholder="Search customer name, agency, GC, or acronym (e.g. CMHC, 720 Modular)"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-background py-2.5 pl-10 pr-3 text-xs font-medium text-foreground shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
                autoComplete="off"
              />
            </div>
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
            {searching ? (
              <p className="mt-1 text-[10px] text-muted-foreground">Searching customer database…</p>
            ) : null}
          </div>

          {profile ? (
            <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-muted/10 p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.category ? (
                  <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {profile.category}
                  </span>
                ) : null}
                {profile.ownershipType ? (
                  <span className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                    {profile.ownershipType}
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
                <h3 className="text-base font-bold tracking-tight text-foreground">
                  {profile.organizationName}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Legal Name: {profile.legalName || profile.organizationName}
                  {profile.tradeName ? ` | Trade Name: ${profile.tradeName}` : ""}
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
                  Customer Scoring — Fit, Opportunity, Confidence
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ScoreCard
                    label="Fit"
                    value={profile.customerQualityScore}
                    hint="ICP × modular × scale"
                  />
                  <ScoreCard
                    label="Opportunity"
                    value={profile.opportunityScore}
                    hint="Win path × urgency"
                  />
                  <ScoreCard
                    label="Confidence"
                    value={profile.confidenceScore}
                    hint="Evidence on record"
                  />
                </div>
                {profile.ratingTier ? (
                  <span className="inline-flex rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {profile.ratingTier}
                  </span>
                ) : null}
                {profile.summaryVerdict ? (
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {profile.summaryVerdict}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-background p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Procurement
                  </p>
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {profile.procurementType || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-background p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Headquarters
                  </p>
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {profile.address || location || "—"}
                  </p>
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
                <p className="text-[10px] text-muted-foreground">Loading full customer record…</p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-xs text-muted-foreground">
              Type a customer name to look up verified records, scores, and project fit.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs cursor-pointer">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!profile) return;
              onConfirm({
                customerCategory: profile.category,
                customerName: profile.organizationName,
                customerProfile: profile,
              });
            }}
            disabled={!profile}
            className="h-8 text-xs font-bold gap-1 cursor-pointer"
          >
            <CheckCircle2 className="size-3.5" />
            Confirm This Customer
          </Button>
        </div>
      </div>
    </div>
  );
}
