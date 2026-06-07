import { test, expect } from "bun:test";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Entry } from "../src/core/types";

function feed(entries: Entry[]) {
  let s = newSession("sid", "/home/u/.claude/projects/-home-u-repo-foo/sid.jsonl");
  for (const e of entries) s = applyEntry(s, e, Date.parse("2026-06-06T00:00:00Z"));
  return s;
}

test("harness TaskCreate/TaskUpdate reconstruct an agnostic task list", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "a", name: "TaskCreate", input: { subject: "Scaffold project" } },
      { type: "tool_use", id: "b", name: "TaskCreate", input: { subject: "Write tests" } },
      { type: "tool_use", id: "c", name: "TaskCreate", input: { subject: "Drop me" } },
    ] } },
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "d", name: "TaskUpdate", input: { taskId: "1", status: "completed" } },
      { type: "tool_use", id: "e", name: "TaskUpdate", input: { taskId: "2", status: "in_progress" } },
      { type: "tool_use", id: "f", name: "TaskUpdate", input: { taskId: "3", status: "deleted" } },
    ] } },
  ]);
  expect(s.todos?.length).toBe(2); // task 3 deleted
  expect(s.todos?.[0]).toEqual({ content: "Scaffold project", status: "completed" });
  expect(s.todos?.[1]).toEqual({ content: "Write tests", status: "in_progress" });
});

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
  expect(bash.iconKey).toBe("bash");
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

import { gitMilestone } from "../src/core/reducer";

test("gitMilestone flags commit and branch creation, ignores the rest", () => {
  expect(gitMilestone('git commit -m "x"')).toBe("commit");
  expect(gitMilestone("git add -A && git commit -m 'y'")).toBe("commit");
  expect(gitMilestone("git commit --dry-run")).toBeUndefined();
  expect(gitMilestone("git checkout -b feat/x")).toBe("branch");
  expect(gitMilestone("git switch -c feat/x")).toBe("branch");
  expect(gitMilestone("git branch feat/x")).toBe("branch");
  expect(gitMilestone("git branch -d feat/x")).toBeUndefined();
  expect(gitMilestone("git branch")).toBeUndefined();
  expect(gitMilestone("git status")).toBeUndefined();
  expect(gitMilestone(undefined)).toBeUndefined();
});

test("a Bash git commit beat carries milestone='commit'", () => {
  let s = newSession("sid", "f");
  s = applyEntry(s, { type: "assistant", message: { content: [
    { type: "tool_use", id: "1", name: "Bash", input: { command: 'git commit -m "x"' } },
  ] } }, 0);
  const beat = s.beats.find((b) => b.label === "Bash")!;
  expect(beat.milestone).toBe("commit");
});
