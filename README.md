# Project Workflow Builder

A desktop-first, local-only visual workflow modeling prototype built with Next.js, React, TypeScript, React Flow, Tailwind CSS, shadcn-style primitives, Zustand, and ELK.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

- `src/types` — renderer-independent workflow and layout schemas
- `src/store` — Zustand state, history, selection, persistence, graph mutations
- `src/components/workflow` — canvas, nodes, edges, panels, toolbar and inspector
- `src/lib/validation.ts` — linting engine
- `src/lib/layout.ts` — ELK layered layout and orthogonal edge-routing adapter
- `src/lib/serialization.ts` — portable JSON format
- `src/lib/inspector-schema.ts` — extensible per-node inspector definitions

The JSON document includes a `schemaVersion`, a `graph` section for domain data, and a separate `layout` section for renderer state. This makes migration to another renderer or a future backend possible without changing workflow meaning.
