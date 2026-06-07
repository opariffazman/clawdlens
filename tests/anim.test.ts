import { test, expect } from "bun:test";
import { spinnerFrame, pulseIntensity, lerpHex, pulsePhase } from "../src/ui/anim";

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
