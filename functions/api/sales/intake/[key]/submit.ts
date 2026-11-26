import { json, readJson } from "../../../_lib";
import { requireSales, saveProjectFromSales } from "../../../_sales";
import { loadOwnerProject, parseStoredWorkflow, readDraftBody, validKey } from "../../_intake";
import {
  applySalesIntake,
  isNewDraftKey,
  nextSalesRevision,
  normalizeJobNumber,
  projectFromTemplate,
  readSalesIntake,
} from "@/lib/sales-intake";
import { syncProjectNameIdentity, workflowLegacyJobNumber } from "@/lib/project-id";
import { formChanges } from "@/lib/qf-changes";
import {
  FORM_101_PASS_SCORE,
  compactQualificationForm101,
  evaluateQualificationForm101,
  normalizeQualificationForm101,
  unfinishedConsultants,
} from "@/lib/qualification-form-101";

/**
 * Submit: writes the Job number and Qualification Form into the project (a
 * new one, made from the team's Sales template, for a new project), then
 * clears the draft. The team sees it in the app from then on.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const auth = await requireSales(request, env);
  if (auth.response) return auth.response;
  const key = String(params.key);
  if (!validKey(key)) return json({ error: "Form not found." }, 404);
  const parsed = readDraftBody(key, await readJson(request));
  if (parsed.response) return parsed.response;
  // A consultant that was started must be finished, or marked Unknown / N/A.
  if (unfinishedConsultants(normalizeQualificationForm101(parsed.draft.form101)).length)
    return json(
      {
        error:
          "Some consultants are only partly filled in. Fill in all three fields or choose Unknown / N/A.",
        code: "CONSULTANT_INCOMPLETE",
      },
      400,
    );
  // Sales submit at Grade B or better (the Qualification pass score).
  if (
    evaluateQualificationForm101({
      form101: normalizeQualificationForm101(parsed.draft.form101),
    }).totalScore < FORM_101_PASS_SCORE
  )
    return json(
      { error: "Grade B is needed to submit. Fill in more answers first.", code: "SCORE_TOO_LOW" },
      400,
    );
  const owner = auth.sales.ownerUserId;
  const isNew = isNewDraftKey(key);

  let existing = null;
  let base;
  let name: string;
  if (isNew) {
    name = parsed.draft.projectName?.trim() || "";
    if (!name) return json({ error: "Enter the project name." }, 400);
    const clash = await env.DB.prepare(
      "SELECT id FROM projects WHERE user_id = ? AND lower(trim(name)) = lower(?) LIMIT 1",
    )
      .bind(owner, name)
      .first<{ id: string }>();
    if (clash)
      return json(
        {
          error: "A project with this name already exists. Choose it from the list instead.",
          code: "NAME_TAKEN",
          projectId: clash.id,
        },
        409,
      );
    const template = await env.DB.prepare(
      "SELECT workflow_json FROM project_templates WHERE user_id = ? AND sales_default = 1 LIMIT 1",
    )
      .bind(owner)
      .first<{ workflow_json: string }>();
    const templateFile = template ? parseStoredWorkflow(template.workflow_json) : null;
    if (!templateFile)
      return json(
        { error: "New projects are not open yet: the team has not chosen a template." },
        409,
      );
    base = projectFromTemplate(templateFile, name);
  } else {
    existing = await loadOwnerProject(env, owner, key);
    if (!existing) return json({ error: "Project not found." }, 404);
    base = parseStoredWorkflow(existing.workflow_json);
    if (!base) return json({ error: "This project cannot be opened." }, 500);
    name = existing.name;
  }

  const previous = readSalesIntake(base).submission;
  const submission = {
    by: auth.user.name,
    email: auth.user.email,
    at: new Date().toISOString(),
    revision: nextSalesRevision(previous, parsed.draft.form101.revision),
  };
  // What this submission changed since the last one, answer by answer.
  const previousIntake = readSalesIntake(base);
  const historyEntry = {
    revision: submission.revision,
    at: submission.at,
    by: submission.by,
    first: !previous,
    changes: previous
      ? formChanges(
          // The Sales form fills an empty Q1 with the project's name; that is not a change.
          compactQualificationForm101({
            ...previousIntake.form101,
            sectionA: {
              ...previousIntake.form101.sectionA,
              projectName:
                previousIntake.form101.sectionA.projectName.trim() ||
                name.replace(/^\s*\d{5}[\s_-]*/, "").trim(),
            },
          }),
          compactQualificationForm101(normalizeQualificationForm101(parsed.draft.form101)),
          {
            before: previousIntake.jobNumber,
            after: normalizeJobNumber(parsed.draft.jobNumber),
          },
        )
      : [],
  };
  const workflow = applySalesIntake(
    base,
    { jobNumber: parsed.draft.jobNumber, form101: parsed.draft.form101 },
    submission,
    historyEntry,
  );
  // A changed Job number leads the project name, as in the app; the cloud
  // name and the workflow's own name stay the same.
  const digits = normalizeJobNumber(parsed.draft.jobNumber);
  if (digits !== workflowLegacyJobNumber(base))
    name = syncProjectNameIdentity(name, digits) || name;
  workflow.graph.metadata = { ...workflow.graph.metadata, name };
  const projectNumber =
    workflowLegacyJobNumber(workflow) || normalizeJobNumber(parsed.draft.jobNumber);
  const saved = await saveProjectFromSales(env, {
    existing,
    ownerUserId: owner,
    actor: auth.user,
    name,
    projectNumber,
    workflowJson: JSON.stringify(workflow),
    details: { salesRevision: submission.revision, changes: historyEntry.changes.length },
  });
  if (saved.response) return saved.response;
  await env.DB.prepare("DELETE FROM sales_drafts WHERE user_id = ? AND draft_key = ?")
    .bind(auth.user.id, key)
    .run();
  return json({
    projectId: saved.id,
    projectName: name,
    jobNumber: projectNumber,
    submission,
    history: readSalesIntake(workflow).history,
  });
};
