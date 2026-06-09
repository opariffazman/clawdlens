import { test, expect } from "bun:test";
import { cursorSnapshot, headerValues } from "../src/ui/headerReveal";
import { newSession, applyEntry } from "../src/core/reducer";
import { parseLine } from "../src/core/parse";
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
test("cursorSnapshot at the head returns null so the header shows authoritative totals", () => {
  const beats = [beat(5, 50), beat(12, 120)];
  expect(cursorSnapshot(beats, 2)).toBe(null); // at head -> caller (headerValues) shows session totals
});
test("cursorSnapshot returns null when there are no beats", () => {
  expect(cursorSnapshot([], 0)).toBe(null);
});
test("cursorSnapshot returns null for a snapshot-less beat below the head", () => {
  const noSnap: Beat = { id: "x", ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1 };
  expect(cursorSnapshot([noSnap, beat(9, 90)], 1)).toBe(null); // cursor 1 < len 2 -> beats[0] has no snap
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

test("at the head the header shows session totals even when a trailing usage entry produced no beat", () => {
  // entry 1: usage + text -> a beat (snap stamped). entry 2: usage but empty content -> NO beat.
  // session.costUSD includes BOTH; the last beat's snap lags. At the head cursorSnapshot must
  // return null so headerValues falls back to the correct session totals.
  let s = newSession("x", "x.jsonl");
  for (const raw of [
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 50000, output_tokens: 500 }, content: [{ type: "text", text: "hi" }] } }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 150000, output_tokens: 1500 }, content: [] } }),
  ]) { const e = parseLine(raw); if (e) s = applyEntry(s, e, 0); }

  expect(s.beats.length).toBe(1);                          // only entry 1 produced a beat
  expect(s.beats[0]!.snap!.cost).toBeLessThan(s.costUSD);  // the last beat's snap lags the total

  const snap = cursorSnapshot(s.beats, s.beats.length);
  expect(snap).toBe(null);                                 // at head -> null
  expect(headerValues(s, snap).cost).toBe(s.costUSD);      // header shows the correct total, not stale snap
});
