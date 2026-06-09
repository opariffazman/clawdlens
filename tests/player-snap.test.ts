import { test, expect } from "bun:test";
import { createPlayer } from "../src/core/player";
import type { Beat } from "../src/core/types";

function beat(id: string, cost: number, ctxTokens: number): Beat {
  return { id, ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1, snap: { cost, ctxTokens } };
}

test("rebuild keeps the LATER snapshot when coalescing adjacent beats", () => {
  const p = createPlayer();
  p.setBeats([beat("a", 1, 100), beat("b", 2, 200)]); // same kind/label/lane -> merge
  const all = p.all();
  expect(all.length).toBe(1);
  expect(all[0]!.count).toBe(2);
  expect(all[0]!.snap!.cost).toBe(2);        // later snap wins (cumulative at the later point)
  expect(all[0]!.snap!.ctxTokens).toBe(200);
});

test("rebuild preserves snapshots on beats that do not merge", () => {
  const p = createPlayer();
  const think: Beat = { ...beat("b", 2, 200), kind: "thinking", label: "thinking" };
  p.setBeats([beat("a", 1, 100), think]); // different kind/label -> no merge
  const all = p.all();
  expect(all.length).toBe(2);
  expect(all[0]!.snap!.cost).toBe(1);
  expect(all[1]!.snap!.cost).toBe(2);
});
