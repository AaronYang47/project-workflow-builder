import {
  appendProjectAuditStatement,
  appendProjectVersionStatement,
  json,
  projectSnapshotHash,
  readJson,
} from "../../_lib";
import { falconDb } from "../../_falcon-customers";
import { getLead, upsertLead } from "../../_leads";
import { normalizeSalesQualificationAnswers } from "@/lib/sales-qualification";
import { parseWorkflow } from "@/lib/serialization";
import {
  applyLeadSelectionToWorkflow,
  createLeadProjectWorkflow,
  extractLeadSelectionFromWorkflow,
  normalizeLeadNumber,
} from "@/lib/seed-lead-workflow";
import type { FalconCustomerProfile } from "@/lib/falcon-customer-intelligence";
import type { WorkflowFile } from "@/types/workflow";

type ProjectRow = {
  id: string;
  name: string;
  project_number: string;
  workflow_json: string;
  user_id: string;
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-CMS-Sync-Token",
};

const withCors = (response: Response) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
};

const requireSyncToken = (request: Request, env: Env) => {
  const expected = String(env.CMS_SYNC_TOKEN || "").trim();
  if (!expected) return json({ error: "CMS_SYNC_TOKEN is not configured." }, 503);
  const provided = request.headers.get("x-cms-sync-token") || "";
  if (provided !== expected) return json({ error: "Unauthorized." }, 401);
  return null;
};

const parseWorkflowSafe = (raw: string): WorkflowFile | null => {
  try {
    return parseWorkflow(raw);
  } catch {
    try {
      return JSON.parse(raw) as WorkflowFile;
    } catch {
      return null;
    }
  }
};

const resolveOwnerUserId = async (env: Env) => {
  const configured = String(env.CMS_PROJECT_OWNER_USER_ID || "").trim();
  if (configured) return configured;
  const row = await env.DB.prepare(
    "SELECT id FROM users ORDER BY created_at ASC LIMIT 1",
  ).first<{ id: string }>();
  return row?.id || "";
};

const persistProject = async (
  env: Env,
  ownerUserId: string,
  existing: ProjectRow | null,
  name: string,
  projectNumber: string,
  workflow: WorkflowFile,
) => {
  const now = new Date().toISOString();
  const workflowJson = JSON.stringify(workflow);
  const contentHash = await projectSnapshotHash(name, projectNumber, workflowJson);
  const versionId = crypto.randomUUID();
  if (existing) {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE projects SET name = ?, project_number = ?, workflow_json = ?, updated_at = ? WHERE id = ?",
      ).bind(name, projectNumber, workflowJson, now, existing.id),
      appendProjectVersionStatement(env.DB, {
        id: versionId,
        projectId: existing.id,
        ownerUserId,
        name,
        projectNumber,
        workflowJson,
        contentHash,
        changeKind: "updated",
        actorUserId: ownerUserId,
        createdAt: now,
      }),
      appendProjectAuditStatement(env.DB, {
        id: crypto.randomUUID(),
        projectId: existing.id,
        ownerUserId,
        actorUserId: ownerUserId,
        actorRole: "Coordinator",
        action: "project.updated",
        versionId,
        details: { source: "customer-cms", snapshotHash: contentHash },
        createdAt: now,
      }),
    ]);
    return { id: existing.id, created: false, updatedAt: now };
  }
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO projects (id, user_id, name, project_number, workflow_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, ownerUserId, name, projectNumber, workflowJson, now, now),
    appendProjectVersionStatement(env.DB, {
      id: versionId,
      projectId: id,
      ownerUserId,
      name,
      projectNumber,
      workflowJson,
      contentHash,
      changeKind: "created",
      actorUserId: ownerUserId,
      createdAt: now,
    }),
    appendProjectAuditStatement(env.DB, {
      id: crypto.randomUUID(),
      projectId: id,
      ownerUserId,
      actorUserId: ownerUserId,
      actorRole: "Coordinator",
      action: "project.created",
      versionId,
      details: { source: "customer-cms", snapshotHash: contentHash },
      createdAt: now,
    }),
  ]);
  return { id, created: true, updatedAt: now };
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { headers: cors });

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const denied = requireSyncToken(request, env);
  if (denied) return withCors(denied);
  const leadNumber = normalizeLeadNumber(String(params.leadNumber || ""));
  if (!leadNumber) return withCors(json({ error: "Lead Number must be 5 digits." }, 400));

  const project = await env.DB.prepare(
    "SELECT id, name, project_number, workflow_json, user_id FROM projects WHERE project_number = ? ORDER BY updated_at DESC LIMIT 1",
  )
    .bind(leadNumber)
    .first<ProjectRow>();
  const workflow = project ? parseWorkflowSafe(project.workflow_json) : null;
  const fromWorkflow = extractLeadSelectionFromWorkflow(workflow);
  const falcon = falconDb(env);
  const stored = falcon ? await getLead(falcon, leadNumber) : null;
  const storedCompany = stored?.company_json ? JSON.parse(stored.company_json) : null;
  const storedForm = stored?.form_json ? JSON.parse(stored.form_json) : null;

  return withCors(
    json({
      exists: Boolean(project || stored),
      created: false,
      leadNumber,
      projectId: project?.id || stored?.pwb_project_id || null,
      customer: fromWorkflow?.customerProfile || storedCompany,
      form: fromWorkflow?.customerForm || (storedForm ? normalizeSalesQualificationAnswers(storedForm) : null),
    }),
  );
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const denied = requireSyncToken(request, env);
  if (denied) return withCors(denied);
  const leadNumber = normalizeLeadNumber(String(params.leadNumber || ""));
  if (!leadNumber) return withCors(json({ error: "Lead Number must be 5 digits." }, 400));
  const body = await readJson<{
    customer?: FalconCustomerProfile | Record<string, unknown>;
    form?: Record<string, string>;
  }>(request);
  if (!body?.customer) return withCors(json({ error: "Customer is required." }, 400));

  const raw = body.customer as Record<string, unknown>;
  const profile = (
    typeof raw.organizationName === "string"
      ? raw
      : {
          companyId: String(raw.company_id || raw.companyId || ""),
          organizationName: String(raw.organization_name || raw.organizationName || ""),
          legalName: String(raw.legal_name || raw.legalName || raw.organization_name || ""),
          tradeName: String(raw.trade_name || raw.tradeName || ""),
          aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
          acronyms: Array.isArray(raw.acronyms) ? raw.acronyms : [],
          category: String(raw.category || ""),
          ownershipType: String(raw.ownership_type || raw.ownershipType || ""),
          province: String(raw.province || ""),
          city: String(raw.city || ""),
          address: String(raw.address || ""),
          website: String(raw.website || ""),
          domain: String(raw.domain || ""),
          procurementType: String(raw.procurement_type || raw.procurementType || ""),
          intelligenceSummary: String(raw.intelligence_summary || raw.intelligenceSummary || ""),
          modularRelevance: String(raw.modular_relevance || raw.modularRelevance || ""),
          customerQualityScore: Number(raw.customer_quality_score ?? raw.customerQualityScore) || null,
          opportunityScore: Number(raw.opportunity_score ?? raw.opportunityScore) || null,
          confidenceScore: Number(raw.confidence_score ?? raw.confidenceScore) || null,
          ratingTier: "",
          summaryVerdict: "",
          keyStrengths: [],
          keyRisks: [],
          keyContacts: [],
        }
  ) as FalconCustomerProfile;
  const selection = {
    customerName: profile.organizationName,
    customerCategory: profile.category,
    customerProfile: profile,
    customerForm: normalizeSalesQualificationAnswers(body.form),
  };

  const ownerUserId = await resolveOwnerUserId(env);
  if (!ownerUserId) {
    return withCors(json({ error: "No Project Workflow Builder user exists to own the project." }, 409));
  }

  const existing = await env.DB.prepare(
    "SELECT id, name, project_number, workflow_json, user_id FROM projects WHERE project_number = ? ORDER BY updated_at DESC LIMIT 1",
  )
    .bind(leadNumber)
    .first<ProjectRow>();
  const current = existing ? parseWorkflowSafe(existing.workflow_json) : null;
  const workflow = current
    ? applyLeadSelectionToWorkflow(current, leadNumber, selection)
    : createLeadProjectWorkflow(leadNumber, selection);
  const saved = await persistProject(
    env,
    existing?.user_id || ownerUserId,
    existing,
    workflow.graph.metadata.name,
    leadNumber,
    workflow,
  );

  const falcon = falconDb(env);
  if (falcon) {
    await upsertLead(falcon, {
      leadNumber,
      projectId: saved.id,
      companyId: profile.companyId,
      companyJson: JSON.stringify(profile),
      formJson: JSON.stringify(selection.customerForm),
    });
  }

  return withCors(
    json({
      ok: true,
      exists: true,
      created: saved.created,
      leadNumber,
      projectId: saved.id,
      customer: profile,
      form: selection.customerForm,
    }),
  );
};
