/**
 * Shared settings for html-to-image captures used by every PDF/PNG export.
 *
 * html-to-image draws a page by serialising it into one SVG image. Two limits
 * on iPhone/iPad Safari break that for large projects:
 * - the SVG must load as an image; by default every element carries all ~400
 *   computed CSS properties, so a full Gantt report reached 20+ MB and iOS
 *   refused to load it (the export then rejects with a bare Event);
 * - the canvas it is drawn on may hold about 16.7 million pixels at most.
 * `exportImageOptions` keeps both under the limits for the current device.
 */
const MAX_SIDE_PX = 12_000;
const DESKTOP_MAX_AREA_PX = 32_000_000;
// WebKit on iOS/iPadOS: 16,777,216 pixels, minus headroom.
const APPLE_TOUCH_MAX_AREA_PX = 16_000_000;

/** iPhone, iPad (including iPadOS that reports itself as a Mac), iPod. */
export function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export function exportPixelRatio(width: number, height: number, preferred = 2) {
  const w = Math.max(1, width),
    h = Math.max(1, height);
  const maxArea = isAppleTouchDevice() ? APPLE_TOUCH_MAX_AREA_PX : DESKTOP_MAX_AREA_PX;
  return Math.min(preferred, MAX_SIDE_PX / Math.max(w, h), Math.sqrt(maxArea / (w * h)));
}

/**
 * CSS properties that affect how exported pages look. Everything else
 * (animations, interaction, scrolling behaviour, etc.) is left out of the SVG.
 * html-to-image caches the first list it sees for the whole page session, so
 * every capture must pass this same list.
 */
export const EXPORT_STYLE_PROPERTIES = [
  // box and layout
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "float",
  "clear",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "overflow-x",
  "overflow-y",
  "visibility",
  "opacity",
  "transform",
  "transform-origin",
  "vertical-align",
  "aspect-ratio",
  "object-fit",
  "object-position",
  "isolation",
  "contain",
  // flex and grid
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "order",
  "justify-content",
  "justify-items",
  "justify-self",
  "align-content",
  "align-items",
  "align-self",
  "place-content",
  "place-items",
  "place-self",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "grid-column-start",
  "grid-column-end",
  "grid-row-start",
  "grid-row-end",
  // borders and outlines
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-collapse",
  "border-spacing",
  "outline-width",
  "outline-style",
  "outline-color",
  "outline-offset",
  // backgrounds and effects
  "background-color",
  "background-image",
  "background-size",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-clip",
  "background-origin",
  "-webkit-background-clip",
  "box-shadow",
  "filter",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "clip-path",
  "mix-blend-mode",
  // text
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-variant-numeric",
  "font-feature-settings",
  "font-stretch",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-indent",
  "text-transform",
  "text-decoration-line",
  "text-decoration-color",
  "text-decoration-style",
  "text-decoration-thickness",
  "text-underline-offset",
  "text-overflow",
  "text-shadow",
  "white-space",
  "word-break",
  "overflow-wrap",
  "hyphens",
  "direction",
  "writing-mode",
  "tab-size",
  "-webkit-text-fill-color",
  "-webkit-line-clamp",
  "-webkit-box-orient",
  "list-style-type",
  "list-style-position",
  "table-layout",
  "caption-side",
  "empty-cells",
  "columns",
  "column-count",
  "column-width",
  "column-fill",
  "column-rule-width",
  "column-rule-style",
  "column-rule-color",
  "break-inside",
  // SVG
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "marker-start",
  "marker-mid",
  "marker-end",
  "paint-order",
  "shape-rendering",
  "vector-effect",
  "stop-color",
  "stop-opacity",
  "dominant-baseline",
  "text-anchor",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "d",
  "content",
];

/** Options shared by every html-to-image capture. */
export function exportImageOptions(width: number, height: number, preferredPixelRatio = 2) {
  return {
    pixelRatio: exportPixelRatio(width, height, preferredPixelRatio),
    includeStyleProperties: EXPORT_STYLE_PROPERTIES,
  };
}
