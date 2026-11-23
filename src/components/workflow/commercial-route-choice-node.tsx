"use client";

import { GitBranch } from "lucide-react";
import { Handle, Position } from "@xyflow/react";
import {
  evaluateQualificationForm101,
  FORM_101_MAX_SCORE,
  FORM_101_PASS_SCORE,
} from "@/lib/qualification-form-101";
import { COMMERCIAL_ROUTE_STYLE } from "@/lib/commercial-routes";
import { qualificationOf, qualificationRoute, type Qualification } from "@/lib/qualification";
import { useWorkflowStore } from "@/store/workflow-store";
import { cn } from "@/lib/utils";
import type { DomainNode } from "@/types/workflow";

const routes = ["CSA", "PCS", "LOI"] as const;
const routePositions = { CSA: "18%", PCS: "50%", LOI: "82%" } as const;

export function CommercialRouteChoiceNode({
  node,
  selected,
  reached,
}: {
  node: DomainNode;
  selected: boolean;
  reached: boolean;
}) {
  const qualificationNode = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "qualification"),
  );
  const qualification = qualificationNode ? qualificationOf(qualificationNode) : {};
  const score = evaluateQualificationForm101(qualification);
  const scorePassed = score.totalScore >= FORM_101_PASS_SCORE;
  const route = qualificationRoute(qualification);

  const update = (patch: Partial<Qualification>) => {
    const store = useWorkflowStore.getState();
    const currentQualificationNode = store.file.graph.nodes.find(
      (item) => item.type === "qualification",
    );
    const currentChoiceNode = store.file.graph.nodes.find((item) => item.id === node.id);
    if (!currentQualificationNode || !currentChoiceNode) return;

    const current = qualificationOf(currentQualificationNode);
    const next = { ...current, ...patch };
    const selectedRoute = qualificationRoute(next);
    next.commercialPath = selectedRoute;
    store.updateNode(currentQualificationNode.id, {
      config: { ...currentQualificationNode.config, qualification: next },
    });
    store.updateNode(currentChoiceNode.id, {
      customFields: {
        ...currentChoiceNode.customFields,
        selectedRoute: selectedRoute ?? "",
      },
    });
  };

  const choiceClass = (active: boolean) =>
    cn(
      "nodrag nopan rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5",
    );

  return (
    <div
      data-commercial-route-choice-node
      data-route-active={reached ? "true" : "false"}
      className={cn(
        "relative flex h-full w-full flex-col overflow-visible rounded-2xl border-2 bg-card shadow-md",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        reached && "commercial-route-node-active",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background !bg-slate-500"
      />
      <div className="flex items-center gap-2 border-b bg-primary/5 px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GitBranch className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Qualification · Route selection
          </p>
          <h3 className="truncate text-sm font-bold">Choose CSA / PCS / LOI</h3>
        </div>
        <span
          data-commercial-route-choice-status
          className={cn(
            "rounded-full border px-2 py-1 text-[10px] font-bold",
            route
              ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700"
              : "border-amber-500/35 bg-amber-500/10 text-amber-700",
          )}
        >
          {route ?? "Choose route"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold">Qualification score</span>
          <span className={scorePassed ? "font-bold text-emerald-700" : "text-muted-foreground"}>
            {score.totalScore} / {FORM_101_MAX_SCORE} · pass {FORM_101_PASS_SCORE}
          </span>
        </div>
        {!scorePassed ? (
          <p className="mt-1 text-[10px] leading-relaxed text-amber-700">
            The selected route unlocks after Form [1.01] reaches {FORM_101_PASS_SCORE}/
            {FORM_101_MAX_SCORE}.
          </p>
        ) : null}

        <p className="mt-3 text-[11px] font-semibold">Customer history</p>
        <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Customer history">
          <button
            type="button"
            aria-pressed={qualification.customerHistory === "new"}
            onClick={(event) => {
              event.stopPropagation();
              update({
                customerHistory: "new",
                plansAvailable: undefined,
                commercialPath: undefined,
              });
            }}
            className={choiceClass(qualification.customerHistory === "new")}
          >
            New customer
          </button>
          <button
            type="button"
            aria-pressed={qualification.customerHistory === "existing"}
            onClick={(event) => {
              event.stopPropagation();
              update({
                customerHistory: "existing",
                plansAvailable: undefined,
                commercialPath: undefined,
              });
            }}
            className={choiceClass(qualification.customerHistory === "existing")}
          >
            Existing customer
          </button>
        </div>

        {qualification.customerHistory === "new" ? (
          <>
            <p className="mt-3 text-[11px] font-semibold">Plans available?</p>
            <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Plans available">
              <button
                type="button"
                aria-pressed={qualification.plansAvailable === "no"}
                onClick={(event) => {
                  event.stopPropagation();
                  update({ plansAvailable: "no" });
                }}
                className={choiceClass(qualification.plansAvailable === "no")}
              >
                No plans · CSA
              </button>
              <button
                type="button"
                aria-pressed={qualification.plansAvailable === "yes"}
                onClick={(event) => {
                  event.stopPropagation();
                  update({ plansAvailable: "yes" });
                }}
                className={choiceClass(qualification.plansAvailable === "yes")}
              >
                Has plans · PCS
              </button>
            </div>
          </>
        ) : null}

        {qualification.customerHistory === "existing" ? (
          <>
            <p className="mt-3 text-[11px] font-semibold">Choose the route</p>
            <div
              className="mt-1 grid grid-cols-3 gap-2"
              role="group"
              aria-label="Existing customer route"
            >
              {routes.map((path) => (
                <button
                  key={path}
                  type="button"
                  aria-pressed={route === path}
                  onClick={(event) => {
                    event.stopPropagation();
                    update({ commercialPath: path });
                  }}
                  className={choiceClass(route === path)}
                >
                  {path}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <p className="mt-auto pt-3 text-[10px] leading-relaxed text-muted-foreground">
          New: CSA without plans or PCS with plans. Existing: CSA or PCS, with LOI as an additional
          option.
        </p>
      </div>

      {routes.map((path) => (
        <div
          key={path}
          className="pointer-events-none absolute right-0 z-20"
          style={{ top: routePositions[path] }}
        >
          <span className="absolute right-4 -translate-y-1/2 rounded bg-card/95 px-1 text-[9px] font-bold text-muted-foreground">
            {path}
          </span>
          <Handle
            type="source"
            position={Position.Right}
            id={path}
            aria-label={`${path} route`}
            className={cn(
              "!right-[-6px] !size-3 !border-2 !border-background",
              route === path && reached && scorePassed && "commercial-route-handle-active",
            )}
            style={{ backgroundColor: COMMERCIAL_ROUTE_STYLE[path].color }}
          />
        </div>
      ))}
    </div>
  );
}
