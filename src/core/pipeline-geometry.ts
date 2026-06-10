export interface Cell { x: number; y: number; ch: string }
export interface Rect { x: number; y: number; w: number; h: number }

export const LEFT = 2;
export const TOP = 1;

// ─── n8n-style node row ──────────────────────────────────────────────────────

export type BoxMode = "art" | "glyph";
export const BOX_W = 13;
export const BOX_W_WIDE = 17;        // wide tier: holds the 13x5 braille art
export const BOX_W_NARROW = 9;
export const BOX_H_ART = 7;
export const BOX_H_GLYPH = 5;
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
  wide: boolean;
}

function rowNeed(n: number, bw: number, gap: number): number {
  return LEFT + n * bw + (n - 1) * gap + 2;
}

// Width ladder: full (trigger+labels) → drop labels → drop trigger → narrow boxes.
// Slack beyond the minimum flows into the gaps (justified row).
export function nodeLayout(width: number, top: number, mode: BoxMode): NodeLayout {
  const boxH = mode === "art" ? BOX_H_ART : BOX_H_GLYPH;
  const showLabels = width >= rowNeed(5, BOX_W, GAP_LABEL);
  const showTrigger = width >= rowNeed(5, BOX_W, GAP_MIN);
  const row = showTrigger ? [...ROW_FULL] : ROW_FULL.slice(1);
  const wide = mode === "art" && width >= rowNeed(5, BOX_W_WIDE, GAP_LABEL);
  const boxW = wide ? BOX_W_WIDE : showTrigger || width >= rowNeed(4, BOX_W, GAP_MIN) ? BOX_W : BOX_W_NARROW;
  const n = row.length;
  const eff = Math.max(width, rowNeed(n, boxW, GAP_SQUEEZE)); // floor: row may overflow tiny widths; panel clips
  const gap = Math.max(GAP_SQUEEZE, Math.floor((eff - LEFT - 2 - n * boxW) / (n - 1)));
  const boxes = new Map<string, Rect>();
  row.forEach((k, i) => boxes.set(k, { x: LEFT + i * (boxW + gap), y: top, w: boxW, h: boxH }));
  return { boxes, row, mode, boxW, boxH, showTrigger, showLabels, wide };
}

// Border cells ordered CLOCKWISE from the top-left corner — the box draw and the
// orbiting ring share this array (the ring recolors a window of it).
export function borderCells(r: Rect, roundedLeft = false): Cell[] {
  const cells: Cell[] = [];
  const x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
  cells.push({ x: r.x, y: r.y, ch: roundedLeft ? "╭" : "┌" });
  for (let x = r.x + 1; x < x1; x++) cells.push({ x, y: r.y, ch: "─" });
  cells.push({ x: x1, y: r.y, ch: "┐" });
  for (let y = r.y + 1; y < y1; y++) cells.push({ x: x1, y, ch: "│" });
  cells.push({ x: x1, y: y1, ch: "┘" });
  for (let x = x1 - 1; x > r.x; x--) cells.push({ x, y: y1, ch: "─" });
  cells.push({ x: r.x, y: y1, ch: roundedLeft ? "╰" : "└" });
  for (let y = y1 - 1; y > r.y; y--) cells.push({ x: r.x, y, ch: "│" });
  return cells;
}

export function portIn(r: Rect): { x: number; y: number } {
  return { x: r.x, y: r.y + (r.h >> 1) };
}
export function portOut(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w - 1, y: r.y + (r.h >> 1) };
}
// n8n status badge: inside the bottom-right corner, on the border row
export function badgeCell(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w - 2, y: r.y + r.h - 1 };
}
// ◇ sub-node port, bottom-border center
export function diamondCell(r: Rect): { x: number; y: number } {
  return { x: r.x + (r.w >> 1), y: r.y + r.h - 1 };
}
// ⚡ floats one cell outside the trigger's left edge (n8n bolt)
export function boltCell(r: Rect): { x: number; y: number } {
  return { x: r.x - 1, y: r.y + (r.h >> 1) };
}

// straight forward wire at mid-box height; optional ×N label embedded mid-run
// (n8n item-count pill). Caller draws ● / ○ on the box borders themselves.
export function wireForward(a: Rect, b: Rect, label?: string): Cell[] {
  const y = a.y + (a.h >> 1);
  const x0 = a.x + a.w, x1 = b.x - 2;
  const cells: Cell[] = [];
  for (let x = x0; x <= x1; x++) cells.push({ x, y, ch: "─" });
  cells.push({ x: b.x - 1, y, ch: "▶" });
  if (label && x1 - x0 + 1 >= label.length + 4) {
    const lx = x0 + ((x1 - x0 + 1 - label.length) >> 1);
    for (let i = 0; i < label.length; i++) cells[lx - x0 + i] = { x: lx + i, y, ch: label[i]! };
  }
  return cells;
}

// backward wire: exits just right of a's output port, rounded U below the row
// (n8n smoothstep), rises just left of b and enters b's input port with ▶.
export function wireLoop(a: Rect, b: Rect, channelY: number): Cell[] {
  const cells: Cell[] = [];
  const midA = a.y + (a.h >> 1);
  const midB = b.y + (b.h >> 1);
  const ax = a.x + a.w;
  const bx = b.x - 2;
  cells.push({ x: ax, y: midA, ch: "╮" });
  for (let y = midA + 1; y < channelY; y++) cells.push({ x: ax, y, ch: "│" });
  cells.push({ x: ax, y: channelY, ch: "╯" });
  for (let x = ax - 1; x > bx; x--) cells.push({ x, y: channelY, ch: "─" });
  cells.push({ x: bx, y: channelY, ch: "╰" });
  for (let y = channelY - 1; y > midB; y--) cells.push({ x: bx, y, ch: "│" });
  cells.push({ x: bx, y: midB, ch: "╭" });
  cells.push({ x: b.x - 1, y: midB, ch: "▶" });
  return cells;
}

// ─── Sub-row layout (skills/agents under tool) ────────────────────────────────

export interface SubRowLayout {
  cells: Cell[];      // dashed trunk + rounded fan + dashed drops
  circles: Rect[];    // SUB_W × SUB_H sub-node boxes
  labelY: number;     // row for the names under the circles (= tool bottom row when shown===0 — skip drawing)
  shown: number;
}

// Skills/agents hang under tool like n8n AI sub-nodes: ◇ port (caller draws it),
// dashed trunk, rounded tree fan, dashed drops into 3-row circles, names below.
export function subRow(tool: Rect, n: number, width: number): SubRowLayout {
  const dx = tool.x + (tool.w >> 1);
  const dy = tool.y + tool.h - 1;
  const fit = Math.max(0, Math.floor((width - LEFT - 2 - SUB_W) / SUB_PITCH) + 1);
  const shown = Math.min(n, fit);
  const cells: Cell[] = [];
  const circles: Rect[] = [];
  if (shown === 0) return { cells, circles, labelY: dy, shown };
  const span = (shown - 1) * SUB_PITCH;
  let cx0 = dx - (span >> 1);
  cx0 = Math.max(LEFT + (SUB_W >> 1), Math.min(cx0, width - 2 - ((SUB_W + 1) >> 1) - span));
  const xs = Array.from({ length: shown }, (_, i) => cx0 + i * SUB_PITCH);
  const fanY = dy + 2;
  cells.push({ x: dx, y: dy + 1, ch: "┆" });
  const lo = Math.min(xs[0]!, dx), hi = Math.max(xs[xs.length - 1]!, dx);
  if (lo === hi) {
    cells.push({ x: dx, y: fanY, ch: "┆" });
  } else {
    for (let x = lo; x <= hi; x++) {
      let ch = "┄";
      if (x === dx) ch = x === lo ? "╰" : x === hi ? "╯" : "┴";
      else if (x === lo) ch = "╭";
      else if (x === hi) ch = "╮";
      else if (xs.includes(x)) ch = "┬";
      cells.push({ x, y: fanY, ch });
    }
  }
  for (const cx of xs) {
    cells.push({ x: cx, y: fanY + 1, ch: "┆" });
    circles.push({ x: cx - (SUB_W >> 1), y: fanY + 2, w: SUB_W, h: SUB_H });
  }
  return { cells, circles, labelY: fanY + 2 + SUB_H, shown };
}

// ◇ on the sub-node's top border (n8n diamond-to-diamond dashed wires)
export function subPortCell(c: Rect): { x: number; y: number } {
  return { x: c.x + (c.w >> 1), y: c.y };
}
