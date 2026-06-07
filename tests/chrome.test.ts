import { test, expect } from "bun:test";
import { PANELS, DEFAULT_PANEL } from "../src/core/types";
import { fuzzyScore } from "../src/core/chrome";

test("PANELS order: lens first, log last", () => {
  expect(PANELS).toEqual(["lens", "files", "tasks", "git", "log"]);
});

test("default panel is log until Lens body exists", () => {
  expect(DEFAULT_PANEL).toBe("log");
  expect(PANELS).toContain(DEFAULT_PANEL);
});

test("fuzzyScore: empty query scores 0 (matches anything)", () => {
  expect(fuzzyScore("", "git")).toBe(0);
});

test("fuzzyScore: non-subsequence returns null", () => {
  expect(fuzzyScore("xyz", "git")).toBeNull();
});

test("fuzzyScore: subsequence matches case-insensitively", () => {
  expect(fuzzyScore("GT", "git")).not.toBeNull();
  expect(fuzzyScore("git", "git")).not.toBeNull();
});

test("fuzzyScore: consecutive run beats scattered match", () => {
  const consec = fuzzyScore("ab", "abx")!;
  const gap = fuzzyScore("ab", "axb")!;
  expect(consec).toBeGreaterThan(gap);
});

test("fuzzyScore: word-start match scores higher than mid-word", () => {
  const start = fuzzyScore("s", "scope")!;     // s at index 0
  const mid = fuzzyScore("s", "discope")!;     // s at index 3, mid-word
  expect(start).toBeGreaterThan(mid);
});
