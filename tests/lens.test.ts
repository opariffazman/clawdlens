import { test, expect } from "bun:test";
import { detectLens } from "../src/core/lens";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Entry } from "../src/core/types";

function run(entries: Entry[]) {
  let s = newSession("sid", "f");
  for (const e of entries) s = applyEntry(s, e, 0);
  return detectLens(s);
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
