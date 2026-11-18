import type { ScheduleCalendar } from "@/types/workflow";

/** Site installation time: a total for the whole project, or a daily rate. */
export type SimInstall =
  { mode: "total"; days: number } | { mode: "rate"; modulesPerDay: number; finishDays: number };

/**
 * FOB yard: the customer collects every module on the pickup date.
 * Site: we ship the modules and install them. Shipping starts as each module
 * is built ("as-built"), once all are built ("all-done"), or once the site is
 * ready ("site-ready").
 */
export type SimDelivery =
  | {
      kind: "fob";
      /** Earliest day the customer collects. */
      pickupDate: string;
      /** The user set pickupDate; otherwise it is worked out from the line
       * (when the last module comes off it). */
      pickupCustom?: boolean;
      /** The customer collects each time this many modules wait in the yard
       * (the last batch takes what is left). 0 or unset: everything at once,
       * once all modules are built. */
      batchSize?: number;
    }
  | {
      kind: "site";
      transport: "as-built" | "all-done" | "site-ready";
      transportDays: number;
      modulesPerDay: number;
      siteReadyDate?: string;
      install: SimInstall;
    };

export interface SimProject {
  id: string;
  name: string;
  color: string;
  source: { kind: "cloud"; projectId: string } | { kind: "virtual" };
  modules: number;
  /** Elapsed weeks a module needs to travel the whole line. */
  weeksPerModule: number;
  /** False: its modules go on the line one after another with no other project in between. */
  splittable: boolean;
  /** L1 Phase used as factory production (cloud projects). */
  productionPhaseId?: string;
  /** Earliest date the first module may go on the line. */
  earliestStart: string;
  /** Customer's required date: pickup (FOB yard) or installation complete (site). */
  dueDate: string;
  delivery: SimDelivery;
  /** Working days for site installation; the factory calendar when unset. */
  siteCalendar?: ScheduleCalendar;
  /** Let this project's modules go on closer together, up to crowdedMax (warned). */
  allowTight?: boolean;
}

export interface SimFactory {
  /** Modules the line normally carries (18). */
  targetOnLine: number;
  /** Most the scheduler puts on the line (19). Up to 23 is physically possible but very tight. */
  normalMax: number;
  crowdedMax: number;
  /** Modules the FOB yard holds; when full, finished modules can't leave the line. */
  yardCapacity: number;
  /** Install crews; each works one site at a time. */
  installCrews: number;
  /** Factory working days (weekends, stats, shutdowns). Its startDate is ignored. */
  calendar?: ScheduleCalendar;
  /** Legacy saved scenario field. */
  startDate?: string;
}

export interface SimScenario {
  id: string;
  name: string;
  factory: SimFactory;
  projects: SimProject[];
  /** Project ids in loading priority. The optimizer fills it. */
  priority?: string[];
}

export type SimModuleOnLine = { projectId: string; module: number; progress: number };

export interface SimDay {
  date: string;
  /** Factory working day. */
  working: boolean;
  /** Closed days: the day-off type (weekend, stat holiday or shutdown). */
  closure?: { kind: "weekend" | "statutory" | "shutdown"; label: string };
  line: SimModuleOnLine[];
  /** Working days the slowest module on the line needs; sets the line speed. */
  paceDays: number;
  /** The line could not move because the yard was full. */
  blocked: boolean;
  yard: Record<string, number>;
  yardTotal: number;
  /** Modules on their way to a site, by project. */
  inTransit: Record<string, number>;
  installing: string[];
  /** More than normalMax modules on the line. */
  tight: boolean;
  /** Site projects: modules delivered and installed so far. */
  sites: Record<string, { arrived: number; installed: number; modules: number }>;
  /** FOB yard projects collected today. */
  pickedUp: string[];
  /** Modules that left the factory today, including FOB pickups and site dispatches. */
  departures: Record<string, number>;
  /** Modules that came off the line today, by project. */
  built: Record<string, number>;
  /** Modules that arrived at their site today, by project. */
  delivered: Record<string, number>;
  /** Site projects whose installation finished today. */
  installedDone: string[];
  events: string[];
}

export type SimProjectResult = {
  projectId: string;
  firstLoad?: string;
  lastLoad?: string;
  productionEnd?: string;
  pickup?: string;
  installStart?: string;
  installEnd?: string;
  /** Pickup (FOB yard) or installation end (site). */
  completion?: string;
  /** Days after the due date (0 when on time). */
  lateDays: number;
  /** What held the project up, largest first (shown for late projects). */
  reasons: string[];
  finished: boolean;
};

export interface SimResult {
  days: SimDay[];
  projects: SimProjectResult[];
  /** Priority order used. */
  priority: string[];
  blockedDays: number;
  /** Working days with more than normalMax modules on the line. */
  tightDays: number;
  /** Most modules on the line on any day. */
  peakOnLine: number;
  /** Last completion date. */
  makespanEnd?: string;
  warnings: string[];
}
