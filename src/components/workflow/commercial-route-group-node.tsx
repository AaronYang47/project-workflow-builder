"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { Calculator, FileSignature, Handshake } from "lucide-react";
import {
  COMMERCIAL_ROUTES,
  COMMERCIAL_ROUTE_STYLE,
  commercialRouteReady,
  type CommercialRoute,
} from "@/lib/commercial-routes";
import { roundedPath } from "@/lib/semantic-edge-geometry";
import { qualificationOf, qualificationRoute } from "@/lib/qualification";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const cad = (amount: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);

type Box = { left: number; top: number; right: number; bottom: number; cx: number; cy: number };
type Geometry = { width: number; csa: Box; pcs: Box; loi: Box };

const boxOf = (element: HTMLElement): Box => ({
  left: element.offsetLeft,
  top: element.offsetTop,
  right: element.offsetLeft + element.offsetWidth,
  bottom: element.offsetTop + element.offsetHeight,
  cx: element.offsetLeft + element.offsetWidth / 2,
  cy: element.offsetTop + element.offsetHeight / 2,
});

/** The lines inside the node: one way in, CSA → PCS, straight to PCS, or LOI; one way out. */
function routeLines(geometry: Geometry) {
  const { width, csa, pcs, loi } = geometry;
  const splitY = Math.round((csa.cy + loi.cy) / 2);
  const busX = csa.left - 14;
  const mergeX = pcs.right + 14;
  const laneY = csa.top - 13;
  return {
    splitY,
    busX,
    mergeX,
    segments: {
      entry: {
        points: [
          { x: 0, y: splitY },
          { x: busX, y: splitY },
        ],
      },
      toCsa: {
        arrow: true,
        points: [
          { x: busX, y: splitY },
          { x: busX, y: csa.cy },
          { x: csa.left - 3, y: csa.cy },
        ],
      },
      bypass: {
        arrow: true,
        points: [
          { x: busX, y: splitY },
          { x: busX, y: laneY },
          { x: pcs.cx, y: laneY },
          { x: pcs.cx, y: pcs.top - 3 },
        ],
      },
      toLoi: {
        arrow: true,
        points: [
          { x: busX, y: splitY },
          { x: busX, y: loi.cy },
          { x: loi.left - 3, y: loi.cy },
        ],
      },
      csaToPcs: {
        arrow: true,
        points: [
          { x: csa.right, y: csa.cy },
          { x: pcs.left - 3, y: csa.cy },
        ],
      },
      pcsOut: {
        points: [
          { x: pcs.right, y: pcs.cy },
          { x: mergeX, y: pcs.cy },
          { x: mergeX, y: splitY },
        ],
      },
      loiOut: {
        points: [
          { x: loi.right, y: loi.cy },
          { x: mergeX, y: loi.cy },
          { x: mergeX, y: splitY },
        ],
      },
      exit: {
        points: [
          { x: mergeX, y: splitY },
          { x: width, y: splitY },
        ],
      },
    },
  };
}

type Segment = keyof ReturnType<typeof routeLines>["segments"];

/** Which lines the chosen route runs along. */
const ROUTE_SEGMENTS: Record<CommercialRoute, Segment[]> = {
  CSA: ["entry", "toCsa", "csaToPcs", "pcsOut", "exit"],
  PCS: ["entry", "bypass", "pcsOut", "exit"],
  LOI: ["entry", "toLoi", "loiOut", "exit"],
};

const ROUTE_LINE_ON = "#16a34a";
const ROUTE_LINE_OFF = "#94a3b8";

export function CommercialRouteGroupNode({
  node,
  selected,
  reached,
}: {
  node: DomainNode;
  selected: boolean;
  reached: boolean;
}) {
  const qualification = useWorkflowStore((state) =>
    state.file.graph.nodes.find((item) => item.type === "qualification"),
  );
  const route = qualification ? qualificationRoute(qualificationOf(qualification)) : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Partial<Record<CommercialRoute, HTMLElement | null>>>({});
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = () => {
      const { CSA: csa, PCS: pcs, LOI: loi } = cardRefs.current;
      if (!root || !csa || !pcs || !loi) return;
      const next = { width: root.clientWidth, csa: boxOf(csa), pcs: boxOf(pcs), loi: boxOf(loi) };
      setGeometry((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root) observer.observe(root);
    Object.values(cardRefs.current).forEach((card) => card && observer.observe(card));
    return () => observer.disconnect();
  }, []);
  const lines = geometry ? routeLines(geometry) : null;
  const splitY = lines?.splitY;
  // Handles follow the drawn split and merge points.
  useEffect(() => {
    if (splitY !== undefined) updateNodeInternals(node.id);
  }, [node.id, splitY, updateNodeInternals]);
  const shownRoute = reached ? route : undefined;
  const activeSegments = new Set<Segment>(shownRoute ? ROUTE_SEGMENTS[shownRoute] : []);
  const markerOn = `commercial-route-arrow-on-${node.id}`;
  const markerOff = `commercial-route-arrow-off-${node.id}`;
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

  return (
    <div
      ref={rootRef}
      data-commercial-route-group
      className={`relative flex h-full w-full flex-col overflow-visible rounded-2xl border-2 bg-card p-3 shadow-md ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border"}`}
      style={{ borderColor: node.color || "#9a5c24" }}
    >
      <div
        className="mb-2 border-b pb-2 text-sm font-bold"
        style={{ borderColor: node.color || "#9a5c24" }}
      >
        CSA / PCS / LOI{" "}
        <span
          data-selected-commercial-route={route ?? "none"}
          className="float-right rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            backgroundColor: route ? COMMERCIAL_ROUTE_STYLE[route].color : "#94a3b8",
            color: "#fff",
          }}
        >
          {route ?? "No route selected"}
        </span>
      </div>
      {lines && (
        <svg
          data-commercial-route-flow
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          width="100%"
          height="100%"
        >
          <defs>
            {[
              [markerOn, ROUTE_LINE_ON],
              [markerOff, ROUTE_LINE_OFF],
            ].map(([id, color]) => (
              <marker
                key={id}
                id={id}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M1 1L9 5L1 9Z" fill={color} />
              </marker>
            ))}
          </defs>
          {(Object.keys(lines.segments) as Segment[])
            .sort(
              (left, right) => Number(activeSegments.has(left)) - Number(activeSegments.has(right)),
            )
            .map((key) => {
              const segment = lines.segments[key];
              const on = activeSegments.has(key);
              return (
                <path
                  key={key}
                  data-commercial-route-line={key}
                  data-active={on ? "true" : undefined}
                  d={roundedPath(segment.points, 10)}
                  fill="none"
                  stroke={on ? ROUTE_LINE_ON : ROUTE_LINE_OFF}
                  strokeWidth={on ? 3 : 1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd={
                    "arrow" in segment && segment.arrow
                      ? `url(#${on ? markerOn : markerOff})`
                      : undefined
                  }
                />
              );
            })}
          {[lines.busX, lines.mergeX].map((x) => (
            <circle
              key={x}
              cx={x}
              cy={lines.splitY}
              r={4}
              fill={shownRoute ? ROUTE_LINE_ON : ROUTE_LINE_OFF}
            />
          ))}
        </svg>
      )}
      {/* One way in from Qualification, one way out to Estimation. */}
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background"
        style={{
          backgroundColor: shownRoute ? ROUTE_LINE_ON : "#94a3b8",
          ...(splitY !== undefined ? { top: splitY } : {}),
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2 !border-background"
        style={{
          backgroundColor:
            shownRoute && commercialRouteReady(node, shownRoute) ? ROUTE_LINE_ON : "#94a3b8",
          ...(splitY !== undefined ? { top: splitY } : {}),
        }}
      />
      <div
        className="grid min-h-0 flex-1 gap-y-3"
        style={{
          gridTemplateColumns: "26px minmax(0,1fr) 40px minmax(0,1fr) 26px",
          gridTemplateRows: "14px minmax(0,1fr) minmax(0,1fr)",
        }}
      >
        {COMMERCIAL_ROUTES.map((path) => {
          const style = COMMERCIAL_ROUTE_STYLE[path];
          // CSA continues into PCS, so PCS lights up on that route too.
          const onRoute = reached && (route === path || (path === "PCS" && route === "CSA"));
          const active = reached && route === path;
          const ready = active && commercialRouteReady(node, path);
          const Icon = path === "CSA" ? Handshake : path === "PCS" ? Calculator : FileSignature;
          return (
            <section
              key={path}
              ref={(element) => {
                cardRefs.current[path] = element;
              }}
              data-commercial-route-card={path}
              className={`relative min-h-0 overflow-hidden rounded-xl border-2 bg-card p-2 text-[10px] leading-snug ${onRoute ? "commercial-route-node-active" : ""}`}
              style={
                {
                  gridColumn: path === "PCS" ? 4 : 2,
                  gridRow: path === "LOI" ? 3 : 2,
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
                {active && <span className="ml-auto">{ready ? "READY" : "INCOMPLETE"}</span>}
                {path === "PCS" && onRoute && !active && <span className="ml-auto">AFTER CSA</span>}
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
                  {active && !ready && (
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
                  {active && !ready && (
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
                  {active && !ready && (
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
