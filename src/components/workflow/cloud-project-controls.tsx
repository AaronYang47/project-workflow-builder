"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle2, Cloud, CloudUpload, Copy, FolderOpen, LogOut, Plus, Save, Trash2, X } from "lucide-react";
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
type View = "login" | "register" | "new" | "open" | "account" | null;

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

export function CloudProjectControls({
  onOpenUploadForms,
  saveOnly = false,
  readOnly = false,
}: {
  onOpenUploadForms?: () => void;
  saveOnly?: boolean;
  readOnly?: boolean;
} = {}) {
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
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [storeys, setStoreys] = useState("");
  const [suites, setSuites] = useState("");
  const [autosaving, setAutosaving] = useState(false);
  const [autosaveError, setAutosaveError] = useState("");
  const [cloudReady, setCloudReady] = useState(isAuthBypass);
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
    if (readOnly || !user || !store.hydrated || activeProjectId || view !== null || isAuthBypass()) return;
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
        setProjectNumber("");
        setView("new");
      })
      .catch(() => {
        if (cancelled) return;
        setProjectNumber("");
        setView("new");
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, readOnly, store.hydrated, user, view]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthBypass()) void api<{ user: User | null }>("/api/auth/me")
      .then(async (result) => {
        if (cancelled) return;
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
          const latest = useWorkflowStore.getState();
          if (!cancelled && !latest.dirty && latest.file === workflow.file &&
              latest.activeProjectId === workflow.activeProjectId &&
              latest.workspaceOwnerId === result.user.id) {
            latest.loadProject(
              parseWorkflow(JSON.stringify(restored.project.workflow)),
              restored.project.id,
              result.user.id,
            );
          }
        } catch (caught) {
          if (!cancelled && caught instanceof ApiError && caught.status === 404 &&
              useWorkflowStore.getState().activeProjectId === workflow.activeProjectId &&
              !useWorkflowStore.getState().dirty) {
            workflow.resetWorkspace(result.user.id);
          }
        }
      })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setCloudReady(true); });
    const saveFromShortcut = () => {
      document
        .querySelector<HTMLButtonElement>('[aria-label="Save project to cloud"]')
        ?.click();
    };
    window.addEventListener("workflow:save-cloud", saveFromShortcut);
    return () => {
      cancelled = true;
      window.removeEventListener("workflow:save-cloud", saveFromShortcut);
    };
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
  const projectName = [projectNumber.trim(), customerCode, projectAddress.trim(), `${storeys} St`, `${suites} Su`].filter(Boolean).join(" ");
  const createProject = async () => {
    if (projectNumber.trim() && !projectNumberValid) return setError("Job Number must be 5 digits, or leave it blank for now.");
    if (!/^[A-Z]{4}$/.test(customerCode)) return setError("Company code must be 4 uppercase letters.");
    if (!projectAddress.trim()) return setError("Enter the full project address.");
    if (!/^\d+$/.test(storeys) || !/^\d+$/.test(suites)) return setError("Enter the storey and suite counts.");
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
    if (readOnly || !cloudReady || inFlight.current) return;
    const currentUser = userRef.current;
    if (!currentUser) {
      if (!silent) setView("login");
      return;
    }
    const workflow = useWorkflowStore.getState();
    if (!workflow.activeProjectId) {
      if (silent) return;
      setProjectNumber(workflowLegacyJobNumber(workflow.file));
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
      if (useWorkflowStore.getState().file === savedFile &&
          useWorkflowStore.getState().activeProjectId === projectId) {
        useWorkflowStore.getState().markSaved();
      }
      setAutosaveError("");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not save project.";
      setAutosaveError(message);
      if (!silent) {
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
    if (readOnly || !cloudReady || !user || !activeProjectId || !dirty) return;
    const timer = window.setTimeout(() => void persistCloudRef.current(true), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [cloudReady, readOnly, user, activeProjectId, dirty, file]);

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
  const deleteAccount = async () => {
    if (!user || deleteConfirmation !== "DELETE" || !deletePassword) return;
    setBusy(true);
    setError("");
    try {
      await api<{ ok: boolean }>("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation }),
      });
      store.setAuthUser(null);
      store.resetWorkspace();
      localStorage.removeItem(`falcon_uploaded_files_${user.id}`);
      localStorage.removeItem("falcon_uploaded_files");
      localStorage.removeItem("project-workflow-builder:v43-no-default-workspace");
      setUser(null);
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ml-1 flex items-center gap-0.5 border-l pl-1">
        {!saveOnly ? <Button title="New project" aria-label="New project" variant="ghost" size="icon" className="size-8" disabled={readOnly} onClick={() => { setProjectNumber(""); setCustomerCode(""); setProjectAddress(""); setStoreys(""); setSuites(""); requireAccount("new"); }}>
          <Plus className="size-4" />
        </Button> : null}
        <Button title={readOnly ? "Only the current editor can save workflow changes" : autosaveError || "Save project to cloud (autosaves while signed in)"} aria-label="Save project to cloud" variant="ghost" size="icon" className="size-8" disabled={readOnly || busy || !cloudReady} onClick={saveCloud}>
          <Save className="size-4" />
        </Button>
        {user && activeProjectId ? (
          <span
            className="hidden max-w-[4.75rem] truncate px-0.5 text-[10px] font-medium text-muted-foreground sm:inline"
            title={autosaveError || undefined}
          >
            {!cloudReady ? "Loading…" : autosaving ? "Saving…" : autosaveError ? "Save failed" : dirty ? "Autosave" : "Saved"}
          </span>
        ) : null}
        {onOpenUploadForms ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenUploadForms}
            disabled={readOnly}
            aria-label="Upload Forms"
            title="Upload Forms to Cloudflare R2"
            className="h-7 gap-1.5 px-2 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10 cursor-pointer shrink-0 ml-1 mr-0.5"
          >
            <CloudUpload className="size-3.5" />
            <span className="hidden sm:inline">Upload Forms</span>
          </Button>
        ) : null}
        {!saveOnly ? <><Button title="Duplicate project" aria-label="Duplicate project" variant="ghost" size="icon" className="size-8" disabled={readOnly || busy} onClick={() => void duplicateProject()}>
          <Copy className="size-4" />
        </Button>
        <Button title="Open project" aria-label="Open project" variant="ghost" size="icon" className="size-8" disabled={readOnly || busy} onClick={openProjects}>
          <FolderOpen className="size-4" />
        </Button>
        <button type="button" className="flex h-8 max-w-36 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted" title={user?.email || "Account"} aria-label="Account settings" onClick={() => { setDeletePassword(""); setDeleteConfirmation(""); setError(""); setView(user ? "account" : "login"); }}>
          <Cloud className="size-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">{user?.name || "Account"}</span>
        </button>
        {user ? (
          <Button title="Sign out" aria-label="Sign out" variant="ghost" size="icon" className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => void signOut()}>
            <LogOut className="size-3.5" />
          </Button>
        ) : null}</> : null}
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
                {view === "login" ? "Sign in" : view === "register" ? "Create account" : view === "new" ? "New project" : view === "account" ? "Account settings" : "Open project"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" aria-label="Close" disabled={busy} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="size-4" /></button>
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              {view === "open" ? "Choose a saved project to open or delete." : view === "new" ? "Enter the project details to create a blank workflow." : view === "account" ? "Review your account and delete it if needed." : "Enter your account details."}
            </Dialog.Description>
            {view === "login" || view === "register" ? (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void authenticate(view === "register"); }}>
                {view === "register" ? <input autoFocus aria-label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="h-10 w-full rounded-lg border px-3 text-sm" /> : null}
                <input autoFocus={view === "login"} aria-label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <input aria-label="Password" type="password" autoComplete={view === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (8+ characters)" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : view === "register" ? "Create account" : "Sign in"}</Button>
                <button className="w-full text-xs text-primary" onClick={() => setView(view === "login" ? "register" : "login")}>{view === "login" ? "Need an account? Register" : "Already registered? Sign in"}</button>
              </form>
            ) : view === "account" ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="font-semibold">{user?.name}</p>
                  <p className="break-all text-xs text-muted-foreground">{user?.email}</p>
                </div>
                {!isAuthBypass() ? (
                  <form className="space-y-3 rounded-xl border border-destructive/40 p-3" onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }}>
                    <h3 className="font-semibold text-destructive">Delete account</h3>
                    <p className="text-xs leading-5 text-muted-foreground">Permanently deletes your account, cloud projects, project history, uploaded files, and all sign-in sessions. This cannot be undone. Download anything you need first.</p>
                    <input aria-label="Current password to delete account" type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} placeholder="Current password" className="h-10 w-full rounded-lg border px-3 text-sm" />
                    <input aria-label="Type DELETE to confirm" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="Type DELETE to confirm" className="h-10 w-full rounded-lg border px-3 text-sm" />
                    <Button type="submit" variant="destructive" className="w-full" disabled={busy || !deletePassword || deleteConfirmation !== "DELETE"}>{busy ? "Deleting…" : "Permanently delete account"}</Button>
                  </form>
                ) : null}
              </div>
            ) : view === "new" ? (
              <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
                <p className="text-xs leading-5 text-muted-foreground">A new project starts with one Project Start card. You can add the 5-digit Job Number later.</p>
                <input autoFocus aria-label="Job Number" value={projectNumber} inputMode="numeric" maxLength={5} onChange={(event) => setProjectNumber(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="Job Number (5 digits)" className="h-10 w-full rounded-lg border px-3 text-sm" />
                {!projectNumberValid ? <p role="status" className="rounded-lg border border-amber-500/60 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">{projectNumber ? "Enter all 5 digits, or leave the Job Number blank." : "Job Number not set. You can add it later."}</p> : null}
                <input aria-label="Company code" value={customerCode} maxLength={4} onChange={(event) => setCustomerCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))} placeholder="Company code (4 letters)" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <input aria-label="Project address" value={projectAddress} onChange={(event) => setProjectAddress(event.target.value)} placeholder="Full project address" className="h-10 w-full rounded-lg border px-3 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input aria-label="Storeys" value={storeys} inputMode="numeric" onChange={(event) => setStoreys(event.target.value.replace(/\D/g, ""))} placeholder="Storeys" className="h-10 w-full rounded-lg border px-3 text-sm" />
                  <input aria-label="Suites" value={suites} inputMode="numeric" onChange={(event) => setSuites(event.target.value.replace(/\D/g, ""))} placeholder="Suites" className="h-10 w-full rounded-lg border px-3 text-sm" />
                </div>
                <p className="break-words text-xs text-muted-foreground">Project name: {projectName}</p>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
              </form>
            ) : (
              <div className="scroll-thin max-h-80 space-y-2 overflow-y-auto pr-1">
                {busy ? <p className="py-8 text-center text-sm text-muted-foreground">Loading projects…</p> : projects.length ? projects.map((project) => (
                  <div key={project.id} className={`flex items-center rounded-xl border transition hover:border-primary/40 hover:bg-muted/40 ${project.id === activeProjectId ? "border-primary/40 bg-primary/5" : ""}`}>
                    <button className="min-w-0 flex-1 p-3 text-left" onClick={() => openProject(project.id)}>
                      <span className="flex items-center gap-2 truncate text-sm font-semibold">{project.name}{project.id === activeProjectId ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"><CheckCircle2 className="size-3" />Current</span> : null}</span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">{project.project_number || "No job number"} · Updated {new Date(project.updated_at).toLocaleString()}</span>
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
