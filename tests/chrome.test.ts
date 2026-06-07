import { test, expect } from "bun:test";
import { PANELS, DEFAULT_PANEL } from "../src/core/types";
import { fuzzyScore, hintsFor, tabModel } from "../src/core/chrome";

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

test("hintsFor: every panel includes the command + quit globals", () => {
  for (const p of ["lens", "files", "tasks", "git", "log"] as const) {
    const keys = hintsFor(p).map((h) => h.key);
    expect(keys).toContain(":");
    expect(keys).toContain("q");
  }
});

test("hintsFor: panel-specific hints appear", () => {
  expect(hintsFor("files").map((h) => h.label)).toContain("sort");
  expect(hintsFor("tasks").map((h) => h.label)).toContain("hide done");
  expect(hintsFor("git").map((h) => h.label)).toContain("scope");
});

test("tabModel: preserves order and marks the active tab", () => {
  const segs = tabModel(["lens", "files", "tasks", "git", "log"], "git");
  expect(segs.map((s) => s.id)).toEqual(["lens", "files", "tasks", "git", "log"]);
  expect(segs.map((s) => s.label)).toEqual(["Lens", "Files", "Tasks", "Git", "Log"]);
  expect(segs.find((s) => s.active)!.id).toBe("git");
  expect(segs.filter((s) => s.active)).toHaveLength(1);
});
