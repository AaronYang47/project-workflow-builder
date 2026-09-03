import type { WorkflowFile, DomainNode, HighLevelNode, NodeLayout } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";

// 1:1 Matching colors from the project canvas (薄荷绿 -> 玫瑰粉红 -> 橘黄色 -> 金黄色)
const DEFAULT_PHASE_THEMES = [
  // 1. Phase 1 (Start / Qualification): 薄荷绿
  {
    badge: "#10b981",
    bg: "#ecfdf5",
    border: "#6ee7b7",
    text: "#064e3b",
    accent: "#10b981",
    subtext: "#047857",
    tagBg: "#d1fae5",
    axisGradient: "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
  },
  // 2. Phase 2 (Phase-01 / Pre-Construction): 玫瑰粉红
  {
    badge: "#f43f5e",
    bg: "#fff1f2",
    border: "#fda4af",
    text: "#881337",
    accent: "#f43f5e",
    subtext: "#be123c",
    tagBg: "#ffe4e6",
    axisGradient: "linear-gradient(90deg, #f43f5e 0%, #fb7185 100%)",
  },
  // 3. Phase 3 (Phase-02 / Construction): 橘黄色 (Warm Vivid Orange)
  {
    badge: "#ea580c",
    bg: "#fff7ed",
    border: "#fdba74",
    text: "#7c2d12",
    accent: "#f97316",
    subtext: "#c2410c",
    tagBg: "#ffedd5",
    axisGradient: "linear-gradient(90deg, #ea580c 0%, #fb923c 100%)",
  },
  // 4. Phase 4 (Final Close / Commission): 金黄色 (Luminous Golden Yellow)
  {
    badge: "#ca8a04",
    bg: "#fefce8",
    border: "#fde047",
    text: "#713f12",
    accent: "#eab308",
    subtext: "#a16207",
    tagBg: "#fef9c3",
    axisGradient: "linear-gradient(90deg, #ca8a04 0%, #facc15 100%)",
  },
  // 5. Sky Blue
  {
    badge: "#0284c7",
    bg: "#f0f9ff",
    border: "#bae6fd",
    text: "#0c4a6e",
    accent: "#0284c7",
    subtext: "#0369a1",
    tagBg: "#e0f2fe",
    axisGradient: "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
  },
];

const GATE_TAG_VISUAL = {
  badgeBg: "#7c3aed",
  badgeText: "#ffffff",
  tagBg: "#f3e8ff",
  tagText: "#6d28d9",
  border: "#8b5cf6",
};

function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isNodeGate(
  node: DomainNode,
  allNodes: DomainNode[],
  layout: Record<string, NodeLayout>,
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

  if (node.type === "gate" || node.type === "decision" || node.type === "approval") {
    return true;
  }

  const parentId = layout[node.id]?.parentId;
  if (parentId) {
    const parentNode = allNodes.find((n) => n.id === parentId);
    if (parentNode && (parentNode.type === "gate" || parentNode.color === "#7c3aed")) {
      return true;
    }
  }

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

  const title = (node.title || "").trim();
  const id = (node.id || "").trim();
  if (/\b(gate\s*\d*|g[1-9][a-z0-9-]*)\b/i.test(title) || /\b(gate\s*\d*|g[1-9][a-z0-9-]*)\b/i.test(id)) {
    return true;
  }

  return false;
}

function getNodeGateLabel(
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
      const pMatch = parentNode.title.match(/g(?:ate)?\s*0?([1-9])/i) || parentNode.id.match(/g(?:ate)?\s*0?([1-9])/i);
      if (pMatch) {
        return `Gate ${pMatch[1]}`;
      }
      return parentNode.title.trim();
    }
  }

  const title = (node.title || "").trim();
  const id = (node.id || "").trim();
  const match =
    title.match(/g(?:ate)?\s*0?([1-9])/i) ||
    id.match(/g(?:ate)?\s*0?([1-9])/i);

  if (match) {
    return `Gate ${match[1]}`;
  }

  if (fallbackNumber !== undefined) {
    return `Gate ${fallbackNumber}`;
  }

  return "Gate";
}

/**
 * Generates an executive alternating timeline roadmap presentation PDF (L1 & L2 focus)
 * directly inspired by classic milestone timeline infographics.
 */
export async function exportExecutivePresentationPdf(file: WorkflowFile): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");

  const projectName = file.graph.metadata.name || "Process Workflow Architecture";
  const projectNumber = file.operations?.projectNumber || "PRJ-001";
  const version = file.graph.metadata.version || "v1.0";
  const timestamp = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const allNodes = file.graph.nodes || [];
  const layout = file.layout.nodes || {};
  const highLevelNodes = file.highLevel?.graph.nodes || [];
  const highLevelEdges = file.highLevel?.graph.edges || [];

  // 1. Resolve L1 Phases in topological order
  let orderedL1: HighLevelNode[] = [];
  if (highLevelNodes.length > 0) {
    orderedL1 = orderHighLevelNodes(highLevelNodes, highLevelEdges);
  } else {
    const phaseNodes = allNodes.filter((n) => n.type === "phase");
    if (phaseNodes.length > 0) {
      orderedL1 = phaseNodes.map((p, idx) => ({
        id: p.id,
        type: "phase" as const,
        title: p.title || `Phase ${idx + 1}`,
        description: p.description || "",
        code: `PHASE-0${idx + 1}`,
      }));
    } else {
      orderedL1 = [
        {
          id: "hl-root",
          type: "phase" as const,
          title: "Project Lifecycle",
          description: "Full end-to-end process lifecycle",
          code: "PHASE-01",
        },
      ];
    }
  }

  // 2. Resolve L2 nodes for each Phase
  const getLinkedL2Nodes = (l1Node: HighLevelNode): DomainNode[] => {
    const explicitIds = l1Node.linkedLayer2NodeIds ?? l1Node.linkedDetailedNodeIds ?? [];
    if (explicitIds.length > 0) {
      const orderedIds = orderLinkedWorkflowNodeIds(explicitIds, allNodes);
      return orderedIds
        .map((id) => allNodes.find((n) => n.id === id))
        .filter((n): n is DomainNode => Boolean(n && n.type !== "phase" && n.type !== "gate"));
    }

    const byParent = allNodes.filter((n) => {
      if (n.type === "phase" || n.type === "gate") return false;
      const pId = layout[n.id]?.parentId;
      if (pId === l1Node.id) return true;
      if (pId) {
        const grandParentId = layout[pId]?.parentId;
        if (grandParentId === l1Node.id) return true;
      }
      return n.config?.phaseId === l1Node.id || (n.metadata?.phaseTitle && n.metadata.phaseTitle === l1Node.title);
    });
    if (byParent.length > 0) return byParent;

    if (l1Node.type === "end" || l1Node.title.toLowerCase().includes("close") || l1Node.title.toLowerCase().includes("commission")) {
      const closeNodes = allNodes.filter(
        (n) =>
          n.type !== "phase" &&
          n.type !== "gate" &&
          (n.type === "terminal" ||
            n.id === "project-complete" ||
            n.id === "close-out" ||
            n.title.toLowerCase().includes("complete") ||
            n.title.toLowerCase().includes("close")),
      );
      if (closeNodes.length > 0) return closeNodes;
    }

    if (l1Node.type === "start" || l1Node.title.toLowerCase().includes("start")) {
      const startNodes = allNodes.filter(
        (n) =>
          n.type !== "phase" &&
          n.type !== "gate" &&
          (n.type === "projectStart" || n.id === "project-start" || n.title.toLowerCase().includes("start")),
      );
      if (startNodes.length > 0) return startNodes;
    }

    if (orderedL1.length === 1) {
      return allNodes.filter((n) => n.type !== "phase" && n.type !== "gate");
    }

    return [];
  };

  // Collect flat sequence of all L2 steps with phase context
  interface TimelineStep {
    phaseIdx: number;
    stepIdx: number;
    globalIdx: number;
    stepNumber: string;
    node: DomainNode;
    phase: HighLevelNode;
    theme: typeof DEFAULT_PHASE_THEMES[0];
    isGate: boolean;
    gateLabel: string;
    isStart: boolean;
    isTerminal: boolean;
  }

  const allTimelineSteps: TimelineStep[] = [];
  let globalCount = 0;

  orderedL1.forEach((l1Node, phaseIdx) => {
    const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
    const linkedL2 = getLinkedL2Nodes(l1Node);

    linkedL2.forEach((node, stepIdx) => {
      const isGate = isNodeGate(node, allNodes, layout);
      const isStart = node.type === "projectStart" || node.id === "project-start";
      const isTerminal = node.type === "terminal" || node.type === "end" || node.id === "project-complete" || node.id === "close-out";
      const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : "";

      allTimelineSteps.push({
        phaseIdx,
        stepIdx,
        globalIdx: globalCount++,
        stepNumber: `STEP ${phaseIdx + 1}.${stepIdx + 1}`,
        node,
        phase: l1Node,
        theme,
        isGate,
        gateLabel,
        isStart,
        isTerminal,
      });
    });
  });

  const totalSteps = allTimelineSteps.length;
  const totalPhases = orderedL1.length;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.zIndex = "-99999";
  container.style.pointerEvents = "none";
  container.style.opacity = "1";
  container.style.visibility = "visible";
  // Exact 297 : 210 A4 ratio (1485px x 1050px = 5px per mm)
  container.style.width = "1485px";
  container.style.height = "1050px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  container.style.padding = "24px 32px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  // 3. Build Top Phase Overview Band (L1 Phase Brackets across top)
  const phaseBandsHtml = orderedL1
    .map((l1Node, phaseIdx) => {
      const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
      const count = allTimelineSteps.filter((s) => s.phaseIdx === phaseIdx).length;
      return `
        <div style="flex: ${Math.max(1, count)}; min-width: 0; background: ${theme.bg}; border: 2px solid ${theme.border}; border-top: 5px solid ${theme.accent}; border-radius: 8px; padding: 10px 14px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
              <span style="background: ${theme.badge}; color: #ffffff; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                ${escapeHtml(l1Node.code || `PHASE-0${phaseIdx + 1}`)}
              </span>
              <span style="font-size: 10.5px; font-weight: 800; color: ${theme.subtext};">
                ${count} Steps
              </span>
            </div>
            <div style="font-size: 16px; font-weight: 900; color: ${theme.text}; line-height: 1.15;">
              ${escapeHtml(l1Node.title)}
            </div>
            <div style="font-size: 11px; color: ${theme.subtext}; font-weight: 600; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(l1Node.description || "Active Phase")}
            </div>
          </div>
          <div style="width: 32px; height: 32px; border-radius: 50%; background: #ffffff; border: 2px solid ${theme.border}; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 900; color: ${theme.text}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            0${phaseIdx + 1}
          </div>
        </div>
      `;
    })
    .join("");

  // 4. Build Alternating Timeline Milestone Nodes (Top / Bottom Alternation like reference image!)
  const timelineNodesHtml = allTimelineSteps
    .map((step, idx) => {
      const isTop = idx % 2 === 0; // Alternates Top and Bottom
      const isGate = step.isGate;
      const theme = step.theme;

      const circleColor = isGate ? GATE_TAG_VISUAL.badgeBg : theme.accent;
      const circleBorder = isGate ? GATE_TAG_VISUAL.border : theme.border;
      const circleText = isGate ? "#ffffff" : "#ffffff";

      // Main icon/badge content inside circle
      const circleContent = isGate
        ? `🚦`
        : step.isStart
          ? `🚀`
          : step.isTerminal
            ? `🏁`
            : `${step.phaseIdx + 1}.${step.stepIdx + 1}`;

      const gateBadgeHtml = isGate
        ? `<span style="background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1.5px solid ${GATE_TAG_VISUAL.border}; font-size: 11px; font-weight: 900; padding: 2.5px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(124,58,237,0.15); margin-bottom: 6px;">🚦 ${escapeHtml(step.gateLabel || "GATE")}</span>`
        : "";

      const subtitle =
        step.node.description?.trim() ||
        (typeof step.node.config?.stage === "string" && step.node.config.stage.trim()) ||
        (step.isStart ? "Project Record Entry" : step.isTerminal ? "Formal Closeout Sign-off" : "Workflow Stage Execution");

      // Content Card Block
      const cardContent = `
        <div style="background: #ffffff; border: 2px solid ${isGate ? GATE_TAG_VISUAL.border : theme.border}; border-top: ${isTop ? `4.5px solid ${circleColor}` : "2px solid " + theme.border}; border-bottom: ${!isTop ? `4.5px solid ${circleColor}` : "2px solid " + theme.border}; border-radius: 10px; padding: 12px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); width: 100%; box-sizing: border-box; text-align: ${isTop ? "center" : "center"};">
          ${gateBadgeHtml}
          <div style="font-size: 12px; font-weight: 900; color: ${circleColor}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px;">
            ${escapeHtml(step.stepNumber)}
          </div>
          <div style="font-size: 14.5px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 4px;">
            ${escapeHtml(step.node.title)}
          </div>
          <div style="font-size: 11px; color: #475569; line-height: 1.35; font-weight: 500;">
            ${escapeHtml(subtitle)}
          </div>
        </div>
      `;

      // Central Circle on the vertical stem
      const circleNode = `
        <div style="width: 58px; height: 58px; border-radius: 50%; background: ${circleColor}; border: 4px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.18), 0 0 0 3px ${circleBorder}; display: flex; align-items: center; justify-content: center; font-size: ${isGate || step.isStart || step.isTerminal ? "22px" : "17px"}; font-weight: 900; color: ${circleText}; z-index: 10; flex-shrink: 0;">
          ${circleContent}
        </div>
      `;

      // Vertical connector stem line
      const stemLine = `
        <div style="width: 3px; height: 42px; background: ${isGate ? GATE_TAG_VISUAL.border : theme.accent}; z-index: 5;"></div>
      `;

      // Axis connector anchor dot
      const axisDot = `
        <div style="width: 16px; height: 16px; border-radius: 50%; background: #ffffff; border: 4px solid ${isGate ? GATE_TAG_VISUAL.badgeBg : theme.accent}; box-shadow: 0 0 0 2px rgba(0,0,0,0.06); z-index: 15;"></div>
      `;

      if (isTop) {
        // TOP MILESTONE (Card -> Circle -> Stem -> Axis Dot)
        return `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; height: 100%; box-sizing: border-box; padding: 0 4px;">
            
            <!-- Top Card -->
            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; margin-bottom: 8px;">
              ${cardContent}
            </div>

            <!-- Milestone Circle -->
            ${circleNode}

            <!-- Vertical Connector Stem -->
            ${stemLine}

            <!-- Central Axis Anchor Dot -->
            ${axisDot}

            <!-- Bottom Empty Spacer to keep Axis centered at 50% -->
            <div style="height: 250px; width: 100%; visibility: hidden;"></div>

          </div>
        `;
      } else {
        // BOTTOM MILESTONE (Top Empty Spacer -> Axis Dot -> Stem -> Circle -> Card)
        return `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; position: relative; height: 100%; box-sizing: border-box; padding: 0 4px;">
            
            <!-- Top Empty Spacer to keep Axis centered at 50% -->
            <div style="height: 250px; width: 100%; visibility: hidden;"></div>

            <!-- Central Axis Anchor Dot -->
            ${axisDot}

            <!-- Vertical Connector Stem -->
            ${stemLine}

            <!-- Milestone Circle -->
            ${circleNode}

            <!-- Bottom Card -->
            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; margin-top: 8px;">
              ${cardContent}
            </div>

          </div>
        `;
      }
    })
    .join("");

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
      
      <!-- TOP HEADER BAR -->
      <div style="border-bottom: 2.5px solid #0f172a; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; height: 56px; box-sizing: border-box; flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 8px; border-radius: 4px;">
              Process Lifecycle Roadmap
            </span>
            <span style="background: #7c3aed; color: #ffffff; font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 8px; border-radius: 4px;">
              ${totalPhases} Phases · ${totalSteps} Sequential Stages
            </span>
          </div>
          <h1 style="margin: 0; font-size: 26px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
            ${escapeHtml(projectName)}
          </h1>
        </div>
        
        <div style="text-align: right; font-size: 11px; color: #475569; display: flex; gap: 12px; align-items: center;">
          <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; text-align: left;">
            <div style="font-size: 8.5px; color: #64748b; text-transform: uppercase; font-weight: 800;">Project Number</div>
            <div style="font-weight: 900; font-family: monospace; font-size: 13px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 4px 10px; text-align: left;">
            <div style="font-size: 8.5px; color: #64748b; text-transform: uppercase; font-weight: 800;">Revision / Date</div>
            <div style="font-weight: 800; font-size: 12px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- L1 PHASE OVERVIEW SPAN BANDS -->
      <div style="display: flex; gap: 10px; margin-top: 10px; margin-bottom: 4px; flex-shrink: 0;">
        ${phaseBandsHtml}
      </div>

      <!-- MAIN ALTERNATING TIMELINE CANVAS (Directly matching the Adobe reference timeline infographic!) -->
      <div style="flex: 1; position: relative; display: flex; align-items: center; justify-content: space-between; overflow: hidden; min-height: 0; margin: 4px 0;">
        
        <!-- Central Horizontal Timeline Axis Line running through the exact center -->
        <div style="position: absolute; top: calc(50% - 2.5px); left: 24px; right: 24px; height: 5px; background: #334155; border-radius: 3px; z-index: 1; box-shadow: 0 1px 3px rgba(0,0,0,0.15);"></div>

        <!-- Alternating Top / Bottom Milestone Nodes -->
        <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: space-between; position: relative; z-index: 5;">
          ${timelineNodesHtml}
        </div>

      </div>

      <!-- BOTTOM EXECUTIVE LEGEND & SIGN-OFF BAR -->
      <div style="border-top: 1.5px solid #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; height: 32px; box-sizing: border-box; flex-shrink: 0;">
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="font-weight: 900; color: #0f172a; text-transform: uppercase; font-size: 10.5px;">Executive Legend:</span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10b981;"></span>
            <strong>Phase 1:</strong> Qualification
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #f43f5e;"></span>
            <strong>Phase 2:</strong> Pre-Construction
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ea580c;"></span>
            <strong>Phase 3:</strong> Construction
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ca8a04;"></span>
            <strong>Phase 4:</strong> Final Close
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #7c3aed;"></span>
            <strong style="color: #6d28d9;">🚦 Purple Tag:</strong> Formal Gate Review
          </span>
        </div>
        <div style="font-weight: 800; color: #0f172a; font-size: 10.5px;">
          ProFab Process Workflow System · Single-Page Executive Presentation Roadmap (A4 Landscape)
        </div>
      </div>

    </div>
  `;

  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    const dataUrl = await toPng(container, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      width: 1485,
      height: 1050,
      cacheBust: true,
    });

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // 297mm x 210mm A4 exact fit
    pdf.addImage(dataUrl, "PNG", 0, 0, 297, 210, undefined, "FAST");
    const safeProjectName = (projectName || "ProFab")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-");
    pdf.save(`${safeProjectName}-L1-L2-Presentation.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
