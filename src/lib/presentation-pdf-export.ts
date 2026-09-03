import type { WorkflowFile } from "@/types/workflow";

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

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  // Exact 297 : 210 ratio (1485px x 1050px = 5px per mm)
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

  const html = `
    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: space-between;">
      
      <!-- TOP HEADER BAR -->
      <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span style="background: #0f172a; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; padding: 2px 7px; border-radius: 3px;">
              L1 · L2 · L3 Process Architecture
            </span>
            <span style="background: #0284c7; color: #ffffff; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 3px;">
              4 Phases · 5 Primary Gates · 52 Controlled Documents
            </span>
          </div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">
            ${projectName}
          </h1>
          <p style="margin: 2px 0 0 0; font-size: 11px; color: #64748b; font-weight: 500;">
            End-to-End Modular Construction Workflow: Macro Lifecycle (L1) → Bounded Stages (L2) → Release Conditions & Controlled Forms (L3)
          </p>
        </div>
        
        <div style="text-align: right; font-size: 10.5px; color: #475569; display: flex; gap: 20px; align-items: center;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; text-align: left;">
            <div style="font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 700;">Project Number</div>
            <div style="font-weight: 800; font-family: monospace; font-size: 12px; color: #0f172a;">${projectNumber}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 12px; text-align: left;">
            <div style="font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 700;">Revision / Date</div>
            <div style="font-weight: 700; font-size: 11px; color: #0f172a;">${version} · ${timestamp}</div>
          </div>
        </div>
      </div>

      <!-- MAIN 3-ZONE TABLE / GRID -->
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; margin-top: 10px; margin-bottom: 10px; gap: 8px;">
        
        <!-- COLUMN TITLES HEADER -->
        <div style="display: grid; grid-template-columns: 260px 450px 1fr; gap: 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; padding: 0 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #0284c7;"></span>
            L1 · 4 Lifecycle Phases & Gates
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #6366f1;"></span>
            L2 · Bounded Stages & Operational Flow
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #059669;"></span>
            L3 · Release Conditions & Controlled Deliverables
          </div>
        </div>

        <!-- ==================== PHASE 1 ROW ==================== -->
        <div style="display: grid; grid-template-columns: 260px 450px 1fr; gap: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); overflow: hidden; height: 215px;">
          <!-- L1 Card -->
          <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-right: 1px solid #bae6fd; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="background: #0284c7; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Phase 01</span>
                <span style="font-size: 9px; font-weight: 700; color: #0369a1;">P01 — Opportunity</span>
              </div>
              <h2 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #0c4a6e; line-height: 1.2;">
                Opportunity & Pre-Con
              </h2>
              <p style="margin: 0; font-size: 9.5px; color: #334155; line-height: 1.3;">
                Qualify client authority, establish project scale, lock Class C basis and 4-party boundaries.
              </p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="background: #ffffff; border: 1px solid #7dd3fc; border-radius: 4px; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 9.5px; font-weight: 800; color: #0284c7;">🚦 Gate G1</span>
                <span style="font-size: 8.5px; font-weight: 600; color: #0369a1;">Commercially Engaged</span>
              </div>
              <div style="background: #ffffff; border: 1px solid #7dd3fc; border-radius: 4px; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 9.5px; font-weight: 800; color: #0284c7;">🚦 Gate G2</span>
                <span style="font-size: 8.5px; font-weight: 600; color: #0369a1;">Technical Commitment</span>
              </div>
            </div>
          </div>

          <!-- L2 Stages -->
          <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #f1f5f9; background: #fafafa;">
            <!-- Stage 1.1 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #0284c7;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">1.1 Project Intake & Qualification</span>
                <span style="background: #e0f2fe; color: #0369a1; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Routes: CSA / Class D / PCS / LOI</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Evidence intake (Storeys, GFA, Site, Budget). Hard blocker check: Unknown authority or incompatible design triggers Hold.
              </p>
            </div>

            <!-- Down Arrow Indicator -->
            <div style="text-align: center; color: #94a3b8; font-size: 10px; line-height: 1; font-weight: 800;">↓</div>

            <!-- Stage 1.2 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #0284c7;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">1.2 Design Basis & Scope Delineation</span>
                <span style="background: #e0f2fe; color: #0369a1; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Class C & SOW Convergence</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Architectural/MEP coordination, PDAF design freeze, 4-party Responsibility Matrix (RM), SOW and formal Sales Agreement.
              </p>
            </div>
          </div>

          <!-- L3 Release Conditions & Documents -->
          <div style="padding: 10px 14px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff;">
            <div>
              <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px;">
                Release Conditions & Governance Rules
              </div>
              <div style="display: flex; flex-direction: column; gap: 3.5px; font-size: 9.5px; color: #334155;">
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>G1 Release:</strong> Validated storeys & GFA, named decision authority, eligible commercial route executed (no bypass).</span>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>G2 Release:</strong> PDAF design freeze, Class C budget signed, 4-Party Responsibility Matrix (RM) & SOW accepted.</span>
                </div>
              </div>
            </div>

            <div>
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
                Key Controlled Master Forms & Artifacts
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-01]</strong> CRM Intake (Sales)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-04]</strong> Client Qual (Sales)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-07]</strong> CEC-D Estimate (Est)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-14]</strong> PDAF Design Auth (Eng)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-18]</strong> SOW Scope (PM)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-20]</strong> Responsibility Matrix (PM)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-21]</strong> Sales Agreement (Legal)
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PHASE 2 ROW ==================== -->
        <div style="display: grid; grid-template-columns: 260px 450px 1fr; gap: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); overflow: hidden; height: 215px;">
          <!-- L1 Card -->
          <div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-right: 1px solid #fde68a; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="background: #d97706; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Phase 02</span>
                <span style="font-size: 9px; font-weight: 700; color: #b45309;">P02 — Readiness</span>
              </div>
              <h2 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #78350f; line-height: 1.2;">
                Production Readiness
              </h2>
              <p style="margin: 0; font-size: 9.5px; color: #334155; line-height: 1.3;">
                Freeze shop drawings, secure building permits, confirm signed PSO and lock production slot.
              </p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="background: #ffffff; border: 1px solid #fcd34d; border-radius: 4px; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 9.5px; font-weight: 800; color: #d97706;">🚦 Gate G3</span>
                <span style="font-size: 8.5px; font-weight: 600; color: #b45309;">Production Authorization</span>
              </div>
            </div>
          </div>

          <!-- L2 Stages -->
          <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #f1f5f9; background: #fafafa;">
            <!-- Stage 2.1 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #d97706;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">2.1 Shop Drawings & Permit Tracking</span>
                <span style="background: #fef3c7; color: #b45309; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Technical Inputs Freeze</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Final fabrication details, engineering stamping, client sign-off on finishes, and municipal permit clearance.
              </p>
            </div>

            <!-- Down Arrow Indicator -->
            <div style="text-align: center; color: #94a3b8; font-size: 10px; line-height: 1; font-weight: 800;">↓</div>

            <!-- Stage 2.2 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #d97706;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">2.2 PSO Execution & Master Schedule (MPS)</span>
                <span style="background: #fef3c7; color: #b45309; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Commercial & Plant Release</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Execute Production Shop Order (PSO), verify production deposit, allocate plant line capacity, lock procurement.
              </p>
            </div>
          </div>

          <!-- L3 Release Conditions & Documents -->
          <div style="padding: 10px 14px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff;">
            <div>
              <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px;">
                Release Conditions & Governance Rules
              </div>
              <div style="display: flex; flex-direction: column; gap: 3.5px; font-size: 9.5px; color: #334155;">
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>Shop Drawings:</strong> 100% approved by client & engineering; unapproved details block factory start.</span>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>G3 Release:</strong> Executed PSO + verified manufacturing funds + confirmed MPS line allocation.</span>
                </div>
              </div>
            </div>

            <div>
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
                Key Controlled Master Forms & Artifacts
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-22]</strong> Shop Order PSO (PM/Eng)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-25]</strong> Permit Tracker (PM)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-28]</strong> Master Schedule MPS (Plant)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-30]</strong> Change Order PCO (PM)
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PHASE 3 ROW ==================== -->
        <div style="display: grid; grid-template-columns: 260px 450px 1fr; gap: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); overflow: hidden; height: 215px;">
          <!-- L1 Card -->
          <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-right: 1px solid #ddd6fe; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="background: #7c3aed; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Phase 03</span>
                <span style="font-size: 9px; font-weight: 700; color: #6d28d9;">P03 — Factory</span>
              </div>
              <h2 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #4c1d95; line-height: 1.2;">
                Factory Production
              </h2>
              <p style="margin: 0; font-size: 9.5px; color: #334155; line-height: 1.3;">
                Fabricate modules, conduct station inspections, control NCRs, and execute dual-release dispatch.
              </p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="background: #ffffff; border: 1px solid #c4b5fd; border-radius: 4px; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 9.5px; font-weight: 800; color: #7c3aed;">🚦 Gate G4</span>
                <span style="font-size: 8.5px; font-weight: 600; color: #6d28d9;">Factory Completion & Release</span>
              </div>
            </div>
          </div>

          <!-- L2 Stages -->
          <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #f1f5f9; background: #fafafa;">
            <!-- Stage 3.1 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #7c3aed;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">3.1 Modular Fabrication & Station Travelers</span>
                <span style="background: #ede9fe; color: #6d28d9; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Structure · MEP · Finishes</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Framing, electrical/plumbing rough-in, pressure testing, insulation, drywall, cabinetry and final trim.
              </p>
            </div>

            <!-- Down Arrow Indicator -->
            <div style="text-align: center; color: #94a3b8; font-size: 10px; line-height: 1; font-weight: 800;">↓</div>

            <!-- Stage 3.2 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #7c3aed;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">3.2 QA/QC Inspection, NCR & Release Check</span>
                <span style="background: #ede9fe; color: #6d28d9; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Dual-Unlock Release</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Independent quality audit, non-conformance remediation, MSO sign-off, staging wrap, and transport coordination.
              </p>
            </div>
          </div>

          <!-- L3 Release Conditions & Documents -->
          <div style="padding: 10px 14px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff;">
            <div>
              <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px;">
                Release Conditions & Governance Rules
              </div>
              <div style="display: flex; flex-direction: column; gap: 3.5px; font-size: 9.5px; color: #334155;">
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>MQC Sign-off:</strong> 100% Station Travelers signed; all critical inspections and testing passed.</span>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>G4 Dual-Release:</strong> Factory completion signed (MSO) + site foundation ready & transport cleared.</span>
                </div>
              </div>
            </div>

            <div>
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
                Key Controlled Master Forms & Artifacts
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-33]</strong> Traveler / Route Card (QC)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-35]</strong> Module Sign-off MSO (QC)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-38]</strong> Factory QC Report (Plant)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-40]</strong> Non-Conformance NCR (QC)
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== PHASE 4 ROW ==================== -->
        <div style="display: grid; grid-template-columns: 260px 450px 1fr; gap: 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); overflow: hidden; height: 215px;">
          <!-- L1 Card -->
          <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-right: 1px solid #a7f3d0; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="background: #059669; color: #ffffff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">Phase 04</span>
                <span style="font-size: 9px; font-weight: 700; color: #047857;">P04 — Delivery & Close</span>
              </div>
              <h2 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 800; color: #064e3b; line-height: 1.2;">
                Delivery & Final Close
              </h2>
              <p style="margin: 0; font-size: 9.5px; color: #334155; line-height: 1.3;">
                Site set, stitch interfaces, punchlist resolution, warranty initiation, and commercial closeout.
              </p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="background: #ffffff; border: 1px solid #6ee7b7; border-radius: 4px; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 9.5px; font-weight: 800; color: #059669;">🚦 Gate G5</span>
                <span style="font-size: 8.5px; font-weight: 600; color: #047857;">Warranty Start</span>
              </div>
              <div style="background: #ffffff; border: 1px solid #6ee7b7; border-radius: 4px; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between;">
                <span style="font-size: 9.5px; font-weight: 800; color: #059669;">🏁 Final Close</span>
                <span style="font-size: 8.5px; font-weight: 600; color: #047857;">Commercial Reconciliation</span>
              </div>
            </div>
          </div>

          <!-- L2 Stages -->
          <div style="padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #f1f5f9; background: #fafafa;">
            <!-- Stage 4.1 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #059669;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">4.1 Transport, Crane Set & Site Interconnection</span>
                <span style="background: #d1fae5; color: #047857; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Site Ready · Crane · Set</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                Site access check, bill of lading receipt, crane rigging, module placement, structural stitch, utility tie-ins.
              </p>
            </div>

            <!-- Down Arrow Indicator -->
            <div style="text-align: center; color: #94a3b8; font-size: 10px; line-height: 1; font-weight: 800;">↓</div>

            <!-- Stage 4.2 -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; border-left: 3px solid #059669;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span style="font-size: 10.5px; font-weight: 700; color: #0f172a;">4.2 Commissioning, Warranty & Final Close</span>
                <span style="background: #d1fae5; color: #047857; font-size: 8px; font-weight: 700; padding: 1px 5px; border-radius: 3px;">Substantial Completion</span>
              </div>
              <p style="margin: 0; font-size: 9px; color: #64748b;">
                HVAC/plumbing start-up, punch list disposition, handover manuals, warranty tracking, final accounting reconciliation.
              </p>
            </div>
          </div>

          <!-- L3 Release Conditions & Documents -->
          <div style="padding: 10px 14px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff;">
            <div>
              <div style="font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px;">
                Release Conditions & Governance Rules
              </div>
              <div style="display: flex; flex-direction: column; gap: 3.5px; font-size: 9.5px; color: #334155;">
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>G5 Release:</strong> Substantial completion executed; non-critical punch items recorded with fixed resolution dates.</span>
                </div>
                <div style="display: flex; align-items: flex-start; gap: 5px;">
                  <span style="color: #059669; font-weight: 800;">✓</span>
                  <span><strong>Final Close:</strong> All warranty obligations completed, change orders finalized, final billing reconciled.</span>
                </div>
              </div>
            </div>

            <div>
              <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">
                Key Controlled Master Forms & Artifacts
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-43]</strong> Site Ready Checklist (Site)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-46]</strong> Bill of Lading BOL (Logistics)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-49]</strong> Substantial Completion (PM)
                </span>
                <span style="background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 8.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px; color: #1e293b;">
                  <strong>[F-52]</strong> Warranty & Final Close (PM/Fin)
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- BOTTOM FOOTER & SIGN-OFF BAR -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #64748b;">
        <div style="display: flex; gap: 16px; align-items: center;">
          <span style="font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 9.5px;">Standard Rules:</span>
          <span>● <strong>Process before Forms:</strong> L1 lifecycle governs L2 flow; L3 owns controlled records.</span>
          <span>● <strong>Main Gates:</strong> Only G1–G5 are primary release points.</span>
          <span>● <strong>Dual Release:</strong> Factory complete is not shipment release without site clearance.</span>
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
    const dataUrl = await toPng(container, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
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
