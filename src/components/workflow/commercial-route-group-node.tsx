"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { Calculator, FileSignature, GitBranch, Handshake } from "lucide-react";
import {
  COMMERCIAL_ROUTE_STYLE,
  commercialRouteReady,
  type CommercialRoute,
} from "@/lib/commercial-routes";
import {
  QUALIFICATION_CASES,
  qualificationCase,
  qualificationCaseChoice,
  qualificationOf,
  qualificationRoute,
  type Qualification,
} from "@/lib/qualification";
import {
  ROUTE_FLOW_OFF,
  ROUTE_FLOW_ON,
  routeFlowExitBus,
  routeFlowLayout,
} from "@/lib/route-flow-layout";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";
import { QualificationRouteFlow } from "./qualification-route-flow";

const cad = (amount: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);

/** Pixels per unit of the route chart. */
const FLOW_SCALE = 2.2;

/** The agreements a route goes through: CSA carries on into PCS. */
const AGREEMENTS: Record<CommercialRoute, CommercialRoute[]> = {
  CSA: ["CSA", "PCS"],
  PCS: ["PCS"],
  LOI: ["LOI"],
};

/**
 * Route Selection: after Qualification, choose the customer's situation on
 * the route chart, fill in the agreement it leads to, and carry on to
 * Estimation along one line out.
 */
export function CommercialRouteGroupNode({
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
  const route = qualificationNode ? qualificationRoute(qualification) : undefined;
  const customerCase = qualificationCase(qualification);
  const chooseRoute = (patch: Partial<Qualification>) => {
    if (!qualificationNode) return;
    const store = useWorkflowStore.getState();
    const current =
      store.file.graph.nodes.find((item) => item.id === qualificationNode.id) ?? qualificationNode;
    const next = { ...qualificationOf(current), ...patch, customerHistory: undefined };
    next.commercialPath = qualificationRoute(next);
    store.updateNode(current.id, { config: { ...current.config, qualification: next } });
  };

  const modules = Number(node.customFields.commercialRouteModuleCount || 0);
  const csaHours = Number(node.customFields.commercialRouteCsaHours || 0);
  const pcsExtraHours = Number(node.customFields.commercialRoutePcsExtraHours || 0);
  const csaFee = Number.isFinite(csaHours) && csaHours > 0 ? csaHours * 200 : undefined;
  const pcsFee =
    Number.isFinite(modules) && modules > 0 ? Math.max(25_000, modules * 1_750) : undefined;
  const pcsTotal = pcsFee === undefined ? undefined : pcsFee + Math.max(0, pcsExtraHours) * 200;
  const signed = node.conditions.some(
    (condition) => condition.id === "loi-ceo-signature-required" && condition.checked,
  );
  const updateField = (key: string, value: string) => {
    const store = useWorkflowStore.getState();
    const current = store.file.graph.nodes.find((item) => item.id === node.id) ?? node;
    store.updateNode(node.id, {
      type: "commercialRule",
      config: { ...current.config, commercialRouteGroup: true },
      customFields: { ...current.customFields, [key]: value },
    });
  };
  const updateSignature = (checked: boolean) =>
    useWorkflowStore.getState().updateNode(node.id, {
      conditions: node.conditions.map((condition) =>
        condition.id === "loi-ceo-signature-required" ? { ...condition, checked } : condition,
      ),
    });

  // The one way out sits level with the bus that every route joins.
  const layout = useMemo(() => routeFlowLayout(QUALIFICATION_CASES, { row: 26 }), []);
  const bus = useMemo(() => routeFlowExitBus(layout), [layout]);
  const svgRef = useRef<SVGSVGElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [exit, setExit] = useState<{ top: number; left: number } | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      // Canvas zoom scales the screen boxes; work in the node's own pixels.
      const rootBox = root.getBoundingClientRect();
      const zoom = rootBox.width / root.offsetWidth || 1;
      const box = svg.getBoundingClientRect();
      const scale = box.width / zoom / bus.width;
      const next = {
        top: Math.round((box.top - rootBox.top) / zoom - root.clientTop + bus.busY * scale),
        left: Math.round((box.right - rootBox.left) / zoom - root.clientLeft),
      };
      setExit((previous) =>
        previous && previous.top === next.top && previous.left === next.left ? previous : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [bus]);
  useEffect(() => {
    if (exit) updateNodeInternals(node.id);
  }, [exit, node.id, updateNodeInternals]);

  const agreements = route ? AGREEMENTS[route] : [];
  const ready = Boolean(route && commercialRouteReady(node, route));
  const lineColor = customerCase ? ROUTE_FLOW_ON : ROUTE_FLOW_OFF;

  return (
    <div
      ref={rootRef}
      data-commercial-route-group
      data-route-selection-node
      className={`relative flex h-full w-full flex-col overflow-visible rounded-2xl border-2 bg-card p-3 shadow-md ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border"}`}
      style={{ borderColor: node.color || "#9a5c24" }}
    >
      <div
        className="flex items-center gap-2 border-b pb-2"
        style={{ borderColor: node.color || "#9a5c24" }}
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GitBranch className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Route Selection
          </p>
          {/* The node's own title: edit it here or in the Inspector. */}
          <input
            key={node.title}
            aria-label="Route Selection title"
            data-route-selection-title
            className="nodrag -mx-1 w-full min-w-0 rounded bg-transparent px-1 text-sm font-bold outline-none hover:bg-muted/60 focus:bg-background focus:ring-1 focus:ring-primary"
            defaultValue={node.title}
            placeholder="CSA / PCS / LOI"
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = node.title;
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const title = event.currentTarget.value.trim();
              if (title && title !== node.title)
                useWorkflowStore.getState().updateNode(node.id, { title });
              else event.currentTarget.value = node.title;
            }}
          />
        </div>
        <span
          data-selected-commercial-route={route ?? "none"}
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            backgroundColor: route ? COMMERCIAL_ROUTE_STYLE[route].color : "#94a3b8",
            color: "#fff",
          }}
        >
          {route ?? "No route selected"}
        </span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: reached ? ROUTE_FLOW_ON : "#94a3b8" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2 !border-background"
        style={{
          backgroundColor: reached && ready ? ROUTE_FLOW_ON : "#94a3b8",
          ...(exit ? { top: exit.top } : {}),
        }}
      />
      {exit && (
        <div
          aria-hidden="true"
          data-route-selection-exit-line
          className="pointer-events-none absolute right-0"
          style={{
            left: exit.left,
            top: exit.top - (customerCase ? 1 : 0.5),
            height: customerCase ? 2.5 : 1.5,
            backgroundColor: lineColor,
          }}
        />
      )}

      <p className="mt-2 text-sm text-muted-foreground">Click the customer&apos;s situation:</p>
      <QualificationRouteFlow
        id={node.id}
        svgRef={svgRef}
        exitBus
        scale={FLOW_SCALE}
        currentId={customerCase?.id}
        client={qualification.clientCategory}
        onPickCase={(caseId) => chooseRoute(qualificationCaseChoice(caseId))}
        onPickClient={(client) =>
          chooseRoute({ clientCategory: client as Qualification["clientCategory"] })
        }
      />
      <p data-qualification-route className="mt-1 text-base font-semibold text-foreground">
        Route:{" "}
        {customerCase
          ? [customerCase.client, ...customerCase.steps].join(" → ")
          : (route ?? "Choose the customer's situation")}
      </p>

      <div
        data-route-agreements
        className="mt-2 grid min-h-0 flex-1 gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, agreements.length)}, minmax(0, 1fr))` }}
      >
        {!agreements.length && (
          <p className="rounded-xl border border-dashed p-3 text-[11px] text-muted-foreground">
            Choose the customer&apos;s situation above to fill in its agreement (CSA, PCS or LOI).
          </p>
        )}
        {agreements.map((path) => {
          const style = COMMERCIAL_ROUTE_STYLE[path];
          const onRoute = reached;
          const active = reached && route === path;
          const pathReady = commercialRouteReady(node, path);
          const Icon = path === "CSA" ? Handshake : path === "PCS" ? Calculator : FileSignature;
          return (
            <section
              key={path}
              data-commercial-route-card={path}
              className={`relative min-h-0 overflow-hidden rounded-xl border-2 bg-card p-2 text-[10px] leading-snug ${onRoute ? "commercial-route-node-active" : ""}`}
              style={
                {
                  borderColor: onRoute ? style.color : `${style.color}88`,
                  backgroundImage: `linear-gradient(${style.color}${onRoute ? "13" : "06"}, ${style.color}${onRoute ? "13" : "06"})`,
                  "--commercial-route-color": style.color,
                } as React.CSSProperties
              }
            >
              <div
                className="mb-1 flex items-center gap-1.5 font-bold"
                style={{ color: style.color }}
              >
                <Icon className="size-3.5" />
                {path} · {style.agreement}
                {active && <span className="ml-auto">{pathReady ? "READY" : "INCOMPLETE"}</span>}
                {path === "PCS" && route === "CSA" && <span className="ml-auto">AFTER CSA</span>}
              </div>
              {path === "CSA" && (
                <>
                  <label className="flex items-center gap-2 font-semibold">
                    Consultation Services · Hours
                    <input
                      aria-label="CSA billable hours"
                      className="nodrag ml-auto w-16 rounded border bg-background px-1 py-0.5 text-right"
                      type="number"
                      min={0}
                      step={0.5}
                      value={String(node.customFields.commercialRouteCsaHours || "")}
                      onChange={(event) =>
                        updateField("commercialRouteCsaHours", event.target.value)
                      }
                    />
                  </label>
                  <p className="font-bold">
                    CAD $200 × hours {csaFee !== undefined && `= ${cad(csaFee)} before tax`}
                  </p>
                  {active && !pathReady && (
                    <p className="text-amber-600">Enter billable hours to continue.</p>
                  )}
                  <p className="text-muted-foreground">
                    Up to 10 hours anticipated (about {cad(2_000)}); actual hours billed. Extra work
                    needs prior written approval. Applicable taxes extra.
                  </p>
                </>
              )}
              {path === "PCS" && (
                <>
                  <label className="flex items-center gap-2 font-semibold">
                    Pre-Construction Services · Modules
                    <input
                      aria-label="PCS module count"
                      className="nodrag ml-auto w-16 rounded border bg-background px-1 py-0.5 text-right"
                      type="number"
                      min={1}
                      step={1}
                      value={String(node.customFields.commercialRouteModuleCount || "")}
                      onChange={(event) =>
                        updateField("commercialRouteModuleCount", event.target.value)
                      }
                    />
                  </label>
                  <p>
                    Base: greater of {cad(25_000)} or {cad(1_750)} × modules.
                  </p>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    Extra hours · {cad(200)} / hour
                    <input
                      aria-label="PCS additional hours"
                      className="nodrag ml-auto w-16 rounded border bg-background px-1 py-0.5 text-right"
                      type="number"
                      min={0}
                      step={0.5}
                      value={String(node.customFields.commercialRoutePcsExtraHours || "")}
                      onChange={(event) =>
                        updateField("commercialRoutePcsExtraHours", event.target.value)
                      }
                    />
                  </label>
                  <p className="font-bold">
                    {pcsTotal === undefined
                      ? "Enter modules to calculate"
                      : `Total: ${cad(pcsTotal)} before tax`}
                  </p>
                  {active && !pathReady && (
                    <p className="text-amber-600">
                      Enter a valid module count and extra hours to continue.
                    </p>
                  )}
                </>
              )}
              {path === "LOI" && (
                <>
                  <label className="block font-semibold">
                    Letter of Intent · Estimated price or range (CAD)
                    <input
                      aria-label="LOI estimated project price or range in CAD"
                      className="nodrag mt-1 w-full rounded border bg-background px-1 py-0.5"
                      defaultValue={String(node.customFields.commercialRoutePrice || "")}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value !== String(node.customFields.commercialRoutePrice || ""))
                          updateField("commercialRoutePrice", value);
                      }}
                    />
                  </label>
                  <label className="nodrag mt-1 flex items-center gap-1">
                    <input
                      type="checkbox"
                      aria-label="LOI signed by the company CEO"
                      checked={signed}
                      onChange={(event) => updateSignature(event.target.checked)}
                    />{" "}
                    CEO signature received
                  </label>
                  <p className="text-muted-foreground">
                    Non-binding estimate; confirmed in the Sales Agreement.
                  </p>
                  {active && !pathReady && (
                    <p className="text-amber-600">
                      Enter a price or range and confirm the CEO signature to continue.
                    </p>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
