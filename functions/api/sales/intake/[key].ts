import { json, readJson } from "../../_lib";
import { requireSales } from "../../_sales";
import { loadOwnerProject, parseStoredWorkflow, readDraftBody, validKey } from "../_intake";
import { normalizeQualificationForm101 } from "@/lib/qualification-form-101";
import { isNewDraftKey, readSalesIntake, type SalesDraft } from "@/lib/sales-intake";

const loadDraft = async (env: Env, userId: string, key: string) => {
  const row = await env.DB.prepare(
    "SELECT draft_json, updated_at FROM sales_drafts WHERE user_id = ? AND draft_key = ?",
  )
    .bind(userId, key)
    .first<{ draft_json: string; updated_at: string }>();
  if (!row) return null;
  try {
    return { ...(JSON.parse(row.draft_json) as SalesDraft), updatedAt: row.updated_at };
  } catch {
    return null;
  }
};

/** One form as Sales sees it: their draft if they have one, otherwise the project's own. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireSales(request, env);
  if (auth.response) return auth.response;
  const key = String(params.key);
  if (!validKey(key)) return json({ error: "Form not found." }, 404);
  const draft = await loadDraft(env, auth.user.id, key);
  if (isNewDraftKey(key))
    return json({
      key,
      isNew: true,
      projectName: draft?.projectName || "",
      jobNumber: draft?.jobNumber || "",
      form101: normalizeQualificationForm101(draft?.form101),
      submission: null,
      draftSavedAt: draft?.updatedAt || null,
      savedJobNumber: "",
      savedForm101: null,
      history: [],
    });
  const project = await loadOwnerProject(env, auth.sales.ownerUserId, key);
  if (!project) return json({ error: "Project not found." }, 404);
  const workflow = parseStoredWorkflow(project.workflow_json);
  if (!workflow) return json({ error: "This project cannot be opened." }, 500);
  const saved = readSalesIntake(workflow);
  return json({
    key,
    isNew: false,
    projectName: project.name,
    jobNumber: draft ? draft.jobNumber : saved.jobNumber,
    form101: draft ? normalizeQualificationForm101(draft.form101) : saved.form101,
    submission: saved.submission ?? null,
    draftSavedAt: draft?.updatedAt || null,
    // What the project holds now, so Sales see what their update changes.
    savedJobNumber: saved.jobNumber,
    savedForm101: saved.form101,
    history: saved.history,
  });
};

/** Saves Sales' draft. The project itself changes only on Submit. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireSales(request, env);
  if (auth.response) return auth.response;
  const key = String(params.key);
  if (!validKey(key)) return json({ error: "Form not found." }, 404);
  if (!isNewDraftKey(key) && !(await loadOwnerProject(env, auth.sales.ownerUserId, key)))
    return json({ error: "Project not found." }, 404);
  const parsed = readDraftBody(key, await readJson(request));
  if (parsed.response) return parsed.response;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO sales_drafts (user_id, draft_key, owner_user_id, draft_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, draft_key) DO UPDATE SET
       owner_user_id = excluded.owner_user_id,
       draft_json = excluded.draft_json,
       updated_at = excluded.updated_at`,
  )
    .bind(auth.user.id, key, auth.sales.ownerUserId, parsed.draftJson, now)
    .run();
  return json({ savedAt: now });
};

/** Throws away Sales' draft. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireSales(request, env);
  if (auth.response) return auth.response;
  await env.DB.prepare("DELETE FROM sales_drafts WHERE user_id = ? AND draft_key = ?")
    .bind(auth.user.id, String(params.key))
    .run();
  return json({ deleted: true });
};
