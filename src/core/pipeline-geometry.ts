import type { PipeKind } from "./pipeline";
import { slotOf, rankOf } from "./pipeline";

export interface Cell { x: number; y: number; ch: string }
export interface Rect { x: number; y: number; w: number; h: number }

export const LEFT = 2;
export const TOP = 1;
export const CARD_W = 11;
export const CARD_H = 3;
export const ARROW_GAP = 4;  // horizontal space between cards (carries the wire)
export const ROW_GAP = 2;    // vertical gap between card rows

// coarse: each stage on its fixed slot, rendered as a card box
export function coarseCardRect(kind: PipeKind): Rect {
  const { col, row } = slotOf(kind);
  return { x: LEFT + col * (CARD_W + ARROW_GAP), y: TOP + row * (CARD_H + ROW_GAP), w: CARD_W, h: CARD_H };
}

// fine: order by rank, lay out left→right, wrap to a new row at `width`
export function fineCardLayout(kinds: string[], width: number): Map<string, Rect> {
  const ordered = [...kinds].sort((a, b) => rankOf(a) - rankOf(b));
  const map = new Map<string, Rect>();
  let x = LEFT;
  let y = TOP;
  for (const k of ordered) {
    if (x > LEFT && x + CARD_W > width) { x = LEFT; y += CARD_H + ROW_GAP; }
    map.set(k, { x, y, w: CARD_W, h: CARD_H });
    x += CARD_W + ARROW_GAP;
  }
  return map;
}

// Manhattan wire (cells only, excludes card glyphs) from card a to card b:
//  - same row, b right of a  → straight horizontal on a's midline
//  - same row, b left of a   → arc one row below the cards (back-edge)
//  - different rows          → horizontal on a's midline to b's x, then vertical into b
export function cardWire(a: Rect, b: Rect): Cell[] {
  const cells: Cell[] = [];
  const acy = a.y + (a.h >> 1);
  const bcy = b.y + (b.h >> 1);

  if (a.y === b.y && b.x > a.x) {
    for (let x = a.x + a.w; x < b.x; x++) cells.push({ x, y: acy, ch: "─" });
    return cells;
  }
  if (a.y === b.y && b.x < a.x) {
    const yArc = a.y + a.h;
    const xa = a.x + (a.w >> 1);
    const xb = b.x + (b.w >> 1);
    cells.push({ x: xa, y: yArc, ch: "╮" });
    for (let x = xa - 1; x > xb; x--) cells.push({ x, y: yArc, ch: "─" });
    cells.push({ x: xb, y: yArc, ch: "╭" });
    return cells;
  }
  // different rows
  const endX = b.x >= a.x ? b.x - 1 : b.x + b.w;
  const startX = b.x >= a.x ? a.x + a.w : a.x - 1;
  const stepX = endX >= startX ? 1 : -1;
  for (let x = startX; x !== endX + stepX; x += stepX) cells.push({ x, y: acy, ch: "─" });
  const stepY = bcy >= acy ? 1 : -1;
  for (let y = acy + stepY; y !== bcy + stepY; y += stepY) cells.push({ x: endX, y, ch: "│" });
  return cells;
}
