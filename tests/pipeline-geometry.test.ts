import { test, expect } from "bun:test";
import { coarseCardRect, pipeForward, pipeReturn, pipeBranch, expandStack, LEFT, TOP } from "../src/core/pipeline-geometry";

test("coarseCardRect places cards on fixed slots", () => {
  const think = coarseCardRect("think");
  const tool = coarseCardRect("tool");
  expect(think.x).toBe(LEFT);
  expect(think.y).toBe(TOP);
  expect(tool.x).toBeGreaterThan(think.x);
  expect(coarseCardRect("result").x).toBeGreaterThan(tool.x);
  expect(coarseCardRect("skill").y).toBeGreaterThan(think.y);
});

test("pipeForward is a horizontal run on the mid-row ending in an arrowhead at the target port", () => {
  const a = coarseCardRect("think");
  const b = coarseCardRect("tool");
  const cells = pipeForward(a, b);
  const my = a.y + (a.h >> 1);
  expect(cells.every((c) => c.y === my)).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);
});

test("pipeReturn is a U below: corners + a left arrowhead on the channel row", () => {
  const a = coarseCardRect("result");
  const b = coarseCardRect("think");
  const channelY = a.y + a.h;
  const cells = pipeReturn(a, b, channelY);
  expect(cells.some((c) => c.ch === "╯")).toBe(true);
  expect(cells.some((c) => c.ch === "╰")).toBe(true);
  expect(cells.some((c) => c.ch === "◀")).toBe(true);
  expect(cells.some((c) => c.y === channelY)).toBe(true);
});

test("pipeBranch trunks from the parent and tees into each child", () => {
  const parent = coarseCardRect("tool");
  const children = expandStack(parent, 3);
  const cells = pipeBranch(parent, children);
  expect(cells.some((c) => c.ch === "│")).toBe(true);
  expect(cells.filter((c) => c.ch === "├" || c.ch === "└").length).toBe(3);
  expect(cells.filter((c) => c.ch === "└").length).toBe(1);
});

test("expandStack stacks n single-row child rects below the parent", () => {
  const parent = coarseCardRect("tool");
  const rects = expandStack(parent, 3);
  expect(rects.length).toBe(3);
  expect(rects.every((r) => r.h === 1)).toBe(true);
  expect(rects.every((r) => r.y >= parent.y + parent.h)).toBe(true);
  expect(rects[0]!.y).toBeLessThan(rects[1]!.y);
  expect(rects[1]!.y).toBeLessThan(rects[2]!.y);
});
