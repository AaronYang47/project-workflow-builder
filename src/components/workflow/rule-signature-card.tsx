"use client";

import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FilePenLine,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ComponentNoteButton } from "./component-note-button";
import { signatureFieldsComplete as signatureIsComplete } from "@/lib/workflow-progress";
import { stopBubble, textareaRows } from "./node-utils";
import type {
  GateSignatureRequirement,
  RequirementType,
  RevisionRecord,
} from "@/types/workflow";

/**
 * One signature/document row inside an approval condition. Tracks its own
 * field revisions and required-signature metadata.
 */
export function RuleSignatureCard({
  nodeId,
  signature,
  ruleIndex,
  signatureIndex,
  update,
  remove,
}: {
  nodeId: string;
  signature: GateSignatureRequirement;
  ruleIndex: number;
  signatureIndex: number;
  update: (patch: Partial<GateSignatureRequirement>) => void;
  remove: () => void;
}) {
  const complete = signatureIsComplete(signature);
  const prefix = `Condition ${ruleIndex + 1} document ${signatureIndex + 1}`;
  const updateText = (
    field: "abbreviation" | "fullName" | "department" | "signedBy",
    value: string,
  ) => {
    const trimmed = value.trim();
    update({
      [field]: trimmed,
      checked: signature.checked && Boolean(trimmed),
    });
  };
  const requirementType = signature.requirementType || "Required";
  const revisions = signature.revisions || [];
  const updateRevision = (revisionId: string, patch: Partial<RevisionRecord>) =>
    update({
      revisions: revisions.map((revision) =>
        revision.id === revisionId ? { ...revision, ...patch } : revision,
      ),
      checked: false,
    });
  const addRevision = () =>
    update({
      revisions: [
        ...revisions.map((revision) => ({
          ...revision,
          status: "Superseded" as const,
        })),
        {
          id: `revision-${crypto.randomUUID().slice(0, 8)}`,
          revision: "",
          receivedDate: "",
          department: signature.department || "",
          modifiedBy: "",
          status: "Current",
        },
      ],
      checked: false,
    });
  const removeRevision = (revisionId: string) => {
    const remaining = revisions.filter(
      (revision) => revision.id !== revisionId,
    );
    update({
      revisions: remaining.map((revision, index) => ({
        ...revision,
        status:
          index === remaining.length - 1
            ? ("Current" as const)
            : ("Superseded" as const),
      })),
      checked: false,
    });
  };
  return (
    <div
      data-signature-card
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border-0 bg-card p-2 shadow-sm transition",
        signature.checked
          ? "ring-1 ring-emerald-500/10"
          : requirementType === "Optional"
            ? "opacity-70"
            : "",
      )}
    >
      <div className="mb-2 flex h-6 items-center gap-1.5">
        <button
          aria-label={`${prefix} completed`}
          aria-pressed={signature.checked}
          disabled={!complete}
          title={
            complete
              ? "Mark signature complete"
              : "Complete every field before checking"
          }
          onClick={stopBubble(() => update({ checked: !signature.checked }))}
          className={cn(
            "flex size-4 items-center justify-center rounded border",
            signature.checked
              ? "border-emerald-600 bg-emerald-600 text-white"
              : complete
                ? "border-primary/50 bg-background"
                : "cursor-not-allowed bg-muted text-muted-foreground",
          )}
        >
          <Check className={cn("size-3", !signature.checked && "opacity-0")} />
        </button>
        <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-primary">
          <FilePenLine className="size-3" />
        </span>
        <span className="min-w-0 truncate text-[8px] font-black uppercase tracking-[0.1em] text-foreground">
          {signature.abbreviation || "Signed document"}
        </span>
        <select
          aria-label={`${prefix} requirement type`}
          value={requirementType}
          onChange={(event) =>
            update({
              requirementType: event.target.value as RequirementType,
            })
          }
          className="ml-auto h-5 shrink-0 rounded border bg-background px-1 text-[7px] font-bold"
        >
          <option>Required</option>
          <option>Optional</option>
        </select>
        <ComponentNoteButton
          nodeId={nodeId}
          noteKey={`signature:${signature.id}`}
          label={`${prefix} document`}
          className="size-5"
        />
        <button
          aria-label={`${signature.collapsed ? "Expand" : "Collapse"} ${prefix}`}
          onClick={stopBubble(() => update({ collapsed: !signature.collapsed }))}
          className="rounded p-0.5 text-muted-foreground"
        >
          {signature.collapsed ? (
            <ChevronRight className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </button>
        <button
          aria-label={`Delete ${prefix}`}
          onClick={stopBubble(remove)}
          className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      {!signature.collapsed ? (
        <>
          <div className="grid grid-cols-[130px_1fr] gap-2">
            <label className="block">
              <span className="mb-1 block text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                Code
              </span>
              <textarea
                aria-label={`${prefix} abbreviation`}
                defaultValue={signature.abbreviation}
                rows={textareaRows(signature.abbreviation, 16, 1)}
                placeholder="NDA"
                onBlur={(event) =>
                  updateText("abbreviation", event.target.value)
                }
                className="min-h-8 w-full resize-none overflow-hidden rounded-md border bg-background px-2 py-1 text-[9px] font-black uppercase leading-4 outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                Document name
              </span>
              <textarea
                aria-label={`${prefix} full name`}
                defaultValue={signature.fullName}
                rows={textareaRows(signature.fullName, 52, 1)}
                placeholder="Non-disclosure agreement"
                onBlur={(event) => updateText("fullName", event.target.value)}
                className="min-h-8 w-full resize-none overflow-hidden rounded-md border bg-background px-2 py-1 text-[9px] font-semibold leading-4 outline-none focus:border-primary"
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                <Building2 className="size-2.5" />
                Department
              </span>
              <textarea
                aria-label={`${prefix} department`}
                defaultValue={signature.department}
                rows={textareaRows(signature.department, 28, 1)}
                placeholder="e.g. Legal"
                onBlur={(event) => updateText("department", event.target.value)}
                className="min-h-8 w-full resize-none overflow-hidden rounded-md border bg-background px-2 py-1 text-[9px] leading-4 outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                <UserRound className="size-2.5" />
                Signed by
              </span>
              <textarea
                aria-label={`${prefix} signed by`}
                defaultValue={signature.signedBy}
                rows={textareaRows(signature.signedBy, 28, 1)}
                placeholder="Signer name"
                onBlur={(event) => updateText("signedBy", event.target.value)}
                className="min-h-8 w-full resize-none overflow-hidden rounded-md border bg-background px-2 py-1 text-[9px] leading-4 outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[7px] font-bold uppercase tracking-wider text-muted-foreground">
                Owner
              </span>
              <textarea
                aria-label={`${prefix} owner`}
                defaultValue={signature.owner || ""}
                rows={textareaRows(signature.owner, 28, 1)}
                placeholder="Document owner"
                onBlur={(event) => update({ owner: event.target.value.trim() })}
                className="min-h-8 w-full resize-none overflow-hidden rounded-md border bg-background px-2 py-1 text-[9px] leading-4 outline-none"
              />
            </label>
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
            <label>
              <span className="mb-1 block text-[7px] font-bold uppercase text-muted-foreground">
                Document status
              </span>
              <input
                aria-label={`${prefix} status`}
                defaultValue={signature.status || ""}
                placeholder="Draft"
                onBlur={(event) =>
                  update({ status: event.target.value.trim() })
                }
                className="h-8 w-full rounded border bg-background px-2 text-[8px]"
              />
            </label>
            <button
              aria-label={`${prefix} revision controlled`}
              aria-pressed={signature.revisionControlled}
              onClick={stopBubble(() =>
                update({
                  revisionControlled: !signature.revisionControlled,
                  checked: false,
                })
              )}
              className={cn(
                "mt-[14px] min-h-8 rounded border px-1 text-[7px] font-bold",
                signature.revisionControlled &&
                  "border-primary bg-primary/10 text-primary",
              )}
            >
              Revision control
            </button>
          </div>
          {signature.revisionControlled ? (
            <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[.03] p-2">
              <div className="mb-2 flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-foreground">
                  Revision history
                </span>
                <span className="min-w-0 truncate text-[7px] text-muted-foreground">
                  Current revision is required
                </span>
                <button
                  aria-label={`Add revision to ${prefix}`}
                  onClick={stopBubble(addRevision)}
                  className="ml-auto flex h-6 shrink-0 items-center gap-1 rounded border border-primary/30 bg-background px-2 text-[7px] font-bold text-primary"
                >
                  <Plus className="size-3" />
                  Add revision
                </button>
              </div>
              {revisions.length ? (
                <div className="space-y-2">
                  {revisions.map((revision, revisionIndex) => {
                    return (
                      <div
                        key={revision.id}
                        data-revision-row
                        className={cn(
                          "rounded-md border p-2",
                          revision.status === "Current"
                            ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                            : "bg-muted/30",
                        )}
                      >
                        <div className="grid min-w-0 grid-cols-[72px_132px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                          <label className="min-w-0">
                            <span className="mb-1 block text-[7px] font-bold uppercase text-muted-foreground">
                              Revision *
                            </span>
                            <input
                              aria-label={`${prefix} revision ${revisionIndex + 1}`}
                              value={revision.revision}
                              onChange={(event) =>
                                updateRevision(revision.id, {
                                  revision: event.target.value,
                                })
                              }
                              placeholder="Rev 1"
                              className="h-7 w-full min-w-0 rounded border bg-background px-2 text-[8px]"
                            />
                          </label>
                          <label className="min-w-0">
                            <span className="mb-1 block text-[7px] font-bold uppercase text-muted-foreground">
                              Date *
                            </span>
                            <input
                              type="date"
                              aria-label={`${prefix} revision ${revisionIndex + 1} received date`}
                              value={revision.receivedDate}
                              onChange={(event) =>
                                updateRevision(revision.id, {
                                  receivedDate: event.target.value,
                                })
                              }
                              className="h-7 w-full min-w-0 rounded border bg-background px-1.5 text-[8px]"
                            />
                          </label>
                          <label className="min-w-0">
                            <span className="mb-1 block text-[7px] font-bold uppercase text-muted-foreground">
                              Department *
                            </span>
                            <input
                              aria-label={`${prefix} revision ${revisionIndex + 1} department`}
                              value={revision.department}
                              onChange={(event) =>
                                updateRevision(revision.id, {
                                  department: event.target.value,
                                })
                              }
                              placeholder="Department"
                              className="h-7 w-full min-w-0 rounded border bg-background px-2 text-[8px]"
                            />
                          </label>
                          <label className="min-w-0">
                            <span className="mb-1 block text-[7px] font-bold uppercase text-muted-foreground">
                              Modified by *
                            </span>
                            <input
                              aria-label={`${prefix} revision ${revisionIndex + 1} modified by`}
                              value={revision.modifiedBy}
                              onChange={(event) =>
                                updateRevision(revision.id, {
                                  modifiedBy: event.target.value,
                                })
                              }
                              placeholder="Name"
                              className="h-7 w-full min-w-0 rounded border bg-background px-2 text-[8px]"
                            />
                          </label>
                        </div>
                        <div className="mt-2 flex min-w-0 items-center justify-end gap-1.5 border-t border-border/60 pt-2">
                          <span
                            className={cn(
                              "mr-auto flex h-7 min-w-[72px] items-center justify-center rounded-md border px-2 text-[7px] font-black uppercase",
                              revision.status === "Current"
                                ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "border-slate-300 bg-muted text-muted-foreground",
                            )}
                          >
                            {revision.status}
                          </span>
                          <div className="flex h-7 min-w-0 items-center justify-end gap-1">
                            <ComponentNoteButton
                              nodeId={nodeId}
                              noteKey={`revision:${signature.id}:${revision.id}`}
                              label={`${prefix} revision ${revisionIndex + 1}`}
                              className="size-7"
                            />
                            <button
                              aria-label={`Delete ${prefix} revision ${revisionIndex + 1}`}
                              title="Delete revision"
                              onClick={stopBubble(() => removeRevision(revision.id))}
                              className="flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-center text-[8px] text-amber-700 dark:text-amber-300">
                  Add the current revision before completing this document.
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}