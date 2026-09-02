"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  LoaderCircle,
  Layers,
  ShieldCheck,
  Cpu,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/store/workflow-store";

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
  const [user, setUser] = useState<User | null>(() => useWorkflowStore.getState().authUser ?? null);
  const [checking, setChecking] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [gatePhase, setGatePhase] = useState<"welcome" | "login-fade" | "login">("welcome");

  const acceptUser = (nextUser: User) => {
    const workflow = useWorkflowStore.getState();
    if (workflow.workspaceOwnerId !== nextUser.id) {
      workflow.resetWorkspace(nextUser.id);
    }
    workflow.setAuthUser(nextUser);
    setUser(nextUser);
  };

  useEffect(() => {
    if (isAuthBypass()) {
      const isTest = typeof navigator !== "undefined" && Boolean(navigator.webdriver);
      const isBypassParam = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bypass");
      const isAuthedInSession = typeof window !== "undefined" && sessionStorage.getItem("falcon_dev_authed") === "1";
      const isWelcomeForced = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("welcome");

      if (isWelcomeForced && typeof window !== "undefined") {
        sessionStorage.removeItem("falcon_dev_authed");
      }

      if ((isTest || isBypassParam || isAuthedInSession) && !isWelcomeForced) {
        const workflow = useWorkflowStore.getState();
        if (workflow.workspaceOwnerId !== DEV_USER.id) {
          useWorkflowStore.setState({ workspaceOwnerId: DEV_USER.id });
        }
        workflow.setAuthUser(DEV_USER);
        // This branch intentionally hydrates React state from sessionStorage
        // after the client-only auth-bypass check has completed.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(DEV_USER);
        setChecking(false);
        return;
      }
      setChecking(false);
      return;
    }

    void request<{ user: User | null }>("/api/auth/me")
      .then((result) => {
        if (result.user) {
          acceptUser(result.user);
        } else {
          setUser(null);
          useWorkflowStore.getState().setAuthUser(null);
        }
      })
      .catch(() => {
        setUser(null);
        useWorkflowStore.getState().setAuthUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  const startExperience = () => {
    setGatePhase("login-fade");
    setTimeout(() => {
      setGatePhase("login");
    }, 700);
  };

  const authenticate = async () => {
    setBusy(true);
    setError("");
    try {
      if (isAuthBypass()) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("falcon_dev_authed", "1");
        }
        acceptUser(DEV_USER);
        setPassword("");
        return;
      }
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
      <main className="flex h-dvh items-center justify-center bg-black text-slate-400">
        <LoaderCircle className="size-6 animate-spin" aria-label="Checking session" />
      </main>
    );
  }

  if (!user) {
    const isWelcome = gatePhase === "welcome";
    const isLogin = gatePhase === "login-fade" || gatePhase === "login";

    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-y-auto bg-[#03070d] p-4 sm:p-6 select-none">
        {/* Industrial Engineering Blueprint / Technical Grid Overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(56, 189, 248, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(56, 189, 248, 0.15) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Ambient background glow */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[550px] w-[550px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-blue-600/15 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-cyan-600/15 blur-[120px]" />

        {/* Industrial Welcome Glass Console */}
        {isWelcome && (
          <div
            onClick={startExperience}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") startExperience();
            }}
            className="welcome-console group relative z-20 flex w-[calc(100vw-32px)] max-w-2xl cursor-pointer flex-col items-center overflow-hidden rounded-3xl border p-6 sm:p-8 text-center transition-all duration-300 outline-none"
          >
            {/* Industrial HUD Status Bar */}
            <div className="flex w-full items-center justify-between border-b border-white/10 pb-3 mb-5 text-[11px] font-mono tracking-wider">
              <div className="flex items-center gap-2 text-cyan-400">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-cyan-500" />
                </span>
                <span>SYS.ONLINE // FALCON WORKFLOW OS v2.6</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[10px]">
                <span className="rounded bg-cyan-950/60 px-1.5 py-0.5 text-cyan-300 border border-cyan-500/30">ELK ENGINE</span>
                <span className="rounded bg-blue-950/60 px-1.5 py-0.5 text-blue-300 border border-blue-500/30">L1-L3 SPEC</span>
                <span className="rounded bg-emerald-950/60 px-1.5 py-0.5 text-emerald-300 border border-emerald-500/30">D1 CLOUD</span>
              </div>
            </div>

            {/* Falcon Brand Header */}
            <div className="mb-5 flex w-full flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-cyan-500/40 bg-black shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                <Image
                  src="/falcon-logo.png"
                  alt="Falcon Workflow System"
                  width={1107}
                  height={979}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black tracking-tight text-white uppercase font-mono">
                  Falcon Workflow System
                </h1>
                <p className="text-xs text-slate-300 font-mono tracking-tight mt-0.5">
                  FROM COMPLEXITY TO CONTROL · INDUSTRIAL WORKFLOW MODELING & GATE GOVERNANCE
                </p>
              </div>
            </div>

            {/* 4 Core Features Grid with Industrial Icons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left my-2">
              {/* Feature 1 */}
              <div className="group/item relative overflow-hidden rounded-xl border border-slate-500/60 bg-[#101725]/80 p-3.5 backdrop-blur-md transition-all hover:border-cyan-500/60 hover:bg-[#131c2c]">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 group-hover/item:scale-105 transition-transform">
                    <Layers className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white tracking-wide">3-Layer Architecture</h3>
                      <span className="text-[9px] font-mono text-cyan-400/80 bg-cyan-950/80 px-1 py-0.5 rounded border border-cyan-500/20">L1-L3</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      Seamless progression from L1 lifecycle overview to L2 gate workflows and L3 execution forms.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group/item relative overflow-hidden rounded-xl border border-slate-500/60 bg-[#101725]/80 p-3.5 backdrop-blur-md transition-all hover:border-emerald-500/60 hover:bg-[#131c2c]">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover/item:scale-105 transition-transform">
                    <ShieldCheck className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white tracking-wide">Gate Governance</h3>
                      <span className="text-[9px] font-mono text-emerald-400/80 bg-emerald-950/80 px-1 py-0.5 rounded border border-emerald-500/20">G1~G5</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      Rigorous gate decision criteria, multi-party signature rules, and closed-loop rework routing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group/item relative overflow-hidden rounded-xl border border-slate-500/60 bg-[#101725]/80 p-3.5 backdrop-blur-md transition-all hover:border-blue-500/60 hover:bg-[#131c2c]">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 group-hover/item:scale-105 transition-transform">
                    <Cpu className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white tracking-wide">Orthogonal Topology</h3>
                      <span className="text-[9px] font-mono text-blue-400/80 bg-blue-950/80 px-1 py-0.5 rounded border border-blue-500/20">AUTO-ELK</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      Algorithmic ELK auto-routing separating primary trunk lines, support swimlanes, and return loops.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group/item relative overflow-hidden rounded-xl border border-slate-500/60 bg-[#101725]/80 p-3.5 backdrop-blur-md transition-all hover:border-amber-500/60 hover:bg-[#131c2c]">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 group-hover/item:scale-105 transition-transform">
                    <Database className="size-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white tracking-wide">Cloud Persistence</h3>
                      <span className="text-[9px] font-mono text-amber-400/80 bg-amber-950/80 px-1 py-0.5 rounded border border-amber-500/20">D1 & EXCEL</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                      Distributed Cloudflare D1 real-time sync with lossless bidirectional Excel export & audit trail.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pure Typographic Metallic Silver-White Command Actuator */}
            <div className="mt-6 w-full rounded-2xl bg-slate-900/60 p-1.5 border border-white/20 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              <button
                type="button"
                onClick={startExperience}
                className="group/btn relative flex w-full items-center justify-between overflow-hidden rounded-xl border-t-2 border-white border-x border-slate-300 border-b-2 border-slate-400 bg-gradient-to-r from-slate-100 via-white to-slate-200 px-6 sm:px-8 py-4 font-mono shadow-[0_4px_24px_rgba(255,255,255,0.2),0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(255,255,255,1)] transition-all duration-150 hover:brightness-105 hover:shadow-[0_0_40px_rgba(255,255,255,0.4),0_12px_32px_rgba(0,0,0,0.5)] active:scale-[0.99] active:translate-y-0.5 cursor-pointer select-none"
              >
                {/* Left: Engineering Status Code - Pure Text */}
                <span className="text-[11px] font-black tracking-widest text-slate-950/70 uppercase">
                  [ SYS.01 ]
                </span>

                {/* Center: Bold Engineering Command - Laser Engraved Obsidian */}
                <span className="text-xs sm:text-sm font-black tracking-[0.25em] text-slate-950 uppercase drop-shadow-2xs">
                  INITIALIZE WORKFLOW SYSTEM
                </span>

                {/* Right: Operational Trigger Tag - Pure Text */}
                <span className="text-[11px] font-black tracking-widest text-slate-950/80 uppercase group-hover/btn:translate-x-0.5 transition-transform">
                  [ ENTER ]
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Login/Register Card */}
        {isLogin && (
          <div
            className={`liquid-glass-panel fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl outline-none transition-all duration-700 ease-out ${
              gatePhase === "login"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 pointer-events-none"
            }`}
          >
            <div className="mb-4 flex items-center">
              <h2 className="text-lg font-bold text-foreground">
                {registering ? "Create account" : "Sign in"}
              </h2>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void authenticate();
              }}
            >
              {registering ? (
                <input
                  autoFocus
                  aria-label="Name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  className="h-10 w-full rounded-lg border px-3 text-sm bg-background/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
                />
              ) : null}
              <input
                autoFocus={!registering}
                aria-label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                className="h-10 w-full rounded-lg border px-3 text-sm bg-background/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
              <input
                aria-label="Password"
                type="password"
                autoComplete={registering ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password (8+ characters)"
                className="h-10 w-full rounded-lg border px-3 text-sm bg-background/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-primary hover:underline"
                onClick={() => {
                  setRegistering(!registering);
                  setError("");
                }}
              >
                {registering ? "Already registered? Sign in" : "Need an account? Register"}
              </button>
            </form>
            {error ? (
              <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </main>
    );
  }

  return children;
}
