"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { useWorkflowStore } from "@/store/workflow-store";

export function DeleteBlockedDialog() {
  const notice = useWorkflowStore((state) => state.deleteBlocked);
  const dismiss = useWorkflowStore((state) => state.dismissDeleteBlocked);
  if (!notice) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && dismiss()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/35 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border bg-background shadow-2xl outline-none">
        <div className="flex items-start gap-3 border-b bg-amber-50 px-5 py-4 dark:bg-amber-950/35">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-sm font-bold">
              {notice.title}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
              {notice.message}
            </Dialog.Description>
          </div>
          <Dialog.Close asChild>
            <button type="button" aria-label="Close message" className="rounded-md p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"><X className="size-4" /></button>
          </Dialog.Close>
        </div>
        {notice.items.length ? (
          <div className="max-h-56 overflow-y-auto px-5 py-4">
            <div className="space-y-1 rounded-lg border bg-muted/35 p-3 text-xs leading-5">
              {notice.items.map((item, index) => (
                <p key={`${item}-${index}`}>{item}</p>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex justify-end border-t px-5 py-3">
          <Dialog.Close asChild>
            <button type="button" autoFocus className="h-8 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Got it</button>
          </Dialog.Close>
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
