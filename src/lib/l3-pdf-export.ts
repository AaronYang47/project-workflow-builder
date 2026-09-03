import type { WorkflowFile, DomainNode, Condition } from "@/types/workflow";
import { isReferenceNodeType } from "@/types/workflow";
import { orderHighLevelNodes } from "@/lib/high-level-workflow";

interface DocItem {
  title: string;
  category: "legal" | "customer" | "supporting";
  required?: boolean;
  checked?: boolean;
  fileName?: string;
  status?: string;
}

function parseDocs(raw?: unknown): DocItem[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        title: item.title || item.fileName || "Document",
        category: item.category || "supporting",
        required: item.required ?? true,
        checked: item.checked ?? false,
        fileName: item.fileName,
        status: item.status || (item.checked ? "Verified" : "Required"),
      }));
    }
  } catch {
    // fallthrough
  }
  return [];
}

export async function exportL3ExecutionPdf(file: WorkflowFile): Promise<void> {
  const { toPng } = await import("html-to-image");
  const { jsPDF } = await import("jspdf");

  const nodes = file.graph.nodes;
  const layout = file.layout.nodes;
  const highLevel = file.highLevel;
  const orderedL1 = orderHighLevelNodes(
    highLevel?.graph.nodes || [],
    highLevel?.graph.edges || [],
  );

  // Group nodes by phase
  const phases = nodes.filter((n) => n.type === "phase");
  const gates = nodes.filter((n) => n.type === "gate");
  const steps = nodes.filter(
    (n) =>
      n.type !== "phase" &&
      n.type !== "gate" &&
      n.type !== "projectStart" &&
      n.type !== "end" &&
      !isReferenceNodeType(n.type),
  );

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "1100px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  container.style.padding = "40px";
  container.style.boxSizing = "border-box";
  container.style.lineHeight = "1.5";

  // Build Document Header
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

  const projectName = file.graph.metadata.name || "ProFab Process Workflow";
  const version = file.graph.metadata.version || "v1.0-draft";
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

  let html = `
    <div style="border-bottom: 2px solid #0284c7; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end;">
      <div>
        <div style="display: inline-block; background-color: #0284c7; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 8px; border-radius: 4px; margin-bottom: 8px;">
          L3 · Execution Requirements & Compliance Matrix
        </div>
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
          ${projectName}
        </h1>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">
          Comprehensive 3-Box Architecture: Legal Documents · Customer Information Forms · Supporting Attachments
        </p>
      </div>
      <div style="text-align: right; font-size: 11px; color: #475569;">
        <p style="margin: 0; font-weight: 700; color: #0f172a;">Project ID: <span style="font-family: monospace;">${projectNumber}</span></p>
        <p style="margin: 2px 0 0 0;">Version: <strong>${version}</strong> · Generated: ${timestamp}</p>
        <p style="margin: 2px 0 0 0; color: #059669; font-weight: 600;">Status: Ready for Print & Signoff</p>
      </div>
    </div>
  `;

  // Render by Phase
  for (const l1Node of orderedL1) {
    if (l1Node.type === "start" || l1Node.type === "end") continue;

    // Find phase node in L2
    const phaseNode = phases.find((p) => p.title === l1Node.title) || phases[0];
    const phaseId = phaseNode?.id;
    const phaseColor = phaseNode?.color || l1Node.backgroundColor || "#0284c7";

    // Find all steps and gates in this phase
    const phaseSteps = steps.filter((s) => {
      const parentId = layout[s.id]?.parentId;
      return parentId === phaseId || (!parentId && phases.indexOf(phaseNode) === 0);
    });
    const phaseGates = gates.filter((g) => {
      const parentId = layout[g.id]?.parentId;
      return parentId === phaseId;
    });

    html += `
      <div style="margin-bottom: 36px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
        <!-- Phase Header Banner -->
        <div style="background-color: ${phaseColor}; color: #ffffff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="background-color: rgba(255,255,255,0.25); font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
              PHASE
            </span>
            <h2 style="margin: 0; font-size: 16px; font-weight: 700;">
              ${l1Node.title}
            </h2>
          </div>
          <span style="font-size: 11px; font-weight: 600; opacity: 0.9;">
            ${l1Node.description || "Active Lifecycle Phase"}
          </span>
        </div>

        <div style="padding: 20px;">
    `;

    // Render Gate if present
    if (phaseGates.length > 0) {
      for (const gate of phaseGates) {
        html += `
          <div style="margin-bottom: 20px; border: 1.5px solid #c084fc; border-radius: 8px; background-color: #faf5ff; padding: 14px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="background-color: #7c3aed; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">
                  GATE CONTROL
                </span>
                <h3 style="margin: 0; font-size: 13px; font-weight: 700; color: #581c87;">
                  ${gate.title}
                </h3>
              </div>
              <span style="font-size: 10px; color: #7e22ce; font-weight: 600;">
                Phase Completion Gate & Executive Signoff
              </span>
            </div>
            ${
              gate.conditions && gate.conditions.length > 0
                ? `<div style="display: flex; flex-wrap: wrap; gap: 8px;">
                    ${gate.conditions
                      .map(
                        (c) => `
                        <div style="background-color: #ffffff; border: 1px solid #d8b4fe; border-radius: 6px; padding: 6px 10px; font-size: 11px; display: flex; align-items: center; gap: 6px;">
                          <span style="color: ${c.checked ? "#059669" : "#7c3aed"}; font-weight: bold;">
                            ${c.checked ? "✓" : "○"}
                          </span>
                          <span style="font-weight: 600; color: #3b0764;">${c.label || "Gate Verification"}</span>
                          <span style="font-size: 9px; color: #9333ea;">(${c.required ? "Mandatory" : "Optional"})</span>
                        </div>
                      `,
                      )
                      .join("")}
                  </div>`
                : `<p style="margin: 0; font-size: 11px; color: #6b21a8; font-style: italic;">All prerequisite steps within this phase must be completed and approved before passing.</p>`
            }
          </div>
        `;
      }
    }

    // Render Steps in this Phase
    if (phaseSteps.length > 0) {
      html += `<div style="display: flex; flex-direction: column; gap: 16px;">`;
      for (const step of phaseSteps) {
        const legalDocs = parseDocs(step.customFields?.legalDocuments);
        const customerDocs = parseDocs(step.customFields?.customerDocuments);
        const supportingDocs = parseDocs(step.customFields?.supportingDocuments);
        const conditions = step.conditions || [];

        html += `
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; background-color: #f8fafc;">
            <!-- Step Header -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 10px; font-weight: 700; color: #0284c7; background-color: #e0f2fe; padding: 2px 6px; border-radius: 4px;">
                    STEP
                  </span>
                  <h4 style="margin: 0; font-size: 13px; font-weight: 700; color: #0f172a;">
                    ${step.title}
                  </h4>
                </div>
                ${step.description ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">${step.description}</p>` : ""}
              </div>
              <div style="text-align: right;">
                <span style="font-size: 10px; font-weight: 600; color: #475569; background-color: #e2e8f0; padding: 2px 6px; border-radius: 4px;">
                  ${step.config?.stage || "Standard Stage"}
                </span>
              </div>
            </div>

            <!-- Conditions Summary -->
            ${
              conditions.length > 0
                ? `
                <div style="margin-bottom: 12px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px;">
                  <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Release Conditions</span>
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    ${conditions
                      .map(
                        (c) => `
                        <span style="font-size: 10px; font-weight: 500; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                          <span style="color: ${c.checked ? "#059669" : "#64748b"}; font-weight: bold;">${c.checked ? "✓" : "○"}</span>
                          <span>${c.label || "Condition"}</span>
                        </span>
                      `,
                      )
                      .join("")}
                  </div>
                </div>
              `
                : ""
            }

            <!-- 3-Box Architecture -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
              <!-- Box 1: Legal Documents -->
              <div style="background-color: #ffffff; border: 1px solid #fecdd3; border-top: 3px solid #e11d48; border-radius: 6px; padding: 10px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                  <span style="font-size: 12px;">⚖️</span>
                  <span style="font-size: 11px; font-weight: 700; color: #9f1239;">Legal Documents</span>
                </div>
                ${
                  legalDocs.length > 0
                    ? `<ul style="margin: 0; padding-left: 14px; font-size: 10px; color: #334155;">
                        ${legalDocs
                          .map(
                            (d) => `
                            <li style="margin-bottom: 4px;">
                              <strong>${d.title}</strong>
                              <span style="color: #64748b; font-size: 9px;"> (${d.status})</span>
                            </li>
                          `,
                          )
                          .join("")}
                      </ul>`
                    : `<p style="margin: 0; font-size: 10px; color: #94a3b8; font-style: italic;">Standard Master Contract & NDA</p>`
                }
              </div>

              <!-- Box 2: Customer Information Forms -->
              <div style="background-color: #ffffff; border: 1px solid #bae6fd; border-top: 3px solid #0284c7; border-radius: 6px; padding: 10px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                  <span style="font-size: 12px;">🏢</span>
                  <span style="font-size: 11px; font-weight: 700; color: #0369a1;">Customer Information</span>
                </div>
                ${
                  customerDocs.length > 0
                    ? `<ul style="margin: 0; padding-left: 14px; font-size: 10px; color: #334155;">
                        ${customerDocs
                          .map(
                            (d) => `
                            <li style="margin-bottom: 4px;">
                              <strong>${d.title}</strong>
                              <span style="color: #64748b; font-size: 9px;"> (${d.status})</span>
                            </li>
                          `,
                          )
                          .join("")}
                      </ul>`
                    : `<p style="margin: 0; font-size: 10px; color: #94a3b8; font-style: italic;">Customer Spec & Authorization</p>`
                }
              </div>

              <!-- Box 3: Supporting Documents -->
              <div style="background-color: #ffffff; border: 1px solid #fed7aa; border-top: 3px solid #ea580c; border-radius: 6px; padding: 10px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
                  <span style="font-size: 12px;">📁</span>
                  <span style="font-size: 11px; font-weight: 700; color: #c2410c;">Supporting Documents</span>
                </div>
                ${
                  supportingDocs.length > 0
                    ? `<ul style="margin: 0; padding-left: 14px; font-size: 10px; color: #334155;">
                        ${supportingDocs
                          .map(
                            (d) => `
                            <li style="margin-bottom: 4px;">
                              <strong>${d.title}</strong>
                              <span style="color: #64748b; font-size: 9px;"> (${d.status})</span>
                            </li>
                          `,
                          )
                          .join("")}
                      </ul>`
                    : `<p style="margin: 0; font-size: 10px; color: #94a3b8; font-style: italic;">Technical Models & Cost Sheets</p>`
                }
              </div>
            </div>
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `
        </div>
      </div>
    `;
  }

  // Footer Signoff Section
  html += `
    <div style="margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 20px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; font-size: 11px; color: #475569;">
        <div style="border-top: 1px dashed #94a3b8; padding-top: 8px;">
          <p style="margin: 0; font-weight: 700; color: #0f172a;">Project Manager Signoff</p>
          <p style="margin: 2px 0 0 0; font-size: 10px;">Signature: ______________________</p>
          <p style="margin: 2px 0 0 0; font-size: 10px;">Date: ____________</p>
        </div>
        <div style="border-top: 1px dashed #94a3b8; padding-top: 8px;">
          <p style="margin: 0; font-weight: 700; color: #0f172a;">Engineering Lead Signoff</p>
          <p style="margin: 2px 0 0 0; font-size: 10px;">Signature: ______________________</p>
          <p style="margin: 2px 0 0 0; font-size: 10px;">Date: ____________</p>
        </div>
        <div style="border-top: 1px dashed #94a3b8; padding-top: 8px;">
          <p style="margin: 0; font-weight: 700; color: #0f172a;">Client Representative Signoff</p>
          <p style="margin: 2px 0 0 0; font-size: 10px;">Signature: ______________________</p>
          <p style="margin: 2px 0 0 0; font-size: 10px;">Date: ____________</p>
        </div>
      </div>
      <p style="margin: 24px 0 0 0; text-align: center; font-size: 10px; color: #94a3b8;">
        Falcon Workflow System · Cloudflare R2 Document Verification Pipeline · End of Document
      </p>
    </div>
  `;

  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const dataUrl = await toPng(container, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
    });

    const imgWidth = 1100;
    const imgHeight = container.offsetHeight;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [imgWidth, imgHeight],
    });

    pdf.addImage(dataUrl, "PNG", 0, 0, imgWidth, imgHeight);
    pdf.save("workflow-L3-execution-matrix.pdf");
  } finally {
    document.body.removeChild(container);
  }
}
