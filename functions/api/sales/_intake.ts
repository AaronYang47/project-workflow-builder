import { json } from "../_lib";
import type { StoredProject } from "../_sales";
import { parseWorkflow } from "@/lib/serialization";
import { normalizeQualificationForm101 } from "@/lib/qualification-form-101";
import { isNewDraftKey, isValidJobNumberInput, type SalesDraft } from "@/lib/sales-intake";
import type { WorkflowFile } from "@/types/workflow";

export const MAX_DRAFT_BYTES = 400_000;

export const validKey = (key: string) => /^[A-Za-z0-9-]{1,80}$/.test(key);

export const parseStoredWorkflow = (raw: string): WorkflowFile | null => {
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

export const loadOwnerProject = (env: Env, ownerUserId: string, id: string) =>
  env.DB.prepare(
    "SELECT id, name, project_number, workflow_json, updated_at FROM projects WHERE id = ? AND user_id = ?",
  )
    .bind(id, ownerUserId)
    .first<StoredProject>();

/** The draft fields Sales may send, cleaned; or an error response. */
export const readDraftBody = (key: string, body: unknown) => {
  if (!body || typeof body !== "object")
    return { response: json({ error: "Nothing to save." }, 400) } as const;
  const value = body as Record<string, unknown>;
  const jobNumber = String(value.jobNumber ?? "").trim();
  if (!isValidJobNumberInput(jobNumber))
    return { response: json({ error: "The Job number has 5 digits." }, 400) } as const;
  const projectName = String(value.projectName ?? "")
    .trim()
    .slice(0, 200);
  const draft: SalesDraft = {
    ...(isNewDraftKey(key) ? { projectName } : {}),
    jobNumber,
    form101: normalizeQualificationForm101(value.form101 as never),
  };
  const draftJson = JSON.stringify(draft);
  if (draftJson.length > MAX_DRAFT_BYTES)
    return { response: json({ error: "The form is too large to save." }, 413) } as const;
  return { draft, draftJson, response: null } as const;
};
