/**
 * Resolution for html-to-image captures used by every PDF/PNG export.
 *
 * Browsers refuse canvases above a size limit, and html-to-image then rejects
 * with a bare Event instead of an Error. iPhone/iPad Safari allows only about
 * 16.7 million pixels per canvas; desktop browsers allow far more. The ratio is
 * reduced just enough to stay under the limit for the current device.
 */
const MAX_SIDE_PX = 12_000;
const DESKTOP_MAX_AREA_PX = 32_000_000;
// WebKit on iOS/iPadOS: 16,777,216 pixels, minus headroom.
const APPLE_TOUCH_MAX_AREA_PX = 16_000_000;

/** iPhone, iPad (including iPadOS that reports itself as a Mac), iPod. */
export function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function exportPixelRatio(width: number, height: number, preferred = 2) {
  const w = Math.max(1, width), h = Math.max(1, height);
  const maxArea = isAppleTouchDevice() ? APPLE_TOUCH_MAX_AREA_PX : DESKTOP_MAX_AREA_PX;
  return Math.min(preferred, MAX_SIDE_PX / Math.max(w, h), Math.sqrt(maxArea / (w * h)));
}
