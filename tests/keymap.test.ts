import { test, expect } from "bun:test";
import { mapKey, type Action } from "../src/ui/keymap";

function a(name: string, mods: Partial<{ shift: boolean; ctrl: boolean }> = {}): Action | null {
  return mapKey({ name, shift: !!mods.shift, ctrl: !!mods.ctrl });
}

test("navigation keys", () => {
  expect(a("j")).toEqual({ type: "sess-down" });
  expect(a("up")).toEqual({ type: "sess-up" });
  expect(a("3")).toEqual({ type: "jump", n: 3 });
  expect(a("tab")).toEqual({ type: "panel-next" });
  expect(a("tab", { shift: true })).toEqual({ type: "panel-prev" });
});

test("timeline + playback keys", () => {
  expect(a("h")).toEqual({ type: "beat-back" });
  expect(a("left")).toEqual({ type: "beat-back" });
  expect(a("G")).toEqual({ type: "to-live" });
  expect(a("g")).toEqual({ type: "to-start" });
  expect(a("space")).toEqual({ type: "pause" });
  expect(a("+")).toEqual({ type: "speed-up" });
  expect(a("p")).toEqual({ type: "pulse" });
});

test("unmapped returns null", () => {
  expect(a("z")).toBeNull();
});

test("replay and loop keys", () => {
  expect(a("R")).toEqual({ type: "replay" });
  expect(a("r", { shift: true })).toEqual({ type: "replay" });
  expect(a("L")).toEqual({ type: "loop" });
  expect(a("l", { shift: true })).toEqual({ type: "loop" });
});
