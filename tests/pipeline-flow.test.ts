import { test, expect } from "bun:test";
import { deriveFlow } from "../src/core/pipeline-flow";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p };
}

test("active stage = head; a completed tool advances to result", () => {
  const f = deriveFlow([beat({ kind: "thinking" }), beat({ kind: "tool", ok: true })], 2, 3);
  expect(f.main.activeKind).toBe("result");
  expect(f.main.trail).toEqual(["think", "tool", "result"]);
  expect(f.main.errored).toBe(false);
});

test("a running tool (ok undefined) stays at tool", () => {
  const f = deriveFlow([beat({ kind: "tool" })], 1, 3);
  expect(f.main.activeKind).toBe("tool");
});

test("a failed tool flags errored at result", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: false })], 1, 3);
  expect(f.main.activeKind).toBe("result");
  expect(f.main.errored).toBe(true);
});

test("trail keeps the last K distinct stages", () => {
  const f = deriveFlow([
    beat({ kind: "thinking" }), beat({ kind: "thinking" }), beat({ kind: "text" }),
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
  ], 5, 3);
  expect(f.main.trail).toEqual(["chat", "think", "tool"]);
});

test("revealed window respects cursor", () => {
  const f = deriveFlow([beat({ kind: "thinking" }), beat({ kind: "tool" })], 1, 3);
  expect(f.main.activeKind).toBe("think");
});

test("milestone is surfaced from the head beat", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: true, milestone: "commit" })], 1, 3);
  expect(f.main.milestone).toBe("commit");
});

test("an open subagent lane appears with label + agentsLive", () => {
  const f = deriveFlow([
    beat({ id: "t", kind: "tool", label: "Task · code-reviewer", toolUseId: "T1" }), // ok undefined => open
    beat({ id: "s", kind: "thinking", lane: "T1" }),
  ], 2, 3);
  expect(f.agentsLive).toBe(1);
  expect(f.subLanes[0]!.lane).toBe("T1");
  expect(f.subLanes[0]!.label).toBe("code-reviewer");
  expect(f.subLanes[0]!.activeKind).toBe("think");
});

test("a closed subagent lane is omitted", () => {
  const f = deriveFlow([
    beat({ id: "t", kind: "tool", label: "Task · x", toolUseId: "T1", ok: true }), // closed
    beat({ id: "s", kind: "thinking", lane: "T1" }),
  ], 2, 3);
  expect(f.agentsLive).toBe(0);
  expect(f.subLanes).toEqual([]);
});

test("actionIcon is head iconKey when activeKind is not result", () => {
  const f = deriveFlow([beat({ kind: "thinking", iconKey: "thinking" })], 1, 3);
  expect(f.main.actionIcon).toBe("thinking");
});

test("actionIcon is 'result' when activeKind is result", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: true, iconKey: "bash" })], 1, 3);
  expect(f.main.activeKind).toBe("result");
  expect(f.main.actionIcon).toBe("result");
});

test("detail falls back to label when detail is absent", () => {
  const f = deriveFlow([beat({ kind: "text", label: "my-label" })], 1, 3);
  expect(f.main.detail).toBe("my-label");
});

test("detail prefers beat detail over label", () => {
  const f = deriveFlow([beat({ kind: "text", label: "L", detail: "the detail" })], 1, 3);
  expect(f.main.detail).toBe("the detail");
});

test("live counts climb with the cursor (coarse)", () => {
  const beats = [beat({ kind: "thinking" }), beat({ kind: "tool", ok: true }), beat({ kind: "thinking" })];
  expect(deriveFlow(beats, 1, 3).main.counts["think"]).toBe(1);
  const f = deriveFlow(beats, 3, 3).main;
  expect(f.counts["think"]).toBe(2);
  expect(f.counts["tool"]).toBe(1);
  expect(f.counts["result"]).toBe(1);
});

test("ok/err tally live from completed tools", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: true }), beat({ kind: "tool", ok: false })], 2, 3).main;
  expect(f.ok).toBe(1);
  expect(f.err).toBe(1);
});

test("fine grain splits tool counts by action; coarse lumps them", () => {
  const beats = [beat({ kind: "tool", iconKey: "bash", ok: true }), beat({ kind: "tool", iconKey: "edit", ok: true })];
  const fine = deriveFlow(beats, 2, 5, "fine").main;
  expect(fine.counts["bash"]).toBe(1);
  expect(fine.counts["edit"]).toBe(1);
  expect(fine.counts["tool"]).toBeUndefined();
  expect(fine.activeKind).toBe("result");
  const coarse = deriveFlow(beats, 2, 5, "coarse").main;
  expect(coarse.counts["tool"]).toBe(2);
});

test("toolBreakdown counts tool beats by iconKey, cursor-synced", () => {
  const beats = [
    beat({ kind: "tool", iconKey: "bash", ok: true }),
    beat({ kind: "tool", iconKey: "edit", ok: true }),
    beat({ kind: "tool", iconKey: "bash", ok: true }),
    beat({ kind: "thinking" }),
  ];
  expect(deriveFlow(beats, 2, 5).main.toolBreakdown).toEqual({ bash: 1, edit: 1 });
  const f = deriveFlow(beats, 4, 5).main;
  expect(f.toolBreakdown).toEqual({ bash: 2, edit: 1 });
  expect(f.counts["tool"]).toBe(3);
});

test("activeTool is the head tool's iconKey, else null", () => {
  expect(deriveFlow([beat({ kind: "tool", iconKey: "edit" })], 1, 5).main.activeTool).toBe("edit");
  expect(deriveFlow([beat({ kind: "tool", iconKey: "bash", ok: true })], 1, 5).main.activeTool).toBe("bash");
  expect(deriveFlow([beat({ kind: "thinking" })], 1, 5).main.activeTool).toBeNull();
});

test("skillBreakdown counts skill beats by name, cursor-synced", () => {
  const beats = [
    beat({ kind: "skill", skill: "tdd", label: "tdd" }),
    beat({ kind: "skill", skill: "brainstorming", label: "brainstorming" }),
    beat({ kind: "skill", skill: "tdd", label: "tdd" }),
    beat({ kind: "thinking" }),
  ];
  expect(deriveFlow(beats, 2, 5).main.skillBreakdown).toEqual({ tdd: 1, brainstorming: 1 });
  const f = deriveFlow(beats, 4, 5).main;
  expect(f.skillBreakdown).toEqual({ tdd: 2, brainstorming: 1 });
  expect(f.counts["skill"]).toBe(3);
});

test("skillBreakdown falls back to label when the skill name is absent", () => {
  const f = deriveFlow([beat({ kind: "skill", label: "writing-plans" })], 1, 5).main;
  expect(f.skillBreakdown).toEqual({ "writing-plans": 1 });
});

test("activeSkill is the head skill beat's name, else null", () => {
  expect(deriveFlow([beat({ kind: "skill", skill: "tdd", label: "tdd" })], 1, 5).main.activeSkill).toBe("tdd");
  expect(deriveFlow([beat({ kind: "skill", skill: "tdd", label: "tdd", ok: true })], 1, 5).main.activeSkill).toBe("tdd"); // completed skill
  expect(deriveFlow([beat({ kind: "tool", iconKey: "bash" })], 1, 5).main.activeSkill).toBeNull();
  expect(deriveFlow([beat({ kind: "thinking" })], 1, 5).main.activeSkill).toBeNull();
});

test("hops counts distinct-collapsed transitions; lastHop is the newest", () => {
  const f = deriveFlow([
    beat({ kind: "thinking" }), beat({ kind: "tool", ok: true }),   // think>tool, tool>result
    beat({ kind: "thinking" }), beat({ kind: "tool" }),             // result>think, think>tool
  ], 4, 3);
  expect(f.main.hops).toEqual({ "think>tool": 2, "tool>result": 1, "result>think": 1 });
  expect(f.main.lastHop).toBe("think>tool");
});

test("hops empty and lastHop null with fewer than two distinct steps", () => {
  const f = deriveFlow([beat({ kind: "thinking" }), beat({ kind: "thinking" })], 2, 3);
  expect(f.main.hops).toEqual({});
  expect(f.main.lastHop).toBeNull();
});
