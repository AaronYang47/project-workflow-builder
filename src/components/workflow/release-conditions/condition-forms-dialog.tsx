"use client";

import Link from "next/link";
import { FolderArchive, Plus, Trash2, X } from "lucide-react";
import { type Condition, type DomainNode } from "@/types/workflow";
import {
  conditionText,
  type DocumentCategory,
  categoryForField,
  DOCUMENT_GROUPS,
  conditionDocuments,
  departmentBoardHeading,
} from "@/lib/release-conditions-workspace-model";
import { removeConditionDocument } from "./condition-documents";

/** Forms window for one condition: Required, Customer and Supporting document columns. */
export function ConditionFormsDialog({
  chapter,
  condition,
  conditionIndex,
  isOptional,
  needle,
  canEdit,
  workflowHref,
  onClose,
  onAddDocument,
  onAddFromLibrary,
}: {
  chapter: DomainNode;
  condition: Condition;
  conditionIndex: number;
  isOptional: boolean;
  /** Current search text; columns show only matching forms unless the condition itself matches. */
  needle: string;
  canEdit: boolean;
  workflowHref: string;
  onClose: () => void;
  onAddDocument: (category: DocumentCategory) => void;
  onAddFromLibrary: (category: DocumentCategory) => void;
}) {
  const heading = departmentBoardHeading(chapter);
  const documentColumns = DOCUMENT_GROUPS.map((group) => ({
    ...group,
    documents: conditionDocuments(chapter, condition, group.field).filter((document) => {
      if (!needle || conditionText(condition, conditionIndex).toLowerCase().includes(needle))
        return true;
      return `${document.title} ${document.fileName ?? ""}`.toLowerCase().includes(needle);
    }),
  }));
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="release-condition-forms-title"
        className="flex max-h-[88dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/50 bg-background/65 shadow-2xl backdrop-blur-2xl supports-[backdrop-filter]:bg-background/55 dark:border-white/15"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/40 bg-background/35 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
              {heading.department} · {heading.chapter}
            </p>
            <h2
              id="release-condition-forms-title"
              className="mt-1 truncate text-sm font-bold sm:text-base"
            >
              {conditionText(condition, conditionIndex)}
            </h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Forms linked to this {isOptional ? "optional condition" : "step"}
            </p>
          </div>
          {canEdit && !isOptional ? (
            <Link
              href={`${workflowHref}${workflowHref.includes("?") ? "&" : "?"}executionNode=${encodeURIComponent(chapter.id)}&condition=${encodeURIComponent(condition.id || "")}`}
              className="shrink-0 rounded border px-2 py-1 text-[10px] font-semibold text-primary"
            >
              Forms & execution details
            </Link>
          ) : null}
          <button
            type="button"
            aria-label="Close forms window"
            onClick={() => onClose()}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/40 bg-background/45 text-muted-foreground transition hover:bg-background/75 hover:text-foreground dark:border-white/10"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="scroll-thin grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 sm:p-5 md:grid-cols-3">
          {documentColumns.map((column) => {
            const colors =
              column.tint === "indigo"
                ? {
                    border: "border-indigo-500/30",
                    header: "bg-indigo-500/[0.09] text-indigo-700 dark:text-indigo-300",
                    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
                    hover: "hover:border-indigo-500/45",
                  }
                : column.tint === "sky"
                  ? {
                      border: "border-sky-500/30",
                      header: "bg-sky-500/[0.09] text-sky-700 dark:text-sky-300",
                      badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                      hover: "hover:border-sky-500/45",
                    }
                  : {
                      border: "border-emerald-500/30",
                      header: "bg-emerald-500/[0.09] text-emerald-700 dark:text-emerald-300",
                      badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      hover: "hover:border-emerald-500/45",
                    };
            const completed = column.documents.filter((document) => document.checked).length;
            const category = categoryForField(column.field);
            return (
              <section
                key={column.field}
                aria-label={column.title}
                className={`flex min-h-52 min-w-0 flex-col overflow-hidden rounded-xl border bg-background/35 backdrop-blur-xl ${colors.border}`}
              >
                <header
                  className={`flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10 ${colors.header}`}
                >
                  <h3 className="min-w-0 text-[11px] font-bold leading-4">{column.title}</h3>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ${colors.badge}`}
                    >
                      {completed}/{column.documents.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddDocument(category)}
                      aria-label={`Add ${column.title}`}
                      title={`Add ${column.title}`}
                      className="flex size-6 items-center justify-center rounded text-current transition hover:bg-background/70"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </header>
                <button
                  type="button"
                  onClick={() => onAddFromLibrary(category)}
                  aria-label={`Add Forms from Library to ${column.title}`}
                  className="mx-2 mt-2 flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-dashed border-white/50 bg-background/35 px-2 py-1.5 text-[9px] font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary dark:border-white/15"
                >
                  <FolderArchive className="size-3" /> Add Forms from Library
                </button>
                <div className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
                  {column.documents.map((document) => (
                    <div
                      key={document.id || document.title}
                      className={`flex min-w-0 items-stretch rounded-lg border bg-background/50 ${colors.hover}`}
                    >
                      <div className="min-w-0 flex-1 px-2.5 py-2">
                        <p className="break-words text-[10px] font-semibold leading-4 text-foreground">
                          {document.title}
                        </p>
                        {document.fileName ? (
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                            {document.fileName}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[9px] text-muted-foreground">
                            Custom entry · no attached file
                          </p>
                        )}
                        <span
                          className={`mt-1 inline-flex rounded px-1 py-0.5 text-[8px] font-bold uppercase ${document.checked ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : document.required === false ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}
                        >
                          {document.checked
                            ? "Done"
                            : document.required === false
                              ? "Optional"
                              : "Required"}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${document.title}`}
                        title="Remove form from this step"
                        onClick={() =>
                          removeConditionDocument(
                            chapter,
                            condition.id,
                            conditionIndex,
                            column.field,
                            document.id,
                          )
                        }
                        className="flex w-8 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {!column.documents.length ? (
                    <p className="rounded-lg border border-dashed border-white/50 px-2 py-4 text-center text-[9px] leading-4 text-muted-foreground dark:border-white/15">
                      No forms added.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
