"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";

export function ConfirmClearDialog() {
  const notice = useWorkflowStore((state) => state.confirmClear);
  const dismiss = useWorkflowStore((state) => state.dismissConfirmClear);

  if (!notice) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && dismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/45 backdrop-blur-sm animate-in fade-in duration-150" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl outline-none animate-in zoom-in-95 duration-150">
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive shadow-sm">
              <AlertTriangle className="size-6" />
            </div>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4">
            <Dialog.Title className="text-base font-bold text-foreground">
              {notice.title}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {notice.message}
            </Dialog.Description>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-input bg-background px-4 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => {
                notice.onConfirm();
                dismiss();
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-destructive px-4 text-xs font-semibold text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
            >
              {notice.confirmLabel || "Confirm Clear"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
