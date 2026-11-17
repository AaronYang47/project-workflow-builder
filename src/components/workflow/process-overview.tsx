"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { TopToolbar } from "./top-toolbar";
import { AuthGate } from "./auth-gate";
import { CollaborationControlOverlay } from "./collaboration-control-overlay";
import { GanttTaskCalendar, type TaskCalendarValue } from "./gantt-task-calendar";
import { ProcessCalendarButton } from "./process-calendar-settings";
import {
  CreateConditionPanel,
  EMPTY_CONDITION_DRAFT,
  type ConditionDraft,
} from "./process-overview/create-condition-panel";
import { GanttScrollControl } from "./process-overview/gantt-scroll-control";
import { GanttTaskRow, type GanttRowActions } from "./process-overview/gantt-task-row";
import { MobileScheduleList } from "./process-overview/mobile-schedule-list";
import { PhaseSummary } from "./process-overview/phase-summary";
import { TimingEditorDialog } from "./process-overview/timing-editor-dialog";
import { useGanttScroll } from "./process-overview/use-gantt-scroll";
import { useWorkflowStore } from "@/store/workflow-store";
import {
  useCollaborationStore,
  canEditCollaborativeWorkflow,
} from "@/lib/collaboration/collaboration-store";
import { buildProcessSchedule, salesHandoffTime, type ScheduleTask } from "@/lib/process-schedule";
import { buildProcessTimeline, taskSegmentBackground } from "@/lib/schedule-calendar";
import { buildGanttAxis } from "@/lib/gantt-axis";
import { planGanttPlacement } from "@/lib/gantt-placement";
import { calendarWorkSummary } from "@/lib/gantt-bar-label";
import { taskCalendarBadges } from "@/lib/calendar-badges";
import { wholeDayCondition } from "@/lib/condition-duration";
import type { Condition } from "@/types/workflow";

const ROW_GRID = "grid grid-cols-[168px_minmax(660px,1fr)] sm:grid-cols-[280px_minmax(660px,1fr)]";

/** Find a release condition by name from the toolbar search and scroll to it. */
function searchGanttTask() {
  const name = window.prompt("Find release condition");
  if (!name) return;
  Array.from(document.querySelectorAll<HTMLElement>("[data-gantt-task]"))
    .find((row) => row.dataset.ganttTask?.toLowerCase().includes(name.toLowerCase()))
    ?.scrollIntoView({ block: "center" });
}

/** L4 "Process & Gantt" page: phase strip, department Gantt chart and timing tools. */
export function ProcessOverview() {
  const file = useWorkflowStore((state) => state.file);
  const hydrated = useWorkflowStore((state) => state.hydrated);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const ensureConditionIds = useWorkflowStore((state) => state.ensureReleaseConditionIds);
  const moveCondition = useWorkflowStore((state) => state.moveNodeCondition);
  const commit = useWorkflowStore((state) => state.commit);
  const collaboration = useCollaborationStore();
  const canEdit = canEditCollaborativeWorkflow(collaboration);

  const [editingTaskKey, setEditingTaskKey] = useState<string | null>(null);
  const [mobileGanttView, setMobileGanttView] = useState<"list" | "timeline">("list");
  const [mobilePhasesOpen, setMobilePhasesOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const conditionDraft = useState<ConditionDraft>(EMPTY_CONDITION_DRAFT);
  const [taskCalendar, setTaskCalendar] = useState<TaskCalendarValue | null>(null);
  const calendarTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (hydrated && canEdit) ensureConditionIds();
  }, [hydrated, canEdit, ensureConditionIds]);

  const schedule = useMemo(() => buildProcessSchedule(file), [file]);
  const workingDaysPerWeek = schedule.workingDaysPerWeek;
  const timeline = useMemo(() => buildProcessTimeline(file, schedule), [file, schedule]);
  const handoff = useMemo(
    () => ({ ...salesHandoffTime(schedule), originDay: timeline.originDay }),
    [schedule, timeline.originDay],
  );
  const axis = buildGanttAxis(schedule, timeline, handoff);
  const { total, ticks, gridBackground, minimumTimelineWidth } = axis;
  const scroll = useGanttScroll(hydrated, [minimumTimelineWidth, createOpen, mobileGanttView]);
  const { boardRef: ganttBoardRef, beginPan, setScrollLeft } = scroll;
  const inboxCount = file.releaseConditionInbox?.length ?? 0;
  const phaseSummary = schedule.phases.filter(
    (phase) => phase.type === "phase" || /phase\s*\d+/i.test(phase.title),
  );

  // Schedule edits always read the latest store state, not this render's copy.
  const currentSchedule = () => buildProcessSchedule(useWorkflowStore.getState().file);
  const updateTask = (task: ScheduleTask, patch: Partial<Condition>) => {
    if (!canEdit) return;
    const node = useWorkflowStore
      .getState()
      .file.graph.nodes.find((item) => item.id === task.nodeId);
    if (!node) return;
    updateNode(node.id, {
      conditions: node.conditions.map((condition, index) =>
        index === task.conditionIndex
          ? wholeDayCondition({ ...condition, ...patch }, workingDaysPerWeek)
          : condition,
      ),
    });
  };
  const resizeTask = (taskKey: string, days: number) => {
    const task = currentSchedule().tasks.find((item) => item.key === taskKey);
    if (!task) return;
    const preserveWeeks =
      task.condition.durationUnit === "weeks" && days % workingDaysPerWeek === 0;
    updateTask(task, {
      duration: preserveWeeks ? days / workingDaysPerWeek : days,
      durationUnit: preserveWeeks ? "weeks" : "days",
    });
  };
  const placeTaskAt = (taskKey: string, startDay: number) => {
    if (!canEdit) return;
    const latest = currentSchedule();
    const task = latest.tasks.find((item) => item.key === taskKey);
    if (!task) return;
    const placement = planGanttPlacement(latest, task, startDay, 0);
    if (placement && placement.startDay !== task.start) updateTask(task, placement.patch);
  };
  /** Saving timing also makes the task follow the previous condition in its chapter. */
  const saveTaskTiming = (taskKey: string, durationWeeks: number) => {
    const task = currentSchedule().tasks.find((item) => item.key === taskKey);
    if (!task) return;
    const node = useWorkflowStore
      .getState()
      .file.graph.nodes.find((item) => item.id === task.nodeId);
    if (!node) return;
    const previous = node.conditions[task.conditionIndex - 1];
    const patch: Partial<Condition> = { duration: durationWeeks, durationUnit: "weeks" };
    if (previous) {
      patch.predecessor = {
        nodeId: node.id,
        conditionId: previous.id || `index-${task.conditionIndex - 1}`,
        relation: "finish",
        lagDays: 0,
      };
      patch.startOffsetDays = undefined;
    }
    updateTask(task, patch);
    setEditingTaskKey(null);
  };
  const toggleAutoSequence = (nodeId: string) => {
    const node = useWorkflowStore.getState().file.graph.nodes.find((item) => item.id === nodeId);
    if (node)
      updateNode(node.id, {
        config: { ...node.config, ganttAutoSequence: node.config.ganttAutoSequence !== true },
      });
  };

  const openTaskCalendar = (task: ScheduleTask, element: HTMLElement) => {
    if (!timeline.enabled || task.start === undefined || task.end === undefined) return;
    calendarTrigger.current = element;
    const pauses = timeline
      .taskSegments(task.start, task.end)
      .filter((part) => part.kind === "pause");
    setTaskCalendar({
      key: task.key,
      title: task.title,
      department: task.department,
      color: task.color,
      startDate: timeline.dateAt(task.start),
      endDate: timeline.dateAt(task.end - 1),
      summary: calendarWorkSummary(task.end - task.start, pauses),
      badges: taskCalendarBadges(task.department, task.condition, pauses, task.color),
      periods: timeline.nonWorkingPeriods.map((period) => ({ ...period })),
    });
  };
  const rowActions: GanttRowActions = {
    moveCondition,
    editTiming: (task) => setEditingTaskKey(task.key),
    openCalendar: openTaskCalendar,
    closeCalendar: () => setTaskCalendar(null),
    placeTask: placeTaskAt,
    resizeTask,
    previewBar: (bar, start, days) => {
      bar.style.background = taskSegmentBackground(
        timeline.taskSegments(start, start + days),
        bar.dataset.ganttColor || "#64748b",
      );
    },
  };

  const editingTask = schedule.tasks.find((task) => task.key === editingTaskKey);
  const previousCondition =
    editingTask && editingTask.conditionIndex > 0
      ? file.graph.nodes.find((node) => node.id === editingTask.nodeId)?.conditions[
          editingTask.conditionIndex - 1
        ]
      : undefined;
  const elapsedSummary =
    handoff.elapsedDays === null
      ? "Time after Sales handoff not estimated"
      : `${Number((handoff.elapsedDays / workingDaysPerWeek).toFixed(1))} ${handoff.elapsedDays === workingDaysPerWeek ? "week" : "weeks"} estimated${timeline.enabled ? " total elapsed time" : handoff.hasSalesDepartment ? " from Sales handoff" : ""}${schedule.unscheduled ? " · partial" : ""}`;
  const viewToggle = (active: boolean) =>
    `min-h-10 flex-1 rounded-lg px-3 text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : "border bg-background"}`;

  return (
    <AuthGate>
      <main
        data-mobile-gantt-view={mobileGanttView}
        className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground"
      >
        <TopToolbar
          pageLayer="L4"
          isHighLevelView={false}
          onToggleHighLevelView={() => {}}
          openPalette={() => {}}
          onPageSearch={searchGanttTask}
        />
        {hydrated && scroll.maxScroll > 1 && (
          <GanttScrollControl scroll={scroll} mobileTimeline={mobileGanttView === "timeline"} />
        )}
        <CollaborationControlOverlay />
        {createOpen && (
          <CreateConditionPanel
            canEdit={canEdit}
            workingDaysPerWeek={workingDaysPerWeek}
            draftState={conditionDraft}
            onClose={() => setCreateOpen(false)}
          />
        )}
        {!canEdit && (
          <p
            role="status"
            className="shrink-0 border-b bg-cyan-500/10 px-4 py-3 text-xs text-cyan-700 dark:text-cyan-200"
          >
            View only — another participant holds editing control. Use Take Control below to request
            access, or reclaim control when the editor is offline. Scheduling fields become editable
            after control is granted.
          </p>
        )}
        {!hydrated ? (
          <p className="p-8 text-sm text-muted-foreground">Loading process…</p>
        ) : (
          <div
            data-release-condition-scroll
            className={`flex-1 space-y-3 overflow-auto p-4 ${createOpen ? "lg:pr-[360px]" : ""}`}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Complete process system
                </p>
                <h2 className="mt-1 text-base font-bold">Process system & schedule</h2>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  aria-label="Open Create Release Condition"
                  aria-expanded={createOpen}
                  onClick={() => setCreateOpen((open) => !open)}
                  className="rounded-lg border bg-primary/10 px-3 py-2 font-semibold text-primary"
                >
                  <Plus className="mr-1 inline size-3.5" />
                  Create RC{inboxCount > 0 ? ` · ${inboxCount} unassigned` : ""}
                </button>
                <span className="rounded-lg border bg-panel px-3 py-2">
                  {schedule.phases.length} phases
                </span>
                <span className="rounded-lg border bg-panel px-3 py-2">
                  {schedule.tasks.length} release conditions
                </span>
                <ProcessCalendarButton
                  value={file.calendar}
                  canEdit={canEdit}
                  workingDays={schedule.totalDays}
                  onSave={(calendar) => {
                    if (canEdit) commit((current) => ({ ...current, calendar }));
                  }}
                />
                <span className="rounded-lg border bg-primary/10 px-3 py-2 font-semibold">
                  {elapsedSummary}
                </span>
              </div>
            </div>

            <PhaseSummary
              phases={phaseSummary}
              mobileOpen={mobilePhasesOpen}
              onToggleMobile={() => setMobilePhasesOpen((open) => !open)}
            />

            {file.calendar && !timeline.enabled && (
              <p role="status" className="rounded-md border bg-amber-500/10 p-3 text-xs">
                Calendar saved. Set all Sales durations to establish the Technical handoff and
                display dates.
              </p>
            )}

            <section
              aria-label="Department Gantt chart"
              className="overflow-hidden rounded-xl border bg-panel"
            >
              <div
                data-mobile-gantt-toggle
                className="flex gap-2 border-b p-2 sm:hidden"
                role="group"
                aria-label="Mobile Gantt view"
              >
                <button
                  type="button"
                  aria-pressed={mobileGanttView === "list"}
                  onClick={() => setMobileGanttView("list")}
                  className={viewToggle(mobileGanttView === "list")}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  aria-pressed={mobileGanttView === "timeline"}
                  onClick={() => setMobileGanttView("timeline")}
                  className={viewToggle(mobileGanttView === "timeline")}
                >
                  Timeline
                </button>
              </div>
              {schedule.unscheduled > 0 && (
                <p
                  role="status"
                  className="border-b bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300"
                >
                  {schedule.unscheduled} condition(s) are not scheduled. Set their duration, link
                  their department to L1, or resolve the dependency shown below. The estimated span
                  excludes these conditions and may increase.
                </p>
              )}
              <MobileScheduleList
                schedule={schedule}
                timeline={timeline}
                visible={mobileGanttView === "list"}
                canEdit={canEdit}
                workingDaysPerWeek={workingDaysPerWeek}
                taskTimeLabel={axis.taskTimeLabel}
                onMove={placeTaskAt}
                onEdit={rowActions.editTiming}
              />
              <div
                ref={ganttBoardRef}
                data-release-condition-board
                onDragStart={(event) => event.preventDefault()}
                onPointerDown={beginPan}
                onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
                className={`${mobileGanttView === "timeline" ? "block" : "hidden sm:block"} overflow-x-auto overscroll-x-contain data-[gantt-panning=true]:cursor-grabbing`}
              >
                <div className="relative" style={{ minWidth: 168 + minimumTimelineWidth }}>
                  <div className={`${ROW_GRID} border-b bg-muted/30 text-[10px] font-semibold`}>
                    <div className="sticky left-0 z-20 border-r bg-muted p-3">
                      Department / release condition
                    </div>
                    <div
                      data-gantt-pan-surface
                      className="relative h-10 cursor-grab touch-auto"
                      style={gridBackground}
                    >
                      {handoff.hasSalesDepartment &&
                      handoff.originDay !== null &&
                      handoff.originDay > 0 ? (
                        <span
                          className="absolute top-1 overflow-hidden px-1 text-center text-[9px] font-semibold leading-3 text-blue-800"
                          style={{ left: 0, width: `${(handoff.originDay / total) * 100}%` }}
                        >
                          Sales lead · customer qualification
                        </span>
                      ) : null}
                      {ticks.map((tick) => (
                        <span
                          key={tick}
                          className="absolute top-3 whitespace-nowrap pl-1"
                          style={{ left: `${(tick / total) * 100}%` }}
                        >
                          {axis.timeLabel(tick)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={`${ROW_GRID} border-b`}>
                    <div className="sticky left-0 z-20 border-r bg-panel p-3 text-[10px] font-semibold text-muted-foreground">
                      PHASE COVERAGE
                    </div>
                    <div
                      data-gantt-pan-surface
                      className="relative h-10 cursor-grab touch-auto"
                      style={gridBackground}
                    >
                      {schedule.phases.map((phase, index) => {
                        const range = schedule.phaseRanges[index];
                        if (range.end <= range.start) return null;
                        const left = timeline.toDisplayDay(range.start, "end");
                        const width = timeline.toDisplayDay(range.end, "end") - left;
                        return (
                          <div
                            key={phase.id}
                            title={phase.title}
                            className="absolute top-2 h-6 overflow-hidden rounded px-1 text-[9px] font-semibold leading-6 text-white"
                            style={{
                              left: `${(left / total) * 100}%`,
                              width: `${(width / total) * 100}%`,
                              background: phase.color,
                            }}
                          >
                            {phase.title}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {schedule.departments.map((department) => (
                    <div key={department.name} data-gantt-department={department.name}>
                      <h3 className="border-b border-t bg-muted text-xs font-bold">
                        <span className="sticky left-0 z-20 block w-[168px] border-r bg-muted px-3 py-1 sm:w-[280px]">
                          {department.name}
                        </span>
                      </h3>
                      {department.chapters.map((chapter) => {
                        const phase = schedule.phases[chapter.phaseIndex];
                        const phaseColor = phase?.color || "#64748b";
                        const autoSequence =
                          file.graph.nodes.find((node) => node.id === chapter.nodeId)?.config
                            .ganttAutoSequence === true;
                        return (
                          <div
                            key={chapter.nodeId}
                            data-release-condition-chapter
                            data-release-condition-drop-node-id={chapter.nodeId}
                            data-release-condition-count={chapter.tasks.length}
                            className="data-[drop-chapter=true]:bg-primary/10"
                          >
                            <div
                              data-phase-department-label
                              className={`${ROW_GRID} border-b bg-background text-[11px]`}
                            >
                              <div
                                className="sticky left-0 z-20 flex min-w-0 items-center gap-2 border-r border-l-4 bg-background px-2 py-0.5"
                                style={{ borderLeftColor: phaseColor }}
                              >
                                <span
                                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                                  style={{ backgroundColor: phaseColor }}
                                >
                                  {phase?.title || "Unlinked"}
                                </span>
                                <strong className="truncate">{department.name}</strong>
                                <span className="hidden shrink-0 text-muted-foreground sm:inline">
                                  {chapter.title}
                                </span>
                              </div>
                              <div className="flex items-center px-2">
                                {canEdit && chapter.tasks.length > 1 ? (
                                  <button
                                    type="button"
                                    aria-pressed={autoSequence}
                                    onClick={() => toggleAutoSequence(chapter.nodeId)}
                                    className="rounded border px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
                                  >
                                    Auto follow previous: {autoSequence ? "On" : "Off"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {!chapter.tasks.length && (
                              <p className="m-1 rounded border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                                Drop a release condition here
                              </p>
                            )}
                            {chapter.tasks.map((task) => (
                              <GanttTaskRow
                                key={task.key}
                                task={task}
                                schedule={schedule}
                                timeline={timeline}
                                axis={axis}
                                canEdit={canEdit}
                                workingDaysPerWeek={workingDaysPerWeek}
                                actions={rowActions}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {!schedule.tasks.length && (
                    <p className="p-6 text-sm text-muted-foreground">
                      Add release conditions to your departments to build a schedule.
                    </p>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
        {taskCalendar && (
          <GanttTaskCalendar
            key={taskCalendar.key}
            value={taskCalendar}
            onDismiss={() => setTaskCalendar(null)}
            onRestoreFocus={() => calendarTrigger.current?.focus()}
          />
        )}
        {editingTask && (
          <TimingEditorDialog
            task={editingTask}
            previousCondition={previousCondition}
            workingDaysPerWeek={workingDaysPerWeek}
            canEdit={canEdit}
            onSave={(weeks) => saveTaskTiming(editingTask.key, weeks)}
            onClose={() => setEditingTaskKey(null)}
          />
        )}
      </main>
    </AuthGate>
  );
}
