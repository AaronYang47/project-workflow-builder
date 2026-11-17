"use client";

import { ArrowRight } from "lucide-react";
import type { buildProcessSchedule } from "@/lib/process-schedule";

type Phase = ReturnType<typeof buildProcessSchedule>["phases"][number];

/** "Process phases" strip: one card per L1 phase in order. Collapsible on phones. */
export function PhaseSummary({
  phases,
  mobileOpen,
  onToggleMobile,
}: {
  phases: Phase[];
  mobileOpen: boolean;
  onToggleMobile: () => void;
}) {
  return (
    <section
      aria-label="Complete process flowchart"
      data-mobile-phases-open={mobileOpen}
      className="rounded-lg border bg-panel p-3"
    >
      <h2 className="mb-2 hidden text-xs font-bold sm:block">Process phases</h2>
      <button
        type="button"
        data-mobile-phases-toggle
        aria-expanded={mobileOpen}
        onClick={onToggleMobile}
        className="flex min-h-10 w-full items-center justify-between text-xs font-bold sm:hidden"
      >
        Process phases <span>{mobileOpen ? "Hide ▲" : "Show ▼"}</span>
      </button>
      <div data-mobile-phases-content className={mobileOpen ? "block" : "hidden sm:block"}>
        {phases.length ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))" }}
          >
            {phases.map((phase, index) => (
              <article
                key={phase.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-l-4 bg-background px-3 py-2"
                style={{ borderLeftColor: phase.color }}
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-bold" style={{ color: phase.color }}>
                    {phase.title}
                  </h3>
                  {phase.description && (
                    <p
                      className="truncate text-[11px] text-muted-foreground"
                      title={phase.description}
                    >
                      {phase.description}
                    </p>
                  )}
                </div>
                {index < phases.length - 1 && (
                  <ArrowRight className="size-4 shrink-0" style={{ color: phase.color }} />
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Create L1 phases to display your process.</p>
        )}
      </div>
    </section>
  );
}
