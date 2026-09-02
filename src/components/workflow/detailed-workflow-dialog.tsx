"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DetailedWorkflowDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[70]" />
        <Dialog.Content className="liquid-glass-panel fixed inset-3 z-[71] flex min-h-0 flex-col overflow-hidden rounded-2xl border outline-none sm:inset-6 lg:inset-10">
          <div className="liquid-glass-header flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-bold text-foreground sm:text-base">
                L2 · Detailed Workflow
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                Detailed workflow nodes, conditions, and connections
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8 shrink-0"
                aria-label="Close Detailed Workflow"
                title="Close Detailed Workflow"
              >
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 min-w-0 flex-1">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
