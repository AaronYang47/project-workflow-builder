"use client";

import { useMemo, useState } from "react";
import { Cloud, Factory, FlaskConical, Save, Sparkles, Trash2, X } from "lucide-react";
import { AuthGate } from "@/components/workflow/auth-gate";
import { TopToolbar } from "@/components/workflow/top-toolbar";
import { Button } from "@/components/ui/button";
import {
  optimizeScenario,
  productionPhaseOptions,
  projectScheduleDates,
  scheduleScore,
  simProjectFromWorkflow,
  simulateScenario,
  virtualSimProject,
  type SimFactory,
  type SimProject,
  type SimScenario,
} from "@/lib/simulation";
import { useHydrated } from "@/lib/use-hydrated";
import { useWorkflowStore } from "@/store/workflow-store";
import type { WorkflowFile } from "@/types/workflow";
import { listCloudProjects, loadCloudProject, type CloudProjectSummary } from "./cloud-projects";
import { FactoryPlayback } from "./factory-playback";
import { ProjectCard } from "./project-card";
import { loadScenarios, newScenario, saveScenarios, todayIso } from "./scenario-store";
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

  const result = useMemo(() => simulateScenario(draft), [draft]);
  const savedDraft = scenarios.find((item) => item.id === draft.id);
  const unsaved = JSON.stringify(savedDraft) !== JSON.stringify(draft);

  const setProjects = (projects: SimProject[]) =>
    setDraft((current) => ({ ...current, projects, priority: undefined }));
  const updateProject = (id: string, patch: Partial<SimProject>) =>
    setProjects(
      draft.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
    );
  const updateFactory = (patch: Partial<SimFactory>) =>
    setDraft((current) => ({ ...current, factory: { ...current.factory, ...patch } }));
  const calendar = draft.factory.calendar ?? { startDate: draft.factory.startDate, shutdowns: [] };

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

  const save = (asNew: boolean) => {
    const scenario = asNew
      ? { ...draft, id: `scenario-${Date.now().toString(36)}`, name: `${draft.name} (copy)` }
      : draft;
    const next = [scenario, ...scenarios.filter((item) => item.id !== scenario.id)];
    setScenarios(next);
    setDraft(scenario);
    setNotice(
      saveScenarios(next)
        ? `Saved “${scenario.name}” in this browser.`
        : "This browser would not save the scenario.",
    );
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[24rem_1fr] lg:overflow-hidden">
      <aside
        aria-label="Simulation inputs"
        className="space-y-3 border-b bg-muted/20 p-3 lg:overflow-y-auto lg:border-b-0 lg:border-r"
      >
        <section aria-label="Scenario" className="rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <select
              aria-label="Saved scenarios"
              value={savedDraft ? draft.id : ""}
              onChange={(event) => {
                const picked = scenarios.find((item) => item.id === event.target.value);
                if (picked) setDraft(picked);
              }}
              className="min-h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
            >
              {!savedDraft ? <option value="">Unsaved scenario</option> : null}
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft(newScenario(`Scenario ${scenarios.length + 1}`, todayIso()))}
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
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => save(false)} disabled={!unsaved}>
              <Save className="size-3.5" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => save(true)}>
              Save as new
            </Button>
            {savedDraft ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete scenario"
                onClick={() => {
                  const next = scenarios.filter((item) => item.id !== draft.id);
                  setScenarios(next);
                  saveScenarios(next);
                  setNotice(`Deleted “${draft.name}”.`);
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
              Simulation start
              <input
                type="date"
                aria-label="Simulation start"
                value={draft.factory.startDate}
                onChange={(event) =>
                  event.target.value && updateFactory({ startDate: event.target.value })
                }
                className={inputClass}
              />
            </label>
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Yard holds (modules)
              <input
                type="number"
                min={1}
                aria-label="Yard holds (modules)"
                value={draft.factory.yardCapacity}
                onChange={(event) =>
                  updateFactory({ yardCapacity: Math.max(1, Number(event.target.value) || 1) })
                }
                className={inputClass}
              />
            </label>
            <label className="block text-[11px] font-semibold text-muted-foreground">
              Install crews
              <input
                type="number"
                min={0}
                aria-label="Install crews"
                value={draft.factory.installCrews}
                onChange={(event) =>
                  updateFactory({ installCrews: Math.max(0, Number(event.target.value) || 0) })
                }
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
                  virtualSimProject(draft.projects.length, draft.factory.startDate),
                ])
              }
            >
              <FlaskConical className="size-3.5" /> Add virtual
            </Button>
          </div>
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
              lateDays={result.projects.find((item) => item.projectId === project.id)?.lateDays}
              onChange={(patch) => updateProject(project.id, patch)}
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
              onRemove={() => setProjects(draft.projects.filter((item) => item.id !== project.id))}
            />
          ))}
        </section>
      </aside>

      <section aria-label="Simulation results" className="min-w-0 space-y-3 p-3 lg:overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-base font-bold">Construction Simulation</h1>
          <Button
            onClick={() => {
              const best = optimizeScenario(draft);
              const byId = new Map(draft.projects.map((project) => [project.id, project]));
              setProjects(best.priority.map((id) => byId.get(id)!).filter(Boolean));
              const late = best.projects.filter((project) => project.lateDays > 0).length;
              setNotice(
                late
                  ? `Best order found, but ${late} project${late === 1 ? " is" : "s are"} still late.`
                  : "Best order found: every project is on time.",
              );
            }}
            disabled={draft.projects.length < 1}
          >
            <Sparkles className="size-4" /> Auto schedule
          </Button>
        </div>
        {notice ? (
          <p role="status" data-sim-notice className="rounded-md bg-muted px-3 py-2 text-xs">
            {notice}
          </p>
        ) : null}
        {result.days.length ? (
          <FactoryPlayback
            key={`${draft.id}:${result.days.find((day) => day.line.length)?.date ?? ""}`}
            result={result}
            projects={draft.projects}
            factory={draft.factory}
          />
        ) : null}
        <SimulationResults result={result} projects={draft.projects} factory={draft.factory} />
        {scenarios.length > 1 ? <ScenarioComparison scenarios={scenarios} /> : null}
      </section>
    </div>
  );
}

function ScenarioComparison({ scenarios }: { scenarios: SimScenario[] }) {
  const rows = scenarios.map((scenario) => {
    const result = simulateScenario(scenario);
    const [unfinished, totalLate] = scheduleScore(result);
    return {
      scenario,
      unfinished,
      totalLate,
      late: result.projects.filter((project) => project.lateDays > 0).length,
      end: result.makespanEnd ?? "—",
    };
  });
  return (
    <section aria-label="Compare scenarios" className="rounded-lg border bg-background p-3">
      <h3 className="text-xs font-bold">Compare saved scenarios</h3>
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
