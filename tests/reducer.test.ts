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
