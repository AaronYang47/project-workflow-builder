"use client";

import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, KeyRound, LayoutTemplate, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkflowStore } from "@/store/workflow-store";

/**
 * Team side of the Sales site: issue access codes (a Sales account that
 * enters one sees this account's project names) and keep the project
 * templates Sales use when they start a new project.
 */

type AccessCode = {
  id: string;
  hint: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  people: { name: string; email: string; linkedAt: string }[];
  /** Only right after it is issued. */
  code?: string;
};
type Template = { id: string; name: string; salesDefault: boolean; updatedAt: string };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: { "content-type": "application/json", ...options?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

const SALES_URL = () =>
  typeof window === "undefined" ? "/sales" : `${window.location.origin}/sales`;

export function SalesAccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"codes" | "templates">("codes");
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [label, setLabel] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(() => {
    void api<{ codes: AccessCode[] }>("/api/sales-admin/codes")
      .then((result) =>
        // Keep a just-issued code visible until the dialog closes.
        setCodes((current) =>
          result.codes.map((code) => ({
            ...code,
            code: current?.find((item) => item.id === code.id)?.code,
          })),
        ),
      )
      .catch((caught: Error) => setError(caught.message));
    void api<{ templates: Template[] }>("/api/templates")
      .then((result) => setTemplates(result.templates))
      .catch((caught: Error) => setError(caught.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string, id: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    });
  };

  const issue = () =>
    run(async () => {
      const created = await api<AccessCode>("/api/sales-admin/codes", {
        method: "POST",
        body: JSON.stringify({ label }),
      });
      setLabel("");
      setCodes((current) => [created, ...(current ?? [])]);
    });

  const saveTemplate = () =>
    run(async () => {
      const file = useWorkflowStore.getState().file;
      await api("/api/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim() || file.graph.metadata.name || "Template",
          workflow: file,
        }),
      });
      setTemplateName("");
    });

  const projectName = useWorkflowStore((state) => state.file.graph.metadata.name);
  const hasQualification = useWorkflowStore((state) =>
    state.file.graph.nodes.some((node) => node.type === "qualification"),
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setCodes((current) => current?.map(({ code: _code, ...rest }) => rest) ?? null);
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[100]" />
        <Dialog.Content
          data-sales-access-dialog
          className="liquid-glass-panel fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl outline-none"
        >
          <div className="mb-3 flex items-center">
            <Dialog.Title className="text-lg font-bold">Sales site</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-3 text-xs text-muted-foreground">
            Sales fill in the Job number and Qualification Form at{" "}
            <button
              type="button"
              className="font-semibold text-primary underline"
              onClick={() => copy(SALES_URL(), "url")}
            >
              {SALES_URL()}
            </button>
            {copied === "url" ? " (copied)" : ""}. They only see your project names.
          </Dialog.Description>

          <div className="mb-4 grid grid-cols-2 rounded-lg border bg-muted/40 p-0.5" role="tablist">
            {(
              [
                ["codes", "Access codes", KeyRound],
                ["templates", "Templates", LayoutTemplate],
              ] as const
            ).map(([value, title, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-semibold",
                  tab === value ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" /> {title}
              </button>
            ))}
          </div>

          {error ? (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}

          {tab === "codes" ? (
            <div className="space-y-3">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void issue();
                }}
              >
                <input
                  aria-label="Who is this code for"
                  value={label}
                  maxLength={100}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Who is it for? (e.g. Sales — Québec)"
                  className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                />
                <Button type="submit" size="sm" className="h-9" disabled={busy} data-issue-code>
                  Issue code
                </Button>
              </form>
              {codes === null ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : codes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No codes yet. Issue one and give it to your Sales team.
                </p>
              ) : (
                <ul className="space-y-2">
                  {codes.map((code) => (
                    <li
                      key={code.id}
                      data-access-code={code.hint}
                      className={cn(
                        "rounded-xl border p-3 text-sm",
                        code.revokedAt && "opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold tracking-wider">
                          {code.code ?? `••••-${code.hint}`}
                        </span>
                        {code.code ? (
                          <button
                            type="button"
                            onClick={() => copy(code.code!, code.id)}
                            className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
                          >
                            {copied === code.id ? (
                              <Check className="size-3" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                            {copied === code.id ? "Copied" : "Copy"}
                          </button>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {code.label}
                        </span>
                        {code.revokedAt ? (
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Stopped
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive hover:text-destructive"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Stop this code? Sales accounts that used it lose access to your projects at once.",
                                )
                              )
                                void run(() =>
                                  api(`/api/sales-admin/codes/${code.id}`, { method: "DELETE" }),
                                );
                            }}
                          >
                            Stop
                          </Button>
                        )}
                      </div>
                      {code.code ? (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                          Copy it now: the full code is shown only once.
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {code.people.length
                          ? `Used by ${code.people.map((person) => person.name || person.email).join(", ")}`
                          : "Not used yet"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border p-3">
                <p className="text-sm font-semibold">Save this project as a template</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Keeps the workflow, Phases, departments and steps. Leaves out the Qualification
                  answers, Job number, Calendar dates and approvals.
                </p>
                {!hasQualification ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                    This project has no Qualification card. Sales projects made from it get one
                    added.
                  </p>
                ) : null}
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTemplate();
                  }}
                >
                  <input
                    aria-label="Template name"
                    value={templateName}
                    maxLength={200}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={projectName || "Template name"}
                    className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="h-9"
                    disabled={busy}
                    data-save-template
                  >
                    Save as template
                  </Button>
                </form>
              </div>
              {templates === null ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No templates yet. Sales can start new projects once there is one.
                </p>
              ) : (
                <ul
                  className="space-y-2"
                  role="radiogroup"
                  aria-label="Template for new Sales projects"
                >
                  {templates.map((template) => (
                    <li
                      key={template.id}
                      data-template={template.name}
                      className="flex items-center gap-2 rounded-xl border p-3 text-sm"
                    >
                      <input
                        type="radio"
                        name="sales-template"
                        aria-label={`Use ${template.name} for new Sales projects`}
                        checked={template.salesDefault}
                        disabled={busy}
                        onChange={() =>
                          void run(() =>
                            api(`/api/templates/${template.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ salesDefault: true }),
                            }),
                          )
                        }
                        className="size-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{template.name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {template.salesDefault
                            ? "Used for new Sales projects"
                            : `Saved ${new Date(template.updatedAt).toLocaleDateString()}`}
                        </span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete template ${template.name}`}
                        className="size-8 text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Delete the template "${template.name}"?`))
                            void run(() =>
                              api(`/api/templates/${template.id}`, { method: "DELETE" }),
                            );
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
