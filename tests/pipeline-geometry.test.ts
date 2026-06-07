import { test, expect } from "bun:test";
import { coarseCardRect, fineCardLayout, cardWire, CARD_W, LEFT, TOP } from "../src/core/pipeline-geometry";

test("coarseCardRect places cards on fixed slots", () => {
  const think = coarseCardRect("think");
  const tool = coarseCardRect("tool");
  expect(think.x).toBe(LEFT);
  expect(think.y).toBe(TOP);
  expect(tool.x).toBeGreaterThan(think.x);
  expect(coarseCardRect("result").x).toBeGreaterThan(tool.x);
  expect(coarseCardRect("skill").y).toBeGreaterThan(think.y);
});

test("fineCardLayout orders by rank and wraps at width", () => {
  const wide = fineCardLayout(["chat", "bash", "think"], 200);
  expect(wide.get("think")!.x).toBeLessThan(wide.get("bash")!.x);
  expect(wide.get("bash")!.x).toBeLessThan(wide.get("chat")!.x);
  expect(wide.get("think")!.y).toBe(wide.get("chat")!.y);

  const narrow = fineCardLayout(["think", "bash", "edit", "read", "web"], CARD_W + 5);
  const ys = [...narrow.values()].map((r) => r.y);
  expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys));
});

test("cardWire same-row forward is a horizontal run between card edges", () => {
  const a = coarseCardRect("think");
  const b = coarseCardRect("tool");
  const cells = cardWire(a, b);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.y === a.y + (a.h >> 1))).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
});

test("cardWire different-row produces a connected L-path", () => {
  const a = coarseCardRect("tool");
  const b = coarseCardRect("skill");
  const cells = cardWire(a, b);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.some((c) => c.y > a.y + a.h - 1)).toBe(true);
});
