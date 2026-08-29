"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Circle,
  Layers3,
  ListChecks,
  Route,
  Target,
} from "lucide-react";
import { evaluateOpportunity, getOpportunityConfig } from "@/lib/opportunity-evaluation";
import { getWorkflowProgress } from "@/lib/workflow-progress";
import { opportunityRouteLabels } from "@/lib/opportunity-routing";
import { useWorkflowStore } from "@/store/workflow-store";
import type { DomainNode } from "@/types/workflow";

type MobileView = "lifecycle" | "workflow";

function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" }) {
  const styles = {
    slate: "border-slate-300 bg-slate-500/10 text-slate-700",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700",
    red: "border-red-500/30 bg-red-500/10 text-red-700",
  };
  return <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${styles[tone]}`}>{children}</span>;
}

function FieldValue({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  return <div className="rounded-lg border bg-background/70 px-2.5 py-2"><p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-0.5 break-words text-[11px] font-medium text-foreground">{String(value)}</p></div>;
}

function OpportunityDetail({ node }: { node: DomainNode }) {
  const result = evaluateOpportunity(node);
  const config = getOpportunityConfig(node);
  const intake = config.intake || {};
  const sections = [
    ["Client & Decision Authority", intake.clientAuthority],
    ["Project Definition", intake.projectDefinition],
    ["Site & Land", intake.siteLand],
    ["Design & Modular Compatibility", intake.design],
    ["Budget / Funding / Timeline", intake.budgetFundingTimeline],
    ["Team & Commitment", intake.teamCommitment],
  ] as const;
  return <div className="mt-3 space-y-3">
    <div className="grid grid-cols-2 gap-2"><FieldValue label="Recommended route" value={opportunityRouteLabels[result.recommendedRoute]} /><FieldValue label="Opportunity score" value={`${result.totalScore} / 100 · ${result.scoreGrade}`} /></div>
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary"><Route className="size-3.5" />Route decision</p><p className="mt-1 text-xs font-bold">{result.routeReason}</p></div>
    <div className="rounded-xl border bg-background/70 p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Target className="size-3.5" />Eligible for</p><div className="mt-2 space-y-2">{result.eligibility.map((item) => <div key={item.key} className="rounded-lg border bg-card p-2"><div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-[11px] font-semibold">{item.label}</span><StatusPill tone={item.status === "ELIGIBLE" ? "green" : item.status === "CONDITIONALLY_ELIGIBLE" ? "amber" : item.status === "NOT_ELIGIBLE" ? "red" : "slate"}>{item.status.replaceAll("_", " ")}</StatusPill></div>{item.reasons.length ? <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{item.reasons.join(" ")}</p> : null}</div>)}</div></div>
    <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Evidence areas</p>{sections.map(([title, values]) => <details key={title} className="rounded-xl border bg-background/70"><summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold">{title}</summary><div className="grid grid-cols-2 gap-2 border-t p-2">{Object.entries(values || {}).filter(([key]) => key !== "stakeholders" && key !== "members").map(([key, value]) => <FieldValue key={key} label={key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase())} value={value} />)}</div></details>)}</div>
    {result.requiredActions.length ? <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold text-amber-800"><AlertTriangle className="size-3.5" />Required next actions</p><ol className="mt-1 space-y-1 pl-4 text-[10px] text-muted-foreground">{result.requiredActions.map((action) => <li key={action} className="list-decimal">{action}</li>)}</ol></div> : null}
  </div>;
}

function NodeCard({ node, reached, onSelect }: { node: DomainNode; reached: boolean; onSelect: () => void }) {
  const complete = reached || node.conditions.length > 0 && node.conditions.every((condition) => !condition.required || condition.checked);
  const isOpportunity = node.type === "opportunityValidation";
  return <article className="rounded-2xl border bg-background shadow-sm">
    <button type="button" onClick={onSelect} className="flex w-full items-start gap-3 p-3 text-left">
      <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${complete ? "bg-emerald-500/15 text-emerald-700" : "bg-primary/10 text-primary"}`}>{complete ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}</span>
      <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold">{node.title}</span><StatusPill tone={complete ? "green" : "amber"}>{complete ? "Complete" : "Action"}</StatusPill></span><span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">{node.description}</span></span>
      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </button>
    <div className="space-y-2 border-t px-3 pb-3 pt-2">
      {node.conditions.length ? <div><p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Release conditions</p><div className="mt-1 space-y-1">{node.conditions.map((condition) => <div key={condition.id} className="flex items-center gap-2 text-[10px]"><span className={`size-2 rounded-full ${condition.checked ? "bg-emerald-500" : "bg-amber-500"}`} />{condition.label}{condition.required ? <span className="text-red-600">*</span> : null}</div>)}</div></div> : null}
      {isOpportunity ? <OpportunityDetail node={node} /> : null}
      {!isOpportunity && node.documents.length ? <p className="text-[10px] text-muted-foreground">Documents: {node.documents.length}</p> : null}
    </div>
  </article>;
}

/** Full-content mobile editor surface without the desktop canvas renderer. */
export function MobileWorkflowView() {
  const [view, setView] = useState<MobileView>("lifecycle");
  const { file, selectNodes } = useWorkflowStore();
  const progress = useMemo(() => getWorkflowProgress(file.graph.nodes, file.graph.edges), [file.graph.nodes, file.graph.edges]);
  const lifecycleNodes = file.highLevel?.graph.nodes || [];
  const workflowNodes = file.graph.nodes.filter((node) => node.type !== "phase");

  return <main className="min-h-dvh overflow-y-auto bg-canvas text-foreground"><header className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur"><div className="flex items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">PW</span><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-bold">{file.graph.metadata.name || "Project Workflow"}</h1><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Complete mobile workflow · {file.graph.metadata.status}</p></div></div><div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border bg-muted/50 p-1"><button type="button" onClick={() => setView("lifecycle")} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-semibold ${view === "lifecycle" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}><Layers3 className="size-3.5" />L1 · Lifecycle</button><button type="button" onClick={() => setView("workflow")} className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[11px] font-semibold ${view === "workflow" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}><ListChecks className="size-3.5" />L2 · Detailed workflow</button></div></header><section className="mx-auto max-w-xl space-y-3 p-4">{view === "lifecycle" ? <><div className="rounded-xl border bg-background p-3 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Lifecycle overview</p><p className="mt-1 text-xs text-muted-foreground">{lifecycleNodes.length} lifecycle steps from initial contact to final close.</p></div><ol className="space-y-2">{lifecycleNodes.map((node, index) => <li key={node.id} className="relative">{index < lifecycleNodes.length - 1 ? <span className="absolute left-5 top-10 h-5 w-px bg-border" aria-hidden /> : null}<button type="button" onClick={() => { const linked = node.linkedLayer2NodeIds ?? node.linkedDetailedNodeIds ?? []; if (linked.length) { selectNodes([linked[0]]); setView("workflow"); } }} className="relative flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left shadow-sm"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-white">{node.type === "primaryGate" ? <CheckCircle2 className="size-5" /> : index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{node.title}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{node.description}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button></li>)}</ol></> : <><div className="rounded-xl border bg-background p-3 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Detailed workflow</p><p className="mt-1 text-xs text-muted-foreground">All workflow nodes and their release criteria are shown below.</p></div><div className="space-y-3">{workflowNodes.map((node) => <NodeCard key={node.id} node={node} reached={progress.reachedNodeIds.has(node.id)} onSelect={() => selectNodes([node.id])} />)}</div></>}</section></main>;
}
