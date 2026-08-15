# PROFAB workflow — delivery status and remaining business inputs

## Developed in this prototype

- [x] Phase/Swimlane containers spanning multiple Gate modules with Auto Arrange support.
- [x] Editable Approval Matrix with role columns, action rows, add/delete rows, and approval checkboxes.
- [x] Gate-level `ALL` / `ANY` rule logic and per-rule `ALL docs` / `ANY doc` logic.
- [x] Required, Conditional, Optional, Applies, and N/A states for rules and signed documents.
- [x] Multiple named Denied/exception outcomes with independent handles; G6 includes issue-specific routes.
- [x] Persistent editable Continuous Control & System Backbone card.
- [x] Structured document lifecycle fields: owner, received date, revision, status, service type, revision control, department, and signer.
- [x] Editable Job Numbering current/future comparison.
- [x] Editable service-type legend and colors.
- [x] Dedicated “Project Complete / Warranty Begins” terminal card.
- [x] Editable responsibility lane aligned to G1–G7.
- [x] Collapsible signed-document packs inside every Gate rule.
- [x] Denied/rework lines route above the workflow and enter the destination Gate from its top handle.

## Business information still required from the workflow owner

- [ ] Assign the actual approving person for every Gate; the source diagrams provide departments/roles but not individual names.
- [ ] Confirm whether Gate 0–6 in the overview is exactly equivalent to G1–G7 in the operational logic map.
- [ ] Confirm which documents are mandatory, optional, conditional, or alternatives—especially CSA, PCS, LOI, PDAF, SDR, and closeout documents.
- [ ] Confirm approval thresholds for LOI, change orders, write-offs/credits, CRO approval, and CEO approval.
- [ ] Confirm whether the G3 “Proceed to G3” source text is a typo and should be “Proceed to G4”; the implemented flow proceeds to G4.
- [ ] Confirm the final destination and owner for each G6 issue route.
