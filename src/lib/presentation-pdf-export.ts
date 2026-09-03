import type { WorkflowFile, DomainNode, HighLevelNode } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";

const PHASE_THEMES = [
  {
    badge: "#0284c7",
    bg: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
    border: "#bae6fd",
    text: "#0c4a6e",
    accent: "#0284c7",
    subtext: "#0369a1",
    tagBg: "#e0f2fe",
    defaultGate: "Gate G1 — Qualified & Commercially Engaged",
  },
  {
    badge: "#d97706",
    bg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
    border: "#fde68a",
    text: "#78350f",
    accent: "#d97706",
    subtext: "#b45309",
    tagBg: "#fef3c7",
    defaultGate: "Gate G2 — Technical & Project Commitment",
  },
  {
    badge: "#7c3aed",
    bg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
    border: "#ddd6fe",
    text: "#4c1d95",
    accent: "#7c3aed",
    subtext: "#6d28d9",
    tagBg: "#ede9fe",
    defaultGate: "Gate G3 — Production & Execution Authorization",
  },
  {
    badge: "#059669",
    bg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    border: "#a7f3d0",
    text: "#064e3b",
    accent: "#059669",
    subtext: "#047857",
    tagBg: "#d1fae5",
    defaultGate: "Gate G5 — Final Project Acceptance & Close",
  },
  {
    badge: "#0891b2",
    bg: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
    border: "#a5f3fc",
    text: "#164e63",
    accent: "#0891b2",
    subtext: "#0e7490",
    tagBg: "#cffafe",
    defaultGate: "Primary Gate Control",
  },
  {
    badge: "#475569",
    bg: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
    border: "#cbd5e1",
    text: "#1e293b",
    accent: "#475569",
    subtext: "#334155",
    tagBg: "#e2e8f0",
    defaultGate: "Primary Gate Control",
  },
];

function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isGateNode(node: DomainNode): boolean {
  const type = String(node.type || "").toLowerCase();
  const title = String(node.title || "").toLowerCase();
  const id = String(node.id || "").toLowerCase();
  const stage = String(node.config?.stage || "").toLowerCase();

  return (
    type === "gate" ||
    type === "decision" ||
    stage.includes("gate") ||
    title.includes("gate") ||
    title.startsWith("g1") ||
    title.startsWith("g2") ||
    title.startsWith("g3") ||
    title.startsWith("g4") ||
    title.startsWith("g5") ||
    id.includes("gate") ||
    title.includes("qualification & commercial") ||
    title.includes("sales agreement") ||
    title.includes("execution & payment") ||
    title.includes("project complete") ||
    title.includes("authorization")
  );
}

function getGateLabelForNode(node: DomainNode, phaseIdx: number, nIdx: number): string {
  const title = String(node.title || "").toLowerCase();
  if (title.includes("qualification") || title.startsWith("g1")) return "Gate G1";
  if (title.includes("sales agreement") || title.includes("technical commitment") || title.startsWith("g2")) return "Gate G2";
  if (title.includes("execution") || title.includes("production auth") || title.startsWith("g3")) return "Gate G3";
  if (title.includes("factory release") || title.startsWith("g4")) return "Gate G4";
  if (title.includes("project complete") || title.includes("warranty start") || title.startsWith("g5")) return "Gate G5";
  return `Gate G${phaseIdx + 1}`;
}

export async function exportPresentationPdf(file: WorkflowFile): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");

  const projectName = file.graph.metadata.name || "ProFab Modular Process Workflow";
  const projectNumber = file.operations?.projectNumber || "PRJ-2026-001";
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

  // 1. Determine L1 Phases from actual project
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
          id: "hl-all",
          type: "phase" as const,
          title: "Project Lifecycle",
          description: "Full workflow lifecycle",
          code: "PHASE-01",
        },
      ];
    }
  }

  // Helper to resolve linked L2 nodes for an L1 phase without filtering out terminal/end nodes
  const getLinkedL2Nodes = (l1Node: HighLevelNode): DomainNode[] => {
    const explicitIds = l1Node.linkedLayer2NodeIds ?? l1Node.linkedDetailedNodeIds ?? [];
    if (explicitIds.length > 0) {
      const orderedIds = orderLinkedWorkflowNodeIds(explicitIds, allNodes);
      return orderedIds
        .map((id) => allNodes.find((n) => n.id === id))
        .filter((n): n is DomainNode => Boolean(n && n.type !== "phase"));
    }

    const byParent = allNodes.filter(
      (n) =>
        n.type !== "phase" &&
        (layout[n.id]?.parentId === l1Node.id ||
          n.config?.phaseId === l1Node.id ||
          (n.metadata?.phaseTitle && n.metadata.phaseTitle === l1Node.title)),
    );
    if (byParent.length > 0) return byParent;

    if (
      l1Node.type === "end" ||
      l1Node.title.toLowerCase().includes("final close") ||
      l1Node.title.toLowerCase().includes("commission")
    ) {
      const closeNodes = allNodes.filter(
        (n) =>
          n.type !== "phase" &&
          (n.type === "terminal" ||
            n.id === "project-complete" ||
            n.id === "close-out" ||
            n.title.toLowerCase().includes("project complete") ||
            n.title.toLowerCase().includes("close")),
      );
      if (closeNodes.length > 0) return closeNodes;
    }

    if (l1Node.type === "start" || l1Node.title.toLowerCase().includes("start")) {
      const startNodes = allNodes.filter(
        (n) =>
          n.type !== "phase" &&
          (n.type === "projectStart" || n.id === "project-start" || n.title.toLowerCase().includes("project start")),
      );
      if (startNodes.length > 0) return startNodes;
    }

    if (orderedL1.length === 1) {
      return allNodes.filter((n) => n.type !== "phase");
    }

    return [];
  };

  const totalPhases = orderedL1.length;
  const totalL2Nodes = allNodes.filter((n) => n.type !== "phase").length;
  const totalL3Items = executionItems.length;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.zIndex = "-99999";
  container.style.pointerEvents = "none";
  container.style.opacity = "1";
  container.style.visibility = "visible";
  // Exact 297 : 210 ratio (1485px x 1050px = 5px per mm)
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

  let phaseRowsHtml = "";

  orderedL1.forEach((l1Node, phaseIdx) => {
    const theme = PHASE_THEMES[phaseIdx % PHASE_THEMES.length];
    const linkedL2 = getLinkedL2Nodes(l1Node);

    // Find any gates in this phase
    const explicitGateNodes = linkedL2.filter(isGateNode);

    // Build L1 Gate Badges list
    let gateBadgesHtml = "";
    if (explicitGateNodes.length > 0) {
      gateBadgesHtml = explicitGateNodes
        .map((g, gIdx) => {
          const gateLabel = getGateLabelForNode(g, phaseIdx, gIdx);
          return `
            <div style="background: #ffffff; border: 1px solid ${theme.border}; border-radius: 3px; padding: 2px 5px; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 8px; font-weight: 800; color: ${theme.accent};">🚦 ${gateLabel}</span>
              <span style="font-size: 7px; font-weight: 600; color: ${theme.subtext}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;">
                ${escapeHtml(g.title)}
              </span>
            </div>
          `;
        })
        .join("");
    } else {
      // Fallback to default phase gate milestone
      gateBadgesHtml = `
        <div style="background: #ffffff; border: 1px solid ${theme.border}; border-radius: 3px; padding: 2px 5px; display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 8px; font-weight: 800; color: ${theme.accent};">🚦 Gate G${phaseIdx + 1}</span>
          <span style="font-size: 7px; font-weight: 600; color: ${theme.subtext}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 105px;">
            ${escapeHtml(theme.defaultGate.replace(/^Gate G\d+\s*—\s*/, ""))}
          </span>
        </div>
      `;
    }

    // Build L2 Stages (Middle Column - Compact connected vertical stepper)
    let l2StagesHtml = "";
    if (linkedL2.length === 0) {
      l2StagesHtml = `
        <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 5px; padding: 8px; text-align: center; color: #94a3b8; font-size: 9px;">
          No L2 steps linked.
        </div>
      `;
    } else {
      l2StagesHtml = linkedL2
        .map((node, nIdx) => {
          const isGate = isGateNode(node);
          const isStart = node.type === "projectStart" || node.id === "project-start";
          const isTerminal = node.type === "terminal" || node.id === "project-complete" || node.id === "close-out";

          const subtitle =
            node.description?.trim() ||
            (node.config?.stage as string) ||
            (isGate ? "Primary Gate Control Point" : isStart ? "Project Record Entry" : isTerminal ? "Final Project Sign-off" : "Workflow Execution Step");

          const gateLabel = isGate ? getGateLabelForNode(node, phaseIdx, nIdx) : isStart ? "Start" : isTerminal ? "End" : "Step";
          const badgeStyle = isGate
            ? `background: ${theme.tagBg}; color: ${theme.subtext}; font-weight: 800;`
            : isStart
              ? `background: #e0f2fe; color: #0369a1; font-weight: 700;`
              : isTerminal
                ? `background: #dcfce7; color: #15803d; font-weight: 700;`
                : `background: #f1f5f9; color: #475569; font-weight: 600;`;

          return `
            <div style="background: #ffffff; border: 1px solid ${isGate ? theme.border : "#e2e8f0"}; border-radius: 4px; padding: 4px 6px; border-left: 3.5px solid ${isGate ? theme.accent : isStart ? "#0284c7" : isTerminal ? "#10b981" : "#64748b"};">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 8.5px; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 185px;">
                  ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                <span style="font-size: 7px; padding: 1px 4px; border-radius: 2px; text-transform: uppercase; ${badgeStyle}">
                  ${isGate ? `🚦 ${gateLabel}` : gateLabel}
                </span>
              </div>
              <p style="margin: 1px 0 0 0; font-size: 7.5px; color: #64748b; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
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
        const isGate = isGateNode(node);
        const gateLabel = isGate ? getGateLabelForNode(node, phaseIdx, nIdx) : "";

        // 1. Collect conditions
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

        if (node.config?.signatureRequirements && Array.isArray(node.config.signatureRequirements)) {
          node.config.signatureRequirements.forEach((sr) => {
            if (sr.fullName?.trim() || sr.abbreviation?.trim()) {
              conditions.push({
                label: `Signoff: ${sr.fullName || sr.abbreviation} (${sr.department || "Auth"})`,
                checked: Boolean(sr.checked),
              });
            }
          });
        }

        // 2. Collect forms
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

        if (node.documents && node.documents.length > 0) {
          node.documents.forEach((docTitle, docIdx) => {
            if (!nodeForms.some((f) => f.title.toLowerCase() === docTitle.toLowerCase())) {
              nodeForms.push({
                code: `DOC-0${docIdx + 1}`,
                title: docTitle,
                role: "Req",
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
                  <span style="color: ${c.checked ? "#059669" : "#d97706"}; font-weight: 800; font-size: 8px;">${c.checked ? "✓" : "☑"}</span>
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
              <span>${isGate ? "Authorized Gate decision & verification release" : "Milestone completion and verification sign-off"}</span>
            </div>
          `;
        }

        let formsMarkup = "";
        if (nodeForms.length > 0) {
          formsMarkup = `
            <div style="display: flex; flex-wrap: wrap; gap: 2px; margin-top: 3px; border-top: 1px dashed #e2e8f0; padding-top: 2px;">
              ${nodeForms
                .map(
                  (f) => `
                <span style="background: #ffffff; border: 1px solid #cbd5e1; font-size: 7px; font-weight: 600; padding: 1px 3px; border-radius: 2px; color: #1e293b; white-space: nowrap;">
                  <strong>[${escapeHtml(f.code)}]</strong> ${escapeHtml(f.title)}
                </span>
              `,
                )
                .join("")}
            </div>
          `;
        }

        const flexGrow = condCount > 10 ? 2 : 1;

        return `
          <div style="flex: ${flexGrow}; min-width: 0; background: ${isGate ? "#ffffff" : "#f8fafc"}; border: 1px solid ${isGate ? theme.border : "#e2e8f0"}; border-radius: 4px; padding: 4px 6px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; ${isGate ? `box-shadow: 0 0 0 1px ${theme.border};` : ""}">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${isGate ? theme.border : "#e2e8f0"}; padding-bottom: 2px; margin-bottom: 3px;">
                <span style="font-size: 8px; font-weight: 800; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                <span style="font-size: 6.5px; color: ${isGate ? theme.subtext : "#64748b"}; font-weight: 700; background: ${isGate ? theme.tagBg : "#ffffff"}; border: 1px solid ${isGate ? theme.border : "#e2e8f0"}; padding: 0 3px; border-radius: 2px;">
                  ${isGate ? `🚦 ${gateLabel}` : `${condCount} cond`}
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
      <div style="display: grid; grid-template-columns: 155px 260px 1fr; gap: 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff; box-shadow: 0 1px 2px rgba(0,0,0,0.02); overflow: hidden; height: 220px; box-sizing: border-box;">
        
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
            <p style="margin: 0; font-size: 8px; color: #334155; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
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
              ${totalPhases} Phases · ${totalL2Nodes} Workflow Nodes · 5 Primary Gates · ${totalL3Items} Controlled Items
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
            L1 · High-Level & Gates (${totalPhases})
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
          <span>● <strong>Primary Gates:</strong> G1 (Qualification), G2 (Commitment), G3 (Execution), G5 (Completion) govern release.</span>
          <span>● <strong>Node Alignment:</strong> Every L3 condition & form is mapped directly to its owner L2 node.</span>
          <span>● <strong>Stage Integrity:</strong> Release conditions must be verified before proceeding downstream.</span>
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
