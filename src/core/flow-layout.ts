import type { Beat } from "./types";

export interface FlowNodeView { beatId: string; lane: string; row: number; column: number }
export interface Cell { x: number; y: number; ch: string }
export interface Segment { kind: "spine" | "branch" | "rejoin"; lane: string; cells: Cell[] }
export interface FlowLane { id: string; column: number; label?: string }
export interface FlowGraph { lanes: FlowLane[]; nodes: FlowNodeView[]; segments: Segment[]; rows: number; columns: number }

const COL_WIDTH = 2; // cells between lane columns when drawn
// Display rows per node. Nodes sit on rows 0, STRIDE, 2*STRIDE, … and the
// (STRIDE-1) gap rows between them carry the vertical spine wire — which is
// what the energy pulse travels along. `node.row` stays the BEAT INDEX; the
// renderer multiplies by ROW_STRIDE for the screen position.
export const ROW_STRIDE = 2;

export function layoutFlow(beats: Beat[]): FlowGraph {
  const lanes = new Map<string, FlowLane>();
  lanes.set("main", { id: "main", column: 0 });
  let nextCol = 1;

  const nodes: FlowNodeView[] = [];
  const segments: Segment[] = [];
  const lastIdxInLane = new Map<string, number>();

  beats.forEach((b, idx) => {
    if (!lanes.has(b.lane)) lanes.set(b.lane, { id: b.lane, column: nextCol++, label: b.label });
    const lane = lanes.get(b.lane)!;
    nodes.push({ beatId: b.id, lane: b.lane, row: idx, column: lane.column });

    const x = lane.column * COL_WIDTH;
    const dispY = idx * ROW_STRIDE;
    const prevIdx = lastIdxInLane.get(b.lane);
    if (prevIdx !== undefined) {
      // fill the gap display-rows between the previous same-lane node and this
      // one with the spine wire (this is the pulse's path)
      const cells: Cell[] = [];
      for (let y = prevIdx * ROW_STRIDE + 1; y < dispY; y++) cells.push({ x, y, ch: "│" });
      if (cells.length > 0) segments.push({ kind: "spine", lane: b.lane, cells });
    } else if (lane.column > 0) {
      // first appearance of a subagent lane -> branch from main at this display row
      segments.push({ kind: "branch", lane: b.lane, cells: branchCells(0, lane.column, dispY) });
    }
    lastIdxInLane.set(b.lane, idx);
  });

  const rows = beats.length > 0 ? (beats.length - 1) * ROW_STRIDE + 1 : 0;
  return { lanes: [...lanes.values()], nodes, segments, rows, columns: nextCol };
}

function branchCells(fromCol: number, toCol: number, y: number): Cell[] {
  const cells: Cell[] = [];
  const x0 = fromCol * COL_WIDTH;
  const x1 = toCol * COL_WIDTH;
  for (let x = x0 + 1; x < x1; x++) cells.push({ x, y, ch: "─" });
  cells.push({ x: x1, y, ch: "┐" });
  return cells;
}
