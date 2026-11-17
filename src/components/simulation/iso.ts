/** Isometric projection: world x runs right-down, y runs left-down, z up. */
export const UNIT = 22;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

export const iso = (x: number, y: number, z = 0) => ({
  x: (x - y) * COS * UNIT,
  y: (x + y) * SIN * UNIT - z * UNIT,
});

export const points = (corners: [number, number, number][]) =>
  corners
    .map(([x, y, z]) => {
      const p = iso(x, y, z);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

/** Flat rectangle on the floor (or at height z). */
export const tile = (x: number, y: number, length: number, width: number, z = 0) =>
  points([
    [x, y, z],
    [x + length, y, z],
    [x + length, y + width, z],
    [x, y + width, z],
  ]);

/** The three visible faces of a box whose corner sits at the origin. */
export function boxFaces(length: number, width: number, height: number) {
  return {
    top: points([
      [0, 0, height],
      [length, 0, height],
      [length, width, height],
      [0, width, height],
    ]),
    // Face on the +x side (lit) and the +y side (shaded).
    right: points([
      [length, 0, 0],
      [length, width, 0],
      [length, width, height],
      [length, 0, height],
    ]),
    left: points([
      [0, width, 0],
      [length, width, 0],
      [length, width, height],
      [0, width, height],
    ]),
  };
}

/** Lighter or darker shade of a #rrggbb colour (amount -1..1). */
export function shade(hex: string, amount: number) {
  const value = /^#[\da-f]{6}$/i.test(hex) ? hex : "#64748b";
  const channels = [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) =>
    Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount)),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
