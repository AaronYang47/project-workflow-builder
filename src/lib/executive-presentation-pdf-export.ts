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
    lineColor: "#10b981",
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
    lineColor: "#f43f5e",
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
    lineColor: "#f97316",
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
    lineColor: "#eab308",
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
    lineColor: "#0284c7",
  },
];

const GATE_TAG_VISUAL = {
  badgeBg: "#7c3aed",
  badgeText: "#ffffff",
  tagBg: "#f3e8ff",
  tagText: "#6d28d9",
  border: "#c084fc",
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
 * Generates an executive Horizontal Mindmap / Tree Hierarchy diagram presentation PDF
 * directly matching the user's reference diagram (Root -> L1 -> L2 -> L3 with orthogonal branches).
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
  const executionItems = file.execution?.items || [];
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
  container.style.padding = "24px 30px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  // 3. Build Horizontal Mindmap Tree Hierarchy
  // Left Column (Root Node) -> Column 1 (L1 Phases) -> Column 2 (L2 Steps) -> Column 3 (L3 Deliverables)
  const phasesTreeHtml = orderedL1
    .map((l1Node, phaseIdx) => {
      const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
      const linkedL2 = getLinkedL2Nodes(l1Node);
      const isGatePhase = linkedL2.some((n) => isNodeGate(n, allNodes, layout));

      // L2 Steps for this Phase
      const stepsHtml = linkedL2
        .map((node, nodeIdx) => {
          const isGate = isNodeGate(node, allNodes, layout);
          const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : "";
          const isStart = node.type === "projectStart" || node.id === "project-start";
          const isTerminal = node.type === "terminal" || node.type === "end" || node.id === "project-complete" || node.id === "close-out";

          // Deliverables / Forms
          const nodeForms: Array<{ code: string; title: string }> = [];
          const linkedItems = executionItems.filter(
            (item) => item.linkedLayer2NodeId === node.id || node.conditions?.some((c) => c.linkedExecutionItemId === item.id),
          );
          linkedItems.forEach((item) => {
            nodeForms.push({
              code: item.documentCode || item.documentNumber || item.catalogId || "DOC",
              title: item.title?.replace(/^[A-Z0-9-—/ ]+\/\s*/, "") || item.title || "Deliverable",
            });
          });

          // Conditions
          const keyConditions = (node.conditions || []).filter((c) => c.label?.trim()).slice(0, 2);

          const stepBadgeStyle = isGate
            ? `background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1.5px solid ${GATE_TAG_VISUAL.border}; font-weight: 900;`
            : isStart
              ? `background: #e0f2fe; color: #0369a1; font-weight: 800; border: 1px solid #bae6fd;`
              : isTerminal
                ? `background: #dcfce7; color: #15803d; font-weight: 800; border: 1px solid #86efac;`
                : `background: #f1f5f9; color: #475569; font-weight: 700; border: 1px solid #e2e8f0;`;

          const stepBadgeText = isGate ? `🚦 ${gateLabel}` : isStart ? "Start" : isTerminal ? "Complete 🏁" : `STEP ${phaseIdx + 1}.${nodeIdx + 1}`;

          // Deliverable / Condition capsules on the far right (L3)
          let l3DeliverablesHtml = "";
          if (nodeForms.length > 0 || keyConditions.length > 0) {
            const items = [
              ...nodeForms.slice(0, 2).map((f) => ({
                icon: "📄",
                text: `<strong>[${escapeHtml(f.code)}]</strong> ${escapeHtml(f.title)}`,
                isForm: true,
              })),
              ...keyConditions.map((c) => ({
                icon: "✓",
                text: escapeHtml(c.label),
                isForm: false,
              })),
            ].slice(0, 2);

            l3DeliverablesHtml = `
              <!-- L3 Elbow Connector Line & Deliverable Capsules -->
              <div style="display: flex; align-items: center; gap: 8px; margin-left: 6px; flex: 1;">
                <span style="color: #94a3b8; font-size: 14px; font-weight: 900; flex-shrink: 0;">➔</span>
                <div style="display: flex; flex-direction: column; gap: 3.5px; flex: 1;">
                  ${items
                    .map(
                      (it) => `
                    <div style="background: ${it.isForm ? "#f8fafc" : theme.bg}; border: 1px solid ${it.isForm ? "#cbd5e1" : theme.border}; border-radius: 5px; padding: 3px 8px; font-size: 9.5px; color: ${it.isForm ? "#1e293b" : theme.text}; display: flex; align-items: center; gap: 5px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      <span style="font-weight: 900; flex-shrink: 0; color: ${it.isForm ? "#0284c7" : "#059669"};">${it.icon}</span>
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;">${it.text}</span>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              </div>
            `;
          }

          return `
            <div style="display: flex; align-items: center; width: 100%;">
              
              <!-- L2 Step Capsule (Sub Headline) -->
              <div style="width: 290px; background: #ffffff; border: 1.5px solid ${isGate ? GATE_TAG_VISUAL.border : theme.border}; border-left: 5px solid ${isGate ? GATE_TAG_VISUAL.badgeBg : theme.accent}; border-radius: 8px; padding: 8px 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                <div style="overflow: hidden; flex: 1;">
                  <div style="font-size: 12px; font-weight: 900; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(node.title)}
                  </div>
                  <div style="font-size: 9.5px; color: #64748b; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                    ${escapeHtml(node.description || (isGate ? "Quality Gate Sign-off" : "Workflow Stage Execution"))}
                  </div>
                </div>
                <span style="font-size: 8px; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; line-height: 1; ${stepBadgeStyle}">
                  ${stepBadgeText}
                </span>
              </div>

              ${l3DeliverablesHtml}

            </div>
          `;
        })
        .join("");

      return `
        <!-- Phase Branch (Main Headline Row) -->
        <div style="display: flex; align-items: center; width: 100%; position: relative;">
          
          <!-- L1 Phase Capsule (Main Headline) -->
          <div style="width: 210px; background: ${theme.bg}; border: 2px solid ${theme.border}; border-left: 6px solid ${theme.accent}; border-radius: 10px; padding: 12px 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.04); flex-shrink: 0; display: flex; flex-direction: column; justify-content: space-between;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="background: ${theme.badge}; color: #ffffff; font-size: 9.5px; font-weight: 900; padding: 2px 6px; border-radius: 3px; text-transform: uppercase;">
                ${escapeHtml(l1Node.code || `PHASE-0${phaseIdx + 1}`)}
              </span>
              <span style="font-size: 9.5px; font-weight: 800; color: ${theme.subtext}; background: rgba(255,255,255,0.85); padding: 1.5px 5px; border-radius: 3px;">
                ${linkedL2.length} Steps
              </span>
            </div>
            <div style="font-size: 16px; font-weight: 900; color: ${theme.text}; line-height: 1.15; margin-top: 2px;">
              ${escapeHtml(l1Node.title)}
            </div>
            <div style="font-size: 10px; color: ${theme.subtext}; font-weight: 600; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(l1Node.description || "Active Phase")}
            </div>
          </div>

          <!-- Connector Elbow Arrow into Steps Column -->
          <div style="display: flex; align-items: center; margin: 0 10px; color: #94a3b8; font-size: 18px; font-weight: 900; flex-shrink: 0;">
            ➔
          </div>

          <!-- L2 Steps Stack for this Phase -->
          <div style="flex: 1; display: flex; flex-direction: column; gap: 7px; border-left: 2px solid ${theme.border}; padding-left: 12px; margin-left: -2px;">
            ${stepsHtml}
          </div>

        </div>
      `;
    })
    .join("");

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
      
      <!-- TOP HEADER BAR -->
      <div style="border-bottom: 2.5px solid #0f172a; padding-bottom: 6px; display: flex; justify-content: space-between; align-items: flex-end; height: 50px; box-sizing: border-box; flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 2.5px 7px; border-radius: 4px;">
              Executive Architecture Hierarchy
            </span>
            <span style="background: #7c3aed; color: #ffffff; font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; padding: 2.5px 7px; border-radius: 4px;">
              ${totalPhases} Lifecycle Phases · ${totalL2Nodes} Workflow Steps
            </span>
          </div>
          <h1 style="margin: 0; font-size: 23px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
            ${escapeHtml(projectName)}
          </h1>
        </div>
        
        <div style="text-align: right; font-size: 10px; color: #475569; display: flex; gap: 12px; align-items: center;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 9px; text-align: left;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800;">Project Number</div>
            <div style="font-weight: 900; font-family: monospace; font-size: 12.5px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 3px 9px; text-align: left;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800;">Revision / Date</div>
            <div style="font-weight: 800; font-size: 11.5px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- MAIN HORIZONTAL MINDMAP / TREE CONTAINER (Matching user reference diagram!) -->
      <div style="flex: 1; display: flex; align-items: center; position: relative; margin: 10px 0; overflow: hidden; min-height: 0;">
        
        <!-- Root Node (Title Post - Far Left Dark Circle) -->
        <div style="width: 140px; height: 140px; border-radius: 50%; background: #0f172a; color: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 14px; box-sizing: border-box; text-align: center; box-shadow: 0 10px 25px rgba(15,23,42,0.25); z-index: 10; flex-shrink: 0;">
          <div style="font-size: 9.5px; font-weight: 900; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3px;">
            PROJECT CORE
          </div>
          <div style="font-size: 14px; font-weight: 900; color: #ffffff; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
            ${escapeHtml(projectName)}
          </div>
        </div>

        <!-- Root to L1 Main Connecting Stem -->
        <div style="display: flex; align-items: center; margin: 0 12px; color: #0f172a; font-size: 22px; font-weight: 900; flex-shrink: 0;">
          ➔
        </div>

        <!-- Phases & Steps Branching Tree Container -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; height: 100%; border-left: 3px solid #0f172a; padding-left: 14px; gap: 10px; overflow: hidden;">
          ${phasesTreeHtml}
        </div>

      </div>

      <!-- BOTTOM EXECUTIVE FOOTER -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 5px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #64748b; height: 24px; box-sizing: border-box; flex-shrink: 0;">
        <div style="display: flex; gap: 14px; align-items: center;">
          <span style="font-weight: 900; color: #0f172a; text-transform: uppercase; font-size: 9.5px;">Hierarchy Architecture:</span>
          <span>● <strong>Root:</strong> Overall project core authority.</span>
          <span>● <strong>L1 Phases:</strong> 4 Macro Lifecycle Phases.</span>
          <span>● <strong>L2 Steps:</strong> Sequential process workflow stages.</span>
          <span>● <strong>L3 Controls:</strong> 🚦 Gate decisions and controlled deliverable records.</span>
        </div>
        <div style="font-weight: 800; color: #0f172a; font-size: 9.5px;">
          ProFab Process Workflow System · Single-Page Executive Presentation Tree (A4 Landscape)
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
    await new Promise((resolve) => setTimeout(resolve, 80));

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
    pdf.save(`${safeProjectName}-Executive-Mindmap-Tree.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
