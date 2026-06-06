import { test, expect } from "bun:test";
import { newSessionTokens } from "../src/core/types";

test("newSessionTokens returns a zeroed token record", () => {
  const t = newSessionTokens();
  expect(t.input).toBe(0);
  expect(t.contextPct).toBe(0);
  expect(t.webCalls).toBe(0);
});
