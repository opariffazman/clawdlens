import { test, expect } from "bun:test";
import { parseLine } from "../src/core/parse";

test("parses a valid assistant line", () => {
  const raw = JSON.stringify({ type: "assistant", sessionId: "s1", message: { model: "claude-opus-4-8" } });
  const e = parseLine(raw);
  expect(e?.type).toBe("assistant");
  expect(e?.message?.model).toBe("claude-opus-4-8");
});

test("returns null for blank and malformed lines", () => {
  expect(parseLine("")).toBeNull();
  expect(parseLine("   ")).toBeNull();
  expect(parseLine("{not json")).toBeNull();
  expect(parseLine(JSON.stringify({ noType: true }))).toBeNull();
});
