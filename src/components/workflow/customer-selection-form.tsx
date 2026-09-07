"use client";

import { useMemo, useState } from "react";
import { Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getFalconCustomerCategories,
  getFalconCustomersByCategory,
} from "@/lib/falcon-customer-intelligence";

const selectClass =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-background px-3.5 py-2.5 text-xs font-medium text-foreground shadow-xs outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20";

export function CustomerSelectionForm({
  open,
  initialCategory = "",
  initialName = "",
  onClose,
  onSave,
}: {
  open: boolean;
  initialCategory?: string;
  initialName?: string;
  onClose: () => void;
  onSave: (selection: { customerCategory: string; customerName: string }) => void;
}) {
  const categories = useMemo(() => getFalconCustomerCategories(), []);
  const [customerCategory, setCustomerCategory] = useState(initialCategory);
  const [customerName, setCustomerName] = useState(initialName);

  const names = useMemo(
    () => (customerCategory ? getFalconCustomersByCategory(customerCategory) : []),
    [customerCategory],
  );

  if (!open) return null;

  const canSave = Boolean(customerCategory && customerName);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-300/90 dark:border-slate-700 bg-card shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Building2 className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Customer Selection Form
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Falcon Customer Intelligence Database
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer selection form"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label
              htmlFor="falcon-customer-category"
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              Customer Category
            </label>
            <select
              id="falcon-customer-category"
              aria-label="Customer Category"
              value={customerCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;
                setCustomerCategory(nextCategory);
                const nextNames = nextCategory
                  ? getFalconCustomersByCategory(nextCategory)
                  : [];
                setCustomerName(
                  nextNames.includes(customerName) ? customerName : "",
                );
              }}
              className={selectClass}
            >
              <option value="">Select customer category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="falcon-customer-name"
              className="block text-xs font-semibold text-foreground mb-1.5"
            >
              Customer Specific Name
            </label>
            <select
              id="falcon-customer-name"
              aria-label="Customer Specific Name"
              value={customerName}
              disabled={!customerCategory}
              onChange={(event) => setCustomerName(event.target.value)}
              className={selectClass}
            >
              <option value="">
                {customerCategory
                  ? "Select customer name"
                  : "Select a category first"}
              </option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3 bg-muted/20">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs cursor-pointer">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!canSave) return;
              onSave({ customerCategory, customerName });
            }}
            disabled={!canSave}
            className="h-8 text-xs font-bold cursor-pointer"
          >
            Save Selection
          </Button>
        </div>
      </div>
    </div>
  );
}
