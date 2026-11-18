"use client";

import type { ReactNode } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/file-storage";
import { cn } from "@/lib/utils";
import type { DocRecord } from "./doc-record";

/** Literal Tailwind classes per colour, written out in full so Tailwind generates them. */
export const DOCUMENT_BOX_THEMES = {
  indigo: {
    iconChip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    countPill:
      "rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-500/20",
    rowIdle: "border-border/80 bg-background hover:border-indigo-500/40",
    checkbox: "mt-1 size-4 shrink-0 accent-indigo-600 rounded cursor-pointer",
    fileIcon: "size-2.5 text-primary shrink-0",
    download: "size-6 text-muted-foreground hover:text-primary hover:bg-primary/10",
    addButton:
      "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/5 hover:text-indigo-600 cursor-pointer",
  },
  emerald: {
    iconChip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    countPill:
      "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
    rowIdle: "border-border/80 bg-background hover:border-emerald-500/40",
    checkbox: "mt-1 size-4 shrink-0 accent-emerald-600 rounded cursor-pointer",
    fileIcon: "size-2.5 text-emerald-600 shrink-0",
    download: "size-6 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10",
    addButton:
      "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:text-emerald-600 cursor-pointer",
  },
} as const;

/**
 * One L3 document column (Required or Supporting): header with a done count,
 * a checklist of documents with download/remove, and an Add button.
 */
export function DocumentBox({
  title,
  subtitle,
  icon,
  theme,
  docs,
  checkedLabel,
  codeFallback,
  lockedReason,
  onBlocked,
  emptyTitle,
  addLabel,
  onSave,
  onAdd,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  theme: (typeof DOCUMENT_BOX_THEMES)[keyof typeof DOCUMENT_BOX_THEMES];
  docs: DocRecord[];
  /** Status shown once a document is ticked, e.g. "Executed" or "Verified". */
  checkedLabel: string;
  /** Code shown when a document has none. */
  codeFallback: (index: number) => string;
  /** When set, unticked documents cannot be ticked yet (sequential release). */
  lockedReason?: string;
  /** Before a file is ticked: true (after showing why) when it must wait. */
  onBlocked?: () => boolean;
  emptyTitle: string;
  addLabel: string;
  onSave: (docs: DocRecord[]) => void;
  onAdd: () => void;
}) {
  const checkedCount = docs.filter((doc) => doc.checked).length;
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-card/85 backdrop-blur-xs shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.05] overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${theme.iconChip}`}
          >
            {icon}
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">{title}</h2>
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <span className={theme.countPill}>
          {checkedCount}/{docs.length} {checkedLabel}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
            <FileText className="size-8 opacity-30 mb-2" />
            <p className="text-xs font-medium">{emptyTitle}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Click &quot;+ {addLabel}&quot; below to add from uploaded forms.
            </p>
          </div>
        ) : null}
        {docs.map((doc, index) => (
          <div
            key={doc.id}
            className={cn(
              "group flex items-start gap-3 rounded-lg border p-3 transition-colors",
              doc.checked ? "border-emerald-500/30 bg-emerald-500/[0.04]" : theme.rowIdle,
            )}
          >
            <input
              type="checkbox"
              aria-label={`Required file: ${doc.title}`}
              checked={doc.checked}
              title={lockedReason}
              onChange={() => {
                // Ticking waits for the earlier steps (shows why in a popup).
                if (!doc.checked && onBlocked?.()) return;
                const updated = [...docs];
                updated[index] = { ...doc, checked: !doc.checked };
                onSave(updated);
              }}
              className={theme.checkbox}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {doc.code || codeFallback(index)}
                  </span>
                  {doc.fileName ? (
                    <span
                      title={doc.fileName}
                      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-foreground font-medium max-w-[130px] truncate"
                    >
                      <FileText className={theme.fileIcon} />
                      <span className="truncate">{doc.fileName}</span>
                    </span>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.2 text-[9px] font-bold uppercase shrink-0",
                    doc.checked
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : doc.required
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-slate-400/15 text-slate-600 dark:text-slate-400",
                  )}
                >
                  {doc.checked ? checkedLabel : doc.required ? "Required" : "Optional"}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold leading-snug text-foreground">{doc.title}</p>
              {doc.notes ? (
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {doc.notes}
                </p>
              ) : null}
            </div>

            {/* Actions: Download and Delete */}
            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              {doc.fileName ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadFile(doc);
                  }}
                  title={`Download ${doc.fileName}`}
                  aria-label={`Download ${doc.fileName}`}
                  className={theme.download}
                >
                  <Download className="size-3.5" />
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  onSave(docs.filter((_, i) => i !== index));
                }}
                title="Remove document"
                aria-label="Remove document"
                className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}

        <button type="button" onClick={onAdd} className={theme.addButton}>
          <Plus className="size-3.5" />
          {addLabel}
        </button>
      </div>
    </div>
  );
}
