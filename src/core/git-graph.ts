import type { Commit } from "./types";
import type { FlowGraph, FlowNodeView, Segment, Cell, FlowLane } from "./flow-layout";
import { ROW_STRIDE } from "./flow-layout";

const COL_WIDTH = 2;

// git log --graph style lane assignment. `lanes[col]` = the hash that column is
// currently waiting to place next (or null when free). First parent continues a
// commit's column; extra parents (merges) open new lanes; lanes converging on
// the same commit close (rejoin).
export function layoutGitGraph(commits: Commit[]): FlowGraph {
  const present = new Set(commits.map((c) => c.hash));
  const lanes: (string | null)[] = [];
  const nodes: FlowNodeView[] = [];
  const segments: Segment[] = [];

  const freeCol = (): number => {
    const i = lanes.indexOf(null);
    if (i !== -1) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  commits.forEach((commit, row) => {
    const y = row * ROW_STRIDE;

    let col = lanes.indexOf(commit.hash);
    if (col === -1) col = freeCol();
    lanes[col] = null;

    // other lanes also waiting for this commit are branches merging in -> close
    for (let k = 0; k < lanes.length; k++) {
      if (k !== col && lanes[k] === commit.hash) {
        segments.push({ kind: "rejoin", lane: commit.hash, cells: hConnect(k, col, y) });
        lanes[k] = null;
      }
    }

    nodes.push({ beatId: commit.hash, lane: String(col), row, column: col });

    const parents = commit.parents.filter((p) => present.has(p));
    if (parents.length > 0) {
      lanes[col] = parents[0]!; // first parent continues this column
      for (let pi = 1; pi < parents.length; pi++) {
        const pcol = freeCol();
        lanes[pcol] = parents[pi]!;
        segments.push({ kind: "branch", lane: parents[pi]!, cells: hConnect(col, pcol, y) });
      }
    }

    // vertical spine on the gap rows under this row, for every still-open lane
    for (let gy = y + 1; gy < y + ROW_STRIDE; gy++) {
      for (let k = 0; k < lanes.length; k++) {
        if (lanes[k] !== null) {
          segments.push({ kind: "spine", lane: lanes[k]!, cells: [{ x: k * COL_WIDTH, y: gy, ch: "│" }] });
        }
      }
    }
  });

  const rows = commits.length > 0 ? (commits.length - 1) * ROW_STRIDE + 1 : 0;
  const flowLanes: FlowLane[] = lanes.map((_, i) => ({ id: String(i), column: i }));
  return { lanes: flowLanes, nodes, segments, rows, columns: Math.max(commits.length > 0 ? 1 : 0, lanes.length) };
}

function hConnect(fromCol: number, toCol: number, y: number): Cell[] {
  const a = Math.min(fromCol, toCol);
  const b = Math.max(fromCol, toCol);
  const cells: Cell[] = [];
  for (let c = a; c <= b; c++) cells.push({ x: c * COL_WIDTH, y, ch: c === a ? "├" : c === b ? "┐" : "─" });
  return cells;
}
