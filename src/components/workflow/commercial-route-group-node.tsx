"use client";

import { Handle, Position } from "@xyflow/react";
import { Calculator, FileSignature, Handshake } from "lucide-react";
import { COMMERCIAL_ROUTES, COMMERCIAL_ROUTE_STYLE } from "@/lib/commercial-routes";
import { qualificationOf, qualificationRoute } from "@/lib/qualification";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

const cad = (amount: number) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);

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
  const modules = Number(node.customFields.commercialRouteModuleCount || 0);
  const pcsFee =
    Number.isFinite(modules) && modules > 0 ? Math.max(25_000, modules * 1_750) : undefined;
  const signed = node.conditions.some(
    (condition) => condition.id === "loi-ceo-signature-required" && condition.checked,
  );
  const updateField = (key: string, value: string) =>
    useWorkflowStore.getState().updateNode(node.id, {
      type: "commercialRule",
      config: { ...node.config, commercialRouteGroup: true },
      customFields: { ...node.customFields, [key]: value },
    });
  const updateSignature = (checked: boolean) =>
    useWorkflowStore.getState().updateNode(node.id, {
      conditions: node.conditions.map((condition) =>
        condition.id === "loi-ceo-signature-required" ? { ...condition, checked } : condition,
      ),
    });

  return (
    <div
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
      <div className="grid min-h-0 flex-1 grid-rows-3 gap-2">
        {COMMERCIAL_ROUTES.map((path) => {
          const style = COMMERCIAL_ROUTE_STYLE[path];
          const active = reached && route === path;
          const Icon = path === "CSA" ? Handshake : path === "PCS" ? Calculator : FileSignature;
          return (
            <section
              key={path}
              className={`relative min-h-0 rounded-xl border-2 p-2 text-[10px] leading-snug ${active ? "commercial-route-node-active" : ""}`}
              style={
                {
                  borderColor: active ? style.color : "#94a3b8",
                  backgroundColor: active ? `${style.color}0c` : "var(--card)",
                  "--commercial-route-color": style.color,
                } as React.CSSProperties
              }
            >
              <Handle
                type="target"
                position={Position.Left}
                id={path}
                className="!left-[-18px] !size-3 !border-2 !border-background"
                style={{ backgroundColor: active ? style.color : "#94a3b8" }}
              />
              <Handle
                type="source"
                position={Position.Right}
                id={path}
                className="!right-[-18px] !size-3 !border-2 !border-background"
                style={{
                  backgroundColor: active && (path !== "LOI" || signed) ? style.color : "#94a3b8",
                }}
              />
              <div
                className="mb-1 flex items-center gap-1.5 font-bold"
                style={{ color: active ? style.color : "#64748b" }}
              >
                <Icon className="size-3.5" />
                {path} · {style.agreement}
                {active && <span className="ml-auto">ACTIVE</span>}
              </div>
              {path === "CSA" && (
                <>
                  <p className="font-semibold">Consultation Services · CAD $200 / hour + taxes</p>
                  <p className="text-muted-foreground">
                    Up to 10 hours anticipated (about {cad(2_000)} before tax); actual hours billed.
                    Extra work needs prior written approval.
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
                    Fee: greater of {cad(25_000)} or {cad(1_750)} × modules.{" "}
                    {pcsFee !== undefined && <strong>{cad(pcsFee)}</strong>}
                  </p>
                  <p className="text-muted-foreground">Additional hours: {cad(200)} / hour.</p>
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
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
