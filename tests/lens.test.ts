import { test, expect } from "bun:test";
import { detectLens, detectLensFromBeats } from "../src/core/lens";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Entry, Beat } from "../src/core/types";

function run(entries: Entry[]) {
  let s = newSession("sid", "f");
  for (const e of entries) s = applyEntry(s, e, 0);
  return detectLens(s);
}

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: p.ts ?? 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p };
}

test("brainstorming -> Brainstorm; spec write -> Spec; writing-plans -> Plan", () => {
  const lens = run([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Skill", input: { skill: "superpowers:brainstorming" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "2", name: "Write", input: { file_path: "docs/superpowers/specs/x-design.md" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "3", name: "Skill", input: { skill: "superpowers:writing-plans" } }] } },
  ]);
  expect(lens.lensId).toBe("superpowers");
  expect(lens.activePhase).toBe("Plan");
  expect(lens.phaseHistory.map(p => p.phase)).toEqual(["Brainstorm", "Spec", "Plan"]);
});

test("no superpowers signal -> null lens", () => {
  const lens = run([{ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Bash", input: {} }] } }]);
  expect(lens.lensId).toBeNull();
  expect(lens.activePhase).toBeNull();
});

test("detectLensFromBeats matches detectLens over the same beats", () => {
  const beats = [
    beat({ kind: "skill", skill: "brainstorming", label: "brainstorming", ts: 1 }),
    beat({ kind: "tool", label: "Write", detail: "x-design.md", ts: 2 }),
    beat({ kind: "skill", skill: "writing-plans", label: "writing-plans", ts: 3 }),
  ];
  const s = { ...newSession("x", "x"), beats };
  expect(detectLensFromBeats(beats)).toEqual(detectLens(s));
});

test("detectLensFromBeats over a partial slice reflects only those beats", () => {
  const beats = [
    beat({ kind: "skill", skill: "brainstorming", label: "brainstorming", ts: 1 }),
    beat({ kind: "skill", skill: "writing-plans", label: "writing-plans", ts: 3 }),
  ];
  const partial = detectLensFromBeats(beats.slice(0, 1));
  expect(partial.skillGroups.map((g) => g.skill)).toEqual(["brainstorming"]);
  expect(partial.activePhase).toBe("Brainstorm");
});
