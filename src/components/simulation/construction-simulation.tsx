"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Factory,
  FileDown,
  FlaskConical,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { AuthGate } from "@/components/workflow/auth-gate";
import { TopToolbar } from "@/components/workflow/top-toolbar";
import { Button } from "@/components/ui/button";
import {
  applySimulatedDays,
  isFactoryProductionRow,
  NEW_FACTORY_PRODUCTION_ROW,
  syncFactoryProductionRow,
  fobPickupDate,
  productionReleaseConditions,
  simulatedLineDays,
  optimizeScenario,
  scheduleNotes,
  productionPhaseOptions,
  projectScheduleDates,
  scheduleScore,
  simProjectFromWorkflow,
  simulateScenario,
  virtualSimProject,
  type SimDelivery,
  type SimFactory,
  type SimProject,
  type SimScenario,
} from "@/lib/simulation";
import { useHydrated } from "@/lib/use-hydrated";
import { useWorkflowStore } from "@/store/workflow-store";
import { canEditCollaborativeWorkflow } from "@/lib/collaboration/collaboration-store";
import { ProcessCalendarButton } from "@/components/workflow/process-calendar-settings";
import type { WorkflowFile } from "@/types/workflow";
import {
  listCloudProjects,
  loadCloudProject,
  saveCloudProject,
  type CloudProjectSummary,
} from "./cloud-projects";
import { finalCloseFobYard, setFinalCloseFobYard } from "@/lib/fob-yard";
import { NumberInput } from "./draft-inputs";
import { CALENDAR_EVENT, FactoryPlayback } from "./factory-playback";
import { DayActivity } from "./day-activity";
import { ProjectCard } from "./project-card";
import {
  deleteCloudScenario,
  fetchCloudScenarios,
  loadScenarios,
  mergeScenarios,
  newScenario,
  saveCloudScenario,
  saveScenarios,
  todayIso,
} from "./scenario-store";
import { SimulationResults } from "./simulation-results";

const inputClass = "mt-1 block min-h-9 w-full rounded-md border bg-background px-2.5 text-sm";

/** L5 page: combine projects on the one factory line and simulate the schedule. */
export function ConstructionSimulation() {
  const hydrated = useHydrated();
  const storeReady = useWorkflowStore((state) => state.hydrated);
  return (
    <AuthGate>
      <main className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-background text-foreground">
        <TopToolbar
          pageLayer="L5"
          isHighLevelView={false}
          onToggleHighLevelView={() => {}}
          openPalette={() => {}}
        />
        {hydrated && storeReady ? (
          <SimulationWorkspace />
        ) : (
          <p className="p-8 text-sm text-muted-foreground">Loading simulation…</p>
        )}
      </main>
    </AuthGate>
  );
}

function firstScenario(currentFile: WorkflowFile, currentId: string | undefined) {
  const today = todayIso();
  const saved = loadScenarios();
  if (saved.length) return { saved, draft: saved[0] };
  const draft = newScenario("Scenario A", today);
  if (currentFile.graph.nodes.length || currentFile.highLevel?.graph.nodes.length) {
    const current = simProjectFromWorkflow(currentFile, currentId ?? "current", 0, today);
    draft.projects = [currentId ? current : { ...current, source: { kind: "virtual" } }];
  }
  return { saved, draft };
}

function SimulationWorkspace() {
  const currentFile = useWorkflowStore((state) => state.file);
  const currentId = useWorkflowStore((state) => state.activeProjectId);
  const [initial] = useState(() => firstScenario(currentFile, currentId));
  const [scenarios, setScenarios] = useState<SimScenario[]>(initial.saved);
  const [draft, setDraft] = useState<SimScenario>(initial.draft);
  const [files, setFiles] = useState<Record<string, WorkflowFile>>(() =>
    currentId ? { [`cloud-${currentId}`]: currentFile } : {},
  );
  const [picker, setPicker] = useState<{
    open: boolean;
    loading: boolean;
    error?: string;
    projects: CloudProjectSummary[];
  }>({ open: false, loading: false, projects: [] });
  const [notice, setNotice] = useState("");
  const [compactView, setCompactView] = useState<"factory" | "results" | "inputs">("factory");
  const [compareOpen, setCompareOpen] = useState(false);
  // The toolbar's left-panel button hides the inputs, as it hides the node library on L1/L2.
  const inputsOpen = useWorkflowStore((state) => state.leftOpen);
  const togglePanel = useWorkflowStore((state) => state.togglePanel);

  // Load scenarios saved to the account; upload any that only this browser has.
  useEffect(() => {
    let cancelled = false;
    void fetchCloudScenarios()
      .then((cloud) => {
        if (cancelled) return;
        const { merged, localOnly } = mergeScenarios(cloud, loadScenarios());
        setScenarios(merged);
        saveScenarios(merged);
        for (const scenario of localOnly) void saveCloudScenario(scenario).catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Saved projects in a reopened scenario: load them again in the background,
  // so their Production Phase list and L4 dates are available.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const project of draft.projects) {
      if (project.source.kind !== "cloud" || files[project.id]) continue;
      if (requested.current.has(project.id)) continue;
      requested.current.add(project.id);
      const id = project.source.projectId;
      void loadCloudProject(id)
        .then((file) => setFiles((current) => ({ ...current, [project.id]: file })))
        .catch(() => undefined);
    }
  }, [draft.projects, files]);

  /** Re-reads a saved project's L4 dates, FOB yard choice and factory line inputs. */
  const refreshFromL4 = async (project: SimProject, index: number) => {
    if (project.source.kind !== "cloud") return;
    const id = project.source.projectId;
    try {
      const file = id === currentId ? currentFile : await loadCloudProject(id);
      setFiles((current) => ({ ...current, [project.id]: file }));
      const fresh = simProjectFromWorkflow(file, id, index, todayIso());
      const phaseId = project.productionPhaseId ?? fresh.productionPhaseId;
      const dates = projectScheduleDates(file, phaseId);
      updateProject(project.id, {
        productionPhaseId: phaseId,
        earliestStart: dates.earliestStart ?? project.earliestStart,
        dueDate: dates.dueDate ?? project.dueDate,
        ...(file.factoryProduction?.modules ? { modules: file.factoryProduction.modules } : {}),
        ...(file.factoryProduction?.weeksPerModule
          ? { weeksPerModule: file.factoryProduction.weeksPerModule }
          : {}),
        delivery: fresh.delivery.kind === project.delivery.kind ? project.delivery : fresh.delivery,
        siteCalendar: file.calendar,
      });
      setNotice(`${project.name} refreshed from its L4 schedule.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reload that project.");
    }
  };

  // Saved projects can't start on the line before their production Phase
  // starts in L4.
  const l4Starts = useMemo(() => {
    const starts = new Map<string, { date: string; phase: string }>();
    for (const project of draft.projects) {
      const file = files[project.id];
      if (!file || !project.productionPhaseId) continue;
      const date = projectScheduleDates(file, project.productionPhaseId).earliestStart;
      const phase = productionPhaseOptions(file).find(
        (option) => option.id === project.productionPhaseId,
      );
      if (date && phase)
        starts.set(project.id, {
          date,
          phase: [phase.title, phase.description].filter(Boolean).join(" · "),
        });
    }
    return starts;
  }, [draft.projects, files]);
  const simDraft = useMemo(
    () => ({
      ...draft,
      projects: draft.projects.map((project) => {
        const l4 = l4Starts.get(project.id)?.date;
        const earliestStart = l4 && project.earliestStart < l4 ? l4 : project.earliestStart;
        const started = { ...project, earliestStart };
        // FOB pickup follows the line start: modules × weeks per module later.
        return project.delivery.kind === "fob" && !project.delivery.pickupCustom
          ? {
              ...started,
              delivery: {
                ...project.delivery,
                pickupDate: fobPickupDate(
                  started,
                  draft.factory.targetOnLine,
                  project.delivery.batchSize,
                ),
              },
            }
          : started;
      }),
    }),
    [draft, l4Starts],
  );
  const result = useMemo(() => simulateScenario(simDraft), [simDraft]);
  // One playback day shared by the factory, the charts, the timeline and Today.
  // It starts on the first production day and resets when the scenario changes.
  const firstProductionIndex = Math.max(
    0,
    result.days.findIndex((day) => day.line.length > 0),
  );
  const playbackKey = `${draft.id}:${result.days[firstProductionIndex]?.date ?? ""}`;
  const [playback, setPlayback] = useState({ key: playbackKey, index: firstProductionIndex });
  if (playback.key !== playbackKey) setPlayback({ key: playbackKey, index: firstProductionIndex });
  const playIndex = Math.min(
    playback.key === playbackKey ? playback.index : firstProductionIndex,
    Math.max(0, result.days.length - 1),
  );
  const setPlayIndex = useCallback<Dispatch<SetStateAction<number>>>(
    (next) =>
      setPlayback((current) => ({
        key: current.key,
        index: typeof next === "function" ? next(current.index) : next,
      })),
    [],
  );
  const savedDraft = scenarios.find((item) => item.id === draft.id);

  // Changing the projects clears Auto schedule's order and split plan.
  const setProjects = (projects: SimProject[]) =>
    setDraft((current) => ({ ...current, projects, priority: undefined, sequence: undefined }));
  const updateProject = (id: string, patch: Partial<SimProject>) =>
    setProjects(
      draft.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );
  // A saved project's FOB yard lives on its L1 Final Close; L2–L4 follow it.
  const fileOf = (project: SimProject) =>
    project.source.kind !== "cloud"
      ? undefined
      : project.source.projectId === currentId
        ? currentFile
        : files[project.id];
  /** The project switched to FOB yard or Ship & install, keeping the other settings. */
  const switchDelivery = (project: SimProject, file: WorkflowFile | undefined, fob: boolean) => {
    if ((project.delivery.kind === "fob") === fob) return project;
    const parked = project.parkedDelivery;
    let delivery: SimDelivery;
    if (parked && (parked.kind === "fob") === fob) delivery = parked;
    else if (file) {
      const fresh = simProjectFromWorkflow(
        setFinalCloseFobYard(file, fob),
        project.source.kind === "cloud" ? project.source.projectId : project.id,
        0,
        todayIso(),
      ).delivery;
      delivery =
        fresh.kind === "fob"
          ? { ...fresh, pickupDate: fobPickupDate(project, draft.factory.targetOnLine) }
          : fresh;
    } else return project;
    return { ...project, delivery, parkedDelivery: project.delivery };
  };
  // L1 → L5: a changed Final Close switches the project's delivery here.
  const synced = draft.projects.map((project) => {
    const file = fileOf(project);
    const fob = file ? finalCloseFobYard(file) : undefined;
    return fob === undefined ? project : switchDelivery(project, file, fob);
  });
  if (synced.some((project, index) => project !== draft.projects[index])) setProjects(synced);
  // L5 → L1: choosing FOB yard or Ship & install sets the project's Final Close.
  const changeDelivery = (project: SimProject, picked: SimDelivery) => {
    if (
      project.source.kind === "cloud" &&
      project.source.projectId === currentId &&
      !canEditCollaborativeWorkflow()
    ) {
      setNotice(
        `${project.name}: you don't have edit control of this project, so its FOB yard can't change.`,
      );
      return;
    }
    const parked = project.parkedDelivery;
    const delivery = parked && parked.kind === picked.kind ? parked : picked;
    updateProject(project.id, { delivery, parkedDelivery: project.delivery });
    const file = fileOf(project);
    if (!file || project.source.kind !== "cloud" || finalCloseFobYard(file) === undefined) return;
    const fob = delivery.kind === "fob";
    const label = fob ? "FOB yard on" : "FOB yard off (Ship & install)";
    if (project.source.projectId === currentId) {
      const store = useWorkflowStore.getState();
      for (const node of store.file.highLevel?.graph.nodes ?? [])
        if (node.type === "end") store.updateHighLevelNode(node.id, { fobYard: fob });
      setNotice(`${project.name}: ${label} in L1 Final Close; L2–L4 follow.`);
      return;
    }
    writeSavedProject(project, (latest) => setFinalCloseFobYard(latest, fob), {
      saved: `${project.name}: ${label} saved to its L1 Final Close; L2–L4 follow.`,
      failed: "could not save FOB yard to the project",
    });
  };
  /**
   * Changes a saved project that isn't open in the editor: shows the change at
   * once, then applies it to the latest saved copy and saves that.
   */
  const writeSavedProject = (
    project: SimProject,
    change: (file: WorkflowFile) => WorkflowFile,
    messages: { saved: string; failed: string },
  ) => {
    if (project.source.kind !== "cloud") return;
    const id = project.source.projectId;
    const before = files[project.id];
    if (before) setFiles((current) => ({ ...current, [project.id]: change(before) }));
    void loadCloudProject(id)
      .then((latest) => {
        const next = change(latest);
        return saveCloudProject(id, next).then(() => {
          setFiles((current) => ({ ...current, [project.id]: next }));
          setNotice(messages.saved);
        });
      })
      .catch((error: unknown) => {
        if (before) setFiles((current) => ({ ...current, [project.id]: before }));
        setNotice(
          `${project.name}: ${messages.failed} (${error instanceof Error ? error.message : "error"}).`,
        );
      });
  };
  const lineDaysFor = (project: SimProject) => {
    const row = result.projects.find((item) => item.projectId === project.id);
    return row ? simulatedLineDays(row) : undefined;
  };
  // L5 → L4: each saved project's Factory Production row follows the simulation
  // (its line days and start timing), and goes away when no Department is chosen.
  const factoryRowChanges = useMemo(
    () =>
      draft.projects.flatMap((project) => {
        if (project.source.kind !== "cloud") return [];
        const file = project.source.projectId === currentId ? currentFile : files[project.id];
        if (!file) return [];
        const row = result.projects.find((item) => item.projectId === project.id);
        const days = row ? simulatedLineDays(row) : undefined;
        const scenarioName = draft.name || "Scenario";
        const next = syncFactoryProductionRow(file, project.l4Target, days, scenarioName);
        return next === file
          ? []
          : [
              {
                project,
                file,
                next,
                days,
                scenarioName,
                current: project.source.projectId === currentId,
              },
            ];
      }),
    [draft.projects, draft.name, files, currentFile, currentId, result.projects],
  );
  useEffect(() => {
    if (!factoryRowChanges.length) return;
    const timer = window.setTimeout(() => {
      for (const change of factoryRowChanges) {
        const { project, file, next, days, scenarioName } = change;
        const target = project.l4Target;
        // A new row: point the project at the row it creates.
        if (target?.conditionId === NEW_FACTORY_PRODUCTION_ROW) {
          const id = next.graph.nodes
            .find((item) => item.id === target.nodeId)
            ?.conditions.find(isFactoryProductionRow)?.id;
          if (id) updateProject(project.id, { l4Target: { ...target, conditionId: id } });
        }
        if (change.current) {
          if (!canEditCollaborativeWorkflow()) continue;
          const store = useWorkflowStore.getState();
          for (const node of next.graph.nodes) {
            const before = file.graph.nodes.find((item) => item.id === node.id);
            if (before && before.conditions !== node.conditions)
              store.updateNode(node.id, { conditions: node.conditions });
          }
        } else {
          writeSavedProject(
            project,
            (latest) => syncFactoryProductionRow(latest, target, days, scenarioName),
            {
              saved: `${project.name}: Factory Production in L4 updated and saved.`,
              failed: "could not update Factory Production in L4",
            },
          );
        }
      }
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the wanted rows change
  }, [factoryRowChanges]);
  /** L5 → L4: the simulated line days become the chosen release condition's duration. */
  const writeLineDaysToL4 = (project: SimProject, days: number) => {
    const target = project.l4Target;
    if (!target || project.source.kind !== "cloud") return;
    const scenarioName = draft.name || "Scenario";
    const change = (file: WorkflowFile) => applySimulatedDays(file, target, days, scenarioName);
    // A new Factory Production row: point the project at the row it creates.
    const follow = (next: WorkflowFile) => {
      if (target.conditionId !== NEW_FACTORY_PRODUCTION_ROW) return;
      const id = next.graph.nodes.find((item) => item.id === target.nodeId)?.conditions.at(-1)?.id;
      if (id) updateProject(project.id, { l4Target: { ...target, conditionId: id } });
    };
    if (project.source.projectId === currentId) {
      if (!canEditCollaborativeWorkflow()) {
        setNotice(
          `${project.name}: you don't have edit control of this project, so L4 can't change.`,
        );
        return;
      }
      const store = useWorkflowStore.getState();
      const next = change(store.file);
      const node = next.graph.nodes.find((item) => item.id === target.nodeId);
      if (!node || next === store.file) return;
      store.updateNode(node.id, { conditions: node.conditions });
      follow(next);
      setNotice(`${project.name}: ${days} days written to L4.`);
      return;
    }
    const file = files[project.id];
    if (file) follow(change(file));
    writeSavedProject(project, change, {
      saved: `${project.name}: ${days} days written to L4 and saved.`,
      failed: "could not write the days to L4",
    });
  };
  const updateFactory = (patch: Partial<SimFactory>) =>
    setDraft((current) => ({ ...current, factory: { ...current.factory, ...patch } }));
  const calendarStart = result.days[0]?.date ?? todayIso();
  const calendar = draft.factory.calendar ?? { startDate: calendarStart, shutdowns: [] };

  const openPicker = async () => {
    setPicker({ open: true, loading: true, projects: [] });
    try {
      setPicker({ open: true, loading: false, projects: await listCloudProjects() });
    } catch (error) {
      setPicker({
        open: true,
        loading: false,
        projects: [],
        error:
          error instanceof Error
            ? `${error.message} Sign in and save projects to the cloud to add them here.`
            : "Could not load saved projects.",
      });
    }
  };
  const addCloudProject = async (summary: CloudProjectSummary) => {
    try {
      const file = await loadCloudProject(summary.id);
      const project = simProjectFromWorkflow(file, summary.id, draft.projects.length, todayIso());
      setFiles((current) => ({ ...current, [project.id]: file }));
      setProjects([...draft.projects, project]);
      setNotice(`${project.name} added. Set its modules and weeks per module.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load that project.");
    }
  };

  // Every change is saved: to this browser at once (a backup when offline),
  // then to the account.
  const [saveState, setSaveState] = useState<"saving" | "saved" | "local">("saved");
  const draftJson = JSON.stringify(draft);
  useEffect(() => {
    if (JSON.stringify(scenarios.find((item) => item.id === draft.id)) === draftJson) return;
    const timer = window.setTimeout(() => {
      const next = scenarios.some((item) => item.id === draft.id)
        ? scenarios.map((item) => (item.id === draft.id ? draft : item))
        : [draft, ...scenarios];
      setScenarios(next);
      saveScenarios(next);
      setSaveState("saving");
      void saveCloudScenario(draft)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("local"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, draftJson, scenarios]);

  return (
    <div
      data-inputs-open={inputsOpen}
      className={`relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden xl:grid-rows-[minmax(0,1fr)] ${inputsOpen ? "xl:grid-cols-[clamp(17rem,21vw,24rem)_minmax(0,1fr)]" : "xl:grid-cols-[minmax(0,1fr)]"}`}
    >
      <nav aria-label="Simulation view" className="flex gap-1 border-b p-1 xl:hidden">
        {(["factory", "results", "inputs"] as const).map((view) => (
          <Button
            key={view}
            size="sm"
            variant={compactView === view ? "default" : "ghost"}
            aria-pressed={compactView === view}
            onClick={() => setCompactView(view)}
            className="flex-1 capitalize"
          >
            {view}
          </Button>
        ))}
      </nav>
      {inputsOpen ? null : (
        <button
          type="button"
          onClick={() => togglePanel("left")}
          className="panel-edge-toggle left-0 z-30 hidden rounded-l-none border-l-0 xl:flex"
          aria-label="Open simulation inputs"
          title="Show inputs"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
      <div
        className={`relative min-h-0 min-w-0 ${compactView === "inputs" ? "block" : "hidden"} ${inputsOpen ? "xl:block" : "xl:hidden"}`}
      >
        <aside
          aria-label="Simulation inputs"
          className="h-full space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-2 xl:border-r"
        >
          <section aria-label="Scenario" className="rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2">
              <select
                aria-label="Saved scenarios"
                value={draft.id}
                onChange={(event) => {
                  const picked = scenarios.find((item) => item.id === event.target.value);
                  if (picked) setDraft(picked);
                }}
                className="min-h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
              >
                {!savedDraft ? <option value={draft.id}>{draft.name}</option> : null}
                {scenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft(newScenario(`Scenario ${scenarios.length + 1}`, todayIso()))
                }
              >
                New
              </Button>
            </div>
            <input
              aria-label="Scenario name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={inputClass}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p data-scenario-save-state className="mr-auto text-[11px] text-muted-foreground">
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "local"
                    ? "Saved in this browser only (the cloud is not reachable)"
                    : "Saved automatically"}
              </p>
              {savedDraft ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete scenario"
                  onClick={() => {
                    const next = scenarios.filter((item) => item.id !== draft.id);
                    setScenarios(next);
                    saveScenarios(next);
                    void deleteCloudScenario(draft.id).catch(() => undefined);
                    setNotice(`Deleted “${draft.name}”.`);
                    // Show another scenario (or a fresh one) so the deleted one isn't saved again.
                    setDraft(next[0] ?? newScenario("Scenario A", todayIso()));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </section>

          <section aria-label="Factory" className="rounded-lg border bg-background p-3">
            <h2 className="flex items-center gap-1.5 text-sm font-bold">
              <Factory className="size-4" /> Factory
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              One line, about {draft.factory.targetOnLine} modules on it, never more than{" "}
              {draft.factory.normalMax} when scheduling. It moves at the pace of its slowest module.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block text-[11px] font-semibold text-muted-foreground">
                Yard holds (modules)
                <NumberInput
                  label="Yard holds (modules)"
                  value={draft.factory.yardCapacity}
                  min={1}
                  integer
                  onCommit={(yardCapacity) => updateFactory({ yardCapacity })}
                  className={inputClass}
                />
              </label>
              <label className="block text-[11px] font-semibold text-muted-foreground">
                Install crews
                <NumberInput
                  label="Install crews"
                  value={draft.factory.installCrews}
                  min={0}
                  integer
                  onCommit={(installCrews) => updateFactory({ installCrews })}
                  className={inputClass}
                />
              </label>
            </div>
            <fieldset className="mt-2 space-y-1 text-xs">
              <legend className="text-[11px] font-semibold text-muted-foreground">
                Factory calendar
              </legend>
              {(
                [
                  ["workWeek", "Work Monday–Thursday (Friday–Sunday off)"],
                  ["holidayRegion", "Ontario statutory holidays off"],
                  ["automaticShutdowns", "Summer and winter shutdowns"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      key === "workWeek"
                        ? calendar.workWeek === "mon-thu"
                        : key === "holidayRegion"
                          ? calendar.holidayRegion === "CA-ON"
                          : calendar.automaticShutdowns === true
                    }
                    onChange={(event) => {
                      const on = event.target.checked;
                      const next = { ...calendar };
                      if (key === "workWeek") {
                        if (on) next.workWeek = "mon-thu";
                        else delete next.workWeek;
                      } else if (key === "holidayRegion") {
                        if (on) next.holidayRegion = "CA-ON";
                        else delete next.holidayRegion;
                      } else next.automaticShutdowns = on;
                      updateFactory({ calendar: next });
                    }}
                  />
                  {label}
                </label>
              ))}
              <div className="pt-1 text-xs">
                <ProcessCalendarButton
                  mode="factory"
                  value={{ ...calendar, startDate: calendarStart }}
                  canEdit
                  workingDays={result.days.length}
                  onSave={(saved) =>
                    saved &&
                    updateFactory({
                      calendar: { ...saved, startDate: calendarStart },
                    })
                  }
                />
              </div>
            </fieldset>
          </section>

          <section aria-label="Projects" className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto text-sm font-bold">Projects · loading order</h2>
              <Button size="sm" variant="outline" onClick={() => void openPicker()}>
                <Cloud className="size-3.5" /> Add saved
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setProjects([
                    ...draft.projects,
                    virtualSimProject(draft.projects.length, calendarStart),
                  ])
                }
              >
                <FlaskConical className="size-3.5" /> Add virtual
              </Button>
            </div>
            {draft.sequence?.length ? (
              <div
                data-split-plan
                className="flex flex-wrap items-center gap-1 rounded-md border border-dashed bg-muted/40 px-2 py-1 text-[11px]"
              >
                <span className="font-semibold">Split plan (Auto schedule):</span>
                {draft.sequence.map((block, index) => {
                  const project = draft.projects.find((item) => item.id === block.projectId);
                  return (
                    <span key={index} className="flex items-center gap-1">
                      {index ? <span className="text-muted-foreground">→</span> : null}
                      <i className="size-2 rounded-sm" style={{ background: project?.color }} />
                      {project?.name ?? block.projectId} ×{block.modules}
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, sequence: undefined }))}
                  className="ml-auto rounded px-1.5 font-semibold text-primary hover:bg-muted"
                >
                  Clear
                </button>
              </div>
            ) : null}
            {picker.open ? (
              <div
                role="dialog"
                aria-label="Saved projects"
                className="rounded-lg border bg-background p-2"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-xs">Saved projects</strong>
                  <button
                    type="button"
                    aria-label="Close saved projects"
                    onClick={() => setPicker({ ...picker, open: false })}
                    className="rounded p-1 hover:bg-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                {picker.loading ? (
                  <p className="p-2 text-xs text-muted-foreground">Loading…</p>
                ) : picker.error ? (
                  <p className="p-2 text-xs text-red-600">{picker.error}</p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto">
                    {picker.projects.map((item) => {
                      const added = draft.projects.some(
                        (project) => project.id === `cloud-${item.id}`,
                      );
                      return (
                        <li key={item.id} className="flex items-center gap-2 px-1 py-1 text-xs">
                          <span className="min-w-0 flex-1 truncate">{item.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={added}
                            onClick={() => void addCloudProject(item)}
                          >
                            {added ? "Added" : "Add"}
                          </Button>
                        </li>
                      );
                    })}
                    {!picker.projects.length ? (
                      <li className="p-2 text-xs text-muted-foreground">No saved projects yet.</li>
                    ) : null}
                  </ul>
                )}
              </div>
            ) : null}
            {draft.projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                position={index}
                count={draft.projects.length}
                phaseOptions={
                  files[project.id] ? productionPhaseOptions(files[project.id]) : undefined
                }
                l4Start={l4Starts.get(project.id)}
                lineSlots={draft.factory.targetOnLine}
                releaseConditions={
                  fileOf(project)
                    ? productionReleaseConditions(fileOf(project)!, project.productionPhaseId)
                    : undefined
                }
                lineDays={lineDaysFor(project)}
                onWriteL4={() => {
                  const days = lineDaysFor(project);
                  if (days !== undefined) writeLineDaysToL4(project, days);
                }}
                lateDays={result.projects.find((item) => item.projectId === project.id)?.lateDays}
                onChange={(patch) => {
                  const { delivery, ...rest } = patch;
                  if (delivery && delivery.kind !== project.delivery.kind) {
                    if (Object.keys(rest).length) updateProject(project.id, rest);
                    changeDelivery(project, delivery);
                  } else updateProject(project.id, patch);
                }}
                onPhaseChange={(productionPhaseId) => {
                  const dates = projectScheduleDates(files[project.id], productionPhaseId);
                  updateProject(project.id, {
                    productionPhaseId,
                    ...(dates.earliestStart ? { earliestStart: dates.earliestStart } : {}),
                  });
                }}
                onMove={(direction) => {
                  const next = [...draft.projects];
                  const [moved] = next.splice(index, 1);
                  next.splice(index + direction, 0, moved);
                  setProjects(next);
                }}
                onRemove={() =>
                  setProjects(draft.projects.filter((item) => item.id !== project.id))
                }
                onRefresh={
                  project.source.kind === "cloud"
                    ? () => void refreshFromL4(project, index)
                    : undefined
                }
              />
            ))}
          </section>
        </aside>
        <button
          type="button"
          onClick={() => togglePanel("left")}
          className="panel-edge-toggle -right-3 z-30 hidden xl:flex"
          aria-label="Collapse simulation inputs"
          title="Hide inputs"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <section
        aria-label="Simulation results"
        className={`min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-2 ${compactView === "inputs" ? "hidden" : "flex"} xl:flex`}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <h1 className="mr-auto text-base font-bold">Construction Simulation</h1>
          <Button
            size="sm"
            onClick={() => {
              const best = optimizeScenario({ ...simDraft, sequence: undefined });
              const byId = new Map(draft.projects.map((project) => [project.id, project]));
              // Keep the split plan only when it is more than one run per project.
              const plan = best.sequence.length > draft.projects.length ? best.sequence : undefined;
              setDraft((current) => ({
                ...current,
                projects: best.priority.map((id) => byId.get(id)!).filter(Boolean),
                priority: undefined,
                sequence: plan,
              }));
              const late = best.projects.filter(
                (project) => !project.finished || project.lateDays > 0,
              ).length;
              setNotice(
                [
                  late
                    ? `Best order found, but ${late} project${late === 1 ? " is" : "s are"} still late.`
                    : "Best order found: every project is on time.",
                  ...scheduleNotes(simDraft, best),
                ].join(" "),
              );
            }}
            disabled={draft.projects.length < 1}
          >
            <Sparkles className="size-4" /> Auto schedule
          </Button>
          {scenarios.length > 1 ? (
            <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
              Compare
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={!result.days.length}
            onClick={async () => {
              // The calendar lives in a popup: open it to capture it, then close it.
              const toggleCalendar = (open: boolean) =>
                window.dispatchEvent(new CustomEvent(CALENDAR_EVENT, { detail: { open } }));
              toggleCalendar(true);
              await new Promise((resolve) => window.setTimeout(resolve, 400));
              const sections = [
                document.querySelector<HTMLElement>("[data-simulation-results]"),
                document.querySelector<HTMLElement>("[data-production-calendar]"),
              ].filter((item): item is HTMLElement => Boolean(item));
              try {
                const { exportSimulationPdf } = await import("./export-simulation-pdf");
                await exportSimulationPdf(draft.name, sections);
                setNotice("PDF exported.");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "Could not export the PDF.");
              } finally {
                toggleCalendar(false);
              }
            }}
          >
            <FileDown className="size-4" /> Export PDF
          </Button>
        </div>
        {notice ? (
          <p
            role="status"
            data-sim-notice
            className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs"
          >
            {notice}
          </p>
        ) : null}
        <div
          className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-2 ${result.days.length ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" : ""}`}
        >
          <div
            className={`min-h-0 min-w-0 flex-col gap-2 ${compactView === "results" || !result.days.length ? "flex" : "hidden"} xl:flex`}
          >
            <SimulationResults
              result={result}
              projects={draft.projects}
              factory={draft.factory}
              currentIndex={playIndex}
              onSelectDay={setPlayIndex}
            />
            <DayActivity result={result} projects={draft.projects} index={playIndex} />
          </div>
          {result.days.length ? (
            <div
              className={`min-h-0 min-w-0 flex-col ${compactView === "factory" ? "flex" : "hidden"} xl:flex`}
            >
              <FactoryPlayback
                key={playbackKey}
                result={result}
                projects={draft.projects}
                factory={draft.factory}
                index={playIndex}
                setIndex={setPlayIndex}
              />
            </div>
          ) : null}
        </div>
        <Dialog.Root open={compareOpen} onOpenChange={setCompareOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="liquid-glass-overlay fixed inset-0 z-[100]" />
            <Dialog.Content className="liquid-glass-panel fixed left-1/2 top-1/2 z-[101] max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border p-3">
              <div className="flex items-center justify-between px-2">
                <Dialog.Title className="text-sm font-bold">Compare saved scenarios</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Completion dates and late projects for saved scenarios.
                </Dialog.Description>
                <Dialog.Close
                  aria-label="Close comparison"
                  className="rounded-md p-2 hover:bg-muted"
                >
                  <X className="size-4" />
                </Dialog.Close>
              </div>
              <ScenarioComparison scenarios={scenarios} />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </section>
    </div>
  );
}

function ScenarioComparison({ scenarios }: { scenarios: SimScenario[] }) {
  const rows = scenarios.map((scenario) => {
    const result = simulateScenario(scenario);
    const [unfinished] = scheduleScore(result);
    return {
      scenario,
      unfinished,
      late: result.projects.filter((project) => project.lateDays > 0).length,
      totalLate: result.projects.reduce((sum, project) => sum + project.lateDays, 0),
      end: result.makespanEnd ?? "—",
    };
  });
  return (
    <section aria-label="Compare scenarios" className="rounded-lg border bg-background p-3">
      <table className="mt-2 w-full text-left text-xs">
        <thead className="text-[10px] uppercase text-muted-foreground">
          <tr>
            <th className="py-1">Scenario</th>
            <th>Projects</th>
            <th>Late</th>
            <th>Late days</th>
            <th>All done</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.scenario.id}>
              <td className="py-1 font-semibold">{row.scenario.name}</td>
              <td>{row.scenario.projects.length}</td>
              <td className={row.late ? "text-red-600" : ""}>{row.late}</td>
              <td>{row.totalLate}</td>
              <td>{row.unfinished ? "Does not finish" : row.end}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
