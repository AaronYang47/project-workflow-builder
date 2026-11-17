import type { DomainNode, NodeLayout } from "@/types/workflow";

/**
 * Colours and Gate detection shared by the Process Presentation and the
 * Executive Presentation PDFs.
 */

// Phase colours matching the project canvas (mint, rose, orange, gold, sky).
export const BASE_PHASE_THEMES = [
  // 1. Phase 1 (Start / Qualification): 薄荷绿
  {
    badge: "#10b981",
    bg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    border: "#6ee7b7",
    text: "#064e3b",
    accent: "#10b981",
    subtext: "#047857",
    tagBg: "#d1fae5",
  },
  // 2. Phase 2 (Phase-01 / Pre-Construction): 玫瑰粉红
  {
    badge: "#f43f5e",
    bg: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
    border: "#fda4af",
    text: "#881337",
    accent: "#f43f5e",
    subtext: "#be123c",
    tagBg: "#ffe4e6",
  },
  // 3. Phase 3 (Phase-02 / Construction): 橘黄色 (Vivid Warm Orange)
  {
    badge: "#ea580c",
    bg: "linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)",
    border: "#fdba74",
    text: "#7c2d12",
    accent: "#f97316",
    subtext: "#c2410c",
    tagBg: "#ffedd5",
  },
  // 4. Phase 4 (Final Close / Commission): 金黄色 (Luminous Golden Yellow)
  {
    badge: "#ca8a04",
    bg: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
    border: "#fde047",
    text: "#713f12",
    accent: "#eab308",
    subtext: "#a16207",
    tagBg: "#fef9c3",
  },
  // 5. Sky Blue
  {
    badge: "#0284c7",
    bg: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
    border: "#bae6fd",
    text: "#0c4a6e",
    accent: "#0284c7",
    subtext: "#0369a1",
    tagBg: "#e0f2fe",
  },
];

export type PhaseTheme = (typeof BASE_PHASE_THEMES)[number];

/** Sixth colour, used only by the Process Presentation. */
export const SLATE_PHASE_THEME: PhaseTheme = {
  badge: "#475569",
  bg: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
  border: "#cbd5e1",
  text: "#1e293b",
  accent: "#475569",
  subtext: "#334155",
  tagBg: "#e2e8f0",
};

/** Purple styling used only for Gate tags and badges. */
export const GATE_TAG_VISUAL = {
  badgeBg: "#7c3aed",
  badgeText: "#ffffff",
  tagBg: "#f3e8ff",
  tagText: "#6d28d9",
  border: "#c084fc",
};

/**
 * Checks whether an L2 node is a Gate or is contained inside a Gate container in the canvas.
 */
export function isNodeGate(
  node: DomainNode,
  allNodes: DomainNode[],
  layout: Record<string, NodeLayout>,
  { matchWorkflowSection = false }: { matchWorkflowSection?: boolean } = {},
): boolean {
  if (
    node.type === "projectStart" ||
    node.type === "terminal" ||
    node.type === "end" ||
    node.id === "project-start" ||
    node.id === "project-complete" ||
    node.id === "close-out"
  ) {
    return false;
  }

  // 1. Direct Gate / Decision node types
  if (node.type === "gate" || node.type === "decision" || node.type === "approval") {
    return true;
  }

  // 2. Parent container in canvas layout is a Gate
  const parentId = layout[node.id]?.parentId;
  if (parentId) {
    const parentNode = allNodes.find((n) => n.id === parentId);
    if (parentNode && (parentNode.type === "gate" || parentNode.color === "#7c3aed")) {
      return true;
    }
  }

  // 3. Node configuration flags
  const config = (node.config || {}) as Record<string, unknown>;
  const stage = String(config.stage || "").toLowerCase();
  if (stage.includes("gate") || stage.includes("decision") || stage.includes("approval")) {
    return true;
  }
  if (config.decisionMode === "approval" || config.decisionMode === "binary") {
    return true;
  }
  if (Array.isArray(config.gateRules) && config.gateRules.length > 0) {
    return true;
  }
  if (Array.isArray(config.signatureRequirements) && config.signatureRequirements.length > 0) {
    return true;
  }

  // 4. Metadata indicators (Process Presentation only)
  if (matchWorkflowSection) {
    const workflowSection = String(node.metadata?.workflowSection || "").toLowerCase();
    if (workflowSection.includes("gate")) {
      return true;
    }
  }

  // 5. Title / ID regex pattern
  const title = (node.title || "").trim();
  const id = (node.id || "").trim();
  if (
    /\b(gate\s*\d*|g[1-9][a-z0-9-]*)\b/i.test(title) ||
    /\b(gate\s*\d*|g[1-9][a-z0-9-]*)\b/i.test(id)
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts a clean, non-wrapping Gate label (e.g. "Gate 1", "Gate 2", "Gate 3").
 */
export function getNodeGateLabel(
  node: DomainNode,
  allNodes: DomainNode[],
  layout: Record<string, NodeLayout>,
  fallbackNumber?: number,
): string {
  const config = (node.config || {}) as Record<string, unknown>;
  if (typeof config.gateLabel === "string" && config.gateLabel.trim()) {
    return config.gateLabel.trim().replace(/^gate\s*/i, "Gate ");
  }

  const parentId = layout[node.id]?.parentId;
  if (parentId) {
    const parentNode = allNodes.find((n) => n.id === parentId);
    if (parentNode && parentNode.title?.trim()) {
      const pMatch =
        parentNode.title.match(/g(?:ate)?\s*0?([1-9])/i) ||
        parentNode.id.match(/g(?:ate)?\s*0?([1-9])/i);
      if (pMatch) {
        return `Gate ${pMatch[1]}`;
      }
      return parentNode.title.trim();
    }
  }

  const title = (node.title || "").trim();
  const id = (node.id || "").trim();
  const match = title.match(/g(?:ate)?\s*0?([1-9])/i) || id.match(/g(?:ate)?\s*0?([1-9])/i);

  if (match) {
    return `Gate ${match[1]}`;
  }

  if (fallbackNumber !== undefined) {
    return `Gate ${fallbackNumber}`;
  }

  return "Gate";
}
