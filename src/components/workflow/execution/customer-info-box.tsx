"use client";

import { Building2, Download, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { customerFormIsComplete } from "@/components/workflow/customer-selection-form";
import { isCustomerSelectionForm } from "@/lib/falcon-customer-intelligence";
import { downloadFile } from "@/lib/file-storage";
import { cn } from "@/lib/utils";
import type { DocRecord } from "./doc-record";

/**
 * Center L3 column: customer information forms and documents. A Customer
 * Selection Form can be ticked only once its customer profile and answers
 * are complete, and is opened in its own form editor.
 */
export function CustomerInfoBox({
  docs,
  onSave,
  onOpenForm,
  onSelectionFormToggled,
  onAdd,
}: {
  docs: DocRecord[];
  onSave: (docs: DocRecord[]) => void;
  onOpenForm: (docId: string) => void;
  /** A selection form ticked or unticked by hand; manual unticks stop auto-ticking. */
  onSelectionFormToggled: (docId: string, checked: boolean) => void;
  onAdd: () => void;
}) {
  const checkedCount = docs.filter((d) => d.checked).length;
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-card/85 backdrop-blur-xs shadow-xs ring-1 ring-black/[0.03] dark:ring-white/[0.05] overflow-hidden">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Building2 className="size-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">Customer Information</h2>
            <p className="text-[10px] text-muted-foreground">
              Client specifications & authorization forms
            </p>
          </div>
        </div>
        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300 border border-sky-500/20">
          {checkedCount}/{docs.length} Verified
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scroll-thin">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-lg">
            <FileText className="size-8 opacity-30 mb-2" />
            <p className="text-xs font-medium">No customer forms added yet.</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Click &quot;+ Add Customer Information Form&quot; below to add from uploaded forms.
            </p>
          </div>
        ) : null}
        {docs.map((doc, index) => (
          <div
            key={doc.id}
            className={cn(
              "group flex items-start gap-3 rounded-lg border p-3 transition-colors",
              doc.checked
                ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                : "border-border/80 bg-background hover:border-sky-500/40",
            )}
          >
            <input
              type="checkbox"
              aria-label={`Required file: ${doc.title}`}
              checked={doc.checked}
              disabled={
                isCustomerSelectionForm(doc) &&
                !customerFormIsComplete(doc.customerProfile, doc.customerForm)
              }
              onChange={() => {
                if (
                  isCustomerSelectionForm(doc) &&
                  !customerFormIsComplete(doc.customerProfile, doc.customerForm)
                ) {
                  return;
                }
                const nextChecked = !doc.checked;
                if (isCustomerSelectionForm(doc)) onSelectionFormToggled(doc.id, nextChecked);
                const updated = [...docs];
                updated[index] = {
                  ...doc,
                  checked: nextChecked,
                  status: (nextChecked
                    ? "Verified"
                    : doc.required
                      ? "Required"
                      : "Optional") as DocRecord["status"],
                };
                onSave(updated);
              }}
              title={
                isCustomerSelectionForm(doc) &&
                !customerFormIsComplete(doc.customerProfile, doc.customerForm)
                  ? "Open and complete the form before checking this box"
                  : undefined
              }
              className="mt-1 size-4 shrink-0 accent-sky-600 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    {doc.code || `CUST-0${index + 1}`}
                  </span>
                  {doc.fileName ? (
                    <span
                      title={doc.fileName}
                      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.2 font-mono text-[9px] text-foreground font-medium max-w-[130px] truncate"
                    >
                      <FileText className="size-2.5 text-sky-500 shrink-0" />
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
                  {doc.checked ? "Verified" : doc.required ? "Required" : "Optional"}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold leading-snug text-foreground">{doc.title}</p>
              {isCustomerSelectionForm(doc) && doc.customerName ? (
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {[doc.customerCategory, doc.customerName].filter(Boolean).join(" · ")}
                  {doc.customerProfile
                    ? ` · Fit ${doc.customerProfile.customerQualityScore ?? "—"} / Opp ${doc.customerProfile.opportunityScore ?? "—"} / Conf ${doc.customerProfile.confidenceScore ?? "—"}`
                    : ""}
                </p>
              ) : doc.notes ? (
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  {doc.notes}
                </p>
              ) : null}
            </div>

            {/* Actions: Download and Delete */}
            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              {isCustomerSelectionForm(doc) ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenForm(doc.id);
                  }}
                  title="Open Form"
                  aria-label="Open Form"
                  className="size-6 text-muted-foreground hover:text-sky-600 hover:bg-sky-500/10"
                >
                  <Building2 className="size-3.5" />
                </Button>
              ) : doc.fileName ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    downloadFile(doc);
                  }}
                  title={`Download ${doc.fileName}`}
                  aria-label={`Download ${doc.fileName}`}
                  className="size-6 text-muted-foreground hover:text-sky-600 hover:bg-sky-500/10"
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
                title="Remove form"
                aria-label="Remove form"
                className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-sky-500/50 hover:bg-sky-500/5 hover:text-sky-600 cursor-pointer"
        >
          <Plus className="size-3.5" />
          Add Customer Information Form
        </button>
      </div>
    </div>
  );
}
