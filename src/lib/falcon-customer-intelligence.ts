import catalog from "@/data/falcon-customer-catalog.json";

export const CUSTOMER_CMS_ORIGIN = "https://customer-management-system.pages.dev";

export type FalconCustomerContact = {
  name: string;
  title: string;
  contact: string;
};

export type FalconCustomerProfile = {
  companyId: string;
  customerCode: string;
  organizationName: string;
  legalName: string;
  tradeName: string;
  aliases: string[];
  acronyms: string[];
  category: string;
  ownershipType: string;
  province: string;
  city: string;
  address: string;
  website: string;
  domain: string;
  procurementType: string;
  intelligenceSummary: string;
  modularRelevance: string;
  customerQualityScore: number | null;
  opportunityScore: number | null;
  confidenceScore: number | null;
  ratingTier: string;
  summaryVerdict: string;
  keyStrengths: string[];
  keyRisks: string[];
  keyContacts: FalconCustomerContact[];
};

export const FALCON_CUSTOMER_CATALOG = (catalog as FalconCustomerProfile[]).map(
  normalizeCatalogRecord,
);

export const CUSTOMER_SELECTION_FORM_ID = "falcon-customer-selection-form";
export const CUSTOMER_SELECTION_FORM_FILE_NAME = "Customer_Selection_Form.json";

export function isCustomerSelectionForm(record: {
  id?: string;
  fileName?: string;
  formKind?: string;
  code?: string;
  title?: string;
}): boolean {
  const fileName = String(record.fileName || "");
  return (
    record.formKind === "customer-selection" ||
    record.id === CUSTOMER_SELECTION_FORM_ID ||
    fileName === CUSTOMER_SELECTION_FORM_FILE_NAME ||
    /^Customer_Selection_Form\./i.test(fileName) ||
    String(record.code || "").toUpperCase().startsWith("CUST-38")
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asContacts(value: unknown): FalconCustomerContact[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      name: String(item.name || "").trim(),
      title: String(item.title || "").trim(),
      contact: String(item.contact || item.email || "").trim(),
    }))
    .filter((item) => item.name || item.contact);
}

function normalizeCatalogRecord(raw: Partial<FalconCustomerProfile>): FalconCustomerProfile {
  return {
    companyId: String(raw.companyId || "").trim(),
    customerCode: String(raw.customerCode || "").trim().toUpperCase(),
    organizationName: String(raw.organizationName || "").trim(),
    legalName: String(raw.legalName || raw.organizationName || "").trim(),
    tradeName: String(raw.tradeName || "").trim(),
    aliases: asStringArray(raw.aliases),
    acronyms: asStringArray(raw.acronyms),
    category: String(raw.category || "").trim(),
    ownershipType: String(raw.ownershipType || "").trim(),
    province: String(raw.province || "").trim(),
    city: String(raw.city || "").trim(),
    address: String(raw.address || "").trim(),
    website: String(raw.website || "").trim(),
    domain: String(raw.domain || "").trim(),
    procurementType: String(raw.procurementType || "").trim(),
    intelligenceSummary: String(raw.intelligenceSummary || "").trim(),
    modularRelevance: String(raw.modularRelevance || "").trim(),
    customerQualityScore: asNumber(raw.customerQualityScore),
    opportunityScore: asNumber(raw.opportunityScore),
    confidenceScore: asNumber(raw.confidenceScore),
    ratingTier: String(raw.ratingTier || "").trim(),
    summaryVerdict: String(raw.summaryVerdict || "").trim(),
    keyStrengths: asStringArray(raw.keyStrengths),
    keyRisks: asStringArray(raw.keyRisks),
    keyContacts: asContacts(raw.keyContacts),
  };
}

function cleanText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function formatCustomerScore(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function customerLocation(profile: Pick<FalconCustomerProfile, "city" | "province">) {
  return [profile.city, profile.province].filter(Boolean).join(", ");
}

export function mapApiCompany(raw: Record<string, unknown>): FalconCustomerProfile {
  const breakdown =
    raw.score_breakdown && typeof raw.score_breakdown === "object"
      ? (raw.score_breakdown as Record<string, unknown>)
      : {};
  const confidence =
    asNumber(raw.confidence_score) ??
    (typeof breakdown.confidence_level === "number"
      ? Math.round(breakdown.confidence_level * 1000) / 10
      : asNumber(breakdown.confidence_score));
  return {
    companyId: String(raw.company_id || "").trim(),
    customerCode: String(raw.customer_code || "").trim().toUpperCase(),
    organizationName: String(raw.organization_name || "").trim(),
    legalName: String(raw.legal_name || raw.organization_name || "").trim(),
    tradeName: String(raw.trade_name || "").trim(),
    aliases: asStringArray(raw.aliases),
    acronyms: asStringArray(raw.acronyms),
    category: String(raw.category || "").trim(),
    ownershipType: String(raw.ownership_type || "").trim(),
    province: String(raw.province || "").trim(),
    city: String(raw.city || "").trim(),
    address: String(raw.address || "").trim(),
    website: String(raw.website || "").trim(),
    domain: String(raw.domain || "").trim(),
    procurementType: String(raw.procurement_type || "").trim(),
    intelligenceSummary: String(raw.intelligence_summary || "").trim(),
    modularRelevance: String(
      raw.profab_relevance || breakdown.modular_relevance || "",
    ).trim(),
    customerQualityScore:
      asNumber(raw.customer_quality_score) ?? asNumber(breakdown.customer_quality_score),
    opportunityScore:
      asNumber(raw.opportunity_score) ?? asNumber(breakdown.opportunity_score),
    confidenceScore: confidence,
    ratingTier: String(breakdown.rating_tier || "").trim(),
    summaryVerdict: String(
      breakdown.scoring_narrative || breakdown.summary_verdict || "",
    ).trim(),
    keyStrengths: asStringArray(breakdown.key_strengths),
    keyRisks: asStringArray(breakdown.key_risks),
    keyContacts: asContacts(raw.key_contacts),
  };
}

export function searchFalconCustomersLocal(query: string, limit = 12): FalconCustomerProfile[] {
  const q = query.trim();
  if (!q) return [];
  const qClean = cleanText(q);
  if (qClean.length < 2) return [];

  return FALCON_CUSTOMER_CATALOG.map((company) => {
    const haystack = [
      company.customerCode,
      company.organizationName,
      company.legalName,
      company.tradeName,
      company.domain,
      ...company.aliases,
      ...company.acronyms,
    ]
      .map(cleanText)
      .filter(Boolean);
    let score = 0;
    for (const term of haystack) {
      if (term === qClean) score = Math.max(score, 1);
      else if (term.startsWith(qClean)) score = Math.max(score, 0.9);
      else if (term.includes(qClean)) score = Math.max(score, 0.75);
    }
    return { company, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.company.customerQualityScore || 0) - (a.company.customerQualityScore || 0);
    })
    .slice(0, limit)
    .map((item) => item.company);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function searchFalconCustomers(
  query: string,
  limit = 12,
): Promise<FalconCustomerProfile[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const d1 = (await fetchJson(
    `/api/falcon/customers/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  )) as { results?: Record<string, unknown>[] } | null;
  if (Array.isArray(d1?.results) && d1.results.length) {
    return d1.results.map(mapApiCompany);
  }

  const cms = (await fetchJson(
    `${CUSTOMER_CMS_ORIGIN}/api/companies/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  )) as { results?: Record<string, unknown>[] } | null;
  if (Array.isArray(cms?.results) && cms.results.length) {
    return cms.results.map(mapApiCompany);
  }

  return searchFalconCustomersLocal(q, limit);
}

export async function fetchFalconCustomerProfile(
  company: Pick<FalconCustomerProfile, "companyId" | "organizationName">,
): Promise<FalconCustomerProfile> {
  const targets = [company.companyId, company.organizationName].filter(Boolean);
  for (const target of targets) {
    const d1 = (await fetchJson(
      `/api/falcon/customers/${encodeURIComponent(target)}`,
    )) as Record<string, unknown> | null;
    if (d1 && !d1.error) return mapApiCompany(d1);

    const cms = (await fetchJson(
      `${CUSTOMER_CMS_ORIGIN}/api/companies/${encodeURIComponent(target)}`,
    )) as Record<string, unknown> | null;
    if (cms && !cms.error) return mapApiCompany(cms);
  }
  return (
    FALCON_CUSTOMER_CATALOG.find(
      (item) =>
        item.companyId === company.companyId ||
        item.organizationName === company.organizationName,
    ) || normalizeCatalogRecord(company)
  );
}
