import type { WorkflowFile, DomainNode, HighLevelNode, NodeLayout } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { conditionIsSatisfied } from "@/lib/workflow-progress";

// 1:1 Matching colors from the project canvas (薄荷绿 -> 玫瑰粉红 -> 橘黄色 -> 金黄色)
const DEFAULT_PHASE_THEMES = [
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
  {
    badge: "#475569",
    bg: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    border: "#cbd5e1",
    text: "#1e293b",
    accent: "#475569",
    subtext: "#334155",
    tagBg: "#e2e8f0",
    icon: "📊",
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
  const projectStartNode = allNodes.find((n) => n.type === "projectStart" || n.id === "project-start");
  const operations = file.operations;

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

  // 2. Helper to resolve linked L2 nodes for any L1 phase
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
  container.style.padding = "16px 20px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  // 3. Build the Horizontal Roadmap Timeline Nodes (Inspired by reference picture!)
  const timelineNodesHtml = orderedL1
    .map((l1Node, phaseIdx) => {
      const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
      const linkedL2 = getLinkedL2Nodes(l1Node);
      const gateNodes = linkedL2.filter((n) => isNodeGate(n, allNodes, layout));

      let gatePill = "";
      if (gateNodes.length > 0) {
        const rawLabel = getNodeGateLabel(gateNodes[0], allNodes, layout);
        const baseGate = rawLabel.replace(/-[A-Z0-9]+$/i, "").trim() || `Gate ${phaseIdx + 1}`;
        gatePill = `<span style="font-size: 8.5px; font-weight: 900; background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1px solid ${GATE_TAG_VISUAL.border}; padding: 1px 6px; border-radius: 3px; white-space: nowrap;">🚦 ${escapeHtml(baseGate)}</span>`;
      } else if (l1Node.type === "end" || phaseIdx === orderedL1.length - 1) {
        gatePill = `<span style="font-size: 8.5px; font-weight: 800; background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 1px 6px; border-radius: 3px; white-space: nowrap;">🏁 Complete</span>`;
      } else {
        gatePill = `<span style="font-size: 8.5px; font-weight: 700; background: #f1f5f9; color: #475569; padding: 1px 6px; border-radius: 3px; white-space: nowrap;">Execution</span>`;
      }

      const isFirst = phaseIdx === 0;
      const isLast = phaseIdx === orderedL1.length - 1;

      return `
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; position: relative; z-index: 2;">
          
          <!-- Top Code & Gate Pill -->
          <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 6px;">
            <span style="font-size: 9.5px; font-weight: 900; color: #ffffff; background: ${theme.badge}; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; letter-spacing: 0.05em;">
              ${escapeHtml(l1Node.code || `PHASE-0${phaseIdx + 1}`)}
            </span>
            ${gatePill}
          </div>

          <!-- Central Roadmap Circle Node (Inspired by user reference image!) -->
          <div style="width: 46px; height: 46px; border-radius: 50%; background: ${theme.bg}; border: 3.5px solid ${theme.badge}; box-shadow: 0 4px 10px rgba(0,0,0,0.1), 0 0 0 4px #ffffff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; color: ${theme.text}; position: relative;">
            <span>${phaseIdx + 1}</span>
          </div>

          <!-- Bottom Phase Title & Subtitle -->
          <div style="text-align: center; margin-top: 6px; max-width: 180px;">
            <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; line-height: 1.15;">
              ${escapeHtml(l1Node.title)}
            </div>
            <div style="font-size: 9.5px; color: ${theme.subtext}; font-weight: 600; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(l1Node.description || "Active Process Stage")}
            </div>
          </div>

        </div>
      `;
    })
    .join("");

  // 4. Build Phase Vertical Swimlane Columns (L2 Stages + L3 Key Release Conditions)
  const columnsHtml = orderedL1
    .map((l1Node, phaseIdx) => {
      const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
      const linkedL2 = getLinkedL2Nodes(l1Node);

      let stepsHtml = "";
      if (linkedL2.length === 0) {
        stepsHtml = `
          <div style="background: #ffffff; border: 1px dashed ${theme.border}; border-radius: 6px; padding: 12px; text-align: center; color: #94a3b8; font-size: 10px;">
            No detailed workflow steps configured.
          </div>
        `;
      } else {
        stepsHtml = linkedL2
          .map((node, nIdx) => {
            const isGate = isNodeGate(node, allNodes, layout);
            const isStart = node.type === "projectStart" || node.id === "project-start";
            const isTerminal = node.type === "terminal" || node.type === "end" || node.id === "project-complete" || node.id === "close-out";
            const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : isStart ? "Start" : isTerminal ? "Complete" : "Step";

            // Conditions
            const conditions: Array<{ label: string; checked: boolean }> = [];
            if (node.conditions && node.conditions.length > 0) {
              node.conditions.forEach((c) => {
                if (c.label?.trim()) {
                  const isSatisfied = conditionIsSatisfied(c, node, projectStartNode, executionItems, operations);
                  conditions.push({ label: c.label.trim(), checked: isSatisfied });
                }
              });
            }

            // Forms linked
            const nodeForms: Array<{ code: string; title: string }> = [];
            const linkedItems = executionItems.filter(
              (item) => item.linkedLayer2NodeId === node.id || node.conditions?.some((c) => c.linkedExecutionItemId === item.id),
            );
            linkedItems.forEach((item) => {
              nodeForms.push({
                code: item.documentCode || item.documentNumber || item.catalogId || "DOC",
                title: item.title?.replace(/^[A-Z0-9-—/ ]+\/\s*/, "") || item.title || "Form",
              });
            });

            const badgeStyle = isGate
              ? `background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1px solid ${GATE_TAG_VISUAL.border}; font-weight: 900;`
              : isStart
                ? `background: #e0f2fe; color: #0369a1; font-weight: 800;`
                : isTerminal
                  ? `background: #dcfce7; color: #15803d; font-weight: 800;`
                  : `background: ${theme.tagBg}; color: ${theme.text}; font-weight: 700;`;

            let conditionsMarkup = "";
            if (conditions.length > 0) {
              conditionsMarkup = `
                <div style="display: flex; flex-direction: column; gap: 2.5px; margin-top: 4px; background: rgba(255,255,255,0.7); border-radius: 3px; padding: 4px 5px;">
                  ${conditions
                    .map((c) => {
                      const box = c.checked
                        ? `<span style="display: inline-flex; align-items: center; justify-content: center; width: 10.5px; height: 10.5px; border-radius: 2px; background: #10b981; color: #ffffff; font-size: 8px; font-weight: 900; line-height: 1; flex-shrink: 0; margin-top: 1px;">✓</span>`
                        : `<span style="display: inline-flex; width: 10.5px; height: 10.5px; border-radius: 2px; background: #fef08a; border: 1.2px solid #ca8a04; flex-shrink: 0; margin-top: 1px; box-sizing: border-box;"></span>`;
                      return `
                        <div style="display: flex; align-items: flex-start; gap: 4px; font-size: 8.5px; color: #1e293b; line-height: 1.25;">
                          ${box}
                          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                            ${escapeHtml(c.label)}
                          </span>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              `;
            }

            let formsMarkup = "";
            if (nodeForms.length > 0) {
              formsMarkup = `
                <div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 3px;">
                  ${nodeForms
                    .map(
                      (f) => `
                    <span style="background: #ffffff; border: 1px solid #cbd5e1; font-size: 7.5px; font-weight: 700; padding: 1px 4px; border-radius: 2px; color: #0f172a; white-space: nowrap;">
                      <strong>[${escapeHtml(f.code)}]</strong> ${escapeHtml(f.title)}
                    </span>
                  `,
                    )
                    .join("")}
                </div>
              `;
            }

            return `
              <div style="background: #ffffff; border: 1.5px solid ${theme.border}; border-left: 4px solid ${isGate ? GATE_TAG_VISUAL.badgeBg : theme.accent}; border-radius: 5px; padding: 5px 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                    <span style="font-size: 10px; font-weight: 900; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                      STEP ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                    </span>
                    <span style="font-size: 7.5px; padding: 1.5px 4px; border-radius: 3px; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; line-height: 1; ${badgeStyle}">
                      ${isGate ? `🚦 ${gateLabel}` : gateLabel}
                    </span>
                  </div>
                  <p style="margin: 2px 0 0 0; font-size: 8.5px; color: #64748b; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                    ${escapeHtml(node.description || "Workflow Step")}
                  </p>
                  ${conditionsMarkup}
                </div>
                ${formsMarkup}
              </div>
            `;
          })
          .join("");
      }

      return `
        <div style="flex: 1; min-width: 0; background: ${theme.bg}; border: 1.5px solid ${theme.border}; border-radius: 8px; padding: 8px 7px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); height: 100%; box-sizing: border-box;">
          
          <!-- Column Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid ${theme.border}; padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="width: 18px; height: 18px; border-radius: 50%; background: ${theme.badge}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900;">${phaseIdx + 1}</span>
              <span style="font-size: 11.5px; font-weight: 900; color: ${theme.text};">${escapeHtml(l1Node.title)}</span>
            </div>
            <span style="font-size: 8.5px; font-weight: 800; color: ${theme.subtext}; background: rgba(255,255,255,0.8); padding: 1px 4px; border-radius: 3px;">${linkedL2.length} Steps</span>
          </div>

          <!-- Steps vertical list -->
          <div style="flex: 1; display: flex; flex-direction: column; gap: 5px; overflow: hidden;">
            ${stepsHtml}
          </div>

        </div>
      `;
    })
    .join("");

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
      
      <!-- TOP HEADER BAR -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: flex-end; height: 42px; box-sizing: border-box; flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 6px; border-radius: 3px;">
              Executive Process Roadmap & Governance Architecture
            </span>
            <span style="background: #7c3aed; color: #ffffff; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 3px;">
              ${totalPhases} Milestone Phases · ${totalL2Nodes} Workflow Steps
            </span>
          </div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
            ${escapeHtml(projectName)}
          </h1>
        </div>
        
        <div style="text-align: right; font-size: 9.5px; color: #475569; display: flex; gap: 10px; align-items: center;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; text-align: left;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800;">Project Number</div>
            <div style="font-weight: 900; font-family: monospace; font-size: 11px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; text-align: left;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800;">Revision / Date</div>
            <div style="font-weight: 800; font-size: 10.5px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- HORIZONTAL TIMELINE ROADMAP AXIS (Directly inspired by reference image!) -->
      <div style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; margin-top: 6px; margin-bottom: 6px; position: relative; flex-shrink: 0;">
        
        <!-- Connecting Pipeline Axis Line running through circles -->
        <div style="position: absolute; top: 52px; left: 80px; right: 80px; height: 4px; background: linear-gradient(90deg, #10b981 0%, #f43f5e 33%, #ea580c 66%, #ca8a04 100%); z-index: 1; border-radius: 2px;"></div>

        <!-- Nodes along the pipeline -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 2;">
          ${timelineNodesHtml}
        </div>

      </div>

      <!-- MAIN SWIMLANES (L2 Stages & L3 Conditions Columns) -->
      <div style="flex: 1; display: flex; gap: 8px; overflow: hidden; min-height: 0;">
        ${columnsHtml}
      </div>

      <!-- BOTTOM EXECUTIVE FOOTER -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #64748b; height: 22px; box-sizing: border-box; flex-shrink: 0; margin-top: 4px;">
        <div style="display: flex; gap: 10px; align-items: center;">
          <span style="font-weight: 800; color: #0f172a; text-transform: uppercase; font-size: 9px;">Executive Governance:</span>
          <span>● <strong>Stage-Gate Integrity:</strong> Primary gates govern progression from Qualification to Closeout.</span>
          <span>● <strong>Live Verification:</strong> Green checkboxes confirm verified conditions; yellow boxes indicate pending items.</span>
        </div>
        <div style="font-weight: 700; color: #0f172a;">
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
    pdf.save(`${safeProjectName}-L1-L2-L3-Presentation.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
