import { afterEach, describe, expect, test } from "bun:test";
import { activeIconSet, ICONS_NERD, ICONS_UNICODE, iconFor } from "../src/ui/icons";

describe("activeIconSet", () => {
  const orig = process.env.CL_ICONS;
  afterEach(() => {
    if (orig === undefined) delete process.env.CL_ICONS;
    else process.env.CL_ICONS = orig;
  });

  test("defaults to nerd when CL_ICONS is unset", () => {
    delete process.env.CL_ICONS;
    expect(activeIconSet()).toBe("nerd");
  });

  test("returns unicode when CL_ICONS=unicode", () => {
    process.env.CL_ICONS = "unicode";
    expect(activeIconSet()).toBe("unicode");
  });
});

test("iconFor resolves the active set", () => {
  // default (no CL_ICONS) is the nerd set
  delete process.env.CL_ICONS;
  expect(iconFor("bash")).toBe(ICONS_NERD.bash);
  process.env.CL_ICONS = "unicode";
  expect(iconFor("bash")).toBe(ICONS_UNICODE.bash);
  delete process.env.CL_ICONS;
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
