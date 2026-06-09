import { test, expect } from "bun:test";
import { mergeHeaderSession } from "../src/ui/headerSession";
import { newSession } from "../src/core/reducer";
import type { SessionState } from "../src/core/types";

function sess(over: Partial<SessionState>): SessionState {
  return { ...newSession("x", "x.jsonl"), ...over };
}

test("mergeHeaderSession takes cost+startedTs+ctx+model from full, status from live", () => {
  const live = sess({
    status: "running", model: "claude-sonnet-4-6", costUSD: 12, startedTs: 5000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.7, contextTokens: 700000 },
  });
  const full = sess({
    status: "idle", model: "claude-opus-4-8", costUSD: 511, startedTs: 1000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.42, contextTokens: 420000 },
  });

  const m = mergeHeaderSession(live, full)!;
  expect(m.costUSD).toBe(511);              // cumulative -> from full
  expect(m.startedTs).toBe(1000);           // whole-session start -> from full
  expect(m.tokens.contextPct).toBe(0.42);   // ctx -> from full (whole-transcript last usage)
  expect(m.tokens.contextTokens).toBe(420000);
  expect(m.model).toBe("claude-opus-4-8");  // model -> from full
  expect(m.status).toBe("running");         // status -> from live (full fold never derives it)
});

test("mergeHeaderSession recovers ctx% the backfill window dropped (crowded tail)", () => {
  // The 64 KB tail was all metadata, so the live window saw no usage entry:
  // contextTokens/contextPct stayed 0. The full fold recovers them.
  const live = sess({
    model: "", costUSD: 0, startedTs: 0,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0, contextTokens: 0 },
  });
  const full = sess({
    model: "claude-opus-4-8", costUSD: 254.45, startedTs: 1000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.39, contextTokens: 183000 },
  });
  const m = mergeHeaderSession(live, full)!;
  expect(m.tokens.contextPct).toBe(0.39);     // recovered, not 0
  expect(m.tokens.contextTokens).toBe(183000);
  expect(m.costUSD).toBe(254.45);
  expect(m.model).toBe("claude-opus-4-8");    // model recovered, not blank
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

test("mergeHeaderSession keeps live cost+ctx when the full fold is empty (read failure)", () => {
  // loadSession swallows a read error and returns a zero SessionState. None of
  // its zero fields must clobber a live session that already has real values.
  const live = sess({
    model: "claude-opus-4-8", costUSD: 12, startedTs: 5000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.5, contextTokens: 500000 },
  });
  const full = sess({ model: "", costUSD: 0, startedTs: 0 }); // contextTokens defaults to 0
  const m = mergeHeaderSession(live, full)!;
  expect(m.costUSD).toBe(12);                   // keep live, never blank to $0
  expect(m.startedTs).toBe(5000);
  expect(m.tokens.contextPct).toBe(0.5);        // keep live ctx, never blank to 0%
  expect(m.tokens.contextTokens).toBe(500000);
  expect(m.model).toBe("claude-opus-4-8");      // keep live model, never blank it
});
