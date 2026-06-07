import { test, expect } from "bun:test";
import { PANELS, DEFAULT_PANEL } from "../src/core/types";
import { fuzzyScore, hintsFor, tabModel, tabBarCells, menuWindow } from "../src/core/chrome";

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

function at(cells: { x: number; row: number; ch: string }[], x: number, row: number) {
  return cells.find((c) => c.x === x && c.row === row)?.ch;
}

test("tabBarCells: row 1 is a bordered rule with frame corners", () => {
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "log"), 40);
  expect(at(cells, 0, 1)).toBe("╭");
  expect(at(cells, 39, 1)).toBe("╮");
  // a mid column with no active-tab opening is a horizontal rule
  expect(at(cells, 20, 1)).toBe("─");
});

test("tabBarCells: active tab punches an opening into row 1", () => {
  // active = Lens at far left; its notch starts at x=1
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "lens"), 40);
  expect(at(cells, 1, 0)).toBe("╭");          // notch top-left on row 0
  expect(at(cells, 1, 1)).toBe("┘");          // left junction on row 1
  // somewhere inside the Lens notch on row 1 is an opening (space)
  const openings = cells.filter((c) => c.row === 1 && c.ch === " ");
  expect(openings.length).toBeGreaterThan(0);
  // the active tab carries its label on row 0
  const row0 = cells.filter((c) => c.row === 0).sort((a, b) => a.x - b.x).map((c) => c.ch).join("");
  expect(row0).toContain("Lens");
});

test("tabBarCells: inactive labels render in order on row 0", () => {
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "lens"), 60);
  const row0 = cells.filter((c) => c.row === 0).sort((a, b) => a.x - b.x).map((c) => c.ch).join("");
  expect(row0.indexOf("Files")).toBeLessThan(row0.indexOf("Tasks"));
  expect(row0.indexOf("Tasks")).toBeLessThan(row0.indexOf("Git"));
  expect(row0.indexOf("Git")).toBeLessThan(row0.indexOf("Log"));
});

test("tabBarCells: every cell is within width", () => {
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "git"), 30);
  for (const c of cells) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(30); }
});

test("menuWindow: short list fits, no overflow", () => {
  const w = menuWindow(3, 0, 10);
  expect(w).toEqual({ start: 0, count: 3, selected: 0, more: 0 });
});

test("menuWindow: long list centers around index and reports more", () => {
  const w = menuWindow(100, 50, 10);
  expect(w.count).toBe(10);
  expect(w.start).toBeLessThanOrEqual(50);
  expect(w.start + w.count).toBeGreaterThan(50);
  expect(w.selected).toBe(50 - w.start);
  expect(w.more).toBe(100 - (w.start + w.count));
});

test("menuWindow: clamps at the end", () => {
  const w = menuWindow(100, 99, 10);
  expect(w.start).toBe(90);
  expect(w.count).toBe(10);
  expect(w.more).toBe(0);
});

test("tabBarCells: a tab whose last cell is the final column still renders", () => {
  // single active "Log": notch occupies x=1..7, last col 7 == width-1 of 8
  const cells = tabBarCells(tabModel(["log"], "log"), 8);
  const row0 = cells.filter((c) => c.row === 0).map((c) => c.ch).join("");
  expect(row0).toContain("Log");
  for (const c of cells) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(8); }
});

test("menuWindow: clamps selected for out-of-range index", () => {
  expect(menuWindow(5, -1, 3).selected).toBe(0);            // negative
  const oob = menuWindow(5, 10, 3);                         // beyond end
  expect(oob.selected).toBeGreaterThanOrEqual(0);
  expect(oob.selected).toBeLessThan(oob.count);
  const empty = menuWindow(0, 0, 3);                        // empty list
  expect(empty).toEqual({ start: 0, count: 0, selected: 0, more: 0 });
});
