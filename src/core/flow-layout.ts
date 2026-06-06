import type { Beat } from "./types";

export interface FlowNodeView { beatId: string; lane: string; row: number; column: number }
export interface Cell { x: number; y: number; ch: string }
export interface Segment { kind: "spine" | "branch" | "rejoin"; lane: string; cells: Cell[] }
export interface FlowLane { id: string; column: number; label?: string }
export interface FlowGraph { lanes: FlowLane[]; nodes: FlowNodeView[]; segments: Segment[]; rows: number; columns: number }

const COL_WIDTH = 2; // cells between lane columns when drawn

export function layoutFlow(beats: Beat[]): FlowGraph {
  const lanes = new Map<string, FlowLane>();
  lanes.set("main", { id: "main", column: 0 });
  let nextCol = 1;

  const nodes: FlowNodeView[] = [];
  const segments: Segment[] = [];
  const lastRowInLane = new Map<string, number>();

  beats.forEach((b, row) => {
    if (!lanes.has(b.lane)) lanes.set(b.lane, { id: b.lane, column: nextCol++, label: b.label });
    const lane = lanes.get(b.lane)!;
    nodes.push({ beatId: b.id, lane: b.lane, row, column: lane.column });

    const x = lane.column * COL_WIDTH;
    const prevRow = lastRowInLane.get(b.lane);
    if (prevRow !== undefined && row - prevRow >= 1) {
      const cells: Cell[] = [];
      for (let y = prevRow + 1; y < row; y++) cells.push({ x, y, ch: "│" });
      segments.push({ kind: "spine", lane: b.lane, cells });
    } else if (lane.column > 0 && prevRow === undefined) {
      // first appearance of a subagent lane -> branch from main at this row
      segments.push({ kind: "branch", lane: b.lane, cells: branchCells(0, lane.column, row) });
    }
    lastRowInLane.set(b.lane, row);
  });

  return { lanes: [...lanes.values()], nodes, segments, rows: beats.length, columns: nextCol };
}

function branchCells(fromCol: number, toCol: number, row: number): Cell[] {
  const cells: Cell[] = [];
  const y = row;
  const x0 = fromCol * COL_WIDTH;
  const x1 = toCol * COL_WIDTH;
  for (let x = x0 + 1; x < x1; x++) cells.push({ x, y, ch: "─" });
  cells.push({ x: x1, y, ch: "┐" });
  return cells;
}
