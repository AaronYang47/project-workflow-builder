import type { WorkflowFile, DomainNode, HighLevelNode, NodeLayout } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";

// 1:1 Matching colors from the project canvas (薄荷绿 -> 玫瑰粉红 -> 橘黄色 -> 金黄色)
const DEFAULT_PHASE_THEMES = [
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
  // 3. Phase 3 (Phase-02 / Construction): 橘黄色 (Warm Vivid Orange)
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
 * Generates an executive alternating timeline presentation PDF where:
 * - The Central Timeline Axis features large circles with Phase Names (No icons).
 * - Vertical stems point to alternating Cards.
 * - Each Card displays its Linked Workflow Nodes.
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

  // 2. Resolve L2 nodes linked to each L1 phase
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

  const totalPhases = orderedL1.length;
  const totalL2Nodes = allNodes.filter((n) => n.type !== "phase" && n.type !== "gate").length;

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
  container.style.padding = "24px 36px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  // 3. Build Alternating Timeline Milestone Nodes
  const timelineNodesHtml = orderedL1
    .map((l1Node, phaseIdx) => {
      const isTop = phaseIdx % 2 === 0; // Alternates Top and Bottom
      const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
      const linkedL2 = getLinkedL2Nodes(l1Node);
      const gateNodes = linkedL2.filter((n) => isNodeGate(n, allNodes, layout));

      // Gate badge for card header
      let gateTagHtml = "";
      if (gateNodes.length > 0) {
        const rawLabel = getNodeGateLabel(gateNodes[0], allNodes, layout);
        const baseGate = rawLabel.replace(/-[A-Z0-9]+$/i, "").trim() || `Gate ${phaseIdx + 1}`;
        gateTagHtml = `
          <span style="background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1.2px solid ${GATE_TAG_VISUAL.border}; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
            🚦 ${escapeHtml(baseGate)}
          </span>
        `;
      } else if (l1Node.type === "end" || phaseIdx === orderedL1.length - 1) {
        gateTagHtml = `
          <span style="background: #dcfce7; color: #15803d; border: 1.2px solid #86efac; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
            🏁 Complete
          </span>
        `;
      }

      // Build Linked Workflow Nodes list inside Card
      const linkedNodesListHtml = linkedL2
        .map((node, nodeIdx) => {
          const isGate = isNodeGate(node, allNodes, layout);
          const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : "";
          const isStart = node.type === "projectStart" || node.id === "project-start";
          const isTerminal = node.type === "terminal" || node.type === "end" || node.id === "project-complete" || node.id === "close-out";

          const badgeStyle = isGate
            ? `background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1px solid ${GATE_TAG_VISUAL.border}; font-weight: 900;`
            : isStart
              ? `background: #e0f2fe; color: #0369a1; font-weight: 800;`
              : isTerminal
                ? `background: #dcfce7; color: #15803d; font-weight: 800;`
                : `background: #f1f5f9; color: #475569; font-weight: 700;`;

          const badgeText = isGate ? `🚦 ${gateLabel}` : isStart ? "Start" : isTerminal ? "Complete" : `Step ${phaseIdx + 1}.${nodeIdx + 1}`;

          return `
            <div style="background: #ffffff; border: 1.5px solid ${isGate ? GATE_TAG_VISUAL.border : theme.border}; border-left: 4px solid ${isGate ? GATE_TAG_VISUAL.badgeBg : theme.accent}; border-radius: 6px; padding: 6px 9px; display: flex; align-items: center; justify-content: space-between; gap: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
              <div style="display: flex; align-items: center; gap: 7px; overflow: hidden; flex: 1;">
                <span style="width: 18px; height: 18px; border-radius: 50%; background: ${theme.badge}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 900; flex-shrink: 0;">
                  ${nodeIdx + 1}
                </span>
                <span style="font-size: 11px; font-weight: 800; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${escapeHtml(node.title)}
                </span>
              </div>
              <span style="font-size: 8px; padding: 1.5px 5px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; line-height: 1; ${badgeStyle}">
                ${badgeText}
              </span>
            </div>
          `;
        })
        .join("");

      // Phase Card (Displays Linked Workflow Nodes)
      const cardContent = `
        <div style="background: #ffffff; border: 2px solid ${theme.border}; border-top: ${isTop ? `5px solid ${theme.accent}` : "2px solid " + theme.border}; border-bottom: ${!isTop ? `5px solid ${theme.accent}` : "2px solid " + theme.border}; border-radius: 12px; padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); width: 310px; box-sizing: border-box;">
          
          <!-- Card Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1.5px dashed ${theme.border}; padding-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="background: ${theme.badge}; color: #ffffff; font-size: 10px; font-weight: 900; padding: 2px 7px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em;">
                ${escapeHtml(l1Node.code || `PHASE-0${phaseIdx + 1}`)}
              </span>
              <span style="font-size: 11.5px; font-weight: 800; color: ${theme.subtext};">
                ${escapeHtml(l1Node.description || "Active Phase")}
              </span>
            </div>
            ${gateTagHtml}
          </div>

          <!-- LINKED WORKFLOW NODES Section Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding: 0 2px;">
            <span style="font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">
              Linked Workflow Nodes
            </span>
            <span style="font-size: 9.5px; font-weight: 800; color: ${theme.subtext};">
              ${linkedL2.length} Step${linkedL2.length !== 1 ? "s" : ""}
            </span>
          </div>

          <!-- List of Linked L2 Steps -->
          <div style="display: flex; flex-direction: column; gap: 5px;">
            ${linkedNodesListHtml}
          </div>

        </div>
      `;

      // Large Central Circle on the Timeline Axis (Displays Phase Title / Name, NO icons)
      const circleNode = `
        <div style="width: 120px; height: 120px; border-radius: 50%; background: ${theme.bg}; border: 4.5px solid ${theme.accent}; box-shadow: 0 8px 24px rgba(0,0,0,0.14), 0 0 0 6px #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px; box-sizing: border-box; text-align: center; z-index: 10; flex-shrink: 0;">
          <span style="font-size: 10px; font-weight: 900; color: ${theme.subtext}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px;">
            0${phaseIdx + 1} · PHASE
          </span>
          <span style="font-size: 17px; font-weight: 900; color: ${theme.text}; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
            ${escapeHtml(l1Node.title)}
          </span>
        </div>
      `;

      // Vertical connector stem line
      const stemLine = `
        <div style="width: 4px; height: 42px; background: ${theme.accent}; z-index: 5;"></div>
      `;

      // Small Pointer Circle/Dot pointing to Card
      const pointerDot = `
        <div style="width: 14px; height: 14px; border-radius: 50%; background: #ffffff; border: 4px solid ${theme.accent}; box-shadow: 0 0 0 2px rgba(0,0,0,0.06); z-index: 15;"></div>
      `;

      if (isTop) {
        // TOP CARD: [Card] -> [Pointer Dot] -> [Vertical Stem] -> [Big Circle on Axis]
        return `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; height: 100%; box-sizing: border-box; padding: 0 8px;">
            
            <!-- Top Phase Card with Linked Nodes -->
            <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 4px;">
              ${cardContent}
            </div>

            <!-- Pointer Dot pointing to Card -->
            ${pointerDot}

            <!-- Vertical Connector Stem -->
            ${stemLine}

            <!-- Large Phase Circle on Central Axis -->
            ${circleNode}

            <!-- Bottom Spacer to center the Axis at 50% -->
            <div style="height: 310px; width: 100%; visibility: hidden;"></div>

          </div>
        `;
      } else {
        // BOTTOM CARD: [Big Circle on Axis] -> [Vertical Stem] -> [Pointer Dot] -> [Card]
        return `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; position: relative; height: 100%; box-sizing: border-box; padding: 0 8px;">
            
            <!-- Top Spacer to center the Axis at 50% -->
            <div style="height: 310px; width: 100%; visibility: hidden;"></div>

            <!-- Large Phase Circle on Central Axis -->
            ${circleNode}

            <!-- Vertical Connector Stem -->
            ${stemLine}

            <!-- Pointer Dot pointing to Card -->
            ${pointerDot}

            <!-- Bottom Phase Card with Linked Nodes -->
            <div style="display: flex; flex-direction: column; align-items: center; margin-top: 4px;">
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
      <div style="border-bottom: 3px solid #0f172a; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; height: 64px; box-sizing: border-box; flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; padding: 3px 8px; border-radius: 4px;">
              Executive Lifecycle Roadmap
            </span>
            <span style="background: #7c3aed; color: #ffffff; font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 8px; border-radius: 4px;">
              ${totalPhases} Milestone Phases · ${totalL2Nodes} Workflow Steps
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

      <!-- MAIN ALTERNATING TIMELINE CANVAS (Phase Big Circles on Axis -> Pointer Stem -> Phase Cards) -->
      <div style="flex: 1; position: relative; display: flex; align-items: center; justify-content: space-between; overflow: hidden; min-height: 0; margin: 10px 0;">
        
        <!-- Central Horizontal Timeline Axis Line running through the exact center -->
        <div style="position: absolute; top: calc(50% - 3px); left: 80px; right: 80px; height: 6px; background: linear-gradient(90deg, #10b981 0%, #f43f5e 33%, #ea580c 66%, #ca8a04 100%); border-radius: 3px; z-index: 1; box-shadow: 0 2px 6px rgba(0,0,0,0.12);"></div>

        <!-- Alternating Top / Bottom Milestone Nodes -->
        <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: space-around; position: relative; z-index: 5;">
          ${timelineNodesHtml}
        </div>

      </div>

      <!-- BOTTOM EXECUTIVE LEGEND & SIGN-OFF BAR -->
      <div style="border-top: 1.5px solid #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; color: #64748b; height: 32px; box-sizing: border-box; flex-shrink: 0;">
        <div style="display: flex; gap: 18px; align-items: center;">
          <span style="font-weight: 900; color: #0f172a; text-transform: uppercase; font-size: 11px;">Phase Architecture:</span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: #10b981;"></span>
            <strong>Phase 1:</strong> Start & Qualification
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: #f43f5e;"></span>
            <strong>Phase 2:</strong> Pre-Construction
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: #ea580c;"></span>
            <strong>Phase 3:</strong> Construction
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: #ca8a04;"></span>
            <strong>Phase 4:</strong> Final Close
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 11px; height: 11px; border-radius: 50%; background: #7c3aed;"></span>
            <strong style="color: #6d28d9;">🚦 Purple Tag:</strong> Gate Milestone
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
