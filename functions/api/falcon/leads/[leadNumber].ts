import { json, readJson, requireUser } from "../../_lib";
import { falconDb } from "../../_falcon-customers";
import { getLead, upsertLead } from "../../_leads";
import { normalizeSalesQualificationAnswers } from "@/lib/sales-qualification";
import type { FalconCustomerProfile } from "@/lib/falcon-customer-intelligence";
import { normalizeLeadNumber } from "@/lib/seed-lead-workflow";

const parseJson = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

const ownsProject = async (env: Env, projectId: string, userId: string) => {
  const row = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ id: string }>();
  return Boolean(row);
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const db = falconDb(env);
  if (!db) return json({ error: "FALCON_DB is not bound." }, 503);
  const leadNumber = normalizeLeadNumber(String(params.leadNumber || ""));
  if (!leadNumber) return json({ error: "Lead Number must be 5 digits." }, 400);
  const row = await getLead(db, leadNumber);
  if (!row) return json({ exists: false, leadNumber });
  if (!row.pwb_project_id || !await ownsProject(env, row.pwb_project_id, auth.user!.id))
    return json({ error: "Lead not found." }, 404);
  const company = parseJson(row.company_json);
  return json({
    exists: true,
    leadNumber: row.lead_number,
    projectId: row.pwb_project_id,
    customer: company && typeof company === "object" ? company : null,
    form: normalizeSalesQualificationAnswers(
      (parseJson(row.form_json) || {}) as Record<string, string>,
    ),
    updatedAt: row.updated_at,
  });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireUser(request, env.DB, env.SESSION_SECRET);
  if (auth.response) return auth.response;
  const db = falconDb(env);
  if (!db) return json({ error: "FALCON_DB is not bound." }, 503);
  const leadNumber = normalizeLeadNumber(String(params.leadNumber || ""));
  if (!leadNumber) return json({ error: "Lead Number must be 5 digits." }, 400);
  const body = await readJson<{
    customer?: FalconCustomerProfile | Record<string, unknown>;
    form?: Record<string, string>;
    projectId?: string;
  }>(request);
  if (!body?.customer) return json({ error: "Customer is required." }, 400);
  if (!body.projectId || !await ownsProject(env, body.projectId, auth.user!.id))
    return json({ error: "Save the project before syncing its lead record." }, 403);
  const existing = await getLead(db, leadNumber);
  if (existing && existing.pwb_project_id !== body.projectId)
    return json({ error: "Lead number is already linked to another project." }, 409);
  const profile = body.customer as FalconCustomerProfile;
  const row = await upsertLead(db, {
    leadNumber,
    projectId: body.projectId || null,
    companyId: profile.companyId,
    companyJson: JSON.stringify(profile),
    formJson: JSON.stringify(normalizeSalesQualificationAnswers(body.form)),
  });
  return json({
    ok: true,
    leadNumber,
    projectId: row?.pwb_project_id || null,
    updatedAt: row?.updated_at,
  });
};
