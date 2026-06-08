import { test, expect } from "bun:test";
import { mergeHeaderSession } from "../src/ui/headerSession";
import { newSession } from "../src/core/reducer";
import type { SessionState } from "../src/core/types";

function sess(over: Partial<SessionState>): SessionState {
  return { ...newSession("x", "x.jsonl"), ...over };
}

test("mergeHeaderSession takes cost+startedTs from full, status+ctx from live", () => {
  const live = sess({
    status: "running", costUSD: 12, startedTs: 5000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.7, contextTokens: 700000 },
  });
  const full = sess({
    status: "idle", costUSD: 511, startedTs: 1000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.1, contextTokens: 100 },
  });

  const m = mergeHeaderSession(live, full)!;
  expect(m.costUSD).toBe(511);             // cumulative -> from full
  expect(m.startedTs).toBe(1000);          // whole-session start -> from full
  expect(m.status).toBe("running");        // live (full fold never derives status)
  expect(m.tokens.contextPct).toBe(0.7);   // live (absolute, already correct)
  expect(m.tokens.contextTokens).toBe(700000);
});

test("mergeHeaderSession passes the live session through when full is null", () => {
  const live = sess({ costUSD: 12 });
  expect(mergeHeaderSession(live, null)).toBe(live); // not yet folded -> live unchanged
});

test("mergeHeaderSession returns null when there is no live session", () => {
  expect(mergeHeaderSession(null, sess({ costUSD: 511 }))).toBe(null);
});

test("mergeHeaderSession keeps live.startedTs when full.startedTs is 0", () => {
  const live = sess({ startedTs: 5000 });
  const full = sess({ startedTs: 0, costUSD: 99 });
  const m = mergeHeaderSession(live, full)!;
  expect(m.startedTs).toBe(5000); // empty fold -> keep the live start
  expect(m.costUSD).toBe(99);     // cost still grafted from full
});

test("mergeHeaderSession keeps live.costUSD when full.costUSD is 0 (failed/empty fold)", () => {
  const live = sess({ costUSD: 12, startedTs: 5000 });
  const full = sess({ costUSD: 0, startedTs: 0 });
  const m = mergeHeaderSession(live, full)!;
  expect(m.costUSD).toBe(12);    // empty fold -> keep the live cost, never blank it to $0
  expect(m.startedTs).toBe(5000); // same empty-fold fallback for startedTs
});
