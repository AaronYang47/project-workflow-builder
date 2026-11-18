"use client";

import type { SimDay, SimProject } from "@/lib/simulation";

function ModuleThumbnail({ finished }: { finished: boolean }) {
  return (
    <svg viewBox="0 0 400 300" aria-hidden="true" className="h-12 w-full">
      <image
        href={
          finished
            ? "/simulation-assets/module-finished.png"
            : "/simulation-assets/module-building.png"
        }
        width="400"
        height="300"
      />
    </svg>
  );
}

/** Yard entries use bay numbers because the engine tracks yard counts, not serial numbers. */
export function FactoryModuleInventory({
  day,
  projects,
  yardCapacity,
}: {
  day: SimDay;
  projects: SimProject[];
  yardCapacity: number;
}) {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const transit = Object.values(day.inTransit).reduce((sum, count) => sum + count, 0);
  const yard = Object.entries(day.yard).flatMap(([projectId, count]) =>
    Array.from({ length: count }, (_, index) => ({ projectId, index })),
  );
  const line = [...day.line].sort((a, b) => b.progress - a.progress);
  return (
    <div className="flex min-h-0 flex-[4] flex-col gap-1.5 text-slate-100">
      <div className="grid shrink-0 grid-cols-4 gap-1 text-center">
        <div className="rounded-lg border border-sky-800 bg-sky-950 p-1">
          <strong data-inventory-factory-count className="block text-base tabular-nums">
            {line.length + day.yardTotal}
          </strong>
          <span className="text-xs text-sky-200">At factory</span>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-1">
          <strong data-inventory-line-count className="block text-base tabular-nums">
            {line.length}
          </strong>
          <span className="text-xs text-slate-300">On the line</span>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-1">
          <strong data-inventory-yard-count className="block text-base tabular-nums">
            {day.yardTotal}
          </strong>
          <span className="text-xs text-slate-300">In the yard</span>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-1">
          <strong className="block text-base tabular-nums">{transit}</strong>
          <span className="text-xs text-slate-300">In transit</span>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        <section aria-label="Production modules" className="flex min-h-0 min-w-0 flex-col">
          <h3 className="mb-1 text-[11px] font-bold">Production line · {line.length} modules</h3>
          <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(82px,1fr))] content-start gap-1 overflow-y-auto overscroll-contain">
            {line.map((module) => {
              const project = byId.get(module.projectId);
              const progress = Math.min(100, Math.max(0, Math.round(module.progress * 100)));
              return (
                <article
                  key={module.projectId + "-" + module.module}
                  data-line-module={module.projectId}
                  aria-label={
                    (project?.name ?? module.projectId) +
                    ", module " +
                    module.module +
                    ", " +
                    progress +
                    "% complete"
                  }
                  className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900"
                >
                  <div
                    className="flex justify-between border-t-4 px-2 pt-1 text-xs font-bold"
                    style={{ borderColor: project?.color }}
                  >
                    <span>#{module.module}</span>
                    <span>{progress}%</span>
                  </div>
                  <ModuleThumbnail finished={progress >= 85} />
                  <p
                    className="line-clamp-2 min-h-8 px-2 pb-2 text-[11px] leading-4"
                    title={project?.name}
                  >
                    {project?.name ?? module.projectId}
                  </p>
                  <div className="h-1 bg-slate-700">
                    <div
                      className="h-full transition-[width]"
                      style={{ width: progress + "%", background: project?.color ?? "#94a3b8" }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          {!line.length ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-2 text-[10px] text-slate-400">
              No modules on the line on this day.
            </p>
          ) : null}
        </section>
        <section aria-label="Yard modules" className="flex min-h-0 min-w-0 flex-col">
          <h3 className="mb-1 text-[11px] font-bold">
            Yard · {day.yardTotal} / {yardCapacity} spaces occupied
          </h3>
          <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(82px,1fr))] content-start gap-1 overflow-y-auto overscroll-contain">
            {yard.map((module, index) => {
              const project = byId.get(module.projectId);
              return (
                <article
                  key={module.projectId + "-" + module.index}
                  data-yard-module={module.projectId}
                  aria-label={(project?.name ?? module.projectId) + ", yard space " + (index + 1)}
                  className="rounded-lg border border-slate-700 border-t-4 bg-slate-900"
                  style={{ borderTopColor: project?.color }}
                >
                  <p className="px-2 pt-1 text-xs font-bold">Space {index + 1}</p>
                  <p
                    className="line-clamp-2 min-h-8 px-2 pb-2 text-[11px] leading-4"
                    title={project?.name}
                  >
                    {project?.name ?? module.projectId}
                  </p>
                </article>
              );
            })}
          </div>
          {!yard.length ? (
            <p className="rounded-lg border border-dashed border-slate-700 p-2 text-[10px] text-slate-400">
              Yard empty on this day.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
