import { useWorkflowStore } from "@/store/workflow-store";
import type { WorkflowFile } from "@/types/workflow";

/**
 * Reports what people do in the app to the permanent audit log: visits and
 * time on site, page views, every button / menu / link click by its label,
 * which fields were changed (never what was typed), app actions such as
 * exports, project edits as counts, and errors. The server adds who, from
 * where and on what device.
 */

type ActivityEvent = {
  ts: string;
  category: string;
  action: string;
  page: string;
  details?: Record<string, unknown>;
};

const ENDPOINT = "/api/audit/events";
const FLUSH_MS = 5000;
const HEARTBEAT_MS = 60_000;
const MAX_QUEUE = 40;

let started = false;
let queue: ActivityEvent[] = [];
let sessionId = "";
let activeMs = 0;
let visibleSince: number | null = null;
const visitStarted = Date.now();

const page = () => `${location.pathname}${location.search}`;
const clip = (value: string | null | undefined, max = 120) =>
  (value || "").replace(/\s+/g, " ").trim().slice(0, max);

/** Only the live site reports activity; local development and tests stay quiet. */
function trackingEnabled() {
  try {
    if (localStorage.getItem("audit:force") === "1") return true;
  } catch {
    // Storage can be blocked; fall back to the address check.
  }
  return !["localhost", "127.0.0.1", "::1", "[::1]"].includes(location.hostname);
}

function clientFacts() {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string; mobile?: boolean };
  };
  return {
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    pixelRatio: devicePixelRatio,
    language: nav.language,
    languages: nav.languages?.slice(0, 5).join(","),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: nav.userAgentData?.platform || nav.platform,
    mobile: nav.userAgentData?.mobile,
    cpuCores: nav.hardwareConcurrency,
    memoryGb: nav.deviceMemory,
    touchPoints: nav.maxTouchPoints,
    colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
  };
}

function record(category: string, action: string, details?: Record<string, unknown>) {
  queue.push({ ts: new Date().toISOString(), category, action, page: page(), details });
  if (queue.length >= MAX_QUEUE) flush();
}

function flush(leaving = false) {
  if (!queue.length) return;
  const body = JSON.stringify({ sessionId, client: clientFacts(), events: queue.splice(0, 50) });
  if (leaving && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" })))
    return;
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
    credentials: "same-origin",
  }).catch(() => undefined);
  if (queue.length) flush(leaving);
}

function settleActiveTime() {
  if (visibleSince !== null) {
    activeMs += Date.now() - visibleSince;
    visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  }
}

/** The words a person would use for what they clicked: its label, title or text. */
function controlLabel(element: HTMLElement) {
  const labelled = element
    .getAttribute("aria-labelledby")
    ?.split(" ")
    .map((id) => document.getElementById(id)?.textContent)
    .join(" ");
  return clip(
    element.getAttribute("aria-label") ||
      labelled ||
      element.getAttribute("title") ||
      element.innerText ||
      element.getAttribute("name") ||
      element.getAttribute("placeholder") ||
      element.id ||
      element.tagName.toLowerCase(),
  );
}

function onClick(event: MouseEvent) {
  const target =
    event.target instanceof HTMLElement || event.target instanceof SVGElement
      ? event.target.closest<HTMLElement>(
          "button, a, [role=button], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=option], [role=switch], [role=checkbox], summary, input[type=checkbox], input[type=radio]",
        )
      : null;
  if (!target) return;
  const href = target instanceof HTMLAnchorElement ? target.getAttribute("href") : null;
  record("click", "ui.click", {
    label: controlLabel(target),
    element: target.getAttribute("role") || target.tagName.toLowerCase(),
    href: href ? clip(href, 200) : undefined,
    checked:
      target instanceof HTMLInputElement
        ? target.checked
        : (target.getAttribute("aria-checked") ?? undefined),
    area:
      clip(
        target
          .closest(
            "[aria-label][role], header, nav, aside, main, [data-workflow-toolbar], .react-flow__node",
          )
          ?.getAttribute("aria-label") ||
          target.closest(".react-flow__node")?.getAttribute("data-id"),
        80,
      ) || undefined,
  });
}

function onChange(event: Event) {
  const field = event.target;
  if (!(
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ))
    return;
  if (field instanceof HTMLInputElement && ["password", "hidden"].includes(field.type)) {
    record("edit", "ui.field_changed", {
      field: controlLabel(field as HTMLElement),
      type: field.type,
    });
    return;
  }
  // Choices from a list are kept; anything typed is never recorded.
  const choice =
    field instanceof HTMLSelectElement
      ? clip(field.selectedOptions[0]?.textContent, 80)
      : field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type)
        ? field.checked
        : undefined;
  record("edit", "ui.field_changed", {
    field: controlLabel(field as HTMLElement),
    type: field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase(),
    value: choice,
    file:
      field instanceof HTMLInputElement && field.type === "file"
        ? Array.from(field.files ?? []).map((file) => `${clip(file.name, 80)} (${file.size} bytes)`)
        : undefined,
  });
}

/** App actions travel as "workflow:*" window events (export, focus, fit, open...). */
function watchAppActions() {
  const original = window.dispatchEvent.bind(window);
  window.dispatchEvent = (event: Event) => {
    if (event.type.startsWith("workflow:")) {
      const detail = (event as CustomEvent).detail;
      const summary =
        detail === null || ["string", "number", "boolean"].includes(typeof detail)
          ? detail
          : Array.isArray(detail)
            ? { items: detail.length }
            : typeof detail === "object"
              ? Object.fromEntries(
                  Object.entries(detail as Record<string, unknown>)
                    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
                    .slice(0, 8),
                )
              : undefined;
      record(
        event.type === "workflow:export" ? "export" : "app",
        `app.${event.type.slice("workflow:".length)}`,
        { detail: summary },
      );
    }
    return original(event);
  };
}

function projectShape(file: WorkflowFile) {
  return {
    l1Nodes: file.highLevel?.graph.nodes.length ?? 0,
    l1Links: file.highLevel?.graph.edges.length ?? 0,
    l2Nodes: file.graph.nodes.length,
    l2Links: file.graph.edges.length,
    releaseConditions: file.graph.nodes.reduce((sum, node) => sum + node.conditions.length, 0),
    unassignedConditions: file.releaseConditionInbox?.length ?? 0,
  };
}

/** Project edits, summarised every few seconds as what changed and by how much. */
function watchProjectEdits() {
  let before = useWorkflowStore.getState();
  let pending: ReturnType<typeof setTimeout> | null = null;
  let edits = 0;
  let baseline = projectShape(before.file);
  useWorkflowStore.subscribe((state) => {
    if (state.activeProjectId !== before.activeProjectId) {
      record("project", "project.switched", {
        projectId: state.activeProjectId,
        name: clip(state.file.graph.metadata.name, 120),
      });
      baseline = projectShape(state.file);
    } else if (state.file !== before.file) {
      edits += 1;
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        const after = projectShape(useWorkflowStore.getState().file);
        const change = Object.fromEntries(
          Object.entries(after).map(([key, value]) => [
            key,
            value - baseline[key as keyof typeof baseline],
          ]),
        );
        record("edit", "project.edited", {
          projectId: useWorkflowStore.getState().activeProjectId,
          name: clip(useWorkflowStore.getState().file.graph.metadata.name, 120),
          edits,
          change,
          now: after,
        });
        baseline = after;
        edits = 0;
      }, 3000);
    }
    if (state.dirty !== before.dirty && !state.dirty)
      record("project", "project.saved_state", { projectId: state.activeProjectId });
    before = state;
  });
}

function watchPages() {
  let last = page();
  const check = () => {
    if (page() === last) return;
    record("page", "page.view", { from: last, title: clip(document.title, 120) });
    last = page();
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history);
    history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      setTimeout(check, 0);
    };
  }
  addEventListener("popstate", check);
}

export function startActivityTracking() {
  if (started || typeof window === "undefined" || !trackingEnabled()) return;
  started = true;
  try {
    sessionId = sessionStorage.getItem("audit:session") || crypto.randomUUID();
    sessionStorage.setItem("audit:session", sessionId);
  } catch {
    sessionId = crypto.randomUUID();
  }
  visibleSince = document.visibilityState === "visible" ? Date.now() : null;

  record("session", "session.start", {
    referrer: clip(document.referrer, 200) || undefined,
    title: clip(document.title, 120),
  });
  record("page", "page.view", { title: clip(document.title, 120) });
  addEventListener("click", onClick, true);
  addEventListener("change", onChange, true);
  addEventListener("error", (event: ErrorEvent) =>
    record("error", "error.client", {
      message: clip(event.message, 300),
      source: clip(event.filename, 200),
      line: event.lineno,
    }),
  );
  addEventListener("unhandledrejection", (event: PromiseRejectionEvent) =>
    record("error", "error.unhandled", {
      message: clip(String(event.reason?.message ?? event.reason), 300),
    }),
  );
  watchAppActions();
  watchProjectEdits();
  watchPages();

  setInterval(() => flush(), FLUSH_MS);
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    settleActiveTime();
    record("session", "session.heartbeat", {
      activeSeconds: Math.round(activeMs / 1000),
      visitSeconds: Math.round((Date.now() - visitStarted) / 1000),
    });
  }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      visibleSince = Date.now();
      record("session", "session.resume");
    } else {
      settleActiveTime();
      record("session", "session.hidden", { activeSeconds: Math.round(activeMs / 1000) });
      flush(true);
    }
  });
  addEventListener("pagehide", () => {
    settleActiveTime();
    record("session", "session.end", {
      activeSeconds: Math.round(activeMs / 1000),
      visitSeconds: Math.round((Date.now() - visitStarted) / 1000),
    });
    flush(true);
  });
}
