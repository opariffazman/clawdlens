import { test, expect } from "bun:test";
import { layoutFlow } from "../src/core/flow-layout";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: 0, kind: p.kind ?? "tool", icon: "x", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p } as Beat;
}

test("main-lane beats stack in column 0 on increasing rows", () => {
  const g = layoutFlow([beat({ id: "a" }), beat({ id: "b" }), beat({ id: "c" })]);
  expect(g.nodes.map(n => n.row)).toEqual([0, 1, 2]);
  expect(g.nodes.every(n => n.column === 0)).toBe(true);
  expect(g.lanes.find(l => l.id === "main")?.column).toBe(0);
});

test("consecutive same-lane nodes are joined by visible spine wires", () => {
  const g = layoutFlow([beat({ id: "a" }), beat({ id: "b" }), beat({ id: "c" })]);
  const cells = g.segments.flatMap((s) => s.cells);
  // there must be drawable connector cells between the stacked nodes
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.some((c) => c.ch === "│")).toBe(true);
  // wires sit in the main lane column (x = 0), between node display-rows
  expect(cells.every((c) => c.x === 0)).toBe(true);
  // display height leaves a gap row between each node (stride > 1)
  expect(g.rows).toBeGreaterThan(g.nodes.length);
});

test("subagent lane gets its own column and a branch segment", () => {
  const g = layoutFlow([
    beat({ id: "task", lane: "main", label: "Task" }),
    beat({ id: "sub", lane: "T1" }),
    beat({ id: "after", lane: "main" }),
  ]);
  const subLane = g.lanes.find(l => l.id === "T1");
  expect(subLane && subLane.column > 0).toBe(true);
  // there is at least one branch segment between columns
  expect(g.segments.some(seg => seg.kind === "branch")).toBe(true);
});
