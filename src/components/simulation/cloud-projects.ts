import { normalizeLoadedWorkflow } from "@/store/workflow-store-helpers";
import type { WorkflowFile } from "@/types/workflow";

export type CloudProjectSummary = { id: string; name: string; updated_at?: string };

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

/** Projects saved to the cloud by the signed-in user. */
export async function listCloudProjects() {
  const { projects } = await request<{ projects: CloudProjectSummary[] }>("/api/projects");
  return projects;
}

/** One saved project, upgraded like a project opened in the editor. */
export async function loadCloudProject(id: string): Promise<WorkflowFile> {
  const { project } = await request<{ project: { workflow: WorkflowFile } }>(
    `/api/projects/${encodeURIComponent(id)}`,
  );
  return normalizeLoadedWorkflow(project.workflow).file;
}
