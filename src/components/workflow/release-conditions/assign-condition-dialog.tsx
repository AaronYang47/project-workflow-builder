"use client";

import { ArrowRight, X } from "lucide-react";
import { type Condition, type DomainNode } from "@/types/workflow";
import { conditionText, departmentBoardHeading } from "@/lib/release-conditions-workspace-model";

/** Phone picker that assigns an unassigned condition to a Department. */
export function AssignConditionDialog({ request, inbox, chapters, onAssign, onClose }: {
  request: { id?: string; index: number };
  inbox: Condition[];
  chapters: DomainNode[];
  onAssign: (chapterId: string) => void;
  onClose: () => void;
}) {
    const sourceIndex = request.id ? inbox.findIndex((condition) => condition.id === request.id) : request.index;
    const condition = inbox[sourceIndex];
    if (!condition) return null;
    return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="assign-condition-title" className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-panel shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4"><div className="min-w-0"><h2 id="assign-condition-title" className="text-sm font-bold">Assign release condition</h2><p className="mt-1 break-words text-xs text-muted-foreground">{conditionText(condition, sourceIndex)}</p></div><button type="button" aria-label="Close assignment" onClick={() => onClose()} className="flex size-9 shrink-0 items-center justify-center rounded-lg border"><X className="size-4" /></button></header>
        <div className="scroll-thin min-h-0 space-y-2 overflow-y-auto p-3"><p className="px-1 text-xs text-muted-foreground">Choose the destination department and chapter.</p>{chapters.map((chapter) => {
          const heading = departmentBoardHeading(chapter);
          return <button key={chapter.id} type="button" aria-label={`Assign to ${heading.department} ${heading.chapter}`} onClick={() => onAssign(chapter.id)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-left hover:border-primary/60 hover:bg-primary/5"><span className="min-w-0"><span className="block truncate text-xs font-semibold">{heading.department}</span><span className="block text-[10px] text-muted-foreground">{heading.chapter}</span></span><ArrowRight className="size-4 shrink-0 text-primary" /></button>;
        })}</div>
      </section>
    </div>;
}
