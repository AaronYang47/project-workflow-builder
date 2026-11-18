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

async function cloudRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Cloud request failed.");
  return body;
}

/** Scenarios saved to the signed-in user's account. */
export async function fetchCloudScenarios() {
  const { scenarios } = await cloudRequest<{ scenarios: SimScenario[] }>(
    "/api/simulation-scenarios",
  );
  return scenarios.filter((item) => item && typeof item.id === "string");
}

export const saveCloudScenario = (scenario: SimScenario) =>
  cloudRequest("/api/simulation-scenarios", {
    method: "PUT",
    body: JSON.stringify({ scenario }),
  });

export const deleteCloudScenario = (id: string) =>
  cloudRequest(`/api/simulation-scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Cloud scenarios win; scenarios only in this browser are kept (and uploaded by the caller). */
export function mergeScenarios(cloud: SimScenario[], local: SimScenario[]) {
  const cloudIds = new Set(cloud.map((item) => item.id));
  const localOnly = local.filter((item) => !cloudIds.has(item.id));
  return { merged: [...cloud, ...localOnly], localOnly };
}
