"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GanttChart,
  Plus,
  X,
} from "lucide-react";
import { AuthGate } from "@/components/workflow/auth-gate";
import { TopToolbar } from "@/components/workflow/top-toolbar";
import {
  listCloudProjects,
  loadCloudProject,
  updateCloudProject,
  type CloudProjectSummary,
} from "@/components/simulation/cloud-projects";
import {
  fetchCloudScenarios,
  loadScenarios,
  mergeScenarios,
  newScenario,
  pickActiveScenario,
  saveActiveScenarioId,
  saveCloudScenario,
  saveScenarios,
  todayIso,
} from "@/components/simulation/scenario-store";
import { simProjectFromWorkflow, type SimScenario } from "@/lib/simulation";
import {
  buildPortfolioProject,
  dayIso,
  departmentLoad,
  isoDay,
  portfolioRange,
  stackLabels,
  tasksOn,
  weekStart,
  type PortfolioProject,
  type PortfolioTask,
} from "@/lib/portfolio-schedule";
import { useHydrated } from "@/lib/use-hydrated";
import { applyGanttEdit, type GanttEdit } from "@/lib/gantt-edit";
import {
  canEditCollaborativeWorkflow,
  useCollaborationStore,
} from "@/lib/collaboration/collaboration-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { WorkflowFile } from "@/types/workflow";

/** L6 page: the L4 schedules of the L5 scenario's projects on one Gantt and Calendar. */
export function PortfolioSchedule() {
  const hydrated = useHydrated();
  const storeReady = useWorkflowStore((state) => state.hydrated);
  return (
    <AuthGate>
      <main className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
        <TopToolbar
          pageLayer="L6"
          isHighLevelView={false}
          onToggleHighLevelView={() => {}}
          openPalette={() => {}}
        />
        {hydrated && storeReady ? (
          <PortfolioWorkspace />
        ) : (
          <p className="p-8 text-sm text-muted-foreground">Loading projects…</p>
        )}
      </main>
    </AuthGate>
  );
}

const PX_PER_DAY = 5;
const MILESTONE_LINE = 22;
const LABEL_WIDTH = 280;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shortDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});
const monthTitle = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const fmt = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));

function initialScenario(): { saved: SimScenario[]; draft: SimScenario } {
  const saved = loadScenarios();
  return {
    saved,
    draft: saved.length ? pickActiveScenario(saved) : newScenario("Scenario A", todayIso()),
  };
}

function PortfolioWorkspace() {
  const currentFile = useWorkflowStore((state) => state.file);
  const currentId = useWorkflowStore((state) => state.activeProjectId);
  const [initial] = useState(initialScenario);
  const [scenarios, setScenarios] = useState<SimScenario[]>(initial.saved);
  const [draft, setDraft] = useState<SimScenario>(initial.draft);
  const [files, setFiles] = useState<Record<string, WorkflowFile>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [view, setView] = useState<"gantt" | "calendar">("gantt");
  const [picker, setPicker] = useState<{
    open: boolean;
    loading: boolean;
    list: CloudProjectSummary[];
    error?: string;
  }>({
    open: false,
    loading: false,
    list: [],
  });

  // The account's scenarios: the one L5 has open wins over this browser's copy.
  useEffect(() => {
    let cancelled = false;
    void fetchCloudScenarios()
      .then((cloud) => {
        if (cancelled) return;
        const { merged, localOnly } = mergeScenarios(cloud, loadScenarios());
        setScenarios(merged);
        saveScenarios(merged);
        for (const scenario of localOnly) void saveCloudScenario(scenario).catch(() => undefined);
        setDraft((current) =>
          current === initial.draft
            ? (merged.find((item) => item.id === current.id) ??
              (initial.saved.length ? current : (pickActiveScenario(merged) ?? current)))
            : current,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initial]);

  // Every change is saved for L5 too: this browser at once, then the account.
  const draftJson = JSON.stringify(draft);
  useEffect(() => {
    saveActiveScenarioId(draft.id);
    if (JSON.stringify(scenarios.find((item) => item.id === draft.id)) === draftJson) return;
    if (!draft.projects.length && !scenarios.some((item) => item.id === draft.id)) return;
    const timer = window.setTimeout(() => {
      const next = scenarios.some((item) => item.id === draft.id)
        ? scenarios.map((item) => (item.id === draft.id ? draft : item))
        : [draft, ...scenarios];
      setScenarios(next);
      saveScenarios(next);
      void saveCloudScenario(draft).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, draftJson, scenarios]);

  // Each saved project's latest copy (the open project comes from the editor).
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const project of draft.projects) {
      if (project.source.kind !== "cloud") continue;
      const id = project.source.projectId;
      if (id === currentId || files[project.id] || requested.current.has(project.id)) continue;
      requested.current.add(project.id);
      void loadCloudProject(id)
        .then((file) => setFiles((current) => ({ ...current, [project.id]: file })))
        .catch((error: unknown) =>
          setFailed((current) => ({
            ...current,
            [project.id]: error instanceof Error ? error.message : "Could not load this project.",
          })),
        );
    }
  }, [draft.projects, files, currentId]);

  const portfolio = useMemo<PortfolioProject[]>(
    () =>
      draft.projects.map((project) => {
        const meta = { id: project.id, name: project.name, color: project.color };
        if (project.source.kind !== "cloud")
          return {
            ...meta,
            phases: [],
            departments: [],
            unscheduled: 0,
            issue: "Simulation-only project: it has no L4 schedule.",
          };
        const file = project.source.projectId === currentId ? currentFile : files[project.id];
        if (!file)
          return {
            ...meta,
            phases: [],
            departments: [],
            unscheduled: 0,
            issue: failed[project.id] || "Loading…",
          };
        return buildPortfolioProject(file, meta);
      }),
    [draft.projects, files, failed, currentFile, currentId],
  );

  const canEditCurrent = useCollaborationStore(canEditCollaborativeWorkflow);
  const [notice, setNotice] = useState("");
  /**
   * A bar dragged here saves to the project exactly as the same drag in L4: the
   * open project through the editor (L4 shows it at once), any other project
   * to its cloud copy, which L4 opens.
   */
  const editTask = (projectId: string, scheduleKey: string, edit: GanttEdit) => {
    const project = draft.projects.find((item) => item.id === projectId);
    if (!project || project.source.kind !== "cloud") return;
    const cloudId = project.source.projectId;
    if (cloudId === currentId) {
      if (!canEditCurrent) {
        setNotice("This project is open read-only.");
        return;
      }
      useWorkflowStore.getState().commit((file) => applyGanttEdit(file, scheduleKey, edit));
      return;
    }
    const before = files[projectId];
    if (before)
      setFiles((current) => ({
        ...current,
        [projectId]: applyGanttEdit(before, scheduleKey, edit),
      }));
    void updateCloudProject(cloudId, (file) => applyGanttEdit(file, scheduleKey, edit))
      .then((saved) => {
        setFiles((current) => ({ ...current, [projectId]: saved }));
        setNotice(`${project.name} saved.`);
      })
      .catch((error: unknown) => {
        if (before) setFiles((current) => ({ ...current, [projectId]: before }));
        setNotice(
          `${project.name} was not saved: ${error instanceof Error ? error.message : "save failed"}`,
        );
      });
  };

  const openPicker = async () => {
    setPicker({ open: true, loading: true, list: [] });
    try {
      setPicker({ open: true, loading: false, list: await listCloudProjects() });
    } catch (error) {
      setPicker({
        open: true,
        loading: false,
        list: [],
        error: error instanceof Error ? error.message : "Could not list projects.",
      });
    }
  };
  const addProject = async (summary: CloudProjectSummary) => {
    setPicker((current) => ({ ...current, open: false }));
    const file = summary.id === currentId ? currentFile : await loadCloudProject(summary.id);
    const project = simProjectFromWorkflow(file, summary.id, draft.projects.length, todayIso());
    setFiles((current) => ({ ...current, [project.id]: file }));
    setDraft((current) => ({
      ...current,
      projects: [...current.projects, project],
      priority: undefined,
      sequence: undefined,
    }));
  };
  const removeProject = (id: string) =>
    setDraft((current) => ({
      ...current,
      projects: current.projects.filter((project) => project.id !== id),
      priority: undefined,
      sequence: undefined,
    }));
  const inScenario = new Set(
    draft.projects.flatMap((project) =>
      project.source.kind === "cloud" ? [project.source.projectId] : [],
    ),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Multi-project schedule
          </p>
          <h2 className="text-base font-bold">Combined Gantt &amp; Calendar</h2>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground">Scenario (shared with L5)</span>
          <select
            aria-label="Scenario"
            value={draft.id}
            onChange={(event) => {
              const next = scenarios.find((item) => item.id === event.target.value);
              if (next) setDraft(next);
            }}
            className="rounded-md border bg-background px-2 py-1 text-xs font-semibold"
          >
            {[draft, ...scenarios.filter((item) => item.id !== draft.id)].map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex rounded-lg border bg-muted/40 p-0.5 text-xs font-semibold">
          {(
            [
              ["gantt", "Gantt", GanttChart],
              ["calendar", "Calendar", CalendarDays],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${view === id ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        {portfolio.map((project) => (
          <span
            key={project.id}
            data-portfolio-project={project.name}
            className="flex items-center gap-2 rounded-full border bg-card py-1 pl-2 pr-1 text-xs font-semibold"
          >
            <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name}
            {project.start ? (
              <span className="font-normal text-muted-foreground">
                {fmt(project.start)} – {fmt(project.end!)}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`Remove ${project.name}`}
              onClick={() => removeProject(project.id)}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={() => void openPicker()}
            className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="size-3.5" /> Add project
          </button>
          {picker.open ? (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 overflow-auto rounded-lg border bg-popover p-1 shadow-lg">
              {picker.loading ? (
                <p className="p-2 text-xs text-muted-foreground">Loading…</p>
              ) : null}
              {picker.error ? <p className="p-2 text-xs text-rose-600">{picker.error}</p> : null}
              {picker.list
                .filter((item) => !inScenario.has(item.id))
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void addProject(item)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    {item.name}
                  </button>
                ))}
              {!picker.loading &&
              !picker.error &&
              !picker.list.some((item) => !inScenario.has(item.id)) ? (
                <p className="p-2 text-xs text-muted-foreground">
                  Every saved project is already here.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => setPicker((current) => ({ ...current, open: false }))}
                className="mt-1 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Close
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {portfolio.some((project) => project.issue || project.unscheduled) ? (
        <div className="space-y-0.5 border-b bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {portfolio.map((project) =>
            project.issue ? (
              <p key={project.id}>
                <strong>{project.name}:</strong> {project.issue}
              </p>
            ) : project.unscheduled ? (
              <p key={project.id}>
                <strong>{project.name}:</strong> {project.unscheduled} step(s) are not scheduled in
                L4 (no duration, department not linked to L1, or a dependency) and are left off.
              </p>
            ) : null,
          )}
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="border-b px-4 py-1.5 text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {!draft.projects.length ? (
          <p className="p-8 text-sm text-muted-foreground">
            No projects yet. Add saved projects here or in L5; both pages use the same list.
          </p>
        ) : view === "gantt" ? (
          <PortfolioGantt projects={portfolio} onEdit={editTask} />
        ) : (
          <PortfolioCalendar projects={portfolio} />
        )}
      </div>
    </div>
  );
}

/**
 * A step's bar: drag to move it, drag its right edge to change its length.
 * Moves snap to whole days; the drop is saved like the same drag in L4.
 */
function DraggableBar({
  task,
  projectName,
  color,
  left,
  width,
  onEdit,
}: {
  task: PortfolioTask;
  projectName: string;
  color: string;
  left: number;
  width: number;
  onEdit: (edit: GanttEdit) => void;
}) {
  const label = useRef<HTMLSpanElement>(null);
  const begin = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    const bar = event.currentTarget;
    const resize = event.clientX > bar.getBoundingClientRect().right - 8;
    const originX = event.clientX;
    let delta = 0;
    bar.setPointerCapture(event.pointerId);
    event.preventDefault();
    const show = () => {
      if (resize) bar.style.width = `${Math.max(PX_PER_DAY, width + delta * PX_PER_DAY)}px`;
      else bar.style.transform = `translateX(${delta * PX_PER_DAY}px)`;
      if (label.current) {
        const startIso = dayIso(isoDay(task.start) + (resize ? 0 : delta));
        const days = Math.max(1, task.days + (resize ? delta : 0));
        label.current.hidden = delta === 0;
        label.current.textContent = `${fmt(startIso)} – ${fmt(dayIso(isoDay(startIso) + days - 1))} · ${days} days`;
        label.current.style.left = `${left + (resize ? 0 : delta * PX_PER_DAY)}px`;
      }
    };
    const move = (pointer: PointerEvent) => {
      delta = Math.round((pointer.clientX - originX) / PX_PER_DAY);
      if (resize) delta = Math.max(1 - task.days, delta);
      show();
    };
    const end = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", end);
      bar.removeEventListener("pointercancel", cancel);
      bar.style.transform = "";
      bar.style.width = "";
      if (label.current) label.current.hidden = true;
    };
    const cancel = () => {
      delta = 0;
      end();
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener(
      "pointerup",
      () => {
        const change = delta;
        end();
        if (!change) return;
        onEdit(
          resize
            ? { kind: "resize", days: task.days + change }
            : { kind: "move", startDay: task.startDay + change },
        );
      },
      { once: true },
    );
    bar.addEventListener("pointercancel", cancel);
  };
  return (
    <>
      <span
        role="slider"
        aria-label={`${projectName} · ${task.title}`}
        aria-valuenow={task.startDay}
        aria-valuetext={`${task.start} to ${task.end}`}
        tabIndex={0}
        data-portfolio-task={task.title}
        title={`${projectName} · ${task.title} · ${fmt(task.start)} – ${fmt(task.end)}\nDrag to move · drag the right edge to change its length`}
        onPointerDown={begin}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = event.key === "ArrowRight" ? 1 : -1;
          onEdit(
            event.shiftKey
              ? { kind: "resize", days: Math.max(1, task.days + step) }
              : { kind: "move", startDay: task.startDay + step },
          );
        }}
        className="absolute top-1.5 h-4 cursor-grab touch-none rounded-sm border-l-4 outline-none after:absolute after:inset-y-0 after:right-0 after:w-2 after:cursor-ew-resize focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        style={{ left, width, backgroundColor: color, borderLeftColor: task.phaseColor }}
      />
      <span
        ref={label}
        hidden
        className="pointer-events-none absolute top-6 z-30 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white"
      />
    </>
  );
}

type GanttGrid = { first: number; width: number; weeks: number[]; todayX: number };

function GanttRow({
  grid: { first, width, weeks, todayX },
  label,
  children,
  className = "",
  labelClassName = "",
  height,
}: {
  grid: GanttGrid;
  label: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  labelClassName?: string;
  height?: number;
}) {
  return (
    <div className={`flex border-b ${className}`} style={{ width: LABEL_WIDTH + width, height }}>
      <div
        className={`sticky left-0 z-10 flex shrink-0 items-center border-r bg-card px-3 text-xs ${labelClassName}`}
        style={{ width: LABEL_WIDTH }}
      >
        {label}
      </div>
      <div className="relative" style={{ width }}>
        {weeks.map((week) => (
          <span
            key={week}
            aria-hidden
            className="absolute inset-y-0 border-l border-border/50"
            style={{ left: (week - first) * PX_PER_DAY }}
          />
        ))}
        {todayX >= 0 && todayX <= width ? (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-emerald-500"
            style={{ left: todayX }}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
}

function PortfolioGantt({
  projects,
  onEdit,
}: {
  projects: PortfolioProject[];
  onEdit: (projectId: string, scheduleKey: string, edit: GanttEdit) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const range = portfolioRange(projects);
  if (!range) return <p className="p-8 text-sm text-muted-foreground">No project has dates yet.</p>;
  const first = isoDay(weekStart(range.start));
  const last = isoDay(range.end) + 7;
  const weeks: number[] = [];
  for (let day = first; day <= last; day += 7) weeks.push(day);
  const width = (last - first + 1) * PX_PER_DAY;
  const x = (iso: string) => (isoDay(iso) - first) * PX_PER_DAY;
  const w = (start: string, end: string) =>
    Math.max(PX_PER_DAY, (isoDay(end) - isoDay(start) + 1) * PX_PER_DAY);
  const names = new Map(projects.map((project) => [project.id, project]));
  const load = departmentLoad(projects);
  const todayX = x(todayIso());

  const grid = { first, width, weeks, todayX };
  // Milestone labels stack onto extra lines where they would overlap.
  const milestones = projects.flatMap((project) =>
    (
      [
        ["Start", project.projectStartDate],
        ["Handoff", project.handoffDate],
      ] as const
    ).flatMap(([kind, date]) => {
      if (!date) return [];
      const text = `${kind} ${fmt(date)}`;
      return [
        {
          key: `${project.id}-${kind}`,
          project,
          kind,
          date,
          text,
          x: x(date) + 3,
          width: text.length * 7.2 + 12,
        },
      ];
    }),
  );
  const milestoneLines = stackLabels(milestones);
  const milestoneHeight = Math.max(44, 8 + milestoneLines.count * MILESTONE_LINE);

  return (
    <div data-portfolio-gantt className="relative min-w-max text-foreground">
      {/* Each project's Project Start (solid) and Technical handoff (dashed), full height. */}
      {projects.flatMap((project) =>
        (
          [
            ["start", project.projectStartDate],
            ["handoff", project.handoffDate],
          ] as const
        ).flatMap(([kind, date]) =>
          date ? (
            <span
              key={`${project.id}-${kind}`}
              aria-hidden
              data-portfolio-milestone={`${project.name}:${kind}`}
              className="pointer-events-none absolute bottom-0 top-9 z-[15]"
              style={{
                left: LABEL_WIDTH + x(date),
                borderLeft: `2px ${kind === "start" ? "solid" : "dashed"} ${project.color}`,
              }}
            />
          ) : (
            []
          ),
        ),
      )}
      <div className="sticky top-0 z-20 bg-card">
        <GanttRow
          grid={grid}
          label={<span className="font-bold">Department / project / step</span>}
          className="h-9"
        >
          {weeks.map((week, index) =>
            index % 2 === 0 ? (
              <span
                key={week}
                className="absolute top-2.5 whitespace-nowrap pl-1 text-[10px] font-semibold text-muted-foreground"
                style={{ left: (week - first) * PX_PER_DAY }}
              >
                {fmt(dayIso(week))}
              </span>
            ) : null,
          )}
        </GanttRow>
      </div>

      <GanttRow
        grid={grid}
        height={milestoneHeight}
        label={
          <span className="flex flex-col leading-tight">
            <span className="font-bold uppercase tracking-wider">Milestones</span>
            <span className="text-[10px] text-muted-foreground">
              Solid: project start · dashed: Technical handoff
            </span>
          </span>
        }
      >
        {milestones.map((item) => (
          <span
            key={item.key}
            data-milestone-label={item.key}
            title={`${item.project.name} · ${item.kind === "Start" ? "Project start (Sales starts)" : "Technical handoff"} · ${fmt(item.date)}`}
            className="absolute z-[16] whitespace-nowrap rounded px-1 text-[10px] font-bold leading-5 text-white"
            style={{
              left: item.x,
              top: 4 + (milestoneLines.lines.get(item.key) ?? 0) * MILESTONE_LINE,
              backgroundColor: item.project.color,
            }}
          >
            {item.text}
          </span>
        ))}
      </GanttRow>
      <GanttRow
        grid={grid}
        label={<span className="font-bold uppercase tracking-wider">Department load</span>}
        className="h-8 bg-muted/40"
        labelClassName="bg-muted"
      />
      {load.map((department) => (
        <GanttRow
          grid={grid}
          key={department.name}
          label={department.name}
          className="h-7"
          labelClassName="font-semibold"
        >
          {[...department.weeks.entries()].map(([week, ids]) => {
            const count = ids.size;
            const tone =
              count >= 3
                ? "bg-rose-500 text-white"
                : count === 2
                  ? "bg-amber-400 text-amber-950"
                  : "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100";
            return (
              <span
                key={week}
                data-department-load={count}
                title={`Week of ${fmt(week)} · ${[...ids].map((id) => names.get(id)?.name).join(", ")}`}
                className={`absolute top-1 flex h-5 items-center justify-center rounded-sm text-[10px] font-bold ${tone}`}
                style={{ left: x(week) + 1, width: 7 * PX_PER_DAY - 2 }}
              >
                {count > 1 ? count : ""}
              </span>
            );
          })}
        </GanttRow>
      ))}

      {projects.map((project) => {
        const closed = collapsed[project.id];
        return (
          <Fragment key={project.id}>
            <GanttRow
              grid={grid}
              className="h-9 bg-muted/30"
              labelClassName="bg-muted/60"
              label={
                <button
                  type="button"
                  onClick={() => setCollapsed((current) => ({ ...current, [project.id]: !closed }))}
                  className="flex min-w-0 items-center gap-2 font-bold"
                >
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition ${closed ? "-rotate-90" : ""}`}
                  />
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <span className="truncate">{project.name}</span>
                </button>
              }
            >
              {project.phases.map((phase) => (
                <span
                  key={phase.title + phase.start}
                  title={`${phase.title} · ${fmt(phase.start)} – ${fmt(phase.end)}`}
                  className="absolute top-2 h-5 truncate rounded px-1.5 text-[10px] font-bold leading-5 text-white"
                  style={{
                    left: x(phase.start),
                    width: w(phase.start, phase.end),
                    backgroundColor: phase.color,
                  }}
                >
                  {phase.title}
                </span>
              ))}
            </GanttRow>
            {closed
              ? null
              : project.departments.map((department) => (
                  <Fragment key={department.name}>
                    <GanttRow
                      grid={grid}
                      className="h-6"
                      label={
                        <span className="pl-5 font-semibold text-muted-foreground">
                          {department.name}
                        </span>
                      }
                    />
                    {department.tasks.map((task) => (
                      <GanttRow
                        grid={grid}
                        key={task.key}
                        className="h-7"
                        label={
                          <span className="truncate pl-8" title={task.title}>
                            {task.title}
                          </span>
                        }
                      >
                        <DraggableBar
                          task={task}
                          projectName={project.name}
                          color={project.color}
                          left={x(task.start)}
                          width={w(task.start, task.end)}
                          onEdit={(edit) => onEdit(project.id, task.scheduleKey, edit)}
                        />
                      </GanttRow>
                    ))}
                  </Fragment>
                ))}
          </Fragment>
        );
      })}
    </div>
  );
}

function PortfolioCalendar({ projects }: { projects: PortfolioProject[] }) {
  const range = portfolioRange(projects);
  const [month, setMonth] = useState(() => (range?.start ?? todayIso()).slice(0, 7));
  const [year, monthIndex] = month.split("-").map(Number);
  const firstDay = Date.UTC(year, monthIndex - 1, 1) / 86_400_000;
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const lead = (new Date(firstDay * 86_400_000).getUTCDay() + 6) % 7;
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => dayIso(firstDay + i)),
  ];
  const shift = (by: number) => {
    const next = new Date(Date.UTC(year, monthIndex - 1 + by, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  const today = todayIso();

  return (
    <div data-portfolio-calendar className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="rounded-md border p-1.5 hover:bg-muted"
        >
          <ChevronLeft className="size-4" />
        </button>
        <h3 className="min-w-40 text-center text-sm font-bold">
          {monthTitle.format(new Date(firstDay * 86_400_000))}
        </h3>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          className="rounded-md border p-1.5 hover:bg-muted"
        >
          <ChevronRight className="size-4" />
        </button>
        <div className="ml-auto flex flex-wrap gap-3 text-xs">
          {projects.map((project) => (
            <span key={project.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {WEEKDAYS.map((name) => (
          <div key={name} className="bg-muted px-2 py-1 font-semibold text-muted-foreground">
            {name}
          </div>
        ))}
        {cells.map((iso, index) => {
          if (!iso) return <div key={`blank-${index}`} className="min-h-28 bg-muted/30" />;
          const tasks = tasksOn(projects, iso);
          const weekend = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7 >= 5;
          return (
            <div
              key={iso}
              data-calendar-day={iso}
              className={`min-h-28 space-y-0.5 p-1.5 ${weekend ? "bg-muted/50" : "bg-card"}`}
            >
              <div
                className={`mb-1 text-[11px] font-bold ${iso === today ? "text-emerald-600" : "text-muted-foreground"}`}
              >
                {Number(iso.slice(8))}
              </div>
              {projects.flatMap((project) => {
                const own = tasks.filter((task) => task.projectId === project.id);
                if (!own.length) return [];
                const phases = [...new Set(own.map((task) => task.phase))];
                return [
                  <div
                    key={project.id}
                    data-calendar-project={project.name}
                    title={`${project.name}\n${own.map((task) => `${task.department} · ${task.title}`).join("\n")}`}
                    className="truncate rounded px-1 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: project.color }}
                  >
                    {project.name} · {phases.join(" + ")} · {own.length} step
                    {own.length === 1 ? "" : "s"}
                  </div>,
                ];
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
