import type { PhaseForms, PrintHeader } from "@/lib/phase-forms-summary";
import { escapeHtml } from "@/lib/html";

/** 11 x 17 in at the CSS 96 px/in reference; the long side is 17 in. */
const SHEET_LONG_PX = 17 * 96;
const SHEET_SHORT_PX = 11 * 96;
const PAGE_MARGIN_PX = 24;
/** Narrowest card, as a share of its canvas width, the print may use. */
const MIN_CARD_WIDTH_SHARE = 0.8;
/** Narrowest gap between columns of cards, and the space kept around a connector label. */
const MIN_COLUMN_GAP = 64;
const LABEL_CLEARANCE = 40;
const ROOT_ID = "vector-canvas-print";
const PANEL_GAP_PX = 14;
/** The notes under the flowchart may use at most this share of the sheet. */
const NOTES_MAX_SHARE = 0.2;

export type CanvasRect = { x: number; y: number; width: number; height: number };
export type CanvasCard = CanvasRect & { id: string; parentId?: string };
export type CanvasLink = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  /** FOB yard bypass: route underneath these skipped cards instead of through them. */
  passUnder?: string[];
};

/** Editing controls inside cards that aren't part of the flowchart itself. */
const EDITING_CONTROLS = [
  '[aria-label^="Drag to reorder"]',
  '[aria-label="Drag node"]',
  '[aria-label^="Open notes for"]',
  '[aria-label^="Edit release condition"]',
  '[aria-label^="Delete release condition"]',
  "svg.lucide-grip-vertical",
].join(", ");
const EDITING_BUTTON_TEXT = /^(\+\s*)?(Add condition|View All)$/i;

/**
 * Arrowheads, gradients and the dot grid are referenced by id. The hidden
 * original keeps those ids, so the copy gets its own and points at them.
 */
function uniquifyIds(root: HTMLElement, prefix: string) {
  const renamed = new Map<string, string>();
  root.querySelectorAll<Element>("[id]").forEach((element) => {
    const next = `${prefix}${element.id}`;
    renamed.set(element.id, next);
    element.id = next;
  });
  if (!renamed.size) return;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(url\\(\\s*['"]?#|^#)(${[...renamed.keys()].map(escape).join("|")})(?=['"]?\\s*\\)|$)`,
    "g",
  );
  root.querySelectorAll<Element>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (!attribute.value.includes("#")) continue;
      const value = attribute.value.replace(
        pattern,
        (_, start: string, id: string) => `${start}${renamed.get(id)}`,
      );
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  });
}

const splitTopLevel = (value: string) => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") depth -= 1;
    else if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
};

/**
 * Blurred shadows and filters can't be drawn as vectors, so the print engine
 * turns them into pictures that many PDF readers show as dark boxes. Keep the
 * sharp rings (often used as borders) and drop only the blurred parts.
 */
function flattenBlurredEffects(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const computed = getComputedStyle(element);
    if (computed.boxShadow && computed.boxShadow !== "none") {
      const sharp = splitTopLevel(computed.boxShadow).filter((shadow) => {
        const lengths =
          shadow.replace(/(rgba?|color|oklch|oklab|hsla?)\([^)]*\)/g, "").match(/-?[\d.]+px/g) ||
          [];
        return Number.parseFloat(lengths[2] || "0") === 0;
      });
      element.style.setProperty(
        "box-shadow",
        sharp.length ? sharp.join(", ") : "none",
        "important",
      );
    }
    if (computed.filter && computed.filter !== "none")
      element.style.setProperty("filter", "none", "important");
  });
}

type Rgba = [number, number, number, number];
const COLOR_TOKEN = /rgba?\([^)]*\)|color\(srgb[^)]*\)/g;

function parseColor(token: string): Rgba | null {
  const numbers = token
    .match(/-?[\d.]+%?/g)
    ?.map((part) => (part.endsWith("%") ? Number.parseFloat(part) / 100 : Number.parseFloat(part)));
  if (!numbers || numbers.length < 3) return null;
  const [r, g, b, a = 1] = numbers;
  return token.startsWith("color(") ? [r * 255, g * 255, b * 255, a] : [r, g, b, a];
}

/** Paints `top` over `bottom` the way the screen does. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3] + bottom[3] * (1 - top[3]);
  if (alpha <= 0) return [0, 0, 0, 0];
  const mix = (index: number) =>
    (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha;
  return [mix(0), mix(1), mix(2), alpha];
}
const css = ([r, g, b, a]: Rgba) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;

/**
 * See-through colour fades are drawn by the print engine as tiles of pictures,
 * which show seams. Pre-mix them with what lies underneath so every colour is
 * solid: the card keeps its tint and colour blend, and the PDF stays vector.
 */
function solidifyTranslucentGradients(root: HTMLElement, pageColor: Rgba) {
  const effective = new Map<Element, Rgba>();
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const backdrop = (element.parentElement && effective.get(element.parentElement)) || pageColor;
    const computed = getComputedStyle(element);
    let base = over(parseColor(computed.backgroundColor) ?? [0, 0, 0, 0], backdrop);
    const layers =
      computed.backgroundImage && computed.backgroundImage !== "none"
        ? splitTopLevel(computed.backgroundImage)
        : [];
    const translucent = layers.filter(
      (layer) =>
        /gradient\(/.test(layer) &&
        (layer.match(COLOR_TOKEN) ?? []).some((token) => (parseColor(token)?.[3] ?? 1) < 1),
    );
    if (translucent.length) {
      // Keep the most visible straight across / straight down fade (such as a
      // blend between two phase colours) as a gradient; fold the rest (diagonal
      // sheens and round corner glows, which print in seamed tiles) into the
      // colour beneath it as their average.
      const strength = (layer: string) =>
        Math.max(...(layer.match(COLOR_TOKEN) ?? []).map((token) => parseColor(token)?.[3] ?? 0));
      const straight = (layer: string) =>
        /^linear-gradient\(\s*(?:(?:0|90|180|270)deg|to (?:right|left|top|bottom))\s*,/.test(
          layer,
        ) || /^linear-gradient\(\s*(?:rgba?|color)\(/.test(layer);
      const linear = translucent.filter(straight);
      const kept = linear.length
        ? linear.reduce((best, layer) => (strength(layer) > strength(best) ? layer : best))
        : null;
      for (const layer of [...layers].reverse()) {
        if (layer === kept || !translucent.includes(layer)) continue;
        const stops = (layer.match(COLOR_TOKEN) ?? [])
          .map(parseColor)
          .filter((color): color is Rgba => Boolean(color));
        if (!stops.length) continue;
        const average = stops.reduce(
          (sum, color) => sum.map((value, index) => value + color[index] / stops.length) as Rgba,
          [0, 0, 0, 0] as Rgba,
        );
        base = over(
          [
            average[0],
            average[1],
            average[2],
            average[3] * (layer.startsWith("radial") ? 0.35 : 1),
          ],
          base,
        );
      }
      const solidKept = kept?.replace(COLOR_TOKEN, (token) =>
        css(over(parseColor(token) ?? [0, 0, 0, 0], base)),
      );
      element.style.setProperty("background-image", solidKept ?? "none", "important");
      element.style.setProperty("background-color", css(base), "important");
    }
    if (base[3] > 0.01) effective.set(element, base[3] >= 0.999 ? base : over(base, backdrop));
  });
}

/** Hidden rather than removed, so cards keep the exact layout of the canvas. */
function hideEditingControls(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(EDITING_CONTROLS).forEach((element) => {
    (element.closest<HTMLElement>("button") ?? element).style.setProperty(
      "visibility",
      "hidden",
      "important",
    );
  });
  root.querySelectorAll<HTMLElement>("button").forEach((button) => {
    if (EDITING_BUTTON_TEXT.test(button.textContent?.trim() ?? ""))
      button.style.setProperty("visibility", "hidden", "important");
  });
}

/**
 * "Forms by phase" as small notes under the flowchart: one column per phase
 * with a thin bar in its colour, and each kind of form run together on a line.
 * Colours are solid so the notes stay vector like the flowchart.
 */
function formsPanel(forms: PhaseForms[]) {
  const panel = document.createElement("section");
  panel.className = "vector-print-forms";
  panel.setAttribute("data-print-forms", "");
  const line = (kind: string, label: string, titles: string[]) => `
    <div class="vpf-line" data-print-forms-group="${kind}"><b class="vpf-${kind}">${label} (${titles.length})</b> ${titles.length ? titles.map(escapeHtml).join('<span class="vpf-sep"> · </span>') : "<i>None</i>"}</div>`;
  panel.innerHTML = `
    <div class="vpf-heading">Forms by phase</div>
    <div class="vpf-grid" style="grid-template-columns: repeat(${forms.length}, minmax(0, 1fr));">
      ${forms
        .map(
          (phase) => `
        <div class="vpf-phase" data-print-forms-phase="${escapeHtml(phase.id)}" style="--vpf-color:${phase.color};">
          <div class="vpf-phase-title">${escapeHtml(phase.title)}${phase.description ? ` · ${escapeHtml(phase.description)}` : ""}</div>
          ${line("legal", "Legal", phase.legal)}
          ${line("customer", "Customer info", phase.customer)}
          ${line("supporting", "Supporting", phase.supporting)}
        </div>`,
        )
        .join("")}
    </div>
    <style>
      .vector-print-forms { box-sizing: border-box; padding-top: .6em; border-top: 1px solid var(--border); color: var(--muted-foreground); font-family: inherit; line-height: 1.3; }
      .vector-print-forms * { box-sizing: border-box; }
      .vpf-heading { margin-bottom: .45em; font-size: .95em; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--foreground); }
      .vpf-grid { display: grid; column-gap: 1.4em; row-gap: .6em; align-items: start; }
      .vpf-phase { min-width: 0; padding-left: .7em; border-left: 3px solid var(--vpf-color); }
      .vpf-phase-title { margin-bottom: .2em; font-weight: 800; color: color-mix(in srgb, var(--vpf-color) 55%, var(--foreground)); overflow-wrap: anywhere; }
      .vpf-line { margin-top: .15em; overflow-wrap: anywhere; }
      .vpf-line b { font-weight: 800; }
      .vpf-line i { opacity: .8; }
      .vpf-sep { opacity: .6; }
      .vpf-legal { color: color-mix(in srgb, #f59e0b 75%, var(--foreground)); }
      .vpf-customer { color: color-mix(in srgb, #0ea5e9 75%, var(--foreground)); }
      .vpf-supporting { color: var(--foreground); }
    </style>`;
  return panel;
}

/** Title block across the top: the project, and what this sheet shows. */
function headerBlock(header: PrintHeader) {
  const block = document.createElement("header");
  block.className = "vector-print-header";
  block.setAttribute("data-print-header", "");
  block.innerHTML = `
    <div class="vph-main"><div class="vph-kicker">${escapeHtml(header.kicker)}</div><div class="vph-title">${escapeHtml(header.title)}</div></div>
    <dl class="vph-details">${header.details.map((detail) => `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`).join("")}</dl>
    <style>
      .vector-print-header { box-sizing: border-box; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 10px; border-bottom: 2px solid var(--foreground); color: var(--foreground); font-family: inherit; }
      .vph-main { min-width: 0; }
      .vph-kicker { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--muted-foreground); }
      .vph-title { margin-top: 4px; font-size: 24px; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; }
      .vph-details { display: flex; gap: 22px; margin: 0; }
      .vph-details div { text-align: right; }
      .vph-details dt { font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: var(--muted-foreground); }
      .vph-details dd { margin: 2px 0 0; font-size: 13px; font-weight: 700; white-space: nowrap; }
    </style>`;
  return block;
}

/** Groups cards whose spans overlap along one axis (columns for "x", rows for "y"). */
function bands(cards: CanvasCard[], axis: "x" | "y") {
  const start = (card: CanvasCard) => (axis === "x" ? card.x : card.y);
  const size = (card: CanvasCard) => (axis === "x" ? card.width : card.height);
  const groups: { start: number; end: number; cards: CanvasCard[] }[] = [];
  for (const card of [...cards].sort((left, right) => start(left) - start(right))) {
    const last = groups.at(-1);
    if (last && start(card) < last.end) {
      last.cards.push(card);
      last.end = Math.max(last.end, start(card) + size(card));
    } else {
      groups.push({ start: start(card), end: start(card) + size(card), cards: [card] });
    }
  }
  return groups;
}

type Reflow = {
  share: number;
  changed: boolean;
  positions: Map<string, CanvasRect>;
  bounds: CanvasRect;
};
type LabelSpan = { x: number; width: number };

/**
 * Narrows every card to `share` of its width, lets its text wrap, and lays the
 * same rows and columns out again with the original gaps between them, so the
 * order and direction of the flowchart never change.
 */
/** Boxes already cut off on the canvas itself (scrolling lists, truncated lines). */
const clippedOnCanvas = new WeakSet<Element>();

function reflowCards(
  copy: HTMLElement,
  cards: CanvasCard[],
  share: number,
  padding: number,
  labels: LabelSpan[] | null,
): Reflow | null {
  const elements = new Map<string, HTMLElement>();
  for (const card of cards) {
    const element = copy.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${CSS.escape(card.id)}"]`,
    );
    if (!element) return null;
    element.style.setProperty("width", `${card.width * share}px`, "important");
    element.style.setProperty("height", `${card.height}px`, "important");
    elements.set(card.id, element);
  }
  const measured = new Map<string, { width: number; height: number }>();
  for (const card of cards) {
    const element = elements.get(card.id)!;
    const children = Array.from(element.children) as HTMLElement[];
    const width = Math.max(element.offsetWidth, ...children.map((child) => child.offsetWidth || 0));
    // A card with a fixed inner width can't get narrower; give up on this width.
    if (width > card.width * share + 2) return null;
    // Contents size themselves to the card, so read how far the wrapped text now overflows.
    const height =
      share === 1
        ? card.height
        : Math.max(
            card.height,
            element.scrollHeight,
            ...children.map((child) => child.scrollHeight || 0),
          );
    element.style.setProperty("height", `${height}px`, "important");
    // Stop narrowing once a list or box inside the card cuts off text that
    // showed in full on the canvas.
    const clipped = Array.from(element.querySelectorAll<HTMLElement>("*")).filter(
      (inner) =>
        getComputedStyle(inner).overflowY !== "visible" &&
        inner.scrollHeight > inner.clientHeight + 2,
    );
    if (share === 1) clipped.forEach((inner) => clippedOnCanvas.add(inner));
    else if (clipped.some((inner) => !clippedOnCanvas.has(inner))) return null;
    measured.set(card.id, { width: card.width * share, height });
  }

  const columnX = new Map<CanvasCard, number>();
  let cursor = 0;
  let previousEnd: number | null = null;
  let changed = share !== 1;
  for (const column of bands(cards, "x")) {
    let gap = previousEnd === null ? 0 : column.start - previousEnd;
    if (labels && previousEnd !== null) {
      // A gap only needs room for the connector label inside it.
      const end = previousEnd;
      const inside = labels.filter((label) => label.x > end && label.x < column.start);
      const needed = Math.max(
        MIN_COLUMN_GAP,
        ...inside.map((label) => label.width + LABEL_CLEARANCE),
      );
      if (needed < gap) {
        gap = needed;
        changed = true;
      }
    }
    const left = previousEnd === null ? column.start : cursor + gap;
    let right = left;
    for (const card of column.cards) {
      const x = left + (card.x - column.start) * share;
      columnX.set(card, x);
      right = Math.max(right, x + measured.get(card.id)!.width);
    }
    cursor = right;
    previousEnd = column.end;
  }
  const rowY = new Map<CanvasCard, number>();
  cursor = 0;
  previousEnd = null;
  for (const row of bands(cards, "y")) {
    const top = previousEnd === null ? row.start : cursor + (row.start - previousEnd);
    let bottom = top;
    for (const card of row.cards) {
      const y = top + (card.y - row.start);
      rowY.set(card, y);
      bottom = Math.max(bottom, y + measured.get(card.id)!.height);
    }
    cursor = bottom;
    previousEnd = row.end;
  }

  const positions = new Map<string, CanvasRect>();
  for (const card of cards)
    positions.set(card.id, {
      x: columnX.get(card)!,
      y: rowY.get(card)!,
      ...measured.get(card.id)!,
    });
  const rects = [...positions.values()];
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    share,
    changed,
    positions,
    bounds: {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    },
  };
}

const fitScale = (bounds: CanvasRect, portrait: boolean) =>
  Math.min(
    ((portrait ? SHEET_SHORT_PX : SHEET_LONG_PX) - PAGE_MARGIN_PX * 2) / bounds.width,
    ((portrait ? SHEET_LONG_PX : SHEET_SHORT_PX) - PAGE_MARGIN_PX * 2) / bounds.height,
  );

/** Point (in canvas units) where a connector meets a card. */
function handlePoint(
  copy: HTMLElement,
  viewport: HTMLElement,
  nodeId: string,
  kind: "source" | "target",
  handleId?: string | null,
) {
  const selector = `.react-flow__handle.${kind}[data-nodeid="${CSS.escape(nodeId)}"]`;
  const handles = Array.from(copy.querySelectorAll<HTMLElement>(selector));
  const handle =
    handles.find((element) => (element.dataset.handleid || null) === (handleId ?? null)) ??
    handles[0];
  if (!handle) return null;
  const origin = viewport.getBoundingClientRect();
  const rect = handle.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - origin.left,
    y: rect.top + rect.height / 2 - origin.top,
  };
}

/** Redraws each connector as a right-angled line between its cards' new handles. */
function rerouteLinks(copy: HTMLElement, viewport: HTMLElement, links: CanvasLink[]) {
  for (const link of links) {
    const from = handlePoint(copy, viewport, link.source, "source", link.sourceHandle);
    const to = handlePoint(copy, viewport, link.target, "target", link.targetHandle);
    const group = copy.querySelector<SVGGElement>(
      `.react-flow__edge[data-id="${CSS.escape(link.id)}"]`,
    );
    if (!from || !to || !group) continue;
    if (link.passUnder?.length) {
      // Out to the right, down below every skipped card, across, then up into the target.
      const origin = viewport.getBoundingClientRect();
      const bottom = Math.max(
        from.y,
        to.y,
        ...link.passUnder.map((id) => {
          const card = copy.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${CSS.escape(id)}"]`,
          );
          return card ? card.getBoundingClientRect().bottom - origin.top : -Infinity;
        }),
      );
      const lane = bottom + 44;
      const outX = from.x + 24;
      const inX = to.x - 24;
      const path = `M ${from.x} ${from.y} L ${outX} ${from.y} L ${outX} ${lane} L ${inX} ${lane} L ${inX} ${to.y} L ${to.x} ${to.y}`;
      group.querySelectorAll("path").forEach((element) => element.setAttribute("d", path));
      copy
        .querySelector<HTMLElement>(`[data-edge-label="${CSS.escape(link.id)}"]`)
        ?.style.setProperty(
          "transform",
          `translate(-50%, 0) translate(${(outX + inX) / 2}px, ${lane + 6}px)`,
        );
      continue;
    }
    const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const middle = horizontal ? (from.x + to.x) / 2 : (from.y + to.y) / 2;
    const path = horizontal
      ? `M ${from.x} ${from.y} L ${middle} ${from.y} L ${middle} ${to.y} L ${to.x} ${to.y}`
      : `M ${from.x} ${from.y} L ${from.x} ${middle} L ${to.x} ${middle} L ${to.x} ${to.y}`;
    group.querySelectorAll("path").forEach((element) => element.setAttribute("d", path));
    const label = copy.querySelector<HTMLElement>(`[data-edge-label="${CSS.escape(link.id)}"]`);
    const labelPoint = horizontal
      ? { x: middle, y: (from.y + to.y) / 2 }
      : { x: (from.x + to.x) / 2, y: middle };
    label?.style.setProperty(
      "transform",
      `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)`,
    );
  }
}

/**
 * Prints the live canvas through the browser's own print engine, so the PDF
 * keeps text, lines and cards as vectors drawn with the same styles and
 * colours as the screen. The flowchart stays in its canvas order on one
 * 11 x 17 sheet; when it helps fill the sheet, cards are made narrower (their
 * text wraps onto more lines) instead of breaking the flow onto new lines.
 */
export function printCanvasVector(
  flowElement: HTMLElement,
  cards: CanvasCard[],
  links: CanvasLink[],
  padding: number,
  title: string,
  forms: PhaseForms[] = [],
  header?: PrintHeader,
) {
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.setAttribute("aria-hidden", "true");
  root.style.background =
    getComputedStyle(document.documentElement).getPropertyValue("--canvas-export").trim() ||
    getComputedStyle(flowElement).backgroundColor;

  const copy = flowElement.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(
      ".react-flow__controls, .react-flow__minimap, .react-flow__panel, .react-flow__attribution, .react-flow__nodesselection, .react-flow__selection",
    )
    .forEach((element) => element.remove());
  // Selection outlines belong to editing, not to the document.
  copy.querySelectorAll(".selected").forEach((element) => element.classList.remove("selected"));
  uniquifyIds(copy, "print-");
  hideEditingControls(copy);
  const viewport = copy.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("The canvas could not be prepared for printing.");
  root.appendChild(copy);

  const style = document.createElement("style");
  root.appendChild(style);
  document.body.appendChild(root);

  // Lay the copy out off-screen at full size so cards can be measured.
  Object.assign(root.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
  });
  Object.assign(copy.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100000px",
    height: "100000px",
  });
  viewport.style.setProperty("transform", "translate(0px, 0px) scale(1)", "important");

  // Cards nested inside other cards move with their parent; keep those as on the canvas.
  const canReflow = cards.length > 0 && cards.every((card) => !card.parentId);
  const original = reflowCards(copy, cards, 1, padding, null);
  let chosen: Reflow | null = original;
  if (canReflow && original) {
    // Connector labels sit in the gaps between cards; measure them once.
    const labels: LabelSpan[] = Array.from(
      copy.querySelectorAll<HTMLElement>("[data-edge-label]"),
    ).flatMap((label) => {
      const match = label.style.transform.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*$/);
      return match ? [{ x: Number(match[1]), width: label.offsetWidth }] : [];
    });
    const scaleOf = (reflow: Reflow) =>
      Math.max(fitScale(reflow.bounds, false), fitScale(reflow.bounds, true));
    let best = { reflow: original, scale: scaleOf(original) };
    for (let share = 1; share >= MIN_CARD_WIDTH_SHARE - 0.001; share -= 0.05) {
      const reflow = reflowCards(copy, cards, Number(share.toFixed(2)), padding, labels);
      if (!reflow) break;
      if (scaleOf(reflow) > best.scale) best = { reflow, scale: scaleOf(reflow) };
    }
    // Keep the canvas layout unless the changes clearly enlarge the print.
    const target = best.scale >= scaleOf(original) * 1.05 ? best.reflow : original;
    const final =
      (target === original
        ? reflowCards(copy, cards, 1, padding, null)
        : reflowCards(copy, cards, target.share, padding, labels)) ?? original;
    chosen = final;
    if (final.changed) {
      for (const card of cards) {
        const position = final.positions.get(card.id)!;
        const element = copy.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${CSS.escape(card.id)}"]`,
        )!;
        element.style.setProperty(
          "transform",
          `translate(${position.x}px, ${position.y}px)`,
          "important",
        );
      }
      rerouteLinks(copy, viewport, links);
    }
  }

  const bounds =
    chosen?.bounds ??
    (() => {
      const xs = cards.map((card) => card.x);
      const ys = cards.map((card) => card.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return {
        x: minX - padding,
        y: minY - padding,
        width: Math.max(...cards.map((card) => card.x + card.width)) - minX + padding * 2,
        height: Math.max(...cards.map((card) => card.y + card.height)) - minY + padding * 2,
      };
    })();
  // Title block on top, the flowchart, then the forms notes underneath. The
  // notes shrink their text rather than take room from the flowchart.
  const titleBlock = header ? headerBlock(header) : null;
  if (titleBlock) root.appendChild(titleBlock);
  const panel = forms.length ? formsPanel(forms) : null;
  if (panel) root.appendChild(panel);
  const layoutFor = (portrait: boolean) => {
    const pageWidth = portrait ? SHEET_SHORT_PX : SHEET_LONG_PX;
    const pageHeight = portrait ? SHEET_LONG_PX : SHEET_SHORT_PX;
    let headerHeight = 0;
    if (titleBlock) {
      titleBlock.style.width = `${pageWidth - PAGE_MARGIN_PX * 2}px`;
      headerHeight = titleBlock.offsetHeight;
    }
    let panelHeight = 0;
    let fontSize = 0;
    if (panel) {
      panel.style.width = `${pageWidth - PAGE_MARGIN_PX * 2}px`;
      for (fontSize = 9; fontSize > 5; fontSize -= 0.5) {
        panel.style.fontSize = `${fontSize}px`;
        panelHeight = panel.offsetHeight;
        if (panelHeight <= pageHeight * NOTES_MAX_SHARE) break;
      }
    }
    const flowTop = PAGE_MARGIN_PX + (titleBlock ? headerHeight + PANEL_GAP_PX : 0);
    const flowHeight =
      pageHeight - flowTop - PAGE_MARGIN_PX - (panel ? panelHeight + PANEL_GAP_PX : 0);
    const scale = Math.min(
      (pageWidth - PAGE_MARGIN_PX * 2) / bounds.width,
      flowHeight / bounds.height,
    );
    return {
      portrait,
      pageWidth,
      pageHeight,
      headerHeight,
      panelHeight,
      fontSize,
      flowTop,
      flowHeight,
      scale,
    };
  };
  const landscape = layoutFor(false);
  const upright = layoutFor(true);
  const page = upright.scale > landscape.scale ? upright : landscape;
  layoutFor(page.portrait);
  const { portrait, pageWidth, pageHeight, scale } = page;
  root.dataset.cardWidthShare = String(chosen?.share ?? 1);
  const offsetX = (pageWidth - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = page.flowTop + (page.flowHeight - bounds.height * scale) / 2 - bounds.y * scale;

  root.removeAttribute("style");
  root.dataset.orientation = portrait ? "portrait" : "landscape";
  root.style.background =
    getComputedStyle(document.documentElement).getPropertyValue("--canvas-export").trim() ||
    getComputedStyle(flowElement).backgroundColor;
  Object.assign(copy.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: `${pageWidth}px`,
    height: `${pageHeight}px`,
  });
  viewport.style.setProperty(
    "transform",
    `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
    "important",
  );
  if (titleBlock)
    Object.assign(titleBlock.style, {
      position: "absolute",
      left: `${PAGE_MARGIN_PX}px`,
      top: `${PAGE_MARGIN_PX}px`,
    });
  if (panel) {
    Object.assign(panel.style, {
      position: "absolute",
      left: `${PAGE_MARGIN_PX}px`,
      top: `${pageHeight - PAGE_MARGIN_PX - page.panelHeight}px`,
    });
    root.dataset.formsFontSize = String(page.fontSize);
  }

  style.textContent = `
    #${ROOT_ID} { display: none; }
    @media print {
      @page { size: ${portrait ? "11in 17in" : "17in 11in"}; margin: 0; }
      html, body { width: ${pageWidth}px !important; height: ${pageHeight}px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
      body > *:not(#${ROOT_ID}) { display: none !important; }
      #${ROOT_ID} { display: block !important; position: fixed; inset: 0; width: ${pageWidth}px; height: ${pageHeight}px; overflow: hidden; }
      #${ROOT_ID}, #${ROOT_ID} * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      /* Blur effects would make the print engine flatten cards into pictures. */
      #${ROOT_ID} * { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
    }
  `;
  const pageColor = parseColor(getComputedStyle(root).backgroundColor) ?? [255, 255, 255, 1];
  flattenBlurredEffects(copy);
  solidifyTranslucentGradients(copy, pageColor);

  const previousTitle = document.title;
  document.title = title;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = previousTitle;
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Some browsers return from print() before the dialog closes; afterprint
  // still cleans up, and this covers browsers that never send it.
  window.setTimeout(cleanup, 60_000);
}
