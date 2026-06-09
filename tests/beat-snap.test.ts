import { test, expect } from "bun:test";
import { newSession, applyEntry } from "../src/core/reducer";
import { parseLine } from "../src/core/parse";
import type { SessionState } from "../src/core/types";

function fold(lines: string[]): SessionState {
  let s = newSession("x", "x.jsonl");
  for (const raw of lines) { const e = parseLine(raw); if (e) s = applyEntry(s, e, 0); }
  return s;
}

test("pushBeat stamps each beat with cumulative cost+ctx as of that beat", () => {
  const lines = [
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 100000, output_tokens: 1000 }, content: [{ type: "text", text: "first" }] } }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 200000, output_tokens: 2000 }, content: [{ type: "text", text: "second" }] } }),
  ];
  const s = fold(lines);
  expect(s.beats.length).toBe(2);
  const a = s.beats[0]!.snap!, b = s.beats[1]!.snap!;
  expect(a.cost).toBeGreaterThan(0);
  expect(b.cost).toBeGreaterThan(a.cost);
  expect(a.ctxTokens).toBe(100000);
  expect(b.ctxTokens).toBe(200000);
  expect(b.cost).toBe(s.costUSD);
  expect(b.ctxTokens).toBe(s.tokens.contextTokens);
});
