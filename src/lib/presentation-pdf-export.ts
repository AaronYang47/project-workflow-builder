import type { WorkflowFile, DomainNode, HighLevelNode, NodeLayout } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { conditionIsSatisfied } from "@/lib/workflow-progress";

// 1:1 Exact Matching colors from the project canvas (薄荷绿 -> 玫瑰粉红 -> 橘黄色 -> 金黄色)
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
  // 6. Slate
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

// Distinct Purple styling ONLY for Gate tags/badges
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

export async function exportPresentationPdf(file: WorkflowFile): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");

  const allNodes = file.graph.nodes || [];
  const startNode = allNodes.find((n) => n.type === "projectStart" || n.id === "project-start");
  const projectNumber =
    String(startNode?.customFields?.projectId || "").trim() ||
    String(startNode?.customFields?.projectNumber || "").trim() ||
    String(allNodes.find((n) => n.customFields?.projectId)?.customFields?.projectId || "").trim() ||
    String(file.operations?.identity?.projectNumber || "").trim() ||
    String(file.operations?.identity?.projectId || "").trim() ||
    String(file.operations?.projectNumber || "").trim() ||
    "PRJ-001";

  const projectName = file.graph.metadata.name || "Process Workflow Architecture";
  const version = file.graph.metadata.version || "v1.0";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const timestamp = `${dateStr} ${timeStr}`;
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
  const totalL3Items = executionItems.length;

  // Calculate dynamic adaptive height weights for each phase
  const phaseData = orderedL1.map((l1Node) => {
    const linkedL2 = getLinkedL2Nodes(l1Node);
    let maxConds = 0;
    linkedL2.forEach((n) => {
      const count = (n.conditions || []).length + ((n.config?.gateRules as unknown[]) || []).length;
      if (count > maxConds) maxConds = count;
    });
    const weight = Math.max(1, Math.min(2.5, 0.8 + (maxConds > 10 ? 0.8 : maxConds > 5 ? 0.4 : 0) + (linkedL2.length > 3 ? 0.3 : 0)));
    return { l1Node, linkedL2, weight };
  });

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
  container.style.padding = "14px 18px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  let phaseRowsHtml = "";

  phaseData.forEach(({ l1Node, linkedL2, weight }, phaseIdx) => {
    const theme = DEFAULT_PHASE_THEMES[phaseIdx % DEFAULT_PHASE_THEMES.length];

    // Filter actual Gate nodes in this phase
    const gateNodes = linkedL2.filter((n) => isNodeGate(n, allNodes, layout));

    // Build L1 Gate Badges: CONSOLIDATE same-gate control points into ONE clean Tag (no text overflow)
    let gateBadgesHtml = "";
    if (gateNodes.length > 0) {
      const gateGroupMap = new Map<string, { label: string; titles: string[] }>();
      gateNodes.forEach((g) => {
        const rawLabel = getNodeGateLabel(g, allNodes, layout);
        const baseGate = rawLabel.replace(/-[A-Z0-9]+$/i, "").trim() || `Gate ${phaseIdx + 1}`;
        if (!gateGroupMap.has(baseGate)) {
          gateGroupMap.set(baseGate, { label: baseGate, titles: [g.title] });
        } else {
          gateGroupMap.get(baseGate)!.titles.push(g.title);
        }
      });

      gateBadgesHtml = Array.from(gateGroupMap.values())
        .map((group) => {
          const summaryText =
            group.titles.length === 1
              ? group.titles[0]
              : `${group.titles.length} Gate Milestones`;
          return `
            <div style="background: #ffffff; border: 1.5px solid ${GATE_TAG_VISUAL.border}; border-radius: 4px; padding: 3px 6px; display: flex; align-items: center; gap: 6px; box-shadow: 0 1px 2px rgba(124,58,237,0.08);">
              <span style="font-size: 9.5px; font-weight: 900; color: ${GATE_TAG_VISUAL.tagText}; background: ${GATE_TAG_VISUAL.tagBg}; padding: 2px 6px; border-radius: 3px; white-space: nowrap; flex-shrink: 0; line-height: 1;">🚦 ${escapeHtml(group.label)}</span>
              <span style="font-size: 9px; font-weight: 800; color: ${theme.subtext}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(summaryText)}
              </span>
            </div>
          `;
        })
        .join("");
    } else if (l1Node.type === "end" || phaseIdx === orderedL1.length - 1 || l1Node.title.toLowerCase().includes("final") || l1Node.title.toLowerCase().includes("close")) {
      gateBadgesHtml = `
        <div style="background: rgba(255,255,255,0.85); border: 1px dashed ${theme.border}; border-radius: 4px; padding: 4px 6px; text-align: center; font-size: 9px; color: ${theme.subtext}; font-weight: 800;">
          🏁 Final Milestone (No Gate)
        </div>
      `;
    } else if (l1Node.type === "start" || phaseIdx === 0) {
      gateBadgesHtml = `
        <div style="background: rgba(255,255,255,0.85); border: 1px dashed ${theme.border}; border-radius: 4px; padding: 4px 6px; text-align: center; font-size: 9px; color: ${theme.subtext}; font-weight: 700;">
          🚀 Project Intake & Start
        </div>
      `;
    } else {
      gateBadgesHtml = `
        <div style="background: rgba(255,255,255,0.85); border: 1px dashed ${theme.border}; border-radius: 4px; padding: 4px 6px; text-align: center; font-size: 9px; color: ${theme.subtext}; font-weight: 700;">
          Phase Execution Flow
        </div>
      `;
    }

    // Build L2 Stages (Middle Column - Card is Phase theme, ONLY Gate tag is Purple, clean single-line badges)
    let l2StagesHtml = "";
    if (linkedL2.length === 0) {
      l2StagesHtml = `
        <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 5px; padding: 10px; text-align: center; color: #94a3b8; font-size: 11px;">
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
            (isGate ? "Phase Completion Gate & Signoff" : isStart ? "Project Record Entry" : isTerminal ? "Completion Sign-off" : "Workflow Execution Step");

          const gateLabel = isGate ? getNodeGateLabel(node, allNodes, layout) : isStart ? "Start" : isTerminal ? "Complete" : "Step";

          const cardBorder = `border: 1.5px solid ${theme.border}; border-left: 4.5px solid ${theme.accent}; background: #ffffff;`;

          const badgeStyle = isGate
            ? `background: ${GATE_TAG_VISUAL.tagBg}; color: ${GATE_TAG_VISUAL.tagText}; border: 1px solid ${GATE_TAG_VISUAL.border}; font-weight: 900;`
            : isStart
              ? `background: #e0f2fe; color: #0369a1; font-weight: 800;`
              : isTerminal
                ? `background: #dcfce7; color: #15803d; font-weight: 800;`
                : `background: ${theme.tagBg}; color: ${theme.text}; font-weight: 700;`;

          return `
            <div style="${cardBorder} border-radius: 4px; padding: 4px 7px;">
              <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px;">
                <span style="font-size: 11px; font-weight: 800; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                  STEP ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                <span style="font-size: 8.5px; padding: 2px 5px; border-radius: 3px; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; line-height: 1; ${badgeStyle}">
                  ${isGate ? `🚦 ${gateLabel}` : gateLabel}
                </span>
              </div>
              <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #475569; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">
                ${escapeHtml(subtitle)}
              </p>
            </div>
          `;
        })
        .join("");
    }

    // Build L3 Right Column (Cards adaptively stretch to fill 100% height and space with rich typography)
    let l3NodesHtml = "";
    if (linkedL2.length === 0) {
      l3NodesHtml = `
        <div style="color: #94a3b8; font-size: 10px; font-style: italic; text-align: center; padding: 10px;">
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
        const projectStartNode = allNodes.find((n) => n.type === "projectStart" || n.id === "project-start");
        const operations = file.operations;

        if (node.conditions && node.conditions.length > 0) {
          node.conditions.forEach((c) => {
            if (c.label?.trim()) {
              const isSatisfied = conditionIsSatisfied(
                c,
                node,
                projectStartNode,
                executionItems,
                operations,
              );
              conditions.push({
                label: c.label.trim(),
                checked: isSatisfied,
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
            <div style="display: grid; grid-template-columns: repeat(${condCols}, 1fr); gap: 3px 8px; flex: 1;">
              ${conditions
                .map((c) => {
                  const boxHtml = c.checked
                    ? `<span style="display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; border-radius: 2px; background: #10b981; color: #ffffff; font-size: 9.5px; font-weight: 900; line-height: 1; flex-shrink: 0; margin-top: 1.5px;">✓</span>`
                    : `<span style="display: inline-flex; width: 12px; height: 12px; border-radius: 2px; background: #fef08a; border: 1.3px solid #ca8a04; flex-shrink: 0; margin-top: 1.5px; box-sizing: border-box;"></span>`;

                  return `
                    <div style="display: flex; align-items: flex-start; gap: 5px; font-size: 9.5px; color: #0f172a; line-height: 1.35;">
                      ${boxHtml}
                      <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600;">
                        ${escapeHtml(c.label)}
                      </span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `;
        } else {
          condMarkup = `
            <div style="display: flex; align-items: center; gap: 5px; font-size: 9.5px; color: #64748b; flex: 1;">
              <span style="display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; border-radius: 2px; background: #10b981; color: #ffffff; font-size: 9.5px; font-weight: 900; line-height: 1; flex-shrink: 0;">✓</span>
              <span style="font-weight: 600;">${isGate ? "Gate approval & verification signoff" : isTerminal ? "Project complete & closeout sign-off" : "Milestone verification"}</span>
            </div>
          `;
        }

        let formsMarkup = "";
        if (nodeForms.length > 0) {
          formsMarkup = `
            <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; border-top: 1px dashed ${theme.border}; padding-top: 3px;">
              ${nodeForms
                .map(
                  (f) => `
                <span style="background: #ffffff; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 700; padding: 2px 5px; border-radius: 2px; color: #0f172a; white-space: nowrap;">
                  <strong>[${escapeHtml(f.code)}]</strong> ${escapeHtml(f.title)}
                </span>
              `,
                )
                .join("")}
            </div>
          `;
        }

        const flexGrow = condCount > 10 ? 2 : 1;

        // Tag: Purple ONLY when it is a Gate; otherwise Phase theme
        const badgeLabel = isGate ? `🚦 ${gateLabel}` : isTerminal ? "🏁 Complete" : isStart ? "Start" : `${condCount} cond`;
        const badgeColor = isGate ? GATE_TAG_VISUAL.tagText : isTerminal ? "#15803d" : isStart ? "#0369a1" : theme.text;
        const badgeBg = isGate ? GATE_TAG_VISUAL.tagBg : isTerminal ? "#dcfce7" : isStart ? "#e0f2fe" : theme.tagBg;
        const badgeBorder = isGate ? GATE_TAG_VISUAL.border : theme.border;

        return `
          <div style="flex: ${flexGrow}; min-width: 0; background: #ffffff; border: 1.5px solid ${theme.border}; border-radius: 4px; padding: 4px 7px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; height: 100%; box-sizing: border-box;">
            <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-between;">
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${theme.border}; padding-bottom: 2px; margin-bottom: 4px; gap: 4px;">
                <span style="font-size: 10px; font-weight: 900; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                  STEP ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                <span style="font-size: 8px; color: ${badgeColor}; font-weight: 900; background: ${badgeBg}; border: 1px solid ${badgeBorder}; padding: 1.5px 5px; border-radius: 2px; white-space: nowrap; flex-shrink: 0; line-height: 1;">
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
      <!-- PHASE ROW ${phaseIdx + 1} (Flex weight: ${weight}) -->
      <div style="flex: ${weight}; min-height: 0; display: grid; grid-template-columns: 190px 275px 1fr; gap: 8px; border: 1.5px solid ${theme.border}; border-radius: 6px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.02); overflow: hidden; box-sizing: border-box;">
        
        <!-- L1 Card (Left Column) -->
        <div style="background: ${theme.bg}; border-right: 1.5px solid ${theme.border}; padding: 7px 10px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="background: ${theme.badge}; color: #ffffff; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 3px; text-transform: uppercase;">
                ${escapeHtml(phaseCode)}
              </span>
              <span style="font-size: 9px; font-weight: 900; color: ${theme.subtext};">
                ${linkedL2.length} Step${linkedL2.length !== 1 ? "s" : ""}
              </span>
            </div>
            <h2 style="margin: 0 0 2px 0; font-size: 15.5px; font-weight: 900; color: ${theme.text}; line-height: 1.15;">
              ${escapeHtml(phaseTitle)}
            </h2>
            <p style="margin: 0; font-size: 10px; color: ${theme.text}; opacity: 0.95; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-weight: 600;">
              ${escapeHtml(phaseSubtitle)}
            </p>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 2px;">
            ${gateBadgesHtml}
          </div>
        </div>

        <!-- L2 Stages (Middle Column) -->
        <div style="padding: 5px 6px; display: flex; flex-direction: column; gap: 4px; justify-content: flex-start; border-right: 1px solid #f1f5f9; background: #fafafa; overflow: hidden;">
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
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: flex-end; height: 44px; box-sizing: border-box; flex-shrink: 0;">
        <div>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; padding: 2px 6px; border-radius: 3px;">
              L1 · L2 · L3 Process Architecture
            </span>
            <span style="background: #0284c7; color: #ffffff; font-size: 9.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 3px;">
              ${totalPhases} Phases · ${totalL2Nodes} Workflow Steps · ${totalL3Items} Controlled Items
            </span>
          </div>
          <h1 style="margin: 0; font-size: 21px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">
            ${escapeHtml(projectName)}
          </h1>
        </div>
        
        <div style="text-align: right; font-size: 10px; color: #475569; display: flex; gap: 10px; align-items: center;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; text-align: left;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800;">Project Number</div>
            <div style="font-weight: 900; font-family: monospace; font-size: 12px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 3px 8px; text-align: left;">
            <div style="font-size: 8px; color: #64748b; text-transform: uppercase; font-weight: 800;">Revision / Date</div>
            <div style="font-weight: 800; font-size: 11px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- MAIN 3-ZONE TABLE / GRID (Fully Adaptive Flex Layout) -->
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; margin-top: 5px; margin-bottom: 5px; gap: 6px; overflow: hidden; min-height: 0;">
        
        <!-- COLUMN TITLES HEADER -->
        <div style="display: grid; grid-template-columns: 190px 275px 1fr; gap: 8px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; padding: 0 2px; flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #0284c7;"></span>
            L1 · High-Level (${totalPhases})
          </div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #6366f1;"></span>
            L2 · Workflow Steps & Gates (${totalL2Nodes})
          </div>
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>
            L3 · Node-by-Node Release Conditions & Controlled Documents
          </div>
        </div>

        ${phaseRowsHtml}

      </div>

      <!-- BOTTOM FOOTER & SIGN-OFF BAR -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #64748b; height: 22px; box-sizing: border-box; flex-shrink: 0;">
        <div style="display: flex; gap: 10px; align-items: center;">
          <span style="font-weight: 800; color: #0f172a; text-transform: uppercase; font-size: 9px;">System Traceability:</span>
          <span>● <strong>Step Governance:</strong> All L2 steps follow sequential lifecycle execution within their parent Phase.</span>
          <span>● <strong>Purple Gate Tags:</strong> 🚦 Gate tags highlight control points while cards retain Phase theme colors.</span>
          <span>● <strong>Adaptive Layout:</strong> Dynamic flex distribution fully utilizes A4 space with zero overflow.</span>
        </div>
        <div style="font-weight: 700; color: #0f172a;">
          ProFab Process Workflow System · Single-Page Executive Tech Architecture (A4 Landscape)
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
    pdf.save(`${safeProjectName}-L1-L2-L3-Tech.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
