import type { SimFactory, SimScenario } from "@/lib/simulation";

const STORAGE_KEY = "construction-simulation:scenarios:v1";

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function defaultFactory(today: string): SimFactory {
  return {
    targetOnLine: 18,
    normalMax: 19,
    crowdedMax: 23,
    yardCapacity: 24,
    installCrews: 2,
    startDate: today,
    calendar: {
      startDate: today,
      shutdowns: [],
      automaticShutdowns: true,
      workWeek: "mon-thu",
      holidayRegion: "CA-ON",
    },
  };
}

export function newScenario(name: string, today: string): SimScenario {
  return {
    id: `scenario-${Date.now().toString(36)}`,
    name,
    factory: defaultFactory(today),
    projects: [],
  };
}

/** Saved scenarios live in this browser. Reads never throw. */
export function loadScenarios(): SimScenario[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is SimScenario =>
            Boolean(item) && typeof item.id === "string" && Array.isArray(item.projects),
        )
      : [];
  } catch {
    return [];
  }
}

export function saveScenarios(scenarios: SimScenario[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
    return true;
  } catch {
    return false;
  }
}
