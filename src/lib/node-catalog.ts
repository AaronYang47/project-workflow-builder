import type { ComponentType } from "react";
import { Activity, AlertTriangle, BookOpenCheck, Bot, Boxes, BriefcaseBusiness, CircleDot, CircleStop, ClipboardCheck, FileStack, FileText, FolderKanban, GitBranch, Handshake, Landmark, Layers3, ListChecks, MessageSquareText, Network, Repeat2, ShieldCheck, Table2, Tags, Target, Trophy, UsersRound } from "lucide-react";
import type { WorkflowNodeType } from "@/types/workflow";

// Surfaces in the node palette (left-side panel). These are the "primary"
// node types users can drag or double-click to add.
export const PALETTE_NODE_TYPES = [
  "projectStart",
  "opportunityValidation",
  "general",
  "gate",
  "phase",
  "terminal",
] as const satisfies readonly WorkflowNodeType[];
export type PaletteNodeType = (typeof PALETTE_NODE_TYPES)[number];

export interface NodeDefinition { type: WorkflowNodeType; label: string; description: string; icon: ComponentType<{ className?: string }>; color: string; category: "General" | "Flow" | "Work" | "Governance" | "Information"; defaultSize: { width: number; height: number }; }

export const NODE_CATALOG: NodeDefinition[] = [
  { type: "projectStart", label: "Project Start", description: "Start a project with an editable project number", icon: FolderKanban, color: "#2563a9", category: "Flow", defaultSize: { width: 320, height: 220 } },
  { type: "opportunityValidation", label: "Opportunity Node", description: "High-Level 6-step opportunity qualification, LOI approval, and G1 handoff pipeline", icon: Target, color: "#1f5fa7", category: "Flow", defaultSize: { width: 780, height: 210 } },
  { type: "general", label: "Node", description: "Custom stage, name, content, and icon", icon: Boxes, color: "#3f668c", category: "General", defaultSize: { width: 270, height: 168 } },
  { type: "start", label: "Start", description: "Workflow entry point", icon: CircleDot, color: "#16866f", category: "Flow", defaultSize: { width: 210, height: 104 } },
  { type: "end", label: "End", description: "Workflow completion", icon: CircleStop, color: "#64748b", category: "Flow", defaultSize: { width: 210, height: 104 } },
  { type: "gate", label: "Decision Module", description: "Custom title, conditions, and YES / NO decision", icon: GitBranch, color: "#16866f", category: "General", defaultSize: { width: 754, height: 470 } },
  { type: "phase", label: "Phase / Group", description: "Swimlane container", icon: Layers3, color: "#64748b", category: "Flow", defaultSize: { width: 620, height: 280 } },
  { type: "decision", label: "Decision", description: "Conditional branch", icon: Repeat2, color: "#7657b5", category: "Flow", defaultSize: { width: 230, height: 132 } },
  { type: "activity", label: "Activity", description: "Task or action", icon: Activity, color: "#2563a9", category: "Work", defaultSize: { width: 240, height: 132 } },
  { type: "handoff", label: "Handoff", description: "Ownership transfer", icon: Handshake, color: "#397d91", category: "Work", defaultSize: { width: 240, height: 132 } },
  { type: "approval", label: "Approval", description: "Review and sign-off", icon: ClipboardCheck, color: "#6d5c9d", category: "Governance", defaultSize: { width: 240, height: 132 } },
  { type: "commercialRule", label: "Commercial Rule", description: "Commercial constraint", icon: Landmark, color: "#9a5c24", category: "Governance", defaultSize: { width: 240, height: 132 } },
  { type: "continuousControl", label: "Continuous Control", description: "Ongoing control", icon: ShieldCheck, color: "#177a77", category: "Governance", defaultSize: { width: 240, height: 132 } },
  { type: "systemRule", label: "System Rule", description: "Automated constraint", icon: Bot, color: "#51647c", category: "Governance", defaultSize: { width: 240, height: 132 } },
  { type: "risk", label: "Risk", description: "Risk or concern", icon: AlertTriangle, color: "#b34a47", category: "Governance", defaultSize: { width: 240, height: 132 } },
  { type: "exception", label: "Exception", description: "Exceptional route", icon: BookOpenCheck, color: "#aa5540", category: "Governance", defaultSize: { width: 240, height: 132 } },
  { type: "document", label: "Document", description: "Managed artifact", icon: FileText, color: "#4f6fa8", category: "Information", defaultSize: { width: 225, height: 142 } },
  { type: "documentGroup", label: "Document Group", description: "Collapsible documents", icon: FileStack, color: "#526d82", category: "Information", defaultSize: { width: 240, height: 132 } },
  { type: "note", label: "Note", description: "Canvas annotation", icon: MessageSquareText, color: "#a07820", category: "Information", defaultSize: { width: 230, height: 142 } },
  { type: "approvalMatrix", label: "Approval Matrix", description: "Document and role approval table", icon: Table2, color: "#334e73", category: "Governance", defaultSize: { width: 760, height: 390 } },
  { type: "controlBackbone", label: "Control Backbone", description: "Controls spanning the workflow", icon: Network, color: "#245d88", category: "Governance", defaultSize: { width: 1680, height: 430 } },
  { type: "responsibilityLane", label: "Responsibility Lane", description: "Gate-aligned ownership roles", icon: UsersRound, color: "#476b8d", category: "Governance", defaultSize: { width: 1680, height: 330 } },
  { type: "serviceLegend", label: "Service Legend", description: "Editable service classifications", icon: Tags, color: "#52734d", category: "Information", defaultSize: { width: 720, height: 210 } },
  { type: "jobNumbering", label: "Job Numbering", description: "Current and proposed numbering", icon: BriefcaseBusiness, color: "#3e6c9d", category: "Information", defaultSize: { width: 760, height: 280 } },
  { type: "businessRules", label: "Business Rules", description: "Cross-workflow business rules", icon: ListChecks, color: "#193f69", category: "Governance", defaultSize: { width: 760, height: 340 } },
  { type: "terminal", label: "Project Complete", description: "Workflow completion and warranty", icon: Trophy, color: "#5d8f36", category: "Flow", defaultSize: { width: 300, height: 150 } },
];

export const AVAILABLE_NODE_CATALOG = NODE_CATALOG.filter((item) =>
  (PALETTE_NODE_TYPES as readonly WorkflowNodeType[]).includes(item.type),
);

export const getNodeDefinition = (type: WorkflowNodeType) => NODE_CATALOG.find((item) => item.type === type)!;
