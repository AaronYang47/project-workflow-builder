# Project Workflow Builder

A desktop-first visual workflow modeling application built with Next.js, React, TypeScript, React Flow, Tailwind CSS, shadcn-style primitives, Zustand, and ELK.

## Online deployment

The current Cloudflare Pages deployment is available at:

<https://project-workflow-builder.pages.dev/>

## What is included

- Infinite canvas with pan, zoom, minimap, grid snapping, multi-select, resizing, locking, configurable gate handles, semantic edges, phase/group containers, drag-and-drop and quick-add.
- Gate nodes use an external Approved/Denied rule switch with editable checklist conditions; Approved becomes active only when every rule is satisfied, otherwise Denied is active.
- Auto Arrange separates primary, supporting, and return lanes, then renders rounded orthogonal routes with exit/entry stubs to avoid abrupt turns and edge crossings.
- Domain graph model kept separate from renderer layout data in `src/types/workflow.ts`.
- Schema-driven node inspector with type-specific document, gate, approval, risk, handoff, control, and rule configuration.
- Local persistence, dirty/autosave state, undo/redo, JSON import/export, PNG/SVG export, auto-layout, display modes, filters, search, and command palette.
- Extensible validation for connectivity, references, handles, IDs, reachability, cycles, required fields, and user rules.
- Editable PROFAB 4-phase / 7-gate reference workflow reconstructed from the supplied process maps; no authentication, APIs, database, or execution engine.

See [`USING-PROFAB-WORKFLOW.md`](./USING-PROFAB-WORKFLOW.md) for operating instructions. Remaining business confirmations are tracked in [`TODO-PROFAB-WORKFLOW.md`](./TODO-PROFAB-WORKFLOW.md).

## Key shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Cmd/Ctrl + S` | Mark saved locally |
| `Cmd/Ctrl + C / V` | Copy / paste selected nodes |
| `Cmd/Ctrl + D` | Duplicate selected nodes |
| `Delete / Backspace` | Delete selection |
| Double-click canvas | Add an Activity node |

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the folder map, the
store slices, shared helpers and a step-by-step checklist for adding a feature.

The JSON document includes a `schemaVersion`, a `graph` section for domain data, and a separate `layout` section for renderer state. This makes migration to another renderer or a future backend possible without changing workflow meaning.

## Deployment

Continuous deployment is configured with Cloudflare Pages. Pushes to the `main` branch automatically build the static export and deploy to [project-workflow-builder.pages.dev](https://project-workflow-builder.pages.dev).
