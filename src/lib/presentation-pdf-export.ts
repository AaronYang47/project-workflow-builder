import type { WorkflowFile, DomainNode, HighLevelNode } from "@/types/workflow";
import { orderHighLevelNodes, orderLinkedWorkflowNodeIds } from "@/lib/high-level-workflow";
import { isReferenceNodeType } from "@/types/workflow";

const PHASE_THEMES = [
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
    badge: "#d97706",
    bg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
    border: "#fde68a",
    text: "#78350f",
    accent: "#d97706",
    subtext: "#b45309",
    tagBg: "#fef3c7",
  },
  {
    badge: "#7c3aed",
    bg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
    border: "#ddd6fe",
    text: "#4c1d95",
    accent: "#7c3aed",
    subtext: "#6d28d9",
    tagBg: "#ede9fe",
  },
  {
    badge: "#059669",
    bg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
    border: "#a7f3d0",
    text: "#064e3b",
    accent: "#059669",
    subtext: "#047857",
    tagBg: "#d1fae5",
  },
  {
    badge: "#0891b2",
    bg: "linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)",
    border: "#a5f3fc",
    text: "#164e63",
    accent: "#0891b2",
    subtext: "#0e7490",
    tagBg: "#cffafe",
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

function escapeHtml(str?: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    // Fallback if highLevel graph is empty: look for phase nodes in L2
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
      // Single group fallback
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

  // Helper to resolve linked L2 nodes for an L1 phase
  const getLinkedL2Nodes = (l1Node: HighLevelNode): DomainNode[] => {
    const explicitIds = l1Node.linkedLayer2NodeIds ?? l1Node.linkedDetailedNodeIds ?? [];
    if (explicitIds.length > 0) {
      const orderedIds = orderLinkedWorkflowNodeIds(explicitIds, allNodes);
      return orderedIds
        .map((id) => allNodes.find((n) => n.id === id))
        .filter((n): n is DomainNode => Boolean(n && !isReferenceNodeType(n.type)));
    }

    // Check by parentId in layout or phaseId in config
    const byParent = allNodes.filter(
      (n) =>
        !isReferenceNodeType(n.type) &&
        n.type !== "phase" &&
        (layout[n.id]?.parentId === l1Node.id ||
          n.config?.phaseId === l1Node.id ||
          (n.metadata?.phaseTitle && n.metadata.phaseTitle === l1Node.title)),
    );
    if (byParent.length > 0) return byParent;

    // If single phase, include all non-reference non-phase nodes
    if (orderedL1.length === 1) {
      return allNodes.filter((n) => !isReferenceNodeType(n.type) && n.type !== "phase");
    }

    return [];
  };

  const totalPhases = orderedL1.length;
  const totalL2Nodes = allNodes.filter((n) => !isReferenceNodeType(n.type) && n.type !== "phase").length;
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
  container.style.padding = "22px 28px";
  container.style.boxSizing = "border-box";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.justifyContent = "space-between";
  container.style.lineHeight = "1.3";
  container.style.setProperty("-webkit-font-smoothing", "antialiased");

  // Calculate dynamic row height based on number of phases
  const rowHeightPx = Math.max(140, Math.floor(900 / Math.max(1, totalPhases)));

  let phaseRowsHtml = "";

  orderedL1.forEach((l1Node, phaseIdx) => {
    const theme = PHASE_THEMES[phaseIdx % PHASE_THEMES.length];
    const linkedL2 = getLinkedL2Nodes(l1Node);

    // Collect all conditions and execution items from linked L2 nodes
    const phaseConditions: Array<{ label: string; checked: boolean; nodeTitle: string; description?: string }> = [];
    const phaseForms: Array<{ code: string; title: string; role: string; type: string }> = [];

    // Find any gates in this phase
    const gateNodes = linkedL2.filter(
      (n) =>
        n.type === "gate" ||
        n.title.toLowerCase().includes("gate") ||
        n.title.toLowerCase().startsWith("g1") ||
        n.title.toLowerCase().startsWith("g2") ||
        n.title.toLowerCase().startsWith("g3") ||
        n.title.toLowerCase().startsWith("g4") ||
        n.title.toLowerCase().startsWith("g5"),
    );

    linkedL2.forEach((l2Node) => {
      // 1. Conditions
      if (l2Node.conditions && l2Node.conditions.length > 0) {
        l2Node.conditions.forEach((c) => {
          if (c.label?.trim()) {
            phaseConditions.push({
              label: c.label.trim(),
              checked: Boolean(c.checked),
              nodeTitle: l2Node.title,
              description: c.description?.trim(),
            });
          }
        });
      }

      // 2. Execution Items (Forms)
      const linkedItems = executionItems.filter(
        (item) =>
          item.linkedLayer2NodeId === l2Node.id ||
          l2Node.conditions?.some((c) => c.linkedExecutionItemId === item.id),
      );
      linkedItems.forEach((item) => {
        phaseForms.push({
          code: item.documentCode || item.documentNumber || item.catalogId || "DOC",
          title: item.title?.replace(/^[A-Z0-9-—/ ]+\/\s*/, "") || item.title || "Form",
          role: item.responsibleRole || "Owner",
          type: item.type,
        });
      });

      // 3. Fallback to node documents if no execution items found
      if (linkedItems.length === 0 && l2Node.documents && l2Node.documents.length > 0) {
        l2Node.documents.forEach((docTitle, docIdx) => {
          phaseForms.push({
            code: `DOC-0${docIdx + 1}`,
            title: docTitle,
            role: "Assigned",
            type: "Document",
          });
        });
      }
    });

    // Deduplicate forms
    const uniqueForms = phaseForms.filter(
      (form, idx, arr) => arr.findIndex((f) => f.code === form.code && f.title === form.title) === idx,
    );

    // Build L2 Stages HTML
    let l2StagesHtml = "";
    if (linkedL2.length === 0) {
      l2StagesHtml = `
        <div style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 8px 12px; text-align: center; color: #94a3b8; font-size: 10px;">
          No detailed L2 workflow nodes linked to this phase.
        </div>
      `;
    } else if (linkedL2.length <= 4) {
      // Linear column stack
      l2StagesHtml = linkedL2
        .map((node, nIdx) => {
          const isGate =
            node.type === "gate" ||
            node.title.toLowerCase().includes("gate") ||
            node.title.toLowerCase().startsWith("g1") ||
            node.title.toLowerCase().startsWith("g2") ||
            node.title.toLowerCase().startsWith("g3") ||
            node.title.toLowerCase().startsWith("g4") ||
            node.title.toLowerCase().startsWith("g5");

          const subtitle =
            node.description?.trim() ||
            (node.config?.stage as string) ||
            (isGate ? "Primary Gate Control Point" : "Workflow Execution Step");

          return `
            <div style="background: #ffffff; border: 1px solid ${isGate ? theme.border : "#e2e8f0"}; border-radius: 6px; padding: 6px 10px; border-left: 3.5px solid ${isGate ? theme.accent : "#64748b"};">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10px; font-weight: 700; color: #0f172a;">
                  ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                </span>
                ${
                  isGate
                    ? `<span style="background: ${theme.tagBg}; color: ${theme.subtext}; font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 3px; text-transform: uppercase;">🚦 Gate</span>`
                    : `<span style="background: #f1f5f9; color: #475569; font-size: 8px; font-weight: 600; padding: 1px 5px; border-radius: 3px;">Step</span>`
                }
              </div>
              <p style="margin: 0; font-size: 8.5px; color: #64748b; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(subtitle)}
              </p>
            </div>
            ${
              nIdx < linkedL2.length - 1
                ? `<div style="text-align: center; color: #94a3b8; font-size: 9px; line-height: 0.8; font-weight: 800; margin: 1px 0;">↓</div>`
                : ""
            }
          `;
        })
        .join("");
    } else {
      // 2-column compact grid for 5+ nodes
      l2StagesHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; max-height: 100%; overflow: hidden;">
          ${linkedL2
            .map((node, nIdx) => {
              const isGate = node.type === "gate" || node.title.toLowerCase().includes("gate");
              return `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 6px; border-left: 3px solid ${isGate ? theme.accent : "#94a3b8"};">
                  <div style="font-size: 9px; font-weight: 700; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${phaseIdx + 1}.${nIdx + 1} ${escapeHtml(node.title)}
                  </div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    // Build L3 Conditions HTML
    let conditionsHtml = "";
    if (phaseConditions.length > 0) {
      conditionsHtml = phaseConditions
        .slice(0, 3)
        .map(
          (c) => `
          <div style="display: flex; align-items: flex-start; gap: 5px; font-size: 9px; color: #334155; line-height: 1.25;">
            <span style="color: ${c.checked ? "#059669" : "#64748b"}; font-weight: 800;">${c.checked ? "✓" : "☑"}</span>
            <span style="overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
              <strong>${escapeHtml(c.label)}</strong>${c.description ? ` · <span style="color: #64748b;">${escapeHtml(c.description)}</span>` : ""}
            </span>
          </div>
        `,
        )
        .join("");
    } else {
      // Synthesize conditions from L2 node titles if no explicit conditions
      conditionsHtml = linkedL2
        .slice(0, 2)
        .map(
          (node) => `
          <div style="display: flex; align-items: flex-start; gap: 5px; font-size: 9px; color: #334155; line-height: 1.25;">
            <span style="color: #059669; font-weight: 800;">✓</span>
            <span><strong>${escapeHtml(node.title)}:</strong> Complete verification and authorized release criteria.</span>
          </div>
        `,
        )
        .join("");
    }

    // Build L3 Forms HTML
    let formsHtml = "";
    if (uniqueForms.length > 0) {
      formsHtml = uniqueForms
        .slice(0, 8)
        .map(
          (form) => `
          <span style="background: #f8fafc; border: 1px solid #cbd5e1; font-size: 8px; font-weight: 600; padding: 2px 5px; border-radius: 3px; color: #1e293b; white-space: nowrap;">
            <strong>[${escapeHtml(form.code)}]</strong> ${escapeHtml(form.title)} <span style="color: #64748b; font-size: 7.5px;">(${escapeHtml(form.role)})</span>
          </span>
        `,
        )
        .join("");
    } else {
      formsHtml = `
        <span style="color: #94a3b8; font-size: 8.5px; font-style: italic;">No specific controlled forms registered for this phase.</span>
      `;
    }

    const phaseCode = l1Node.code || `PHASE-0${phaseIdx + 1}`;
    const phaseTitle = l1Node.title || `Phase ${phaseIdx + 1}`;
    const phaseSubtitle = l1Node.description || "Active Lifecycle Phase";

    phaseRowsHtml += `
      <!-- PHASE ROW ${phaseIdx + 1} -->
      <div style="display: grid; grid-template-columns: 260px 460px 1fr; gap: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); overflow: hidden; min-height: ${rowHeightPx}px; height: 100%;">
        
        <!-- L1 Card (Left Column) -->
        <div style="background: ${theme.bg}; border-right: 1px solid ${theme.border}; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="background: ${theme.badge}; color: #ffffff; font-size: 8.5px; font-weight: 800; padding: 2px 6px; border-radius: 3px; text-transform: uppercase;">
                ${escapeHtml(phaseCode)}
              </span>
              <span style="font-size: 8.5px; font-weight: 700; color: ${theme.subtext};">
                ${linkedL2.length} L2 Step${linkedL2.length !== 1 ? "s" : ""}
              </span>
            </div>
            <h2 style="margin: 0 0 2px 0; font-size: 13.5px; font-weight: 800; color: ${theme.text}; line-height: 1.2;">
              ${escapeHtml(phaseTitle)}
            </h2>
            <p style="margin: 0; font-size: 9px; color: #334155; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
              ${escapeHtml(phaseSubtitle)}
            </p>
          </div>
          
          <div style="display: flex; flex-direction: column; gap: 3px; margin-top: 4px;">
            ${
              gateNodes.length > 0
                ? gateNodes
                    .map(
                      (g) => `
                    <div style="background: #ffffff; border: 1px solid ${theme.border}; border-radius: 4px; padding: 3px 6px; display: flex; align-items: center; justify-content: space-between;">
                      <span style="font-size: 8.5px; font-weight: 800; color: ${theme.accent};">🚦 Gate</span>
                      <span style="font-size: 8px; font-weight: 600; color: ${theme.subtext}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;">
                        ${escapeHtml(g.title)}
                      </span>
                    </div>
                  `,
                    )
                    .join("")
                : `
                  <div style="background: rgba(255,255,255,0.7); border: 1px dashed ${theme.border}; border-radius: 4px; padding: 3px 6px; text-align: center; font-size: 8px; color: ${theme.subtext};">
                    Continuous Phase Controls
                  </div>
                `
            }
          </div>
        </div>

        <!-- L2 Stages (Middle Column) -->
        <div style="padding: 8px 10px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #f1f5f9; background: #fafafa; overflow: hidden;">
          ${l2StagesHtml}
        </div>

        <!-- L3 Release Conditions & Documents (Right Column) -->
        <div style="padding: 8px 12px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; overflow: hidden;">
          <div>
            <div style="font-size: 9px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">
              Release Conditions & Gate Rules
            </div>
            <div style="display: flex; flex-direction: column; gap: 3px;">
              ${conditionsHtml}
            </div>
          </div>

          <div style="margin-top: 4px;">
            <div style="font-size: 8px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 3px;">
              Controlled Forms, Master Records & Artifacts
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 3px;">
              ${formsHtml}
            </div>
          </div>
        </div>

      </div>
    `;
  });

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
      
      <!-- TOP HEADER BAR -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; padding: 2px 6px; border-radius: 3px;">
              L1 · L2 · L3 Process Architecture
            </span>
            <span style="background: #0284c7; color: #ffffff; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 6px; border-radius: 3px;">
              ${totalPhases} Phases · ${totalL2Nodes} Workflow Steps · ${totalL3Items} Controlled Items
            </span>
          </div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
            ${escapeHtml(projectName)}
          </h1>
          <p style="margin: 1px 0 0 0; font-size: 10.5px; color: #64748b; font-weight: 500;">
            Current Project Workflow Structure: L1 High-Level Phases → L2 Detailed Stages & Gates → L3 Release Conditions & Deliverables
          </p>
        </div>
        
        <div style="text-align: right; font-size: 10px; color: #475569; display: flex; gap: 14px; align-items: center;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 4px 10px; text-align: left;">
            <div style="font-size: 8.5px; color: #64748b; text-transform: uppercase; font-weight: 700;">Project Number</div>
            <div style="font-weight: 800; font-family: monospace; font-size: 11px; color: #0f172a;">${escapeHtml(projectNumber)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; padding: 4px 10px; text-align: left;">
            <div style="font-size: 8.5px; color: #64748b; text-transform: uppercase; font-weight: 700;">Revision / Date</div>
            <div style="font-weight: 700; font-size: 10.5px; color: #0f172a;">${escapeHtml(version)} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- MAIN 3-ZONE TABLE / GRID -->
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; margin-top: 8px; margin-bottom: 8px; gap: 6px;">
        
        <!-- COLUMN TITLES HEADER -->
        <div style="display: grid; grid-template-columns: 260px 460px 1fr; gap: 12px; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; padding: 0 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #0284c7;"></span>
            L1 · High-Level Phases (${totalPhases})
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #6366f1;"></span>
            L2 · Detailed Workflow Stages (${totalL2Nodes})
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>
            L3 · Release Conditions & Controlled Documents
          </div>
        </div>

        ${phaseRowsHtml}

      </div>

      <!-- BOTTOM FOOTER & SIGN-OFF BAR -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 8.5px; color: #64748b;">
        <div style="display: flex; gap: 14px; align-items: center;">
          <span style="font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 9px;">System Traceability:</span>
          <span>● <strong>Dynamic Mapping:</strong> Directly rendered from current project workspace nodes & connections.</span>
          <span>● <strong>Stage Governance:</strong> Each L2 step inherits its parent L1 lifecycle phase.</span>
          <span>● <strong>Release Integrity:</strong> L3 conditions block progress until verified.</span>
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
