import type { PipeKind } from "./pipeline";
import { slotOf } from "./pipeline";

export interface Cell { x: number; y: number; ch: string }

export const LEFT = 2;
export const TOP = 1;
export const COL_GAP = 14;     // cells between stage columns
export const STAGE_ROW_H = 4;  // vertical block between spine row 0 and skill row 1

export function nodePos(kind: PipeKind): { x: number; y: number } {
  const { col, row } = slotOf(kind);
  return { x: LEFT + col * COL_GAP, y: TOP + row * STAGE_ROW_H };
}

// Ordered routed cells from the `from` node to the `to` node (excludes the node
// glyphs). Skill (row 1) is reached via a vertical feeder to/from the spine; the
// spine is traversed straight (forward) or via an arc one row below (backward).
export function edgePath(from: PipeKind, to: PipeKind): Cell[] {
  if (from === to) return [];
  const a = slotOf(from);
  const b = slotOf(to);
  const cells: Cell[] = [];
  const xOf = (col: number) => LEFT + col * COL_GAP;
  const fromX = xOf(a.col);
  const toX = xOf(b.col);

  // 1. feeder UP from a skill source to the spine row
  if (a.row === 1) {
    for (let y = TOP + STAGE_ROW_H - 1; y > TOP; y--) cells.push({ x: fromX, y, ch: "│" });
  }
  // 2. spine traversal
  if (b.col > a.col) {
    for (let x = fromX + 1; x < toX; x++) cells.push({ x, y: TOP, ch: "─" });
  } else if (b.col < a.col) {
    const yArc = TOP + 2;
    cells.push({ x: fromX, y: TOP + 1, ch: "│" });
    cells.push({ x: fromX, y: yArc, ch: "╯" });
    for (let x = fromX - 1; x > toX; x--) cells.push({ x, y: yArc, ch: "─" });
    cells.push({ x: toX, y: yArc, ch: "╰" });
    cells.push({ x: toX, y: TOP + 1, ch: "│" });
  }
  // 3. feeder DOWN to a skill target
  if (b.row === 1) {
    for (let y = TOP + 1; y < TOP + STAGE_ROW_H; y++) cells.push({ x: toX, y, ch: "│" });
  }
  return cells;
}
