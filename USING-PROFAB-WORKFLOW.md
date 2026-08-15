# How to use the PROFAB workflow

## Navigate and arrange

1. Open the app and click **Auto arrange** after adding or deleting cards.
2. Use the mouse wheel to zoom, drag empty canvas space to pan, and click **Zoom to fit** for the full map.
3. The four dashed Phase containers group their Gate modules. Select several nodes and click **Group selected** to create another Phase.

## Configure a Gate

1. Edit the Gate name and description directly inside the top Gate card.
2. In **Approval Conditions**, choose **ALL rules** or **ANY rule**.
3. Add a rule, then choose **Required**, **Conditional**, or **Optional**.
4. For a Conditional rule, use **Applies / N/A** to decide whether it participates in approval.
5. Choose **ALL docs** when every attached document is required, or **ANY doc** for alternatives such as `CSA OR PCS OR LOI`.
6. Click **Add document** to attach a signed document to that rule.
7. Fill in code, document name, department, signer, owner, received date, revision, status, service type, and revision-control status.
8. Collapse completed document packs with the chevron to keep the Gate compact.
9. Check each required document and rule. The Gate changes from red to amber to green as work progresses.
10. Enter the approving department and individual approver in the Decision card. Approved is available only when the active checklist is complete.

## Add and connect approval outcomes

1. Select a Gate and open **Outcome handles** in the right Inspector.
2. Keep the `yes` outcome for Approved.
3. Click **+** to add another Denied/rework route, then edit its label, semantic type, route condition, and ID.
4. Drag from the new red handle in the Decision card to another node.
5. Denied routes automatically enter the destination Gate through its red top handle after **Auto arrange**.

## Use the reference components

- **Approval Matrix:** edit role headers and action names; click cells to toggle approval authority; add or delete rows.
- **Control Backbone / Responsibility Lane:** edit section titles and newline-separated items; add or delete sections.
- **Service Legend:** edit label and color; add or delete classifications.
- **Job Numbering:** edit the Current and Proposed lists.
- **Business Rules:** edit one rule per line.
- **Project Complete:** edit the final status title and warranty message.
- All cards can be moved, resized, locked from the Inspector, duplicated, deleted, and connected.

## Save and share

1. Changes autosave locally; the toolbar indicates whether the canvas is saved.
2. Use **Export JSON** for a portable editable workflow and **Import JSON** to restore it.
3. Use **Export image** for PNG or SVG output.
4. Run **Validate workflow** before sharing. Click a validation item to focus the related node.
