import { test, expect } from "bun:test";
import { slotOf, nodeKindOf, rankOf } from "../src/core/pipeline";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: "b", ts: 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: "L", count: 1, lane: "main", ...p };
}

test("slotOf returns fixed coarse slots", () => {
  expect(slotOf("think")).toEqual({ col: 0, row: 0 });
  expect(slotOf("tool")).toEqual({ col: 1, row: 0 });
  expect(slotOf("skill")).toEqual({ col: 1, row: 1 });
  expect(slotOf("result")).toEqual({ col: 2, row: 0 });
  expect(slotOf("chat")).toEqual({ col: 3, row: 0 });
});

test("nodeKindOf: coarse maps BeatKind; fine explodes tool to its iconKey", () => {
  expect(nodeKindOf(beat({ kind: "thinking" }), "coarse")).toBe("think");
  expect(nodeKindOf(beat({ kind: "text" }), "coarse")).toBe("chat");
  expect(nodeKindOf(beat({ kind: "skill" }), "coarse")).toBe("skill");
  expect(nodeKindOf(beat({ kind: "tool", iconKey: "bash" }), "coarse")).toBe("tool");
  expect(nodeKindOf(beat({ kind: "tool", iconKey: "bash" }), "fine")).toBe("bash");
  expect(nodeKindOf(beat({ kind: "tool", iconKey: "edit" }), "fine")).toBe("edit");
  expect(nodeKindOf(beat({ kind: "thinking" }), "fine")).toBe("think");
  expect(nodeKindOf(beat({ kind: "wait" }), "coarse")).toBeNull();
  expect(nodeKindOf(beat({ kind: "phase" }), "coarse")).toBeNull();
});

test("rankOf: think < tool-actions < skill < result < chat", () => {
  expect(rankOf("think")).toBeLessThan(rankOf("bash"));
  expect(rankOf("bash")).toBeLessThan(rankOf("result"));
  expect(rankOf("skill")).toBeLessThan(rankOf("result"));
  expect(rankOf("result")).toBeLessThan(rankOf("chat"));
  expect(rankOf("notanode")).toBe(99);
});
