"use client";

import { useEffect, useState } from "react";
import { FolderKanban, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/store/workflow-store";

const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";

type User = { id: string; email: string; name: string };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const acceptUser = (nextUser: User) => {
    const workflow = useWorkflowStore.getState();
    if (workflow.workspaceOwnerId !== nextUser.id) {
      workflow.resetWorkspace(nextUser.id);
    }
    setUser(nextUser);
  };

  useEffect(() => {
    if (AUTH_BYPASS) {
      const workflow = useWorkflowStore.getState();
      if (workflow.workspaceOwnerId !== "dev-bypass") {
        workflow.resetWorkspace("dev-bypass");
      }
      setUser({ id: "dev-bypass", email: "[email protected]", name: "Local Dev" });
      setChecking(false);
      return;
    }
    void request<{ user: User | null }>("/api/auth/me")
      .then((result) => {
        if (result.user) acceptUser(result.user);
        else setUser(null);
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const authenticate = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{ user: User }>(
        `/api/auth/${registering ? "register" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        },
      );
      acceptUser(result.user);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <main className="flex h-dvh items-center justify-center bg-slate-50 text-slate-700">
        <LoaderCircle className="size-6 animate-spin" aria-label="Checking session" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white p-7 shadow-2xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <FolderKanban className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-950">Project Workflow Builder</h1>
              <p className="text-sm text-slate-500">Sign in to access your projects</p>
            </div>
          </div>
          <div className="space-y-3">
            {registering ? <input aria-label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-blue-500" /> : null}
            <input aria-label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-blue-500" />
            <input aria-label="Password" type="password" autoComplete={registering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void authenticate(); }} placeholder="Password (8+ characters)" className="h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-blue-500" />
            <Button className="h-11 w-full rounded-xl" disabled={busy} onClick={authenticate}>{busy ? "Please wait…" : registering ? "Create account" : "Sign in"}</Button>
            <button type="button" className="w-full py-1 text-sm text-blue-600 hover:underline" onClick={() => { setRegistering((value) => !value); setError(""); }}>{registering ? "Already registered? Sign in" : "Need an account? Register"}</button>
          </div>
          {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        </section>
      </main>
    );
  }

  return children;
}
