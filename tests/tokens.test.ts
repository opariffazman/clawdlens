import { test, expect } from "bun:test";
import { contextLimit, effectiveContextLimit, contextTokens, addUsage, estimateCostUSD } from "../src/core/tokens";

test("context limit: 1m variants vs default", () => {
  expect(contextLimit("claude-opus-4-8")).toBe(200_000);
  expect(contextLimit("claude-opus-4-8[1m]")).toBe(1_000_000);
});

test("effectiveContextLimit infers 1M when observed context exceeds the standard window", () => {
  expect(effectiveContextLimit("claude-opus-4-8", 50_000)).toBe(200_000);
  expect(effectiveContextLimit("claude-opus-4-8", 472_000)).toBe(1_000_000); // would have read 236%
  expect(effectiveContextLimit("claude-opus-4-8[1m]", 50_000)).toBe(1_000_000);
});

test("contextTokens sums input + cache read + cache create", () => {
  expect(contextTokens({ input_tokens: 2, cache_read_input_tokens: 49566, cache_creation_input_tokens: 1337 })).toBe(50905);
  expect(contextTokens(undefined)).toBe(0);
});

test("addUsage accumulates", () => {
  const a = addUsage({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }, { input_tokens: 2, output_tokens: 515 });
  expect(a.input).toBe(2);
  expect(a.output).toBe(515);
});

test("estimateCostUSD uses model price (opus default)", () => {
  const cost = estimateCostUSD({ input: 1_000_000, output: 0, cacheRead: 0, cacheCreate: 0 }, "claude-opus-4-8");
  expect(cost).toBeCloseTo(15, 5);
});
