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
