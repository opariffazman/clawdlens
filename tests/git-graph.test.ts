import { test, expect } from "bun:test";
import { layoutGitGraph } from "../src/core/git-graph";
import type { Commit } from "../src/core/types";

function c(hash: string, parents: string[]): Commit {
  return { hash, shortHash: hash.slice(0, 7), parents, refs: [], subject: hash };
}

test("linear history -> single column, stacked rows", () => {
  const g = layoutGitGraph([c("a", ["b"]), c("b", ["d"]), c("d", [])]);
  expect(g.nodes.map((n) => n.row)).toEqual([0, 1, 2]);
  expect(g.nodes.every((n) => n.column === 0)).toBe(true);
  // a vertical spine wire exists between the commits
  expect(g.segments.flatMap((s) => s.cells).some((cell) => cell.ch === "│")).toBe(true);
});

test("a merge commit opens a second lane with a branch segment", () => {
  // m merges p1 and p2; p1 and p2 both descend from base
  const g = layoutGitGraph([
    c("m", ["p1", "p2"]),
    c("p1", ["base"]),
    c("p2", ["base"]),
    c("base", []),
  ]);
  expect(g.columns).toBeGreaterThanOrEqual(2);
  expect(g.segments.some((s) => s.kind === "branch")).toBe(true);
  // the two branch tips occupy different columns
  const cols = new Set(g.nodes.map((n) => n.column));
  expect(cols.size).toBeGreaterThanOrEqual(2);
});

test("empty -> empty graph", () => {
  const g = layoutGitGraph([]);
  expect(g.nodes.length).toBe(0);
  expect(g.rows).toBe(0);
});
