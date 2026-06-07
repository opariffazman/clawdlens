import { test, expect } from "bun:test";
import { spinnerFrame, pulseIntensity, lerpHex, pulsePhase, cometColor, breathe } from "../src/ui/anim";

test("spinnerFrame cycles", () => {
  const a = spinnerFrame(0);
  const b = spinnerFrame(1);
  expect(typeof a).toBe("string");
  expect(a).not.toBe(b);
  expect(spinnerFrame(0)).toBe(spinnerFrame(100 * 1)); // wraps by length
});

test("pulseIntensity is 1 at head, fades to 0 past the tail", () => {
  expect(pulseIntensity(0, 4)).toBeCloseTo(1, 5);
  expect(pulseIntensity(4, 4)).toBeCloseTo(0, 5);
  expect(pulseIntensity(10, 4)).toBe(0);
});

test("lerpHex blends endpoints", () => {
  expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
  expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
});

test("pulsePhase ramps 0→1 across one interval and clamps past it", () => {
  expect(pulsePhase(1000, 1000, 200)).toBeCloseTo(0, 5);   // just advanced
  expect(pulsePhase(1100, 1000, 200)).toBeCloseTo(0.5, 5); // halfway
  expect(pulsePhase(1200, 1000, 200)).toBeCloseTo(1, 5);   // arrived
  expect(pulsePhase(9999, 1000, 200)).toBe(1);             // clamps past the end
});

test("pulsePhase parks at 1 before the first advance or with a bad interval", () => {
  expect(pulsePhase(500, -1, 200)).toBe(1);  // lastAdvanceMs < 0
  expect(pulsePhase(500, 1000, 0)).toBe(1);  // intervalMs <= 0
});

test("cometColor: hot head, dim tail-end, floor preserved", () => {
  const lane = "#00E5FF", hot = "#F2FBFF", dim = "#2E3440";
  expect(cometColor(0, 7, lane, hot, dim)).toBe("#f2fbff");          // head (d=0) → hot
  expect(cometColor(7, 7, lane, hot, dim)).toBe(dim);                // past tail, no floor → dimHex unchanged
  expect(cometColor(7, 7, lane, hot, dim, 0.4)).toBe(lerpHex(dim, lane, 0.4)); // floor → resting lane tint
  // mid-body cell (0 < d < tail): brighter than dim, not as hot as the head
  const mid = cometColor(3, 7, lane, hot, dim);
  expect(mid).not.toBe(dim);
  expect(mid).not.toBe("#f2fbff");
});

test("breathe stays within [0.6,1] and repeats by period", () => {
  // 1350ms = 3/4 period → sin=-1 → the exact minimum (0.6); 450ms → sin=1 → max (1.0)
  for (const t of [0, 200, 450, 900, 1350, 1800]) {
    const v = breathe(t, 1800);
    expect(v).toBeGreaterThanOrEqual(0.6 - 1e-9);
    expect(v).toBeLessThanOrEqual(1 + 1e-9);
  }
  expect(breathe(1350, 1800)).toBeCloseTo(0.6, 5); // hits the true minimum
  expect(breathe(450, 1800)).toBeCloseTo(1.0, 5);  // hits the true maximum
  expect(breathe(450, 1800)).toBeCloseTo(breathe(2250, 1800), 5); // periodic at a non-trivial point
});
