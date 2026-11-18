import { workflowLegacyJobNumber } from "@/lib/project-id";
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

/** Saves a project that is not open in the editor (for example a changed FOB yard). */
export async function saveCloudProject(id: string, file: WorkflowFile) {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.graph.metadata.name?.trim() || "Project",
      projectNumber: workflowLegacyJobNumber(file),
      workflow: file,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || "Could not save the project.");
  }
}
