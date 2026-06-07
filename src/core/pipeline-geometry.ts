import type { PipeKind } from "./pipeline";
import { slotOf } from "./pipeline";

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

// forward pipe: a (left) → b (right), same row. Horizontal on the mid-row,
// terminating in ▶ at b's left input port.
export function pipeForward(a: Rect, b: Rect): Cell[] {
  const y = a.y + (a.h >> 1);
  const cells: Cell[] = [];
  for (let x = a.x + a.w; x < b.x - 1; x++) cells.push({ x, y, ch: "─" });
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

// vertical stack of n single-row child slots below the parent card
export function expandStack(parent: Rect, n: number): Rect[] {
  const rects: Rect[] = [];
  const x = parent.x + 4;
  const y0 = parent.y + parent.h;
  for (let i = 0; i < n; i++) rects.push({ x, y: y0 + i, w: CARD_W, h: 1 });
  return rects;
}
