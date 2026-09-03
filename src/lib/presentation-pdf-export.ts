import type { WorkflowFile, DomainNode, HighLevelNode, NodeLayout } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";

// 1:1 Matching colors from the app canvas (Green -> Pink -> Amber -> Yellow)
const DEFAULT_PHASE_THEMES = [
  {
    badge: "#10b981",
    bg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    border: "#a7f3d0",
    text: "#064e3b",
    accent: "#10b981",
    subtext: "#047857",
    tagBg: "#d1fae5",
  },
  {
    badge: "#f43f5e",
    bg: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
    border: "#fecdd3",
    text: "#881337",
    accent: "#f43f5e",
    subtext: "#be123c",
    tagBg: "#ffe4e6",
  },
  {
    badge: "#f59e0b",
    bg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
    border: "#fde68a",
    text: "#78350f",
    accent: "#f59e0b",
    subtext: "#b45309",
    tagBg: "#fef3c7",
  },
  {
    badge: "#eab308",
    bg: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
    border: "#fef08a",
    text: "#713f12",
    accent: "#eab308",
    subtext: "#854d0e",
    tagBg: "#fef9c3",
  },
  {
    badge: "#0284c7",
    bg: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
    border: "#bae6fd",
    text: "#0c4a6e",
    accent: "#0284c7",
    subtext: "#0369a1",
    tagBg: "#e0f2fe",
  },
  {
    badge: "#475569",
    bg: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    border: "#cbd5e1",
    text: "#1e293b",
    accent: "#475569",
    subtext: "#334155",
    tagBg: "#e2e8f0",
  },
];

// Distinct Purple styling for all Gate nodes matching the canvas Gate container (#7c3aed)
const GATE_VISUAL = {
  accent: "#7c3aed",
  badgeBg: "#7c3aed",
  badgeText: "#ffffff",
  tagBg: "#f3e8ff",
  tagText: "#6d28d9",
  cardBg: "#faf5ff",
  border: "#c084fc",
  checkColor: "#7c3aed",
  shadow: "0 1px 3px rgba(124, 58, 237, 0.12)",
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

/**
 * Checks whether an L2 node is a Gate or is contained inside a Gate container in the canvas.
 */
export function isNodeGate(
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

  // 4. Metadata indicators
  const metadata = node.metadata || {};
  const workflowSection = String(metadata.workflowSection || "").toLowerCase();
  if (workflowSection.includes("gate")) {
    return true;
  }

  // 5. Title / ID regex pattern
  const title = (node.title || "").trim();
  const id = (node.id || "").trim();
  if (/\b(gate\s*\d*|g[1-9][a-z0-9-]*)\b/i.test(title) || /\b(gate\s*\d*|g[1-9][a-z0-9-]*)\b/i.test(id)) {
    return true;
  }

  return false;
}

/**
 * Extracts a clean Gate label (e.g. "Gate G1", "Gate G2", "Gate") for any Gate node.
 */
export function getNodeGateLabel(
  node: DomainNode,
  allNodes: DomainNode[],
  layout: Record<string, NodeLayout>,
  fallbackNumber?: number,
): string {
  const config = (node.config || {}) as Record<string, unknown>;
  if (typeof config.gateLabel === "string" && config.gateLabel.trim()) {
    return config.gateLabel.trim();
  }

  // Check parent container title if wrapped inside a Gate
  const parentId = layout[node.id]?.parentId;
  if (parentId) {
    const parentNode = allNodes.find((n) => n.id === parentId);
    if (parentNode && parentNode.title?.trim()) {
      const pMatch = parentNode.title.match(/\b(g[1-9][a-z0-9-]*)\b/i) || parentNode.title.match(/\b(gate\s*[a-z0-9-]*)\b/i);
      if (pMatch) {
        const raw = pMatch[1].replace(/gate\s*/i, "G").toUpperCase();
        return raw.startsWith("G") ? `Gate ${raw}` : `Gate G${raw}`;
      }
      return parentNode.title.trim();
    }
  }

  const title = (node.title || "").trim();
  const id = (node.id || "").trim();
  const match =
    title.match(/\b(g[1-9][a-z0-9-]*)\b/i) ||
    id.match(/\b(g[1-9][a-z0-9-]*)\b/i) ||
    title.match(/\b(gate\s*[a-z0-9-]*)\b/i) ||
    id.match(/\b(gate\s*[a-z0-9-]*)\b/i);

  if (match) {
    const raw = match[1].replace(/gate\s*/i, "G").toUpperCase();
    return raw.startsWith("G") ? `Gate ${raw}` : `Gate G${raw}`;
  }

  if (fallbackNumber !== undefined) {
    return `Gate G${fallbackNumber}`;
  }

  return "Gate";
}

export async function exportPresentationPdf(file: WorkflowFile): Promise<void> {
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

  // 2. Helper to resolve linked L2 nodes for any L1 phase
  const getLinkedL2Nodes = (l1Node: HighLevelNode): DomainNode[] => {
    const explicitIds = l1Node.linkedLayer2NodeIds ?? l1Node.linkedDetailedNodeIds ?? [];
    if (explicitIds.length > 0) {
      const orderedIds = orderLinkedWorkflowNodeIds(explicitIds, allNodes);
      return orderedIds
        .map((id) => allNodes.find((n) => n.id === id))
        .filter((n): n is DomainNode => Boolean(n && n.type !== "phase" && n.type !== "gate"));
    }

    // Dynamic matching by parent container in layout
    const byParent = allNodes.filter((n) => {
      if (n.type === "phase" || n.type === "gate") return false;
      const pId = layout[n.id]?.parentId;
      if (pId === l1Node.id) return true;
      // If parent is a gate, check if that gate's parent is this phase
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
  const totalL3Items = executionItems.length;

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
  container.style.lineHeight = "1.25";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  let globalGateCounter = 0;
  let phaseRowsHtml = "";

  orderedL1.forEach((l1Node, phaseIdx) => {
    const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];
    const linkedL2 = getLinkedL2Nodes(l1Node);

    // Filter actual Gate nodes in this phase
    const gateNodes = linkedL2.filter((n) => isNodeGate(n, allNodes, layout));

    // Build L1 Gate Badges list with distinct purple Gate styling
    let gateBadgesHtml = "";
    if (gateNodes.length > 0) {
      gateBadgesHtml = gateNodes
        .map((g) => {
          globalGateCounter += 1;
          const gateLabel = getNodeGateLabel(g, allNodes, layout, globalGateCounter);
          return `
            <div style="background: ${GATE_VISUAL.cardBg}; border: 1.5px solid ${GATE_VISUAL.border}; border-radius: 3px; padding: 2px 5px; display: flex; align-items: center; justify-content: space-between; box-shadow: ${GATE_VISUAL.shadow};">
              <span style="font-size: 7.5px; font-weight: 800; color: ${GATE_VISUAL.accent};">🚦 ${gateLabel}</span>
              <span style="font-size: 7px; font-weight: 700; color: ${GATE_VISUAL.tagText}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 95px;">
                ${escapeHtml(g.title)}
              </span>
            </div>
          `;
        })
        .join("");
    } else if (l1Node.type === "end" || phaseIdx === orderedL1.length - 1 || l1Node.title.toLowerCase().includes("final") || l1Node.title.toLowerCase().includes("close")) {
      gateBadgesHtml = `
        <div style="background: rgba(255,255,255,0.7); border: 1px dashed ${theme.border}; border-radius: 2px; padding: 2px 4px; text-align: center; font-size: 7px; color: ${theme.subtext}; font-weight: 600;">
          🏁 Final Milestone (No Gate)
        </div>
      `;
    } else if (l1Node.type === "start" || phaseIdx === 0) {
      gateBadgesHtml = `
        <div style="background: rgba(255,255,255,0.7); border: 1px dashed ${theme.border}; border-radius: 2px; padding: 2px 4px; text-align: center; font-size: 7px; color: ${theme.subtext};">
          🚀 Project Intake & Start
        </div>
      `;
    } else {
      gateBadgesHtml = `
        <div style="background: rgba(255,255,255,0.7); border: 1px dashed ${theme.border}; border-radius: 2px; padding: 2px 4px; text-align: center; font-size: 7px; color: ${theme.subtext};">
          Phase Execution Flow
        </div>
      `;
    }

    // Build L2 Stages (Middle Column - Compact connected vertical stepper)
    let l2StagesHtml = "";
    if (linkedL2.length === 0) {
      l2StagesHtml = `
        <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 5px; padding: 8px; text-align: center; color: #94a3b8; font-size: 9px;">
          No detailed L2 workflow nodes linked to this phase.
        </div>
      `;
    } else {
      l2StagesHtml = linkedL2
        .map((node, nIdx) => {
          const isGate = isNodeGate(node, allNodes, layout);
          const isStart = node.type === "projectStart" || node.id === "project-start";
          const isTerminal = node.type === "terminal" || node.type === "end" || node.id === "project-complete" || node.id === "close-out";

          const subtitle =
            node.description?.trim() ||
            (typeof node.config?.stage === "string" && node.config.stage.trim()) ||
            (isGate ? "Phase Completion Gate & Signoff" : isStart ? "Project Entry" : isTerminal ? "Completion Sign-off" : "Workflow Step");

          const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : isStart ? "Start" : isTerminal ? "Complete" : "Step";
          const cardBorder = isGate
            ? `border: 1.5px solid ${GATE_VISUAL.border}; border-left: 4px solid ${GATE_VISUAL.accent}; background: ${GATE_VISUAL.cardBg}; box-shadow: ${GATE_VISUAL.shadow};`
            : `border: 1px solid ${theme.border}; border-left: 3.5px solid ${isStart ? "#0284c7" : isTerminal ? "#10b981" : theme.accent}; background: #ffffff;`;

          const badgeStyle = isGate
            ? `background: ${GATE_VISUAL.tagBg}; color: ${GATE_VISUAL.accent}; border: 1px solid ${GATE_VISUAL.border}; font-weight: 800;`
            : isStart
              ? `background: #e0f2fe; color: #0369a1; font-weight: 700;`
              : isTerminal
                ? `background: #dcfce7; color: #15803d; font-weight: 700;`
                : `background: ${theme.tagBg}; color: ${theme.text}; font-weight: 600;`;

          return `
            <div style="${cardBorder} border-radius: 4px; padding: 4px 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 8.5px; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
                  ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                <span style="font-size: 7px; padding: 1px 4px; border-radius: 2px; text-transform: uppercase; ${badgeStyle}">
                  ${isGate ? `🚦 ${gateLabel}` : gateLabel}
                </span>
              </div>
              <p style="margin: 1px 0 0 0; font-size: 7.5px; color: ${isGate ? GATE_VISUAL.tagText : "#64748b"}; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(subtitle)}
              </p>
            </div>
            ${
              nIdx < linkedL2.length - 1
                ? `<div style="text-align: center; color: #94a3b8; font-size: 7px; line-height: 0.5; font-weight: 800; margin: 1px 0;">↓</div>`
                : ""
            }
          `;
        })
        .join("");
    }

    // Build L3 Right Column: Side-by-side horizontal cards for each L2 node in this phase
    let l3NodesHtml = "";
    if (linkedL2.length === 0) {
      l3NodesHtml = `
        <div style="color: #94a3b8; font-size: 8.5px; font-style: italic; text-align: center; padding: 8px;">
          No release conditions or controlled forms defined.
        </div>
      `;
    } else {
      const subCards = linkedL2.map((node, nIdx) => {
        const isGate = isNodeGate(node, allNodes, layout);
        const isTerminal = node.type === "terminal" || node.type === "end" || node.id === "project-complete" || node.id === "close-out";
        const isStart = node.type === "projectStart" || node.id === "project-start";
        const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : "";

        // 1. Dynamically collect all conditions attached to this node
        const conditions: Array<{ label: string; checked: boolean }> = [];
        if (node.conditions && node.conditions.length > 0) {
          node.conditions.forEach((c) => {
            if (c.label?.trim()) {
              conditions.push({
                label: c.label.trim(),
                checked: Boolean(c.checked),
              });
            }
          });
        }

        // Gate rules from node config
        if (node.config?.gateRules && Array.isArray(node.config.gateRules)) {
          node.config.gateRules.forEach((gr) => {
            if (gr.label?.trim()) {
              conditions.push({
                label: gr.label.trim(),
                checked: Boolean(gr.checked),
              });
            }
          });
        }

        // Signature requirements from node config
        if (node.config?.signatureRequirements && Array.isArray(node.config.signatureRequirements)) {
          node.config.signatureRequirements.forEach((sr) => {
            if (sr.fullName?.trim() || sr.abbreviation?.trim()) {
              conditions.push({
                label: `Signoff: ${sr.fullName || sr.abbreviation} (${sr.department || "Authorized"})`,
                checked: Boolean(sr.checked),
              });
            }
          });
        }

        // 2. Dynamically collect execution items and forms linked to this node
        const nodeForms: Array<{ code: string; title: string; role: string }> = [];
        const linkedItems = executionItems.filter(
          (item) =>
            item.linkedLayer2NodeId === node.id ||
            node.conditions?.some((c) => c.linkedExecutionItemId === item.id),
        );
        linkedItems.forEach((item) => {
          nodeForms.push({
            code: item.documentCode || item.documentNumber || item.catalogId || "DOC",
            title: item.title?.replace(/^[A-Z0-9-—/ ]+\/\s*/, "") || item.title || "Form",
            role: item.responsibleRole || "Owner",
          });
        });

        // Add node documents if present
        if (node.documents && node.documents.length > 0) {
          node.documents.forEach((docTitle, docIdx) => {
            if (!nodeForms.some((f) => f.title.toLowerCase() === docTitle.toLowerCase())) {
              nodeForms.push({
                code: `DOC-0${docIdx + 1}`,
                title: docTitle,
                role: "Required",
              });
            }
          });
        }

        const condCount = conditions.length;
        const condCols = condCount > 14 ? 3 : condCount > 6 ? 2 : 1;

        let condMarkup = "";
        if (condCount > 0) {
          condMarkup = `
            <div style="display: grid; grid-template-columns: repeat(${condCols}, 1fr); gap: 2px 6px;">
              ${conditions
                .map(
                  (c) => `
                <div style="display: flex; align-items: flex-start; gap: 3px; font-size: 7.5px; color: #334155; line-height: 1.2;">
                  <span style="color: ${c.checked ? "#059669" : isGate ? "#7c3aed" : "#d97706"}; font-weight: 800; font-size: 8px;">${c.checked ? "✓" : "☑"}</span>
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(c.label)}
                  </span>
                </div>
              `,
                )
                .join("")}
            </div>
          `;
        } else {
          condMarkup = `
            <div style="display: flex; align-items: center; gap: 3px; font-size: 7.5px; color: #64748b;">
              <span style="color: #059669; font-weight: 800;">✓</span>
              <span>${isGate ? "Gate approval & verification signoff" : isTerminal ? "Project complete & closeout sign-off" : "Milestone verification"}</span>
            </div>
          `;
        }

        let formsMarkup = "";
        if (nodeForms.length > 0) {
          formsMarkup = `
            <div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 3px; border-top: 1px dashed ${isGate ? GATE_VISUAL.border : "#e2e8f0"}; padding-top: 2px;">
              ${nodeForms
                .map(
                  (f) => `
                <span style="background: #ffffff; border: 1px solid ${isGate ? GATE_VISUAL.border : "#cbd5e1"}; font-size: 7px; font-weight: 600; padding: 1px 3px; border-radius: 2px; color: #1e293b; white-space: nowrap;">
                  <strong>[${escapeHtml(f.code)}]</strong> ${escapeHtml(f.title)}
                </span>
              `,
                )
                .join("")}
            </div>
          `;
        }

        const flexGrow = condCount > 10 ? 2 : 1;

        const badgeLabel = isGate ? `🚦 ${gateLabel}` : isTerminal ? "🏁 Complete" : isStart ? "Start" : `${condCount} cond`;
        const badgeColor = isGate ? GATE_VISUAL.accent : isTerminal ? "#15803d" : isStart ? "#0369a1" : "#64748b";
        const badgeBg = isGate ? GATE_VISUAL.tagBg : isTerminal ? "#dcfce7" : isStart ? "#e0f2fe" : "#ffffff";

        const cardStyle = isGate
          ? `background: ${GATE_VISUAL.cardBg}; border: 1.5px solid ${GATE_VISUAL.border}; box-shadow: ${GATE_VISUAL.shadow};`
          : `background: #f8fafc; border: 1px solid #e2e8f0;`;

        return `
          <div style="flex: ${flexGrow}; min-width: 0; ${cardStyle} border-radius: 4px; padding: 4px 6px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${isGate ? GATE_VISUAL.border : "#e2e8f0"}; padding-bottom: 2px; margin-bottom: 3px;">
                <span style="font-size: 8px; font-weight: 800; color: ${isGate ? GATE_VISUAL.accent : "#0f172a"}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                <span style="font-size: 6.5px; color: ${badgeColor}; font-weight: 800; background: ${badgeBg}; border: 1px solid ${isGate ? GATE_VISUAL.border : "#e2e8f0"}; padding: 0 3px; border-radius: 2px;">
                  ${badgeLabel}
                </span>
              </div>
              ${condMarkup}
            </div>
            ${formsMarkup}
          </div>
        `;
      });

      l3NodesHtml = `
        <div style="display: flex; gap: 6px; height: 100%; width: 100%;">
          ${subCards.join("")}
        </div>
      `;
    }

    const phaseCode = l1Node.code || `PHASE-0${phaseIdx + 1}`;
    const phaseTitle = l1Node.title || `Phase ${phaseIdx + 1}`;
    const phaseSubtitle = l1Node.description || "Active Lifecycle Phase";

    phaseRowsHtml += `
      <!-- PHASE ROW ${phaseIdx + 1} -->
      <div style="display: grid; grid-template-columns: 155px 260px 1fr; gap: 8px; border: 1px solid ${theme.border}; border-radius: 6px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.02); overflow: hidden; height: 220px; box-sizing: border-box;">
        
        <!-- L1 Card (Left Column) -->
        <div style="background: ${theme.bg}; border-right: 1px solid ${theme.border}; padding: 6px 8px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
              <span style="background: ${theme.badge}; color: #ffffff; font-size: 7.5px; font-weight: 800; padding: 1px 4px; border-radius: 2px; text-transform: uppercase;">
                ${escapeHtml(phaseCode)}
              </span>
              <span style="font-size: 7.5px; font-weight: 700; color: ${theme.subtext};">
                ${linkedL2.length} Node${linkedL2.length !== 1 ? "s" : ""}
              </span>
            </div>
            <h2 style="margin: 0 0 1px 0; font-size: 12px; font-weight: 800; color: ${theme.text}; line-height: 1.15;">
              ${escapeHtml(phaseTitle)}
            </h2>
            <p style="margin: 0; font-size: 8px; color: ${theme.text}; opacity: 0.85; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
              ${escapeHtml(phaseSubtitle)}
            </p>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 2px;">
            ${gateBadgesHtml}
          </div>
        </div>

        <!-- L2 Stages (Middle Column) -->
        <div style="padding: 5px 6px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #f1f5f9; background: #fafafa; overflow: hidden;">
          ${l2StagesHtml}
        </div>

        <!-- L3 Release Conditions & Documents (Right Column, Side-by-Side L2 Nodes) -->
        <div style="padding: 5px 6px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; overflow: hidden;">
          ${l3NodesHtml}
        </div>

      </div>
    `;
  });

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
      
      <!-- TOP HEADER BAR -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: flex-end; height: 42px; box-sizing: border-box;">
        <div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 1px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 1px 5px; border-radius: 2px;">
              L1 · L2 · L3 Process Architecture
            </span>
            <span style="background: #0284c7; color: #ffffff; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 5px; border-radius: 2px;">
              ${totalPhases} Phases · ${totalL2Nodes} Workflow Nodes · ${totalL3Items} Controlled Items
            </span>
          </div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
            ${escapeHtml(projectName)}
          </h1>
        </div>
        
        <div style="text-align: right; font-size: 9px; color: #475569; display: flex; gap: 10px; align-items: center;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 6px; text-align: left;">
            <div style="font-size: 7.5px; color: #64748b; text-transform: uppercase; font-weight: 700;">Project Number</div>
            <div style="font-weight: 800; font-family: monospace; font-size: 10px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 6px; text-align: left;">
            <div style="font-size: 7.5px; color: #64748b; text-transform: uppercase; font-weight: 700;">Revision / Date</div>
            <div style="font-weight: 700; font-size: 9.5px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- MAIN 3-ZONE TABLE / GRID -->
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; margin-top: 5px; margin-bottom: 5px; gap: 6px; overflow: hidden;">
        
        <!-- COLUMN TITLES HEADER -->
        <div style="display: grid; grid-template-columns: 155px 260px 1fr; gap: 8px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; padding: 0 2px;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #0284c7;"></span>
            L1 · High-Level (${totalPhases})
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #6366f1;"></span>
            L2 · Workflow Steps & Gates (${totalL2Nodes})
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #059669;"></span>
            L3 · Node-by-Node Release Conditions & Controlled Documents
          </div>
        </div>

        ${phaseRowsHtml}

      </div>

      <!-- BOTTOM FOOTER & SIGN-OFF BAR -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; color: #64748b; height: 22px; box-sizing: border-box;">
        <div style="display: flex; gap: 10px; align-items: center;">
          <span style="font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 8px;">System Traceability:</span>
          <span>● <strong>Canvas 1:1 Colors:</strong> Phase colors (Green, Pink, Amber, Yellow) and Gate purple (#7c3aed) match the canvas.</span>
          <span>● <strong>Gate Governance:</strong> Gate nodes require verified release conditions before downstream stages proceed.</span>
          <span>● <strong>Node Traceability:</strong> All L3 release conditions & controlled forms are mapped directly to parent L2 nodes.</span>
        </div>
        <div style="font-weight: 600; color: #0f172a;">
          ProFab Process Workflow System · Single-Page Executive Presentation (A4 Landscape)
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
