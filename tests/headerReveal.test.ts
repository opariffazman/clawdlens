import { test, expect } from "bun:test";
import { cursorSnapshot, headerValues } from "../src/ui/headerReveal";
import { newSession } from "../src/core/reducer";
import type { Beat, SessionState } from "../src/core/types";

function beat(cost: number, ctxTokens: number): Beat {
  return { id: `${cost}`, ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1, snap: { cost, ctxTokens } };
}
function sess(over: Partial<SessionState>): SessionState {
  return { ...newSession("x", "x.jsonl"), ...over };
}

test("cursorSnapshot returns zeros at the start of the reveal", () => {
  expect(cursorSnapshot([beat(5, 50)], 0)).toEqual({ cost: 0, ctxTokens: 0 });
});
test("cursorSnapshot returns the snapshot at the cursor (beats[cursor-1])", () => {
  const beats = [beat(5, 50), beat(9, 90), beat(12, 120)];
  expect(cursorSnapshot(beats, 2)).toEqual({ cost: 9, ctxTokens: 90 });
});
test("cursorSnapshot at the head returns the final snapshot (totals)", () => {
  const beats = [beat(5, 50), beat(12, 120)];
  expect(cursorSnapshot(beats, 2)).toEqual({ cost: 12, ctxTokens: 120 });
});
test("cursorSnapshot returns null when there are no beats", () => {
  expect(cursorSnapshot([], 0)).toBe(null);
});
test("cursorSnapshot returns null for a snapshot-less beat", () => {
  const b: Beat = { id: "x", ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1 };
  expect(cursorSnapshot([b], 1)).toBe(null);
});

test("headerValues without reveal shows the session totals", () => {
  const s = sess({ model: "claude-opus-4-8", costUSD: 511, tokens: { ...newSession("x", "x.jsonl").tokens, contextTokens: 700000, contextPct: 0.7 } });
  const v = headerValues(s, null);
  expect(v.cost).toBe(511);
  expect(v.ctxTokens).toBe(700000);
  expect(v.pct).toBe(0.7);
});
test("headerValues with reveal animates cost+ctx against the STABLE final limit", () => {
  const s = sess({ model: "claude-opus-4-8", costUSD: 986, tokens: { ...newSession("x", "x.jsonl").tokens, contextTokens: 940000, contextPct: 0.94 } });
  const v = headerValues(s, { cost: 100, ctxTokens: 150000 });
  expect(v.limit).toBe(1_000_000);     // stable: derived from final 940k, not the reveal ctx
  expect(v.cost).toBe(100);            // animated
  expect(v.ctxTokens).toBe(150000);    // animated
  expect(v.pct).toBeCloseTo(0.15, 5);  // 150k / 1M, NOT 150k / 200k
});
