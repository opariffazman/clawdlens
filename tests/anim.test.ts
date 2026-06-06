import { test, expect } from "bun:test";
import { spinnerFrame, pulseIntensity, lerpHex } from "../src/ui/anim";

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
