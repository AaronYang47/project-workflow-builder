import { buildProcessSchedule } from "@/lib/process-schedule";
import { buildProcessTimeline } from "@/lib/schedule-calendar";
import type { WorkflowFile } from "@/types/workflow";

/**
 * L6: several projects on one date axis. Each project keeps its own L4
 * schedule (its own Phases, departments, step order and durations); projects
 * line up only by calendar date, never by step.
 */

export type PortfolioTask = {
  key: string;
  projectId: string;
  title: string;
  chapter: string;
  department: string;
  phase: string;
  phaseColor: string;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  /** The step's key in its project's L4 schedule, for drag edits. */
  scheduleKey: string;
  /** Schedule day it starts on, and its length in days (as in L4). */
  startDay: number;
  days: number;
};

export type PortfolioPhase = { title: string; color: string; start: string; end: string };

export type PortfolioProject = {
  id: string;
  name: string;
  color: string;
  /** Why the project has no dates (no Calendar start date, nothing scheduled). */
  issue?: string;
  start?: string;
  end?: string;
  /** The day Sales starts (Calendar Project Start Date, or worked out from the handoff). */
  projectStartDate?: string;
  /** The Sales-to-Technical handoff, once every Sales step has a duration. */
  handoffDate?: string;
  phases: PortfolioPhase[];
  departments: { name: string; tasks: PortfolioTask[] }[];
  /** Steps with no duration yet, so not on the timeline. */
  unscheduled: number;
};

const DAY_MS = 86_400_000;
export const isoDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
export const dayIso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Department names match regardless of case ("Sales" and "SALES"). */
export const departmentKey = (name: string) => name.trim().toLowerCase();

export function buildPortfolioProject(
  file: WorkflowFile,
  meta: { id: string; name: string; color: string },
): PortfolioProject {
  const schedule = buildProcessSchedule(file);
  const timeline = buildProcessTimeline(file, schedule);
  const base = { ...meta, phases: [], departments: [], unscheduled: schedule.unscheduled };
  if (!timeline.enabled)
    return {
      ...base,
      issue: file.calendar?.startDate
        ? "Not on dates yet: set a Project Start Date in this project's L4 Calendar, or every Sales step's duration (to place the Technical handoff)."
        : "Not on dates yet: set a Project Start Date in this project's L4 Calendar.",
    };
  const endDate = (end: number, start: number) => timeline.dateAt(Math.max(start, end - 1));
  const phaseOf = (index: number) => schedule.phases[index];
  const departments = schedule.departments
    .map((department) => ({
      name: department.name,
      tasks: department.tasks.flatMap((task): PortfolioTask[] =>
        task.start === undefined || task.end === undefined
          ? []
          : [
              {
                key: `${meta.id}:${task.key}`,
                projectId: meta.id,
                title: task.title,
                chapter: task.chapter,
                department: department.name,
                phase: phaseOf(task.phaseIndex)?.title ?? "No Phase",
                phaseColor: phaseOf(task.phaseIndex)?.color ?? "#94a3b8",
                start: timeline.dateAt(task.start),
                end: endDate(task.end, task.start),
                scheduleKey: task.key,
                startDay: task.start,
                days: task.end - task.start,
              },
            ],
      ),
    }))
    .filter((department) => department.tasks.length);
  const phases = schedule.phases.flatMap((phase, index): PortfolioPhase[] => {
    const range = schedule.phaseRanges[index];
    if (!range || range.end <= range.start) return [];
    return [
      {
        title: phase.title,
        color: phase.color,
        start: timeline.dateAt(range.start),
        end: endDate(range.end, range.start),
      },
    ];
  });
  const tasks = departments.flatMap((department) => department.tasks);
  const dates = {
    projectStartDate: timeline.projectStartDate || undefined,
    handoffDate: timeline.handoffDate || undefined,
  };
  if (!tasks.length)
    return {
      ...base,
      ...dates,
      issue: "No step has a duration yet. Set durations in this project's L4.",
    };
  return {
    ...base,
    ...dates,
    phases,
    departments,
    start: tasks.map((task) => task.start).sort()[0],
    end: tasks
      .map((task) => task.end)
      .sort()
      .at(-1),
  };
}

/** Monday of the week holding this date. */
export function weekStart(iso: string) {
  const day = isoDay(iso);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
  return dayIso(day - weekday);
}

export type DepartmentLoad = {
  name: string;
  /** Week start (Monday) → ids of the projects with a step in that department that week. */
  weeks: Map<string, Set<string>>;
};

/** For each department, which projects use it in each week. */
export function departmentLoad(projects: PortfolioProject[]): DepartmentLoad[] {
  const byKey = new Map<string, DepartmentLoad>();
  for (const project of projects)
    for (const department of project.departments) {
      const key = departmentKey(department.name);
      const load = byKey.get(key) ?? { name: department.name, weeks: new Map() };
      byKey.set(key, load);
      for (const task of department.tasks)
        for (let week = isoDay(weekStart(task.start)); week <= isoDay(task.end); week += 7) {
          const id = dayIso(week);
          const set = load.weeks.get(id) ?? new Set<string>();
          set.add(project.id);
          load.weeks.set(id, set);
        }
    }
  return [...byKey.values()];
}

/** Steps under way on one date, across all projects. */
export function tasksOn(projects: PortfolioProject[], iso: string) {
  return projects.flatMap((project) =>
    project.departments.flatMap((department) =>
      department.tasks.filter((task) => task.start <= iso && task.end >= iso),
    ),
  );
}

/** First and last date across the projects that have dates. */
export function portfolioRange(projects: PortfolioProject[]) {
  const dated = projects.filter((project) => project.start && project.end);
  if (!dated.length) return undefined;
  return {
    start: dated
      .flatMap((project) => [
        project.start!,
        ...(project.projectStartDate ? [project.projectStartDate] : []),
      ])
      .sort()[0],
    end: dated
      .map((project) => project.end!)
      .sort()
      .at(-1)!,
  };
}
