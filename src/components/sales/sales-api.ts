import type { QualificationForm101 } from "@/lib/qualification-form-101";
import type { SalesSubmission } from "@/lib/sales-intake";
import type { RevisionEntry } from "@/lib/qf-changes";

/** Client for the Sales site's own API (/api/sales/*). */

export class SalesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function salesApi<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "content-type": "application/json", ...options?.headers },
    });
  } catch {
    throw new SalesApiError("No connection. Check your network and try again.", 0);
  }
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
  };
  if (!response.ok)
    throw new SalesApiError(
      body.error || "Something went wrong. Please try again.",
      response.status,
      body.code,
      body as Record<string, unknown>,
    );
  return body;
}

export type SalesUser = { id: string; email: string; name: string };
export type SalesMe = {
  user: SalesUser | null;
  sales: { linked: boolean; team: string } | null;
};

export type SalesProjectList = {
  team: string;
  projects: { id: string; name: string }[];
  drafts: { key: string; projectName: string; updatedAt: string }[];
  canCreate: boolean;
};

export type SalesForm = {
  key: string;
  isNew: boolean;
  projectName: string;
  jobNumber: string;
  form101: QualificationForm101;
  submission: SalesSubmission | null;
  draftSavedAt: string | null;
  /** What the project holds now (null for a new project). */
  savedJobNumber: string;
  savedForm101: QualificationForm101 | null;
  history: RevisionEntry[];
};

export type SubmitResult = {
  projectId: string;
  projectName: string;
  jobNumber: string;
  submission: SalesSubmission;
  history: RevisionEntry[];
};

export const salesEndpoints = {
  me: () => salesApi<SalesMe>("/api/sales/me"),
  login: (email: string, password: string) =>
    salesApi<{ user: SalesUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    salesApi<{ user: SalesUser }>("/api/sales/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => salesApi<unknown>("/api/auth/logout", { method: "POST" }),
  link: (code: string) =>
    salesApi<{ linked: true; team: string }>("/api/sales/link", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  projects: () => salesApi<SalesProjectList>("/api/sales/projects"),
  form: (key: string) => salesApi<SalesForm>(`/api/sales/intake/${encodeURIComponent(key)}`),
  saveDraft: (
    key: string,
    draft: { projectName?: string; jobNumber: string; form101: QualificationForm101 },
  ) =>
    salesApi<{ savedAt: string }>(`/api/sales/intake/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(draft),
    }),
  discardDraft: (key: string) =>
    salesApi<unknown>(`/api/sales/intake/${encodeURIComponent(key)}`, { method: "DELETE" }),
  submit: (
    key: string,
    draft: { projectName?: string; jobNumber: string; form101: QualificationForm101 },
  ) =>
    salesApi<SubmitResult>(`/api/sales/intake/${encodeURIComponent(key)}/submit`, {
      method: "POST",
      body: JSON.stringify(draft),
    }),
};
