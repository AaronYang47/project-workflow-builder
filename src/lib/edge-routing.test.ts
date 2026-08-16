import assert from "node:assert/strict";
import { test } from "node:test";
import { PHASE_CONTENT_TOP, PHASE_HEADER_HEIGHT } from "@/lib/node-layout";
import { aboveRouteCardTop, corridorYAboveCards } from "@/lib/edge-routing";

test("in-phase above routes stay in the gutter below the Phase title", () => {
  const phaseY = 64;
  const cardTop = phaseY + PHASE_CONTENT_TOP;
  const y = corridorYAboveCards(cardTop, 2, 400, 900, [
    {
      id: "phase-1__header",
      x: 329,
      y: phaseY,
      width: 626,
      height: PHASE_HEADER_HEIGHT,
      kind: "phase-header",
    },
  ]);
  assert.ok(y >= phaseY + PHASE_HEADER_HEIGHT, "must clear the title box");
  assert.ok(y <= cardTop - 12, "must stay above the gate cards");
});

test("when the gutter is too tight, the corridor goes above the Phase", () => {
  const phaseY = 64;
  const y = corridorYAboveCards(phaseY + 120, 0, 400, 900, [
    {
      id: "phase-1__header",
      x: 329,
      y: phaseY,
      width: 626,
      height: 130,
      kind: "phase-header",
    },
  ]);
  assert.ok(y < phaseY, "must leave the title box by going over the Phase");
});

test("a corridor already in the gutter is left alone", () => {
  const phaseY = 64;
  const cardTop = phaseY + PHASE_CONTENT_TOP;
  const y = corridorYAboveCards(cardTop, 0, 400, 900, [
    {
      id: "phase-1__header",
      x: 329,
      y: phaseY,
      width: 626,
      height: 80,
      kind: "phase-header",
    },
  ]);
  assert.equal(y, cardTop - 28);
});

test("above-route card top uses the gate cards, not handle Y", () => {
  const cardTop = 64 + PHASE_CONTENT_TOP;
  assert.equal(
    aboveRouteCardTop(
      { id: "g1", x: 0, y: cardTop, width: 520, height: 400 },
      { id: "g2", x: 700, y: cardTop, width: 520, height: 400 },
      cardTop + 400,
    ),
    cardTop,
  );
});
