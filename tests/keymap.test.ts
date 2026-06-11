import { test, expect } from "bun:test";
import { mapKey, type Action } from "../src/ui/keymap";

function a(name: string, mods: Partial<{ shift: boolean; ctrl: boolean }> = {}): Action | null {
  return mapKey({ name, shift: !!mods.shift, ctrl: !!mods.ctrl });
}

test("timeline keys: arrows scrub + speed, space, replay", () => {
  expect(a("up")).toEqual({ type: "beat-back" });
  expect(a("down")).toEqual({ type: "beat-fwd" });
  expect(a("left")).toEqual({ type: "speed-down" });
  expect(a("right")).toEqual({ type: "speed-up" });
  expect(a("space")).toEqual({ type: "pause" });
  expect(a("r")).toEqual({ type: "replay" });
});

test("panels + misc", () => {
  expect(a("tab")).toEqual({ type: "panel-next" });
  expect(a("tab", { shift: true })).toEqual({ type: "panel-prev" });
  expect(a("i")).toEqual({ type: "info" });
  expect(a("?")).toEqual({ type: "help" });
  expect(a("q")).toEqual({ type: "quit" });
});

test("l maps to go-live", () => {
  expect(mapKey({ name: "l" })).toEqual({ type: "live" });
});

test("dropped keys are unmapped", () => {
  for (const k of ["j", "k", "h", "g", "G", "p", "w", "L", "R", "1", "5", "[", "]", "+", "-", "z", "home", "end"]) {
    expect(a(k)).toBeNull();
  }
});

test("error jump keys", () => {
  expect(a("e")).toEqual({ type: "error-next" });
  expect(a("e", { shift: true })).toEqual({ type: "error-prev" });
});
