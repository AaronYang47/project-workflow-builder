"use client";

import { memo, useEffect } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";
import { AlertTriangle, Route, Target, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { opportunityHandleIsActive, opportunityRouteLabels } from "@/lib/opportunity-routing";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" }) {
  const tones = {
    slate: "border-slate-300 bg-slate-500/10 text-slate-700",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    red: "border-red-500/30 bg-red-500/10 text-red-700",
  };
  return <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", tones[tone])}>{children}</span>;
}

function OpportunityDecisionNodeComponent({ node, selected }: { node: DomainNode; selected: boolean }) {
  useEffect(() => {
    const root = document.querySelector(`[data-id="${node.id}"]`);
    if (!root) return;
    const stopCanvasWheel = (event: Event) => {
      const wheel = event as WheelEvent;
      if (!wheel.ctrlKey && !wheel.metaKey && wheel.deltaY !== 0) event.stopPropagation();
    };
    root.addEventListener("wheel", stopCanvasWheel, { capture: true });
    return () => root.removeEventListener("wheel", stopCanvasWheel, { capture: true });
  }, [node.id]);

  const result = evaluateOpportunity(node);
  const config = getOpportunityConfig(node);
  const statusTone = result.overallStatus === "READY" ? "green" : result.overallStatus === "NO-GO" || result.overallStatus === "BLOCKED" ? "red" : "amber";
  const active = (id: string) => opportunityHandleIsActive(result, id);

  const mergeIntoSingleNode = () => {
    const store = useWorkflowStore.getState();
    const configuredIds = config.opportunitySectionNodeIds || [];
    const discoveredIds = store.file.graph.nodes
      .filter((item) => item.config.opportunityParentId === node.id && item.config.opportunitySection)
      .map((item) => item.id);
    const childIds = Array.from(new Set([...configuredIds, ...discoveredIds])).filter((id) => store.file.graph.nodes.some((item) => item.id === id));
    const childSet = new Set(childIds);
    const incomingEdges = store.file.graph.edges.filter(
      (edge) => childSet.has(edge.target) && !childSet.has(edge.source),
    );
    if (childIds.length) store.deleteNodes(childIds);
    incomingEdges.forEach((edge) => {
      store.addEdge({ ...edge, target: node.id, targetHandle: "in" });
    });
    store.updateNode(node.id, { config: { ...node.config, opportunityRole: undefined, opportunitySectionNodeIds: undefined } });
  };

  const outputs = [
    ["P1 · Gate 1 passed", "pass-p1-p2", "green"],
    ["P2 · Strong qualified", "loi-governed", "blue"],
    ["P3 · CSA / PCS", "csa-pcs", "cyan"],
    ["P4 · Site feasibility", "site-feasibility", "amber"],
    ["P5 · No-Go / disqualified", "nogo-disqualified", "red"],
    ["PI · Governed LOI", "path-loi", "violet"],
  ] as const;
  const outputColors: Record<string, string> = { green: "#10b981", blue: "#2563eb", cyan: "#06b6d4", amber: "#f59e0b", red: "#ef4444", violet: "#8b5cf6" };

  return (
    <div className="relative h-full w-full overflow-visible">
      <div data-canvas-node className={cn("workflow-node flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-[0_8px_30px_rgba(15,23,42,.14)]", selected && "ring-2 ring-primary/80")}>
        <NodeResizer minWidth={560} minHeight={420} isVisible={selected} onResizeEnd={(_, params) => useWorkflowStore.getState().updateLayout(node.id, { width: params.width, height: params.height }, true)} lineClassName="!border-primary" handleClassName="!size-2.5 !rounded-sm !border-primary !bg-background" />
        <header data-node-header className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Target className="size-5" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Opportunity Decision Hub</p><h3 className="truncate text-sm font-bold">Rules, eligibility, route and score</h3></div></div>
          <div className="flex shrink-0 items-center gap-2"><button type="button" onClick={mergeIntoSingleNode} title="Merge the six evidence nodes back into one Opportunity node" className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[0.66rem] font-semibold text-primary hover:bg-primary/10"><Undo2 className="size-3" />Merge to 1 node</button><Badge tone={statusTone}>{result.overallStatus}</Badge></div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_220px] divide-x">
          <main className="min-w-0 space-y-3 overflow-y-auto p-3 overscroll-contain"><div className="rounded-xl border bg-muted/25 p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recommended route</p><p className="mt-1 text-lg font-extrabold">{opportunityRouteLabels[result.recommendedRoute]}</p></div><div className="text-right"><p className="text-[10px] text-muted-foreground">Opportunity score</p><p className="text-2xl font-black">{result.totalScore}<span className="ml-1 text-xs font-medium text-muted-foreground">/100</span></p><Badge tone={result.scoreGrade === "Strong" ? "green" : result.scoreGrade === "High Risk" ? "red" : "amber"}>{result.scoreGrade}</Badge></div></div><p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{result.routeReason}</p></div><div className="grid grid-cols-2 gap-2">{result.eligibility.slice(0, 6).map((item) => <div key={item.key} className="rounded-lg border bg-background/60 p-2"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-semibold">{item.label}</span><Badge tone={item.status === "ELIGIBLE" || item.status === "CONDITIONALLY_ELIGIBLE" ? "green" : item.status === "NOT_ELIGIBLE" ? "red" : "slate"}>{item.status === "NOT_YET_ELIGIBLE" ? "Not yet" : item.status === "CONDITIONALLY_ELIGIBLE" ? "Conditional" : item.status}</Badge></div></div>)}</div>{result.requiredActions.length > 0 && <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5"><p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800"><AlertTriangle className="size-3.5" />Next actions</p><ul className="mt-1 space-y-0.5 pl-4 text-[10px] text-muted-foreground">{result.requiredActions.slice(0, 4).map((action) => <li key={action} className="list-disc">{action}</li>)}</ul></div>}</main>
          <aside className="space-y-2 overflow-y-auto bg-muted/20 p-3 overscroll-contain"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Route className="size-3.5 text-primary" />Outputs</p>{outputs.map(([label, id, color]) => <div key={id} className={cn("flex items-center justify-between gap-2 rounded-lg border px-2 py-2", active(id) ? "border-primary/40 bg-primary/5" : "bg-background/40 opacity-60")}><span className="text-[10px] font-semibold leading-tight">{label}</span><span className="size-2.5 rounded-full" style={{ backgroundColor: active(id) ? outputColors[color] : "#94a3b8" }} /></div>)}<div className="mt-3 rounded-lg border bg-background/60 p-2 text-[9px] text-muted-foreground">Shared intake updates automatically. Score is a management indicator and never overrides a hard rule.</div></aside>
        </div>
        <footer className="border-t bg-muted/35 px-4 py-2 text-[10px] text-muted-foreground">Evidence → Rules → Eligibility → Route → Score → Status</footer>
      </div>
      <Handle type="target" position={Position.Left} id="in" title="Opportunity evidence input" className="!left-[-8px] !z-50 !size-4 !border-2 !border-background !bg-primary" />
      <Handle type="source" position={Position.Right} id="pass-p1-p2" style={{ top: "12%" }} title="P1 · Gate 1 passed" className={cn("!right-0 !z-50 !size-4 !border-2 !border-background", active("pass-p1-p2") ? "!bg-emerald-500" : "!bg-emerald-500/55")} />
      <Handle type="source" position={Position.Right} id="loi-governed" style={{ top: "28%" }} title="P2 · Strong qualified" className={cn("!right-0 !z-50 !size-4 !border-2 !border-background", active("loi-governed") ? "!bg-blue-500" : "!bg-blue-500/55")} />
      <Handle type="source" position={Position.Right} id="csa-pcs" style={{ top: "44%" }} title="P3 · CSA / PCS" className={cn("!right-0 !z-50 !size-4 !border-2 !border-background", active("csa-pcs") ? "!bg-cyan-500" : "!bg-cyan-500/55")} />
      <Handle type="source" position={Position.Right} id="site-feasibility" style={{ top: "60%" }} title="P4 · Site feasibility" className={cn("!right-0 !z-50 !size-4 !border-2 !border-background", active("site-feasibility") ? "!bg-amber-500" : "!bg-amber-500/55")} />
      <Handle type="source" position={Position.Right} id="nogo-disqualified" style={{ top: "76%" }} title="P5 · No-Go / disqualified" className={cn("!right-0 !z-50 !size-4 !border-2 !border-background", active("nogo-disqualified") ? "!bg-red-500" : "!bg-red-500/55")} />
      <Handle type="source" position={Position.Right} id="path-loi" style={{ top: "92%" }} title="PI · Governed LOI" className={cn("!right-0 !z-50 !size-4 !border-2 !border-background", active("path-loi") ? "!bg-violet-500" : "!bg-violet-500/55")} />
    </div>
  );
}

export const OpportunityDecisionNode = memo(OpportunityDecisionNodeComponent);
