"use client";

import { ArrowDown, ArrowUp, Cloud, FlaskConical, RefreshCw, Trash2 } from "lucide-react";
import { fobPickupDate, type SimDelivery, type SimProject } from "@/lib/simulation";
import { DateInput, NumberInput } from "./draft-inputs";

const inputClass = "mt-1 block min-h-9 w-full rounded-md border bg-background px-2.5 text-sm";
const labelClass = "block text-[11px] font-semibold text-muted-foreground";

function NumberField({
  label,
  value,
  min = 0,
  step = 1,
  integer = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  integer?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <NumberInput
        label={label}
        value={value}
        min={min}
        step={step}
        integer={integer}
        onCommit={onChange}
        className={inputClass}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <DateInput label={label} value={value} onCommit={onChange} min={min} className={inputClass} />
    </label>
  );
}

const SITE_DEFAULT: Extract<SimDelivery, { kind: "site" }> = {
  kind: "site",
  transport: "as-built",
  transportDays: 1,
  modulesPerDay: 4,
  install: { mode: "rate", modulesPerDay: 4, finishDays: 5 },
};

/** Department and release condition in L4 that take the simulated line days. */
function L4TargetPicker({
  departments,
  target,
  lineDays,
  onTarget,
  onWrite,
}: {
  departments: NonNullable<Parameters<typeof ProjectCard>[0]["releaseConditions"]>;
  target?: { nodeId: string; conditionId: string };
  lineDays?: number;
  onTarget: (target: { nodeId: string; conditionId: string } | undefined) => void;
  onWrite?: () => void;
}) {
  const department = departments.find((item) => item.nodeId === target?.nodeId);
  const condition = department?.conditions.find((item) => item.conditionId === target?.conditionId);
  const inSync = condition && lineDays !== undefined && condition.days === lineDays;
  return (
    <div className="col-span-2 grid grid-cols-2 gap-2" data-l4-target>
      <label className={labelClass}>
        Department
        <select
          aria-label="Department"
          value={department?.nodeId ?? ""}
          onChange={(event) => {
            const next = departments.find((item) => item.nodeId === event.target.value);
            const first = next?.conditions[0];
            onTarget(
              next && first ? { nodeId: next.nodeId, conditionId: first.conditionId } : undefined,
            );
          }}
          className={inputClass}
        >
          <option value="">Choose…</option>
          {departments.map((item) => (
            <option key={item.nodeId} value={item.nodeId}>
              {item.department}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Release condition
        <select
          aria-label="Release condition"
          value={condition?.conditionId ?? ""}
          disabled={!department}
          onChange={(event) =>
            department &&
            onTarget(
              event.target.value
                ? { nodeId: department.nodeId, conditionId: event.target.value }
                : undefined,
            )
          }
          className={`${inputClass} disabled:opacity-50`}
        >
          <option value="">Choose…</option>
          {department?.conditions.map((item) => (
            <option key={item.conditionId} value={item.conditionId}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex flex-wrap items-center gap-2 text-[10px] leading-snug">
        <span className="min-w-0 flex-1 text-muted-foreground" data-l4-target-status>
          {!departments.length
            ? "No release conditions in this Phase in L4."
            : !condition
              ? "Choose where L5's line days go in L4."
              : lineDays === undefined
                ? "This project doesn't finish on the line in this simulation."
                : inSync
                  ? `L4 has the L5 line time: ${lineDays} days.`
                  : `L5: ${lineDays} days on the line · L4 now ${condition.days ? `${condition.days} days` : "no duration"}.`}
        </span>
        {condition && lineDays !== undefined && !inSync && onWrite ? (
          <button
            type="button"
            onClick={onWrite}
            className="rounded-md bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground"
          >
            Write {lineDays} days to L4
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Inputs for one project in the simulation. */
export function ProjectCard({
  project,
  position,
  count,
  phaseOptions,
  l4Start,
  lineSlots,
  releaseConditions,
  lineDays,
  onWriteL4,
  lateDays,
  onChange,
  onPhaseChange,
  onMove,
  onRemove,
  onRefresh,
}: {
  project: SimProject;
  position: number;
  count: number;
  phaseOptions?: { id: string; title: string; description: string }[];
  /** Saved projects: the L4 date the production Phase starts; the line can't start earlier. */
  l4Start?: { date: string; phase: string };
  /** Modules the line holds at its normal pace (the pipeline length). */
  lineSlots: number;
  /** Saved projects: Departments in the production Phase and their L4 release conditions. */
  releaseConditions?: Array<{
    nodeId: string;
    department: string;
    conditions: Array<{ conditionId: string; title: string; days?: number; simulated?: number }>;
  }>;
  /** Days this project is on the line in the simulation. */
  lineDays?: number;
  /** Writes lineDays into the chosen L4 release condition. */
  onWriteL4?: () => void;
  lateDays?: number;
  onChange: (patch: Partial<SimProject>) => void;
  onPhaseChange: (phaseId: string) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  /** Saved projects: re-read dates and inputs from the project's L4. */
  onRefresh?: () => void;
}) {
  const delivery = project.delivery;
  const name = project.name || "Project";
  const autoPickup = fobPickupDate(
    {
      ...project,
      earliestStart:
        l4Start && project.earliestStart < l4Start.date ? l4Start.date : project.earliestStart,
    },
    lineSlots,
  );
  return (
    <article
      data-sim-project={project.id}
      aria-label={`Simulation project ${name}`}
      className="rounded-lg border bg-background p-3 shadow-xs"
      style={{ borderLeft: `4px solid ${project.color}` }}
    >
      <header className="flex items-center gap-2">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold"
          title="Loading priority"
        >
          {position + 1}
        </span>
        {project.source.kind === "cloud" ? (
          <Cloud className="size-3.5 shrink-0 text-sky-600" aria-label="Saved project" />
        ) : (
          <FlaskConical className="size-3.5 shrink-0 text-amber-600" aria-label="Virtual project" />
        )}
        <input
          aria-label="Project name"
          value={project.name}
          onChange={(event) => onChange({ name: event.target.value })}
          className="min-h-8 min-w-0 flex-1 rounded-md border-transparent bg-transparent px-1 text-sm font-bold hover:border-border focus:border-border"
        />
        <input
          type="color"
          aria-label={`${name} colour`}
          value={project.color}
          onChange={(event) => onChange({ color: event.target.value })}
          className="size-7 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <button
          type="button"
          aria-label={`Move ${name} up`}
          disabled={position === 0}
          onClick={() => onMove(-1)}
          className="rounded p-1 hover:bg-muted disabled:opacity-30"
        >
          <ArrowUp className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Move ${name} down`}
          disabled={position === count - 1}
          onClick={() => onMove(1)}
          className="rounded p-1 hover:bg-muted disabled:opacity-30"
        >
          <ArrowDown className="size-4" />
        </button>
        {onRefresh ? (
          <button
            type="button"
            aria-label={`Refresh ${name} from L4`}
            title="Refresh dates and inputs from this project's L4"
            onClick={onRefresh}
            className="rounded p-1 hover:bg-muted"
          >
            <RefreshCw className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
        >
          <Trash2 className="size-4" />
        </button>
      </header>
      {lateDays ? (
        <p className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-600">
          {lateDays} days late
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField
          label="Modules"
          value={project.modules}
          min={1}
          integer
          onChange={(modules) => onChange({ modules })}
        />
        <NumberField
          label="Weeks per module"
          value={project.weeksPerModule}
          min={0.5}
          step={0.5}
          onChange={(weeksPerModule) => onChange({ weeksPerModule })}
        />
        {phaseOptions?.length ? (
          <label className={`${labelClass} col-span-2`}>
            Production Phase
            <select
              aria-label="Production Phase"
              value={project.productionPhaseId ?? ""}
              onChange={(event) => onPhaseChange(event.target.value)}
              className={inputClass}
            >
              {phaseOptions.map((phase) => (
                <option key={phase.id} value={phase.id}>
                  {phase.title}
                  {phase.description ? ` · ${phase.description}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {releaseConditions ? (
          <L4TargetPicker
            departments={releaseConditions}
            target={project.l4Target}
            lineDays={lineDays}
            onTarget={(l4Target) => onChange({ l4Target })}
            onWrite={onWriteL4}
          />
        ) : null}
        <DateField
          label="Earliest line start"
          value={project.earliestStart}
          min={l4Start?.date}
          onChange={(earliestStart) => onChange({ earliestStart })}
        />
        <DateField
          label="Due date"
          value={project.dueDate}
          onChange={(dueDate) => onChange({ dueDate })}
        />
        {l4Start ? (
          <p
            data-l4-start-limit
            className={`col-span-2 text-[10px] leading-snug ${project.earliestStart < l4Start.date ? "font-semibold text-red-600" : "text-muted-foreground"}`}
          >
            {project.earliestStart < l4Start.date
              ? `Before L4 allows: the simulation uses ${l4Start.date}, when ${l4Start.phase} starts in L4.`
              : `L4: ${l4Start.phase} starts ${l4Start.date} — earlier dates can't be chosen.`}
          </p>
        ) : null}
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={project.splittable}
          onChange={(event) => onChange({ splittable: event.target.checked })}
        />
        Can be split (other projects may go on the line in between)
      </label>
      <label className="mt-1 flex items-center gap-2 text-xs font-semibold">
        <input
          type="checkbox"
          checked={project.allowTight === true}
          onChange={(event) => onChange({ allowTight: event.target.checked })}
        />
        Allow a tight line (up to 23 modules, flagged red)
      </label>

      <div
        role="radiogroup"
        aria-label="Delivery"
        className="mt-3 grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
      >
        {(
          [
            ["fob", "FOB yard"],
            ["site", "Ship & install"],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={delivery.kind === kind}
            onClick={() =>
              delivery.kind !== kind &&
              onChange({
                delivery:
                  kind === "fob"
                    ? { kind: "fob", pickupDate: project.earliestStart }
                    : SITE_DEFAULT,
              })
            }
            className={`min-h-8 rounded text-xs font-semibold ${delivery.kind === kind ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {project.source.kind === "cloud" ? (
        <p data-fob-yard-linked className="mt-1 text-[10px] leading-snug text-muted-foreground">
          Linked to this project&apos;s L1 Final Close FOB yard switch — L1–L4 change with it, and a
          change there shows here.
        </p>
      ) : null}

      {delivery.kind === "fob" ? (
        <div className="mt-2 grid grid-cols-2 gap-2" data-fob-pickup>
          <div className="col-span-2" data-fob-earliest-pickup>
            {delivery.pickupCustom ? (
              <DateField
                label="Earliest pickup date"
                value={delivery.pickupDate}
                onChange={(pickupDate) => onChange({ delivery: { ...delivery, pickupDate } })}
              />
            ) : (
              <>
                <span className={labelClass}>Earliest pickup date</span>
                <output
                  aria-label="Earliest pickup date"
                  className="mt-1 flex min-h-9 w-full items-center rounded-md border bg-muted/60 px-2.5 text-sm font-semibold"
                >
                  {autoPickup}
                </output>
              </>
            )}
            <label className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold">
              <input
                type="checkbox"
                checked={delivery.pickupCustom === true}
                onChange={(event) =>
                  onChange({
                    delivery: {
                      ...delivery,
                      pickupCustom: event.target.checked || undefined,
                      pickupDate: event.target.checked ? autoPickup : delivery.pickupDate,
                    },
                  })
                }
              />
              Set my own pickup date
            </label>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {delivery.pickupCustom
                ? `Auto would be ${autoPickup}, when the last module comes off the line.`
                : `Auto: when the last module comes off the line — line start + (${project.modules} modules + ${lineSlots} line places − 1) × ${project.weeksPerModule} weeks ÷ ${lineSlots}.`}
            </p>
          </div>
          <div className="col-span-2">
            <NumberField
              label="Customer collects every (modules)"
              value={delivery.batchSize ?? 0}
              integer
              onChange={(batchSize) => onChange({ delivery: { ...delivery, batchSize } })}
            />
          </div>
          <p className="col-span-2 text-[10px] leading-snug text-muted-foreground">
            {delivery.batchSize
              ? `The customer collects ${delivery.batchSize} at a time once that many wait in the yard (the last batch takes what is left), from the earliest pickup date.`
              : "0 = the customer collects everything at once, after the last module is built and from the earliest pickup date."}
          </p>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={`${labelClass} col-span-2`}>
            Shipping starts
            <select
              aria-label="Shipping starts"
              value={delivery.transport}
              onChange={(event) =>
                onChange({
                  delivery: {
                    ...delivery,
                    transport: event.target.value as typeof delivery.transport,
                  },
                })
              }
              className={inputClass}
            >
              <option value="as-built">As each module is built</option>
              <option value="all-done">When all modules are built</option>
              <option value="site-ready">When the site is ready</option>
            </select>
          </label>
          {delivery.transport === "site-ready" ? (
            <div className="col-span-2">
              <DateField
                label="Site ready date"
                value={delivery.siteReadyDate ?? project.earliestStart}
                onChange={(siteReadyDate) => onChange({ delivery: { ...delivery, siteReadyDate } })}
              />
            </div>
          ) : null}
          <NumberField
            label="Transport days"
            value={delivery.transportDays}
            onChange={(transportDays) => onChange({ delivery: { ...delivery, transportDays } })}
          />
          <NumberField
            label="Modules shipped per day"
            value={delivery.modulesPerDay}
            min={1}
            onChange={(modulesPerDay) => onChange({ delivery: { ...delivery, modulesPerDay } })}
          />
          <label className={`${labelClass} col-span-2`}>
            Installation time
            <select
              aria-label="Installation time"
              value={delivery.install.mode}
              onChange={(event) =>
                onChange({
                  delivery: {
                    ...delivery,
                    install:
                      event.target.value === "total"
                        ? { mode: "total", days: 10 }
                        : { mode: "rate", modulesPerDay: 4, finishDays: 5 },
                  },
                })
              }
              className={inputClass}
            >
              <option value="rate">Modules per day, then finishing days</option>
              <option value="total">Total days for the whole project</option>
            </select>
          </label>
          {delivery.install.mode === "total" ? (
            <NumberField
              label="Install days"
              value={delivery.install.days}
              min={1}
              onChange={(days) =>
                onChange({ delivery: { ...delivery, install: { mode: "total", days } } })
              }
            />
          ) : (
            <>
              <NumberField
                label="Installed per day"
                value={delivery.install.modulesPerDay}
                min={1}
                onChange={(modulesPerDay) =>
                  delivery.install.mode === "rate" &&
                  onChange({
                    delivery: { ...delivery, install: { ...delivery.install, modulesPerDay } },
                  })
                }
              />
              <NumberField
                label="Finishing days"
                value={delivery.install.finishDays}
                onChange={(finishDays) =>
                  delivery.install.mode === "rate" &&
                  onChange({
                    delivery: { ...delivery, install: { ...delivery.install, finishDays } },
                  })
                }
              />
            </>
          )}
        </div>
      )}
    </article>
  );
}
