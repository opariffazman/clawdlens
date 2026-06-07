import { afterEach, describe, expect, test } from "bun:test";
import { activeIconSet } from "../src/ui/icons";

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
