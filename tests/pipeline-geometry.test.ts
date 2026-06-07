import { test, expect } from "bun:test";
import { nodePos, edgePath, LEFT, TOP, COL_GAP } from "../src/core/pipeline-geometry";

test("nodePos places stages on fixed slots", () => {
  expect(nodePos("think")).toEqual({ x: LEFT, y: TOP });
  expect(nodePos("tool")).toEqual({ x: LEFT + COL_GAP, y: TOP });
  expect(nodePos("result")).toEqual({ x: LEFT + 2 * COL_GAP, y: TOP });
  expect(nodePos("chat")).toEqual({ x: LEFT + 3 * COL_GAP, y: TOP });
  expect(nodePos("skill").x).toBe(LEFT + COL_GAP);
  expect(nodePos("skill").y).toBeGreaterThan(TOP);
});

test("forward edge is a horizontal run on the spine row", () => {
  const cells = edgePath("think", "tool");
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.y === TOP)).toBe(true);
  expect(cells.every((c) => c.ch === "─")).toBe(true);
  expect(cells.every((c) => c.x > nodePos("think").x && c.x < nodePos("tool").x)).toBe(true);
});

test("backward edge dips below the spine (arc)", () => {
  const cells = edgePath("result", "think");
  expect(cells.some((c) => c.y > TOP)).toBe(true);
});

test("skill edge uses a vertical feeder at the skill column", () => {
  const cells = edgePath("skill", "tool");
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.x === nodePos("skill").x)).toBe(true);
  expect(cells.some((c) => c.ch === "│")).toBe(true);
});

test("self edge is empty", () => {
  expect(edgePath("tool", "tool")).toEqual([]);
});

test("tool→skill edge is a vertical feeder downward", () => {
  const cells = edgePath("tool", "skill");
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.x === nodePos("tool").x)).toBe(true);
  expect(cells.every((c) => c.ch === "│")).toBe(true);
  expect(cells.every((c) => c.y > TOP && c.y < nodePos("skill").y)).toBe(true);
});

test("think→chat forward edge spans multiple columns on the spine", () => {
  const cells = edgePath("think", "chat");
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.y === TOP)).toBe(true);
  expect(cells[0]!.x).toBeGreaterThan(nodePos("think").x);
  expect(cells[cells.length - 1]!.x).toBeLessThan(nodePos("chat").x);
});

test("skill→result edge combines feeder-up then forward spine", () => {
  const cells = edgePath("skill", "result");
  expect(cells.some((c) => c.y > TOP)).toBe(true);   // feeder-up portion
  expect(cells.some((c) => c.y === TOP)).toBe(true);  // spine portion
  expect(cells.some((c) => c.ch === "│")).toBe(true);
  expect(cells.some((c) => c.ch === "─")).toBe(true);
});
