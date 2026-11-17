# Architecture and how to add a feature

This guide is the map of the code. Read it before adding a feature so new code
lands in the right place and the codebase stays easy to change.

## 1. The model in one paragraph

A project is one `WorkflowFile` (`src/types/workflow.ts`). It has three linked
layers:

| Layer | What it is | Where it lives in `WorkflowFile` |
| --- | --- | --- |
| **L1** High-level process | Phases (Sales, Technical, Purchasing, Production, Site) | `highLevel` |
| **L2** Detailed workflow | Chapters/nodes with **release conditions** (duration, predecessor) | `graph` + `layout` |
| **L3** Execution | Controlled forms, documents, approvals for an L2 node | `execution` |

Around them: `calendar` (handoff date, shutdowns, holidays), `operations`
(client path, payments, approvals, estimates, warranty) and
`releaseConditionInbox` (conditions not yet assigned to a chapter).

Domain data and canvas layout are kept separate on purpose: meaning lives in
`graph` / `highLevel.graph`, positions live in `layout` / `highLevel.layout`.

## 2. Folder map

```
src/
  types/            Data shapes only (no logic). Start here for any new field.
  lib/              Pure logic. No React. Safe to unit test in isolation.
    export/         Export formats, the PDF dispatcher, and capture.ts (the only
                    DOM -> PNG path; keeps page images small enough for iPhone).
    excel/          Excel import/export of the workflow.
    collaboration/  Peer-to-peer live collaboration (trystero + BroadcastChannel).
    process-locator/  Pyramid (Process Locator) layout model.
    html.ts         escapeHtml for every HTML/PDF builder.
    calendar-date.ts  DAY_MS, isoFromDay, month formatter.
  store/            Zustand store (see section 3).
  components/
    ui/             Small shadcn-style primitives.
    workflow/       Screens, panels, canvases, nodes, dialogs.
      process-overview/    Pieces of the Process & Gantt page (task row, dialogs, scroll).
      release-conditions/  Dialogs of the L3 Release Conditions page.
      execution/           L3 execution view pieces (DocumentBox, add-document modal).
      inspector/           Inspector panels (fields, condition editor, phase steps).
      high-level/          L1 view pieces.
  app/              Next.js routes: /, /process-overview, /release-conditions, /privacy.
functions/api/      Cloudflare Pages Functions (auth, projects, files, CMS, audit).
migrations/         D1 schema for the main database.
auditlog/           Separate audit-log console (own Pages project).
tests/              Playwright tests (unit-style and browser).
```

**Rule of thumb:** if a function does not render anything, it belongs in
`src/lib`, not in a component file. Components should read state, call
actions and render.

**Pages and their pieces.** A page component keeps its state and the actions
that change the workflow; each dialog, panel or repeated row is its own
component in a folder named after the page, with explicit props. Do not write
dialogs as inline `(() => { ... })()` blocks.

## 3. The store

`useWorkflowStore` is one Zustand store, built from domain slices:

| Slice file (`src/store/slices/`) | Owns |
| --- | --- |
| `session-slice.ts` | the `file`, account, load/reset, `commit`, undo/redo, dirty/saved |
| `ui-slice.ts` | panels, selection, search, validation results, blocking dialogs |
| `graph-slice.ts` | L2 nodes, phases, edges, layout |
| `release-conditions-slice.ts` | inbox, import, ordering, moving conditions between chapters |
| `high-level-slice.ts` | L1 nodes, links to L2, L1 canvas |
| `execution-slice.ts` | L3 execution items |
| `operations-slice.ts` | project operations (payments, approvals, conversion, warranty) |

Supporting files:

- `workflow-store.ts` composes the slices, blocks edits while another
  collaborator holds edit control, and configures persistence.
- `workflow-store-types.ts` holds `WorkflowState`, the full list of state and
  actions. **Every new action is declared here first.**
- `workflow-store-helpers.ts` holds pure helpers the slices share
  (normalising a loaded file, free-position search, collaboration broadcast).
- `workflow-persist.ts` holds history length and debounced local storage.

Editing conventions:

- Use `commit(updater)` (or `set` with `past: appendHistory(...)`) for user
  edits so they can be undone. Use `commitTransient` for live drags/typing
  that will be recorded once at the end.
- Never mutate `state.file`; return new objects.
- Changes made by a viewer are dropped automatically by the guard in
  `workflow-store.ts`; you do not need to check edit permission in each action.

## 4. Adding a feature: checklist

1. **Data**: add the field to `src/types/workflow.ts` (or
   `project-operations.ts`). Make it optional so old saved projects still load.
   If old files need converting, add the step to `src/lib/workflow-migration.ts`.
2. **Logic**: write pure functions in `src/lib/<feature>.ts`. Calculations,
   formatting, validation, scheduling go here.
3. **State**: declare the action in `workflow-store-types.ts`, implement it in
   the slice that owns that part of the file. A new area may get its own
   `src/store/slices/<feature>-slice.ts`; add it to `workflow-store.ts`.
4. **UI**: add a component under `src/components/workflow/`. Keep it to
   rendering and wiring actions. If it grows past ~400 lines, split out
   sub-components or move logic to `lib/`.
5. **Export (if needed)**: add the format to `ExportFormat` in
   `src/lib/export/export-formats.ts`; document PDFs go in `exportDocument`.
   Build HTML with `escapeHtml` from `src/lib/html.ts`.
6. **Server (if needed)**: add a Pages Function under `functions/api/`. Use
   `requireUser`/`json` from `functions/api/_lib.ts`; requests are audit-logged
   automatically by `_middleware.ts`. Schema changes are new numbered files in
   `migrations/`.
7. **Tests**: put pure-logic tests next to related specs in `tests/` (they run
   without a browser page) and one browser test for the main user path.

**Before refactoring a screen**, check that passing tests cover it. If they do
not, first write a characterization test of today's behaviour, confirm it passes
on the current code, then refactor (see `tests/release-conditions-dialogs.spec.ts`).

**Guardrails**: `tsconfig.json` sets `noUnusedLocals`, so unused imports,
variables and functions fail the type check instead of piling up. Subscribe to
the store with a selector (`useWorkflowStore((s) => s.x)` or `useShallow`);
`useWorkflowStore()` with no selector re-renders on every edit.

## 5. Shared building blocks (reuse, do not copy)

| Need | Use |
| --- | --- |
| Escape text in HTML/PDF | `escapeHtml` in `src/lib/html.ts` |
| Date-only math | `DAY_MS`, `isoFromDay`, `monthYearFormat` in `src/lib/calendar-date.ts` |
| Release-condition schedule | `buildProcessSchedule` in `src/lib/process-schedule.ts` |
| Calendar dates, shutdowns, holidays | `buildProcessTimeline` in `src/lib/schedule-calendar.ts` |
| Day-off colours | `DAY_OFF_COLORS` / `DAY_OFF_INK` in `src/lib/schedule-calendar.ts` |
| Actual-work summary and labels | `calendarWorkSummary` (`gantt-bar-label.ts`), `calendar-badges.ts` |
| Completion / release rules | `src/lib/workflow-progress.ts` |
| Trigger an export | `requestExport` / `exportDocument` in `src/lib/export/export-formats.ts` |
| Turn DOM into a PNG for a PDF | `captureToPng` in `src/lib/export/capture.ts` (never call html-to-image directly) |
| Gantt time axis and labels | `buildGanttAxis` in `src/lib/gantt-axis.ts` |
| L2 canvas nodes/edges for React Flow | `buildCanvasNodes` / `buildCanvasEdges` in `src/lib/canvas-model.ts` |
| A checklist column of L3 documents | `DocumentBox` / `CustomerInfoBox` in `components/workflow/execution/` |
| Process Locator layout | `buildPyramidDiagram` in `src/lib/process-locator/pyramid-diagram.ts` |
| Time-based UI (presence, "x min ago") | `useCurrentTime` (never `Date.now()` during render) |

## 6. Commands

```bash
npm run dev          # local app on http://localhost:3000
npm run lint
npx tsc --noEmit
npm test             # all Playwright tests (starts the dev server)
npm run build        # static export to out/
```

## 7. Known technical debt

Tracked here so it is fixed deliberately, not by accident:

- **Stale tests**: about 60 Playwright tests still target UI that was renamed
  or removed (for example the old "Export Gantt PDF" button). They fail before
  and after the refactor; update them when touching those screens.
- **Lint**: 7 `react-hooks/set-state-in-effect` errors (`workflow-builder.tsx`,
  `customer-selection-form.tsx`, `pyramid-location-widget.tsx`). Most read the
  URL or sessionStorage after the static page hydrates, which cannot happen
  during the first render without a hydration mismatch. Leave them unless the
  component is restructured.
- **Largest components** are now under ~1,000 lines: `pyramid-location-widget.tsx`
  (~970; camera pan/zoom could become a hook), `execution-view.tsx` (~850),
  `execution-form-sheet.tsx` and `layer-context-minimap.tsx` (~780). Split
  further only when they are next changed.
- **Browser tests and the Next.js dev badge**: in dev mode Next shows a draggable
  "N" badge bottom-left and saves its position in
  `.next/dev/cache/next-devtools-config.json`. A test that drags near that corner
  can move it on top of other controls and break later tests; delete that file to
  reset it.
- **Two gate detectors**: `isNodeGate` in `presentation-pdf-export.ts` and
  `executive-presentation-pdf-export.ts` differ slightly (the first also reads
  metadata). Decide which rule is correct before merging them.
