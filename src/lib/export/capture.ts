import type { Options } from "html-to-image/lib/types";
import { exportImageOptions } from "@/lib/export/canvas-limits";

/**
 * The one place exports turn DOM into a PNG data URL.
 *
 * html-to-image copies `getComputedStyle(el).cssText` wholesale when the
 * browser provides it (Safari/WebKit does, Chromium does not). That ignores
 * `includeStyleProperties` and makes the SVG several times larger, which iOS
 * then refuses to load. While a capture runs, computed styles report an empty
 * `cssText`, so every browser copies only the properties exports need.
 */
export async function captureToPng(
  node: HTMLElement,
  options: Options & { width?: number; height?: number; preferredPixelRatio?: number },
) {
  const { preferredPixelRatio = 2, ...rest } = options;
  const width = rest.width ?? node.offsetWidth;
  const height = rest.height ?? node.offsetHeight;
  const { toPng } = await import("html-to-image");
  const original = window.getComputedStyle;
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    const style = original.call(window, element, pseudo);
    return new Proxy(style, {
      get(target, property) {
        if (property === "cssText") return "";
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as typeof window.getComputedStyle;
  try {
    return await toPng(node, { ...exportImageOptions(width, height, preferredPixelRatio), ...rest });
  } finally {
    window.getComputedStyle = original;
  }
}
