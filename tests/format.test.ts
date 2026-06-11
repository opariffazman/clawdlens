import { test, expect } from "bun:test";
import { statusGlyph, gaugeBar, sparkline, truncate, fmtCost, fmtTokens, fmtDur } from "../src/ui/format";

test("statusGlyph maps status to glyph + color", () => {
  expect(statusGlyph("running").glyph).toBe("●");
  expect(statusGlyph("error").color).toBe("#FF5370");
  expect(statusGlyph("waiting").pulse).toBe(true);
});

test("gaugeBar fills proportionally", () => {
  expect(gaugeBar(0.5, 10)).toBe("▓▓▓▓▓░░░░░");
  expect(gaugeBar(0, 4)).toBe("░░░░");
  expect(gaugeBar(2, 4)).toBe("▓▓▓▓"); // clamps
});

test("sparkline maps values to blocks", () => {
  expect(sparkline([0, 1], 2)).toBe("▁█");
  expect(sparkline([], 3)).toBe("   ");
});

test("truncate adds ellipsis", () => {
  expect(truncate("hello world", 5)).toBe("hell…");
  expect(truncate("hi", 5)).toBe("hi");
});

test("fmt helpers", () => {
  expect(fmtCost(0.4239)).toBe("$0.42");
  expect(fmtTokens(38000, 200000)).toBe("38k/200k");
});
test("done gets a calm green check", () => {
  expect(statusGlyph("done")).toEqual({ glyph: "✓", color: "#5AF78E", pulse: false });
});

test("fmtDur scales ms→s→m", () => {
  expect(fmtDur(400)).toBe("0.4s");
  expect(fmtDur(2300)).toBe("2s");
  expect(fmtDur(59_400)).toBe("59s");
  expect(fmtDur(95_000)).toBe("1m35s");
});
