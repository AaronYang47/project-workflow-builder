"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  KeyRound,
  LoaderCircle,
  LogOut,
  PencilLine,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SALES_NEW_DRAFT_PREFIX } from "@/lib/sales-intake";
import { SalesApiError, salesEndpoints, type SalesMe, type SalesProjectList } from "./sales-api";
import { SalesForm } from "./sales-form";
import {
  LanguageSwitch,
  SalesLanguageProvider,
  errorText,
  localeOf,
  useT,
  type SalesStrings,
} from "./sales-i18n";

/**
 * The Sales site (/sales). Sales sign in, enter the access code their team
 * gave them, pick a project by name (or start a new one) and fill in only the
 * Job number and Qualification Form. Built for phones first.
 */

const FIELD =
  "h-12 w-full rounded-xl border bg-background px-3.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20";

const formKeyFromUrl = () =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("form");

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main
      data-sales-site
      className="sales-site min-h-dvh bg-background text-foreground [padding-bottom:env(safe-area-inset-bottom)]"
    >
      <div className={cn("mx-auto w-full px-4 py-6", wide ? "max-w-2xl" : "max-w-md")}>
        {children}
      </div>
    </main>
  );
}

function Brand({ subtitle, children }: { subtitle: string; children?: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
        <ClipboardCheck className="size-6" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight">{t.brand}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <LanguageSwitch />
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}

function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "register") await salesEndpoints.register(name, email, password);
      else await salesEndpoints.login(email, password);
      setPassword("");
      onSignedIn();
    } catch (caught) {
      setError(errorText(caught, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <Brand subtitle={t.salesIntake} />
      <div className="mb-4 grid grid-cols-2 rounded-xl border bg-muted/40 p-1" role="tablist">
        {(["login", "register"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setError("");
            }}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold",
              mode === value ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {value === "login" ? t.signIn : t.createAccount}
          </button>
        ))}
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {mode === "register" ? (
          <input
            aria-label={t.yourName}
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.yourName}
            className={FIELD}
          />
        ) : null}
        <input
          aria-label={t.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t.email}
          className={FIELD}
        />
        <input
          aria-label={t.password}
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 12 : undefined}
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={mode === "register" ? t.passwordNew : t.password}
          className={FIELD}
        />
        <Button type="submit" className="h-12 w-full rounded-xl text-base" disabled={busy}>
          {busy ? t.pleaseWait : mode === "register" ? t.createAccount : t.signIn}
        </Button>
        <ErrorNote message={error} />
      </form>
    </Shell>
  );
}

function SignOutButton({ onSignedOut }: { onSignedOut: () => void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={() => void salesEndpoints.logout().finally(onSignedOut)}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <LogOut className="size-4" />
      <span className="max-sm:sr-only">{t.signOut}</span>
    </button>
  );
}

function formatCode(value: string) {
  const raw = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

function CodeScreen({
  me,
  onLinked,
  onSignedOut,
}: {
  me: SalesMe;
  onLinked: () => void;
  onSignedOut: () => void;
}) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await salesEndpoints.link(code);
      onLinked();
    } catch (caught) {
      setError(errorText(caught, t));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell>
      <Brand subtitle={t.signedInAs(me.user?.name ?? "")} />
      <div className="rounded-2xl border bg-card p-5">
        <KeyRound className="mb-3 size-7 text-primary" />
        <h2 className="text-lg font-bold">{t.enterCode}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t.codeHelp}</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            aria-label={t.accessCode}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(formatCode(event.target.value))}
            placeholder="XXXX-XXXX"
            className={cn(FIELD, "text-center font-mono text-xl tracking-[0.3em]")}
          />
          <Button
            type="submit"
            className="h-12 w-full rounded-xl text-base"
            disabled={busy || code.replace("-", "").length !== 8}
          >
            {busy ? t.checking : t.continue}
          </Button>
          <ErrorNote message={error} />
        </form>
      </div>
      <div className="mt-4 flex justify-center">
        <SignOutButton onSignedOut={onSignedOut} />
      </div>
    </Shell>
  );
}

function TeamAccountScreen({ onSignedOut }: { onSignedOut: () => void }) {
  const { t } = useT();
  return (
    <Shell>
      <Brand subtitle={t.salesIntake} />
      <div className="rounded-2xl border bg-card p-5 text-sm">
        <p className="font-semibold">{t.teamAccount}</p>
        <p className="mt-1 text-muted-foreground">{t.teamAccountHelp}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild className="h-11 rounded-xl">
            <Link href="/">{t.openApp}</Link>
          </Button>
          <SignOutButton onSignedOut={onSignedOut} />
        </div>
      </div>
    </Shell>
  );
}

function relativeTime(iso: string, t: SalesStrings, locale: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return t.justNow;
  if (minutes < 60) return t.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  return new Date(iso).toLocaleDateString(locale);
}

function ProjectList({
  me,
  onOpen,
  onSignedOut,
  onNeedsCode,
}: {
  me: SalesMe;
  onOpen: (key: string) => void;
  onSignedOut: () => void;
  onNeedsCode: () => void;
}) {
  const { t, lang } = useT();
  const locale = localeOf(lang);
  const [list, setList] = useState<SalesProjectList | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(() => {
    salesEndpoints
      .projects()
      .then((result) => {
        setList(result);
        setError("");
      })
      .catch((caught: unknown) => {
        if (caught instanceof SalesApiError && caught.code === "NEEDS_ACCESS_CODE") onNeedsCode();
        else setError(caught instanceof Error ? caught.message : "");
      });
  }, [onNeedsCode]);
  useEffect(() => {
    load();
  }, [load]);

  const needle = query.trim().toLowerCase();
  const projects = useMemo(
    () => (list?.projects ?? []).filter((project) => project.name.toLowerCase().includes(needle)),
    [list, needle],
  );
  const draftByKey = new Map((list?.drafts ?? []).map((draft) => [draft.key, draft]));
  const newDrafts = (list?.drafts ?? []).filter((draft) =>
    draft.key.startsWith(SALES_NEW_DRAFT_PREFIX),
  );

  return (
    <Shell wide>
      <div className="mb-4">
        <Brand subtitle={list?.team ? `${list.team} · ${me.user?.name}` : (me.user?.name ?? "")}>
          <SignOutButton onSignedOut={onSignedOut} />
        </Brand>
      </div>

      <Button
        data-sales-new-project
        className="h-14 w-full rounded-2xl text-base"
        disabled={!list?.canCreate}
        onClick={() => onOpen(`${SALES_NEW_DRAFT_PREFIX}${crypto.randomUUID()}`)}
      >
        <FilePlus2 className="size-5" /> {t.newProject}
      </Button>
      {list && !list.canCreate ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">{t.noTemplate}</p>
      ) : null}

      {newDrafts.length ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t.notSubmitted}
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {newDrafts.map((draft) => (
              <li key={draft.key}>
                <button
                  type="button"
                  onClick={() => onOpen(draft.key)}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
                >
                  <PencilLine className="size-5 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {draft.projectName || t.newProject}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.newProjectDraft(relativeTime(draft.updatedAt, t, locale))}
                    </span>
                  </span>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t.projects}
        </h2>
        <label className="relative mb-3 block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label={t.searchProjects}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchPlaceholder}
            className={cn(FIELD, "pl-11")}
          />
        </label>
        <ErrorNote message={error} />
        {!list && !error ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {list ? (
          projects.length ? (
            <ul data-sales-projects className="divide-y overflow-hidden rounded-2xl border bg-card">
              {projects.map((project) => {
                const draft = draftByKey.get(project.id);
                return (
                  <li key={project.id}>
                    <button
                      type="button"
                      data-sales-project={project.name}
                      onClick={() => onOpen(project.id)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{project.name}</span>
                        {draft ? (
                          <span className="text-xs text-[#b54708]">
                            {t.draftNotSubmitted(relativeTime(draft.updatedAt, t, locale))}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {needle ? t.noMatch : t.noProjects}
            </p>
          )
        ) : null}
      </section>
    </Shell>
  );
}

export function SalesApp() {
  return (
    <SalesLanguageProvider>
      <SalesSite />
    </SalesLanguageProvider>
  );
}

function SalesSite() {
  const { t } = useT();
  const [me, setMe] = useState<SalesMe | null>(null);
  const [error, setError] = useState("");
  const [formKey, setFormKey] = useState<string | null>(null);

  // Switching language must not reload the account.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const refresh = useCallback(() => {
    salesEndpoints
      .me()
      .then((result) => {
        setMe(result);
        setError("");
      })
      .catch((caught: unknown) => setError(errorText(caught, tRef.current)));
  }, []);

  useEffect(() => {
    refresh();
    // The phone's Back button returns from a form to the list.
    const sync = () => setFormKey(formKeyFromUrl());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [refresh]);

  const open = (key: string) => {
    window.history.pushState(null, "", `?form=${encodeURIComponent(key)}`);
    setFormKey(key);
    window.scrollTo({ top: 0 });
  };
  const close = () => {
    if (formKeyFromUrl()) window.history.back();
    setFormKey(null);
  };
  const signedOut = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setFormKey(null);
    setMe({ user: null, sales: null });
  };
  const needsCode = useCallback(
    () =>
      setMe((current) =>
        current?.sales ? { ...current, sales: { ...current.sales, linked: false } } : current,
      ),
    [],
  );

  if (!me)
    return (
      <Shell>
        {error ? (
          <div className="space-y-3 pt-10">
            <ErrorNote message={error} />
            <Button className="h-12 w-full rounded-xl" onClick={refresh}>
              {t.tryAgain}
            </Button>
          </div>
        ) : (
          <div className="flex justify-center pt-24">
            <LoaderCircle className="size-7 animate-spin text-muted-foreground" />
          </div>
        )}
      </Shell>
    );
  if (!me.user) return <AuthScreen onSignedIn={refresh} />;
  if (!me.sales) return <TeamAccountScreen onSignedOut={signedOut} />;
  if (!me.sales.linked) return <CodeScreen me={me} onLinked={refresh} onSignedOut={signedOut} />;
  if (formKey)
    return (
      <SalesForm
        key={formKey}
        formKey={formKey}
        onClose={close}
        onOpenProject={(key) => {
          window.history.replaceState(null, "", `?form=${encodeURIComponent(key)}`);
          setFormKey(key);
        }}
        onNeedsCode={needsCode}
      />
    );
  return <ProjectList me={me} onOpen={open} onSignedOut={signedOut} onNeedsCode={needsCode} />;
}
