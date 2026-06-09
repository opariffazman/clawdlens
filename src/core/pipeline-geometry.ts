import type { PipeKind } from "./pipeline";

export interface Cell { x: number; y: number; ch: string }
export interface Rect { x: number; y: number; w: number; h: number }

export const LEFT = 2;
export const TOP = 1;
export const CARD_W = 11;
export const CARD_H = 3;
export const ARROW_GAP = 4;  // horizontal space between cards (carries the wire)
export const ROW_GAP = 2;    // vertical gap between card rows

export const MAX_CARD_W = 18;

// Width-aware coarse layout: think · tool · result · chat justified across the
// full width (cardW capped, slack flows into the gaps), with the skill card one
// row below, centered in the tool→result gap. `top` is supplied by the caller
// (the panel centers the block vertically).
export function coarseLayout(width: number, top: number): Map<PipeKind, Rect> {
  const usable = Math.max(4 * CARD_W + 3 * ARROW_GAP, width - LEFT - 2);
  const cardW = Math.max(CARD_W, Math.min(MAX_CARD_W, Math.floor(usable * 0.16)));
  const gap = Math.max(ARROW_GAP, Math.floor((usable - 4 * cardW) / 3));
  const colX = (c: number) => LEFT + c * (cardW + gap);
  const m = new Map<PipeKind, Rect>();
  m.set("think", { x: colX(0), y: top, w: cardW, h: CARD_H });
  m.set("tool", { x: colX(1), y: top, w: cardW, h: CARD_H });
  m.set("result", { x: colX(2), y: top, w: cardW, h: CARD_H });
  m.set("chat", { x: colX(3), y: top, w: cardW, h: CARD_H });
  const toolR = m.get("tool")!;
  const resultR = m.get("result")!;
  const gapInner = resultR.x - (toolR.x + toolR.w);
  // skill sits centered in the tool→result gap; clamp so it never overlaps the
  // tool card. When the gap is too narrow it lands at tool's right edge (and may
  // touch result) — the panel then repositions it below tool (narrow fallback).
  const sx = toolR.x + toolR.w + Math.max(0, Math.floor((gapInner - cardW) / 2));
  m.set("skill", { x: Math.max(toolR.x + toolR.w, Math.min(sx, resultR.x - cardW)), y: top + CARD_H + ROW_GAP, w: cardW, h: CARD_H });
  return m;
}

// forward pipe: a (left) → b (right), same row. Horizontal on the mid-row,
// terminating in ▶ at b's left input port.
export function pipeForward(a: Rect, b: Rect): Cell[] {
  const y = a.y + (a.h >> 1);
  const cells: Cell[] = [];
  for (let x = a.x + a.w; x < b.x - 1; x++) cells.push({ x, y, ch: "━" });
  cells.push({ x: b.x - 1, y, ch: "▶" });
  return cells;
}

// return pipe: a (right) → b (left). Down from a's bottom port to channelY, a
// run left, up into b's bottom port — a clean U with a ◀ arrowhead.
export function pipeReturn(a: Rect, b: Rect, channelY: number): Cell[] {
  const cells: Cell[] = [];
  const ax = a.x + (a.w >> 1);
  const bx = b.x + (b.w >> 1);
  for (let y = a.y + a.h; y < channelY; y++) cells.push({ x: ax, y, ch: "│" });
  cells.push({ x: ax, y: channelY, ch: "╯" });
  for (let x = ax - 1; x > bx + 1; x--) cells.push({ x, y: channelY, ch: "─" });
  cells.push({ x: bx + 1, y: channelY, ch: "◀" });
  cells.push({ x: bx, y: channelY, ch: "╰" });
  for (let y = channelY - 1; y >= b.y + b.h; y--) cells.push({ x: bx, y, ch: "│" });
  return cells;
}

// branch pipe: vertical trunk from the parent's bottom, with a tee into each
// child's left port (children are single-row rects from expandStack).
export function pipeBranch(parent: Rect, children: Rect[]): Cell[] {
  const cells: Cell[] = [];
  if (children.length === 0) return cells;
  const tx = parent.x + 1;
  const last = children[children.length - 1]!;
  for (let y = parent.y + parent.h; y < last.y; y++) cells.push({ x: tx, y, ch: "│" });
  for (const c of children) {
    cells.push({ x: tx, y: c.y, ch: c === last ? "└" : "├" });
    for (let x = tx + 1; x < c.x - 1; x++) cells.push({ x, y: c.y, ch: "─" });
    cells.push({ x: c.x - 1, y: c.y, ch: "▶" });
  }
  return cells;
}

// branch a parent to a child that hangs below it. If the child is to the
// lower-right (own sub-column), route down the parent's right edge, corner,
// then right into the child's left-mid port. If the child sits directly below
// (narrow fallback), drop a centered vertical stem into the child's top port.
export function pipeElbow(a: Rect, b: Rect): Cell[] {
  const cells: Cell[] = [];
  // wide route — child below-right. Callers keep a real gap (b.x > a.x+a.w) via
  // SKILL_SIDE_MIN; an exactly-adjacent child would collapse the corner onto the arrow.
  if (b.x >= a.x + a.w) {
    const ex = a.x + a.w - 1;
    const by = b.y + (b.h >> 1);
    for (let y = a.y + a.h; y < by; y++) cells.push({ x: ex, y, ch: "│" });
    cells.push({ x: ex, y: by, ch: "╰" });
    for (let x = ex + 1; x < b.x - 1; x++) cells.push({ x, y: by, ch: "─" });
    cells.push({ x: b.x - 1, y: by, ch: "▶" });
  } else {
    const cx = a.x + 1; // left trunk (collinear with pipeBranch) — clears left-aligned child labels
    for (let y = a.y + a.h; y < b.y; y++) cells.push({ x: cx, y, ch: "│" });
    cells.push({ x: cx, y: b.y, ch: "▼" });
  }
  return cells;
}

// vertical stack of n single-row child slots below the parent card
export function expandStack(parent: Rect, n: number): Rect[] {
  const rects: Rect[] = [];
  const x = parent.x + 4;
  const y0 = parent.y + parent.h;
  for (let i = 0; i < n; i++) rects.push({ x, y: y0 + i, w: CARD_W, h: 1 });
  return rects;
}
