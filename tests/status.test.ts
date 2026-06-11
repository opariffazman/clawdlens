import { test, expect } from "bun:test";
import { deriveStatus, type StatusInput } from "../src/core/status";

const base: StatusInput = {
  lastEntryType: "assistant", lastStopReason: null, lastBlockKind: "text",
  pendingToolResult: false, lastErrored: false, ageMs: 0,
};

test("error wins", () => {
  expect(deriveStatus({ ...base, lastErrored: true })).toBe("error");
});
test("waiting on end_turn", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn" })).toBe("waiting");
});
test("running when a tool result is pending and fresh", () => {
  expect(deriveStatus({ ...base, pendingToolResult: true, ageMs: 1000 })).toBe("running");
});
test("working when fresh", () => {
  expect(deriveStatus({ ...base, ageMs: 2000 })).toBe("working");
});
test("idle when stale", () => {
  expect(deriveStatus({ ...base, ageMs: 120_000 })).toBe("idle");
});
test("dormant when very stale (even if end_turn)", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 40 * 60_000 })).toBe("dormant");
});
test("done after 30s quiet following end_turn", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 31_000 })).toBe("done");
});
test("still waiting just after end_turn", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 29_000 })).toBe("waiting");
});
test("mid-run stall without end_turn never reads done", () => {
  expect(deriveStatus({ ...base, ageMs: 31_000 })).toBe("working"); // existing fallthrough path
});
test("done yields to dormant when very stale", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 31 * 60_000 })).toBe("dormant");
});
