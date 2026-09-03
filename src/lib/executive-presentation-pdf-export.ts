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
    icon: "🚀",
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
    icon: "📐",
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
    icon: "🏗️",
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
    icon: "🏁",
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
    icon: "📦",
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
 * Generates an executive alternating timeline presentation PDF displaying L1 Phases in order
 * directly inspired by the Adobe reference timeline infographic.
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
  container.style.padding = "30px 48px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  // 3. Build Alternating Timeline Milestone Nodes for L1 Phases (Matching reference infographic!)
  const timelineNodesHtml = orderedL1
    .map((l1Node, phaseIdx) => {
      const isTop = phaseIdx % 2 === 0; // Alternates Top and Bottom
      const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
      const linkedL2 = getLinkedL2Nodes(l1Node);
      const gateNodes = linkedL2.filter((n) => isNodeGate(n, allNodes, layout));

      let gateTagHtml = "";
      if (gateNodes.length > 0) {
        const rawLabel = getNodeGateLabel(gateNodes[0], allNodes, layout);
        const baseGate = rawLabel.replace(/-[A-Z0-9]+$/i, "").trim() || `Gate ${phaseIdx + 1}`;
        gateTagHtml = `
          <div style="margin-bottom: 6px;">
            <span style="background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1.5px solid ${GATE_TAG_VISUAL.border}; font-size: 13px; font-weight: 900; padding: 3px 10px; border-radius: 5px; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 5px rgba(124,58,237,0.12);">
              🚦 ${escapeHtml(baseGate)}
            </span>
          </div>
        `;
      } else if (l1Node.type === "end" || phaseIdx === orderedL1.length - 1) {
        gateTagHtml = `
          <div style="margin-bottom: 6px;">
            <span style="background: #dcfce7; color: #15803d; border: 1.5px solid #86efac; font-size: 13px; font-weight: 900; padding: 3px 10px; border-radius: 5px; display: inline-flex; align-items: center; gap: 5px;">
              🏁 Final Milestone
            </span>
          </div>
        `;
      }

      // Card Content Block for Phase
      const cardContent = `
        <div style="background: #ffffff; border: 2.5px solid ${theme.border}; border-top: ${isTop ? `6px solid ${theme.accent}` : "2.5px solid " + theme.border}; border-bottom: ${!isTop ? `6px solid ${theme.accent}` : "2.5px solid " + theme.border}; border-radius: 14px; padding: 18px 22px; box-shadow: 0 8px 24px rgba(0,0,0,0.06); width: 280px; box-sizing: border-box; text-align: center;">
          ${gateTagHtml}
          
          <div style="display: flex; justify-content: center; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="background: ${theme.badge}; color: #ffffff; font-size: 12px; font-weight: 900; padding: 3px 9px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.08em;">
              ${escapeHtml(l1Node.code || `PHASE-0${phaseIdx + 1}`)}
            </span>
            <span style="font-size: 12px; font-weight: 800; color: ${theme.subtext}; background: ${theme.tagBg}; padding: 2px 7px; border-radius: 4px;">
              ${linkedL2.length} Steps
            </span>
          </div>

          <div style="font-size: 22px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-bottom: 6px;">
            ${escapeHtml(l1Node.title)}
          </div>
          
          <div style="font-size: 14px; color: #475569; line-height: 1.35; font-weight: 600;">
            ${escapeHtml(l1Node.description || "Active Lifecycle Phase")}
          </div>
        </div>
      `;

      // Large Milestone Circle Node (Matching Adobe reference image icon/number circles)
      const circleNode = `
        <div style="width: 82px; height: 82px; border-radius: 50%; background: ${theme.bg}; border: 5px solid ${theme.accent}; box-shadow: 0 8px 20px rgba(0,0,0,0.15), 0 0 0 6px #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; color: ${theme.text}; z-index: 10; flex-shrink: 0;">
          <span style="font-size: 26px; line-height: 1;">${theme.icon}</span>
        </div>
      `;

      // Vertical connector stem line
      const stemLine = `
        <div style="width: 4px; height: 50px; background: ${theme.accent}; z-index: 5;"></div>
      `;

      // Central Axis Anchor Dot
      const axisDot = `
        <div style="width: 22px; height: 22px; border-radius: 50%; background: #ffffff; border: 5px solid ${theme.accent}; box-shadow: 0 0 0 3px rgba(0,0,0,0.08); z-index: 15;"></div>
      `;

      if (isTop) {
        // TOP MILESTONE (Card -> Circle -> Stem -> Axis Dot)
        return `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; height: 100%; box-sizing: border-box; padding: 0 10px;">
            
            <!-- Top Card -->
            <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 12px;">
              ${cardContent}
            </div>

            <!-- Milestone Circle -->
            ${circleNode}

            <!-- Vertical Connector Stem -->
            ${stemLine}

            <!-- Central Axis Anchor Dot -->
            ${axisDot}

            <!-- Bottom Empty Spacer to keep Axis centered at 50% -->
            <div style="height: 320px; width: 100%; visibility: hidden;"></div>

          </div>
        `;
      } else {
        // BOTTOM MILESTONE (Top Empty Spacer -> Axis Dot -> Stem -> Circle -> Card)
        return `
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; position: relative; height: 100%; box-sizing: border-box; padding: 0 10px;">
            
            <!-- Top Empty Spacer to keep Axis centered at 50% -->
            <div style="height: 320px; width: 100%; visibility: hidden;"></div>

            <!-- Central Axis Anchor Dot -->
            ${axisDot}

            <!-- Vertical Connector Stem -->
            ${stemLine}

            <!-- Milestone Circle -->
            ${circleNode}

            <!-- Bottom Card -->
            <div style="display: flex; flex-direction: column; align-items: center; margin-top: 12px;">
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
      <div style="border-bottom: 3px solid #0f172a; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end; height: 68px; box-sizing: border-box; flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; padding: 3px 9px; border-radius: 4px;">
              Executive Process Roadmap
            </span>
            <span style="background: #7c3aed; color: #ffffff; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; padding: 3px 9px; border-radius: 4px;">
              ${totalPhases} Lifecycle Phases · ${totalL2Nodes} Workflow Steps
            </span>
          </div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
            ${escapeHtml(projectName)}
          </h1>
        </div>
        
        <div style="text-align: right; font-size: 12px; color: #475569; display: flex; gap: 14px; align-items: center;">
          <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 5px 12px; text-align: left;">
            <div style="font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 800;">Project Number</div>
            <div style="font-weight: 900; font-family: monospace; font-size: 14px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 6px; padding: 5px 12px; text-align: left;">
            <div style="font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 800;">Revision / Date</div>
            <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- MAIN ALTERNATING TIMELINE CANVAS (L1 Phases Alternating Along Central Axis) -->
      <div style="flex: 1; position: relative; display: flex; align-items: center; justify-content: space-between; overflow: hidden; min-height: 0; margin: 20px 0;">
        
        <!-- Central Horizontal Timeline Axis Line running through the exact center -->
        <div style="position: absolute; top: calc(50% - 3px); left: 60px; right: 60px; height: 6px; background: linear-gradient(90deg, #10b981 0%, #f43f5e 33%, #ea580c 66%, #ca8a04 100%); border-radius: 3px; z-index: 1; box-shadow: 0 2px 6px rgba(0,0,0,0.12);"></div>

        <!-- Alternating Top / Bottom L1 Phase Milestone Nodes -->
        <div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: space-around; position: relative; z-index: 5;">
          ${timelineNodesHtml}
        </div>

      </div>

      <!-- BOTTOM EXECUTIVE LEGEND & SIGN-OFF BAR -->
      <div style="border-top: 1.5px solid #cbd5e1; padding-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #64748b; height: 36px; box-sizing: border-box; flex-shrink: 0;">
        <div style="display: flex; gap: 20px; align-items: center;">
          <span style="font-weight: 900; color: #0f172a; text-transform: uppercase; font-size: 11.5px;">Phase Architecture:</span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></span>
            <strong>Phase 1:</strong> Start & Qualification
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #f43f5e;"></span>
            <strong>Phase 2:</strong> Pre-Construction
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ea580c;"></span>
            <strong>Phase 3:</strong> Construction
          </span>
          <span style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ca8a04;"></span>
            <strong>Phase 4:</strong> Final Close
          </span>
        </div>
        <div style="font-weight: 800; color: #0f172a; font-size: 11px;">
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
    pdf.save(`${safeProjectName}-L1-Presentation.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
