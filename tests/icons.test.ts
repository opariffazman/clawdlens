import { test, expect } from "bun:test";
import { iconFor, ICONS_UNICODE, ICONS_NERD } from "../src/ui/icons";

test("iconFor resolves the active set", () => {
  // default (no HF_ICONS) is the nerd set
  delete process.env.HF_ICONS;
  expect(iconFor("bash")).toBe(ICONS_NERD.bash);
  process.env.HF_ICONS = "unicode";
  expect(iconFor("bash")).toBe(ICONS_UNICODE.bash);
  delete process.env.HF_ICONS;
});

test("every IconKey has a glyph in both sets", () => {
  const keys = ["bash","edit","read","search","web","task","skill","thinking","text","todo","result","tool"] as const;
  for (const k of keys) {
    expect(typeof ICONS_UNICODE[k]).toBe("string");
    expect(ICONS_UNICODE[k].length).toBeGreaterThan(0);
    expect(typeof ICONS_NERD[k]).toBe("string");
    expect(ICONS_NERD[k].length).toBeGreaterThan(0);
  }
});

test("unknown key falls back to a dot", () => {
  // @ts-expect-error testing fallback
  expect(iconFor("nope")).toBe("·");
});
