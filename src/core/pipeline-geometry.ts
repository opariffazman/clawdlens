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

// a card taps the flow rail from its top-center.
function railStubX(card: Rect): number { return card.x + (card.w >> 1); }

// flow rail ABOVE the card row: one horizontal bus across all the cards' stub
// columns (┯ tee per card), a short │ stub down toward each card, ● at the left
// origin and ▶ at the right terminus. Forward flow rides the bus instead of
// threading through the boxes at content height.
export function railCells(cards: Rect[], railY: number): Cell[] {
  const cells: Cell[] = [];
  if (cards.length === 0) return cells;
  const xs = cards.map(railStubX).sort((a, b) => a - b);
  const x0 = xs[0]!, x1 = xs[xs.length - 1]!;
  const stub = new Set(xs);
  cells.push({ x: x0 - 1, y: railY, ch: "●" });
  for (let x = x0; x <= x1; x++) cells.push({ x, y: railY, ch: stub.has(x) ? "┯" : "━" });
  cells.push({ x: x1 + 1, y: railY, ch: "▶" });
  for (const c of cards) {
    const sx = railStubX(c);
    for (let y = railY + 1; y < c.y; y++) cells.push({ x: sx, y, ch: "│" });
  }
  return cells;
}

// ordered horizontal run along the rail between two cards' stub columns (a→b),
// for the comet. Cells flow from a's stub toward b's stub.
export function railSegment(a: Rect, b: Rect, railY: number): Cell[] {
  const ax = railStubX(a), bx = railStubX(b);
  const lo = Math.min(ax, bx), hi = Math.max(ax, bx);
  const cells: Cell[] = [];
  for (let x = lo; x <= hi; x++) cells.push({ x, y: railY, ch: "━" });
  return ax <= bx ? cells : cells.reverse();
}

// vertical stack of n single-row child slots below the parent card
export function expandStack(parent: Rect, n: number): Rect[] {
  const rects: Rect[] = [];
  const x = parent.x + 4;
  const y0 = parent.y + parent.h;
  for (let i = 0; i < n; i++) rects.push({ x, y: y0 + i, w: CARD_W, h: 1 });
  return rects;
}

// ─── n8n-style node row ──────────────────────────────────────────────────────

export type BoxMode = "art" | "glyph";
export const BOX_W = 13;
export const BOX_W_NARROW = 9;
export const BOX_H_ART = 7;
export const BOX_H_GLYPH = 5;
export const NAME_ROWS = 2;          // name + detail line below each box
export const SUB_ROWS = 7;           // ┆ + fan + ┆ + 3-row circle + label
export const SUB_W = 5;
export const SUB_H = 3;
export const SUB_PITCH = 16;
const GAP_LABEL = 9;                 // min gap that fits an embedded ×N label
const GAP_MIN = 5;                   // min gap for ─▶ + ports
const GAP_SQUEEZE = 3;
const ROW_FULL = ["prompt", "think", "tool", "result", "chat"];

export interface NodeLayout {
  boxes: Map<string, Rect>;
  row: string[];
  mode: BoxMode;
  boxW: number;
  boxH: number;
  showTrigger: boolean;
  showLabels: boolean;
}

function rowNeed(n: number, bw: number, gap: number): number {
  return LEFT + n * bw + (n - 1) * gap + 2;
}

// Width ladder: full (trigger+labels) → drop labels → drop trigger → narrow boxes.
// Slack beyond the minimum flows into the gaps (justified row, like the old coarseLayout).
export function nodeLayout(width: number, top: number, mode: BoxMode): NodeLayout {
  const boxH = mode === "art" ? BOX_H_ART : BOX_H_GLYPH;
  const showLabels = width >= rowNeed(5, BOX_W, GAP_LABEL);
  const showTrigger = width >= rowNeed(5, BOX_W, GAP_MIN);
  const row = showTrigger ? [...ROW_FULL] : ROW_FULL.slice(1);
  const boxW = showTrigger || width >= rowNeed(4, BOX_W, GAP_MIN) ? BOX_W : BOX_W_NARROW;
  const n = row.length;
  const eff = Math.max(width, rowNeed(n, boxW, GAP_SQUEEZE)); // floor: row may overflow tiny widths; panel clips
  const gap = Math.max(GAP_SQUEEZE, Math.floor((eff - LEFT - 2 - n * boxW) / (n - 1)));
  const boxes = new Map<string, Rect>();
  row.forEach((k, i) => boxes.set(k, { x: LEFT + i * (boxW + gap), y: top, w: boxW, h: boxH }));
  return { boxes, row, mode, boxW, boxH, showTrigger, showLabels };
}
