"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Cloud, Copy, FolderOpen, LogOut, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createProjectWorkflow, duplicateWorkflowFile } from "@/lib/project-template";
import { parseWorkflow } from "@/lib/serialization";
import { workflowLegacyJobNumber } from "@/lib/project-id";
import { useWorkflowStore } from "@/store/workflow-store";

type User = { id: string; email: string; name: string };
type Project = {
  id: string;
  name: string;
  project_number: string;
  created_at: string;
  updated_at: string;
  workflow?: unknown;
};
type View = "login" | "register" | "new" | "open" | null;

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const AUTOSAVE_MS = 2500;
const AUTOSAVE_RETRY_MS = 5000;
const isLocalhost = () =>
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
   window.location.hostname === "127.0.0.1");

const isAuthBypass = () =>
  isLocalhost() && process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";

const DEV_USER = {
  id: "dev-bypass",
  email: "[email protected]",
  name: "Local Dev",
} as const;

const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...options?.headers },
    ...options,
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error || "Request failed.", response.status);
  return body;
};

export function CloudProjectControls() {
  const store = useWorkflowStore();
  const [user, setUser] = useState<User | null>(() => store.authUser ?? (isAuthBypass() ? DEV_USER : null));
  const [view, setView] = useState<View>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [autosaving, setAutosaving] = useState(false);
  const [autosaveError, setAutosaveError] = useState("");
  const activeProjectId = store.activeProjectId;
  const dirty = store.dirty;
  const file = store.file;
  const inFlight = useRef(false);
  const autosaveRetryTimer = useRef<number | undefined>(undefined);
  const userRef = useRef(user);
  const authUser = store.authUser;
  const confirmReplaceWorkspace = () =>
    !useWorkflowStore.getState().dirty ||
    window.confirm(
      "This project has unsaved changes. Continue and discard those changes?",
    );

  useEffect(() => {
    if (authUser) {
      // The auth gate owns the canonical user; mirror it into this control's
      // local state when the shared store hydrates after the first render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(authUser);
    }
  }, [authUser]);

  useEffect(() => {
    // Local auth-bypass runs without the Pages Functions API. Keep the local
    // editor usable and avoid opening a project picker over the workspace.
    if (!user || !store.hydrated || activeProjectId || view !== null || isAuthBypass()) return;
    let cancelled = false;
    void api<{ projects: Project[] }>("/api/projects")
      .then((result) => {
        if (cancelled) return;
        setProjects(result.projects);
        // Existing projects should be reopened from the project picker. Only
        // first-time users with no saved projects go directly to New Project.
        if (result.projects.length) {
          setView("open");
          return;
        }
        setProjectName("");
        setProjectNumber("");
        setView("new");
      })
      .catch(() => {
        if (cancelled) return;
        setProjectName("");
        setProjectNumber("");
        setView("new");
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, store.hydrated, user, view]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!isAuthBypass()) void api<{ user: User | null }>("/api/auth/me")
      .then(async (result) => {
        setUser(result.user);
        useWorkflowStore.getState().setAuthUser(result.user);
        const workflow = useWorkflowStore.getState();
        if (!result.user || !workflow.activeProjectId) return;
        if (workflow.workspaceOwnerId !== result.user.id) {
          workflow.resetWorkspace(result.user.id);
          return;
        }
        try {
          const restored = await api<{ project: Project }>(
            `/api/projects/${workflow.activeProjectId}`,
          );
          if (!workflow.dirty) {
            workflow.loadProject(
              parseWorkflow(JSON.stringify(restored.project.workflow)),
              restored.project.id,
              result.user.id,
            );
          }
        } catch (caught) {
          if (caught instanceof ApiError && caught.status === 404) {
            workflow.resetWorkspace(result.user.id);
          }
        }
      })
      .catch(() => setUser(null));
    const saveFromShortcut = () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Save project to cloud"]')
        ?.click();
    };
    window.addEventListener("workflow:save-cloud", saveFromShortcut);
    return () =>
      window.removeEventListener("workflow:save-cloud", saveFromShortcut);
  }, []);

  const requireAccount = (next: Exclude<View, "login" | "register">) => {
    if (!user) {
      setView("login");
      return false;
    }
    setError("");
    setView(next);
    return true;
  };
  const refreshProjects = async () => {
    const result = await api<{ projects: Project[] }>("/api/projects");
    setProjects(result.projects);
  };
  const openProjects = async () => {
    if (!requireAccount("open")) return;
    setBusy(true);
    setError("");
    try {
      await refreshProjects();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load projects.");
    } finally {
      setBusy(false);
    }
  };
  const authenticate = async (register: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(`/api/auth/${register ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setUser(result.user);
      store.setAuthUser(result.user);
      setView(null);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };
  const projectNumberValid = /^\d{5}$/.test(projectNumber.trim());
  const createProject = async () => {
    if (!projectName.trim()) return setError("Enter a project name.");
    if (!projectNumberValid) return setError("Project number must be 5 digits.");
    if (!confirmReplaceWorkspace()) return;
    setBusy(true);
    setError("");
    try {
      const workflow = createProjectWorkflow(
        projectName.trim(),
        projectNumber.trim(),
      );
      const result = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName, projectNumber, workflow }),
      });
      store.loadProject(workflow, result.project.id, user!.id);
      setView(null);
      window.setTimeout(() => window.dispatchEvent(new Event("workflow:fit")), 100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create project.");
    } finally {
      setBusy(false);
    }
  };
  const duplicateProject = async () => {
    if (!user) {
      setView("login");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const source = useWorkflowStore.getState().file;
      const name = `Copy of ${source.graph.metadata.name.trim() || "Untitled Project"}`;
      const workflow = duplicateWorkflowFile(source, name);
      const result = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          projectNumber: workflowLegacyJobNumber(workflow),
          workflow,
        }),
      });
      store.loadProject(workflow, result.project.id, user.id);
      window.setTimeout(() => window.dispatchEvent(new Event("workflow:fit")), 100);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not duplicate project.";
      setError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  };
  const persistCloud = async (silent: boolean) => {
    if (inFlight.current) return;
    const currentUser = userRef.current;
    if (!currentUser) {
      if (!silent) setView("login");
      return;
    }
    const workflow = useWorkflowStore.getState();
    if (!workflow.activeProjectId) {
      if (silent) return;
      setProjectName(workflow.file.graph.metadata.name);
      setProjectNumber(
        String(
          workflow.file.graph.nodes.find((node) => node.type === "projectStart")
            ?.customFields.projectId || "",
        ),
      );
      setView("new");
      return;
    }
    if (silent && !workflow.dirty) return;
    inFlight.current = true;
    if (silent) setAutosaving(true);
    else {
      setBusy(true);
      setError("");
    }
    const savedFile = workflow.file;
    const projectId = workflow.activeProjectId;
    let wrote = false;
    try {
      await api(`/api/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: savedFile.graph.metadata.name,
          projectNumber: workflowLegacyJobNumber(savedFile),
          workflow: savedFile,
        }),
      });
      wrote = true;
      if (useWorkflowStore.getState().file === savedFile) {
        useWorkflowStore.getState().markSaved();
      }
      setAutosaveError("");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not save project.";
      if (silent) setAutosaveError(message);
      else {
        setError(message);
        window.alert(message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      setAutosaving(false);
      if (silent && useWorkflowStore.getState().dirty && autosaveRetryTimer.current === undefined) {
        const delay = wrote ? 800 : AUTOSAVE_RETRY_MS;
        autosaveRetryTimer.current = window.setTimeout(() => {
          autosaveRetryTimer.current = undefined;
          const current = useWorkflowStore.getState();
          if (current.activeProjectId && current.dirty) {
            void persistCloudRef.current(true);
          }
        }, delay);
      }
    }
  };
  const saveCloud = () => {
    void persistCloud(false);
  };

  const persistCloudRef = useRef(persistCloud);
  useEffect(() => {
    persistCloudRef.current = persistCloud;
  });

  useEffect(() => {
    if (!user || !activeProjectId || !dirty) return;
    const timer = window.setTimeout(() => void persistCloudRef.current(true), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [user, activeProjectId, dirty, file]);

  useEffect(() => {
    return () => {
      if (autosaveRetryTimer.current !== undefined) {
        window.clearTimeout(autosaveRetryTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void persistCloudRef.current(true);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [user, activeProjectId]);
  const openProject = async (id: string) => {
    if (!confirmReplaceWorkspace()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ project: Project }>(`/api/projects/${id}`);
      store.loadProject(
        parseWorkflow(JSON.stringify(result.project.workflow)),
        id,
        user!.id,
      );
      setView(null);
      window.setTimeout(() => window.dispatchEvent(new Event("workflow:fit")), 100);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open project.");
    } finally {
      setBusy(false);
    }
  };
  const deleteProject = async (project: Project) => {
    if (
      !window.confirm(
        `Delete “${project.name}”?\n\nThis project will be permanently removed and cannot be recovered.`,
      )
    ) return;
    setDeletingId(project.id);
    setError("");
    try {
      await api<{ deleted: boolean; id: string }>(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (project.id === activeProjectId) {
        store.resetWorkspace(user!.id);
        window.setTimeout(
          () => window.dispatchEvent(new Event("workflow:fit")),
          100,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete project.");
    } finally {
      setDeletingId(null);
    }
  };
  const signOut = async () => {
    if (!confirmReplaceWorkspace()) return;
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      store.setAuthUser(null);
      store.resetWorkspace();
      setUser(null);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ml-1 flex items-center gap-0.5 border-l pl-1">
        <Button title="New project" aria-label="New project" variant="ghost" size="icon" className="size-8" onClick={() => { setProjectName(""); setProjectNumber(""); requireAccount("new"); }}>
          <Plus className="size-4" />
        </Button>
        <Button title={autosaveError || "Save project to cloud (autosaves while signed in)"} aria-label="Save project to cloud" variant="ghost" size="icon" className="size-8" disabled={busy} onClick={saveCloud}>
          <Save className="size-4" />
        </Button>
        {user && activeProjectId ? (
          <span
            className="hidden max-w-[4.75rem] truncate px-0.5 text-[10px] font-medium text-muted-foreground sm:inline"
            title={autosaveError || undefined}
          >
            {autosaving ? "Saving…" : autosaveError ? "Save failed" : dirty ? "Autosave" : "Saved"}
          </span>
        ) : null}
        <Button title="Duplicate project" aria-label="Duplicate project" variant="ghost" size="icon" className="size-8" disabled={busy} onClick={() => void duplicateProject()}>
          <Copy className="size-4" />
        </Button>
        <Button title="Open project" aria-label="Open project" variant="ghost" size="icon" className="size-8" disabled={busy} onClick={openProjects}>
          <FolderOpen className="size-4" />
        </Button>
        <div className="flex h-8 max-w-36 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground" title={user?.email}>
          <Cloud className="size-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{user?.name || "Account"}</span>
        </div>
        {user ? (
          <Button title="Sign out" aria-label="Sign out" variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void signOut()}>
            <LogOut className="size-3.5" />
          </Button>
        ) : null}
      </div>

      <Dialog.Root
        open={view !== null}
        onOpenChange={(next) => {
          if (!next && !busy) {
            setView(null);
            setError("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[100]" />
          <Dialog.Content
            className="liquid-glass-panel fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl outline-none"
            onPointerDownOutside={(event) => busy && event.preventDefault()}
            onEscapeKeyDown={(event) => busy && event.preventDefault()}
          >
            <div className="mb-4 flex items-center">
              <Dialog.Title className="text-lg font-bold">
                {view === "login" ? "Sign in" : view === "register" ? "Create account" : view === "new" ? "New project" : "Open project"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close" disabled={busy} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="size-4" /></button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              {view === "open" ? "Choose a saved project to open or delete." : view === "new" ? "Enter the project details to create a blank workflow." : "Enter your account details."}
            </Dialog.Description>
            {view === "login" || view === "register" ? (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void authenticate(view === "register"); }}>
                {view === "register" ? <input autoFocus aria-label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="h-10 w-full rounded-lg border px-3 text-sm" /> : null}
                <input autoFocus={view === "login"} aria-label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <input aria-label="Password" type="password" autoComplete={view === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (8+ characters)" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : view === "register" ? "Create account" : "Sign in"}</Button>
                <button className="w-full text-xs text-primary" onClick={() => setView(view === "login" ? "register" : "login")}>{view === "login" ? "Need an account? Register" : "Already registered? Sign in"}</button>
              </form>
            ) : view === "new" ? (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
                <p className="text-xs leading-5 text-muted-foreground">A new project starts with one Project Start card. The 5-digit number is the Legacy Job Number (YY + sequence) and stays in sync if you later change the Project ID.</p>
                <input autoFocus aria-label="New project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <input aria-label="Legacy job number" value={projectNumber} inputMode="numeric" maxLength={5} onChange={(event) => setProjectNumber(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Legacy number (5 digits)" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
              </form>
            ) : (
              <div className="scroll-thin max-h-80 space-y-2 overflow-y-auto pr-1">
                {busy ? <p className="py-8 text-center text-sm text-muted-foreground">Loading projects…</p> : projects.length ? projects.map((project) => (
                  <div key={project.id} className={`flex items-center rounded-xl border transition hover:border-primary/40 hover:bg-muted/40 ${project.id === activeProjectId ? "border-primary/40 bg-primary/5" : ""}`}>
                    <button className="min-w-0 flex-1 p-3 text-left" onClick={() => openProject(project.id)}>
                      <span className="flex items-center gap-2 truncate text-sm font-semibold">{project.name}{project.id === activeProjectId ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"><CheckCircle2 className="size-3" />Current</span> : null}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{project.project_number || "No project number"} · Updated {new Date(project.updated_at).toLocaleString()}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete project ${project.name}`}
                      title={`Delete ${project.name}`}
                      disabled={deletingId !== null}
                      onClick={() => void deleteProject(project)}
                      className="mr-2 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )) : <p className="py-8 text-center text-sm text-muted-foreground">No cloud projects yet.</p>}
              </div>
            )}
            {error ? <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
