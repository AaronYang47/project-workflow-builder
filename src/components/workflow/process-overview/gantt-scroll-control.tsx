"use client";

import type { useGanttScroll } from "./use-gantt-scroll";

/** The ← range → bar above the Gantt chart for moving along the timeline. */
export function GanttScrollControl({
  scroll,
  mobileTimeline,
}: {
  scroll: ReturnType<typeof useGanttScroll>;
  mobileTimeline: boolean;
}) {
  const { maxScroll, scrollLeft, scrollTo, pageWidth, beginPan } = scroll;
  const stepButton =
    "flex size-10 shrink-0 items-center justify-center rounded border text-base disabled:opacity-40 sm:size-auto sm:px-2 sm:py-1 sm:text-xs";
  return (
    <div
      data-gantt-horizontal-control
      className={`${mobileTimeline ? "flex" : "hidden sm:flex"} shrink-0 items-center gap-2 border-b bg-panel px-3 py-2 sm:gap-3 sm:px-4`}
    >
      <div
        data-gantt-pan-surface
        onPointerDown={beginPan}
        aria-label="Drag to move Gantt timeline"
        className="hidden shrink-0 cursor-grab select-none rounded border bg-background px-3 py-1.5 text-xs font-semibold active:cursor-grabbing sm:block"
      >
        ✥ Drag timeline left / right
      </div>
      <button
        type="button"
        aria-label="Scroll Gantt left"
        disabled={scrollLeft <= 0}
        onClick={() => scrollTo(scrollLeft - pageWidth())}
        className={stepButton}
      >
        ←
      </button>
      <input
        type="range"
        aria-label="Gantt horizontal position"
        min={0}
        max={maxScroll}
        step={1}
        value={Math.min(scrollLeft, maxScroll)}
        onChange={(event) => scrollTo(Number(event.target.value))}
        className="min-w-0 flex-1 accent-primary"
      />
      <button
        type="button"
        aria-label="Scroll Gantt right"
        disabled={scrollLeft >= maxScroll - 1}
        onClick={() => scrollTo(scrollLeft + pageWidth())}
        className={stepButton}
      >
        →
      </button>
    </div>
  );
}
