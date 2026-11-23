"use client";

import { Handle, Position } from "@xyflow/react";
import { Calculator, FileSignature, Handshake } from "lucide-react";
import { COMMERCIAL_ROUTE_STYLE, commercialRouteForNode } from "@/lib/commercial-routes";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const cad = (amount: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);

export function CommercialRouteNode({
  node,
  selected,
  reached,
}: {
  node: DomainNode;
  selected: boolean;
  reached: boolean;
}) {
  const route = commercialRouteForNode(node);
  if (!route) return null;

  const style = COMMERCIAL_ROUTE_STYLE[route];
  const moduleCount = Number(node.customFields.commercialRouteModuleCount || 0);
  const pcsFee =
    Number.isFinite(moduleCount) && moduleCount > 0
      ? Math.max(25_000, moduleCount * 1_750)
      : undefined;
  const loiSigned = node.conditions.find(
    (condition) => condition.id === "loi-ceo-signature-required",
  );
  const Icon = route === "CSA" ? Handshake : route === "PCS" ? Calculator : FileSignature;

  const updateField = (key: string, value: string | number) =>
    useWorkflowStore.getState().updateNode(node.id, {
      customFields: { ...node.customFields, [key]: value },
    });

  const updateLoiSignature = (checked: boolean) =>
    useWorkflowStore.getState().updateNode(node.id, {
      conditions: node.conditions.map((condition) =>
        condition.id === "loi-ceo-signature-required" ? { ...condition, checked } : condition,
      ),
    });

  return (
    <div
      data-commercial-route-node={route}
      data-route-active={reached ? "true" : "false"}
      className={`commercial-route-node relative flex h-full w-full flex-col overflow-visible rounded-2xl border-2 bg-card shadow-md ${reached ? "commercial-route-node-active" : ""} ${selected ? "ring-2 ring-offset-2 ring-offset-background" : ""}`}
      style={
        {
          borderColor: style.color,
          color: "var(--foreground)",
          "--commercial-route-color": style.color,
          ...(selected ? { outlineColor: style.color } : {}),
        } as React.CSSProperties
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: style.color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2 !border-background"
        style={{ backgroundColor: reached ? style.color : "#94a3b8" }}
      />

      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: `${style.color}55` }}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: style.color }}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: style.color }}
          >
            {route} · {style.agreement}
          </p>
          <h3 className="truncate text-xs font-bold">{node.title}</h3>
        </div>
        {reached && (
          <span
            className="rounded-full px-2 py-1 text-[9px] font-bold text-white"
            style={{ backgroundColor: style.color }}
          >
            ACTIVE
          </span>
        )}
      </div>

      {route === "CSA" && (
        <div className="flex flex-1 flex-col gap-1.5 px-3 py-2 text-[10px] leading-snug">
          <p className="font-bold">CAD $200 / hour + applicable taxes</p>
          <p className="text-muted-foreground">
            Anticipated scope: up to 10 hours (about {cad(2_000)} before tax). Billed for actual
            hours worked.
          </p>
          <p className="mt-auto text-muted-foreground">
            Extra work requires prior written approval.
          </p>
        </div>
      )}

      {route === "PCS" && (
        <div className="flex flex-1 flex-col gap-1.5 px-3 py-2 text-[10px] leading-snug">
          <label className="flex items-center justify-between gap-2 font-semibold">
            Modules
            <input
              aria-label="PCS module count"
              className="nodrag w-20 rounded-md border bg-background px-2 py-1 text-right text-xs outline-none focus:border-primary"
              type="number"
              min={1}
              step={1}
              value={String(node.customFields.commercialRouteModuleCount || "")}
              onChange={(event) => updateField("commercialRouteModuleCount", event.target.value)}
            />
          </label>
          <p className="font-bold">
            Fee: greater of {cad(25_000)} or {cad(1_750)} × modules
          </p>
          <p className="text-muted-foreground">
            {pcsFee === undefined
              ? "Enter module count to calculate the agreement fee."
              : `Calculated fee: ${cad(pcsFee)} CAD`}
          </p>
          <p className="mt-auto text-muted-foreground">
            Additional hours beyond the included amount: {cad(200)} / hour.
          </p>
        </div>
      )}

      {route === "LOI" && (
        <div className="flex flex-1 flex-col gap-1.5 px-3 py-2 text-[10px] leading-snug">
          <label className="flex flex-col gap-1 font-semibold">
            Estimated project price or range (CAD)
            <input
              aria-label="LOI estimated project price or range in CAD"
              className="nodrag rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              type="text"
              placeholder="Enter price or range"
              defaultValue={String(node.customFields.commercialRoutePrice || "")}
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== String(node.customFields.commercialRoutePrice || ""))
                  updateField("commercialRoutePrice", value);
              }}
            />
          </label>
          <p className="text-muted-foreground">
            Non-binding estimate; confirmed in the Sales Agreement.
          </p>
          <label className="nodrag mt-auto flex cursor-pointer items-center gap-2 font-semibold">
            <input
              type="checkbox"
              aria-label="LOI signed by the company CEO"
              checked={loiSigned?.checked === true}
              onChange={(event) => updateLoiSignature(event.target.checked)}
            />
            CEO signature received
          </label>
          {!loiSigned?.checked && (
            <p className="text-[9px] font-semibold text-amber-700">Required before Estimation</p>
          )}
        </div>
      )}
    </div>
  );
}
