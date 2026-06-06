import { test, expect } from "bun:test";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Entry } from "../src/core/types";

function feed(entries: Entry[]) {
  let s = newSession("sid", "/home/u/.claude/projects/-home-u-repo-foo/sid.jsonl");
  for (const e of entries) s = applyEntry(s, e, Date.parse("2026-06-06T00:00:00Z"));
  return s;
}

test("identity, title, prompt, model and tokens fold in", () => {
  const s = feed([
    { type: "ai-title", aiTitle: "Fix the thing" },
    { type: "last-prompt", lastPrompt: "please fix the thing" },
    { type: "assistant", cwd: "/home/u/repo/foo", gitBranch: "main",
      message: { model: "claude-opus-4-8", stop_reason: "end_turn",
        usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 49998 },
        content: [{ type: "text", text: "ok" }] } },
  ]);
  expect(s.title).toBe("Fix the thing");
  expect(s.lastPrompt).toBe("please fix the thing");
  expect(s.cwd).toBe("/home/u/repo/foo");
  expect(s.gitBranch).toBe("main");
  expect(s.model).toBe("claude-opus-4-8");
  expect(s.tokens.contextTokens).toBe(50000);
  expect(s.tokens.contextPct).toBeCloseTo(0.25, 5);
  expect(s.tokens.output).toBe(10);
  expect(s.lastStopReason).toBe("end_turn");
});

test("project derived from cwd basename when no cwd field yet", () => {
  const s = feed([{ type: "assistant", cwd: "/home/u/repo/foo", message: { content: [] } }]);
  expect(s.project).toBe("foo");
});

import { TOOL_ICONS } from "../src/core/reducer";

test("assistant content blocks become beats with labels and icons", () => {
  const s = feed([
    { type: "assistant", message: { model: "claude-opus-4-8", stop_reason: "tool_use", content: [
      { type: "thinking", thinking: "let me check" },
      { type: "text", text: "I'll run the tests" },
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "pytest -q", description: "run tests" } },
    ] } },
  ]);
  const kinds = s.beats.map(b => b.kind);
  expect(kinds).toEqual(["thinking", "text", "tool"]);
  const bash = s.beats[2]!;
  expect(bash.label).toBe("Bash");
  expect(bash.detail).toBe("run tests");
  expect(bash.icon).toBe(TOOL_ICONS.Bash!);
  expect(bash.toolUseId).toBe("t1");
  expect(s.lastBlockKind).toBe("tool_use");
  expect(s.toolStats.Bash).toBe(1);
});

test("Skill tool_use becomes a skill beat", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "t1", name: "Skill", input: { skill: "superpowers:brainstorming" } },
    ] } },
  ]);
  expect(s.beats[0]!.kind).toBe("skill");
  expect(s.beats[0]!.label).toBe("superpowers:brainstorming");
});

test("Edit tool_use records file detail", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/src/auth.ts" } },
    ] } },
  ]);
  expect(s.beats[0]!.detail).toBe("auth.ts");
});

test("tool_result pairs with its tool beat and sets ok/error", () => {
  const s = feed([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { description: "x" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true }] } },
  ]);
  const bash = s.beats.find(b => b.toolUseId === "t1")!;
  expect(bash.ok).toBe(false);
  expect(s.lastErrored).toBe(true);
  expect(s.pendingTools.t1).toBeUndefined();
});

test("Edit/Write increment file heat edits; Read increments reads", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "e1", name: "Edit", input: { file_path: "/r/a.ts" } },
      { type: "tool_use", id: "r1", name: "Read", input: { file_path: "/r/a.ts" } },
    ] } },
  ]);
  expect(s.fileHeat["a.ts"]!.edits).toBe(1);
  expect(s.fileHeat["a.ts"]!.reads).toBe(1);
});

test("TodoWrite updates todos", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "td", name: "TodoWrite", input: { todos: [
        { content: "do a", status: "completed" }, { content: "do b", status: "in_progress" },
      ] } },
    ] } },
  ]);
  expect(s.todos?.length).toBe(2);
  expect(s.todos?.[1]!.status).toBe("in_progress");
});

test("Task opens a subagent lane; its result closes it; sidechain beats land in the lane", () => {
  const s = feed([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "T1", name: "Task", input: { subagent_type: "code-reviewer", description: "review" } }] } },
    { type: "assistant", isSidechain: true, sourceToolUseID: "T1", message: { content: [{ type: "tool_use", id: "g1", name: "Grep", input: { query: "useEffect" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "T1" }] } },
  ]);
  const grep = s.beats.find(b => b.label === "Grep")!;
  expect(grep.lane).toBe("T1");
  expect(s.openLanes).toEqual([]); // closed after result
});
