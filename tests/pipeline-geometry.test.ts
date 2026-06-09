import { test, expect } from "bun:test";
import { coarseLayout, pipeForward, pipeElbow, pipeReturn, pipeBranch, expandStack, LEFT, TOP } from "../src/core/pipeline-geometry";
import type { PipeKind } from "../src/core/pipeline";

test("pipeForward is a horizontal run on the mid-row ending in an arrowhead at the target port", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 25, y: 1, w: 13, h: 3 };
  const cells = pipeForward(a, b);
  const my = a.y + (a.h >> 1);
  expect(cells.every((c) => c.y === my)).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
  expect(cells.slice(0, -1).every((c) => c.ch === "━")).toBe(true); // heavy run
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);
});

test("pipeReturn is a U below: corners + a left arrowhead on the channel row", () => {
  const a = { x: 48, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 1, w: 13, h: 3 };
  const channelY = a.y + a.h;
  const cells = pipeReturn(a, b, channelY);
  expect(cells.some((c) => c.ch === "╯")).toBe(true);
  expect(cells.some((c) => c.ch === "╰")).toBe(true);
  expect(cells.some((c) => c.ch === "◀")).toBe(true);
  expect(cells.some((c) => c.y === channelY)).toBe(true);
});

test("pipeReturn drops a connecting stem when the channel is below the card bottom", () => {
  const a = { x: 48, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 1, w: 13, h: 3 };
  const channelY = a.y + a.h + 2; // a real channel below the cards
  const cells = pipeReturn(a, b, channelY);
  const ax = a.x + (a.w >> 1);
  const bx = b.x + (b.w >> 1);
  // a vertical stem on the source side connecting the card bottom down to the channel
  expect(cells.some((c) => c.ch === "│" && c.x === ax && c.y === a.y + a.h)).toBe(true);
  // and a rising stem on the target side
  expect(cells.some((c) => c.ch === "│" && c.x === bx && c.y < channelY && c.y >= b.y + b.h)).toBe(true);
});

test("pipeBranch trunks from the parent and tees into each child", () => {
  const parent = { x: 25, y: 1, w: 13, h: 3 };
  const children = expandStack(parent, 3);
  const cells = pipeBranch(parent, children);
  expect(cells.some((c) => c.ch === "│")).toBe(true);
  expect(cells.filter((c) => c.ch === "├" || c.ch === "└").length).toBe(3);
  expect(cells.filter((c) => c.ch === "└").length).toBe(1);
});

test("expandStack stacks n single-row child rects below the parent", () => {
  const parent = { x: 25, y: 1, w: 13, h: 3 };
  const rects = expandStack(parent, 3);
  expect(rects.length).toBe(3);
  expect(rects.every((r) => r.h === 1)).toBe(true);
  expect(rects.every((r) => r.y >= parent.y + parent.h)).toBe(true);
  expect(rects[0]!.y).toBeLessThan(rects[1]!.y);
  expect(rects[1]!.y).toBeLessThan(rects[2]!.y);
});

test("coarseLayout spreads four cards across the width in flow order, non-overlapping", () => {
  const m = coarseLayout(160, TOP);
  const order = ["think", "tool", "result", "chat"].map((k) => m.get(k as PipeKind)!);
  for (let i = 1; i < order.length; i++) {
    expect(order[i]!.x).toBeGreaterThan(order[i - 1]!.x + order[i - 1]!.w);
    expect(order[i]!.y).toBe(TOP);
  }
  const last = order[3]!;
  expect(last.x + last.w).toBeLessThanOrEqual(160);
  expect(last.x + last.w).toBeGreaterThanOrEqual(160 - 4); // fills close to the full width
});

test("coarseLayout caps card width and pushes slack into the gaps", () => {
  const narrow = coarseLayout(80, TOP);
  const wide = coarseLayout(200, TOP);
  const gap = (m: Map<any, any>) => m.get("tool")!.x - (m.get("think")!.x + m.get("think")!.w);
  expect(wide.get("think")!.w).toBeLessThanOrEqual(18); // cardW capped
  expect(gap(wide)).toBeGreaterThan(gap(narrow)); // wider terminal => fatter gaps
});

test("coarseLayout places the skill card one row below, between tool and result", () => {
  const m = coarseLayout(200, TOP);
  const skill = m.get("skill")!, tool = m.get("tool")!, result = m.get("result")!;
  expect(skill.y).toBeGreaterThan(tool.y + tool.h);
  expect(skill.x).toBeGreaterThanOrEqual(tool.x + tool.w);
  expect(skill.x + skill.w).toBeLessThanOrEqual(result.x);
});

test("coarseLayout keeps the skill card from overlapping tool at narrow widths", () => {
  const m = coarseLayout(80, TOP);
  const skill = m.get("skill")!, tool = m.get("tool")!;
  expect(skill.x).toBeGreaterThanOrEqual(tool.x + tool.w);
});

test("pipeElbow routes down the parent's right edge then into the child's left port", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 40, y: 6, w: 13, h: 3 };
  const cells = pipeElbow(a, b);
  const by = b.y + (b.h >> 1); // child mid-row — the turn happens here
  expect(cells.some((c) => c.ch === "│" && c.x === a.x + a.w - 1)).toBe(true); // stem on a's right edge
  expect(cells.some((c) => c.ch === "╰" && c.x === a.x + a.w - 1 && c.y === by)).toBe(true); // corner on the turn-row
  expect(cells.filter((c) => c.ch === "─").every((c) => c.y === by)).toBe(true); // horizontal run on the turn-row
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);                            // arrow at b's left port
  expect(cells[cells.length - 1]!.y).toBe(by);                                // arrow on the turn-row
});

test("pipeElbow drops a left-trunk stem when the child sits directly below", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 9, w: 13, h: 3 };
  const cells = pipeElbow(a, b);
  const cx = a.x + 1; // left trunk, collinear with pipeBranch — clears left-aligned child labels
  expect(cells.every((c) => c.x === cx)).toBe(true);
  expect(cells[cells.length - 1]!.ch).toBe("▼");
  expect(cells[cells.length - 1]!.y).toBe(b.y);
});
