import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/store/sessionStore";

test("pollOnce ingests appended lines into session state and derives status", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-store-"));
  const proj = join(root, "-home-u-repo-foo");
  mkdirSync(proj, { recursive: true });
  const f = join(proj, "sid.jsonl");
  writeFileSync(f, ""); // empty session file

  const store = createStore({ root });
  store.pollOnce(1000); // discovers file, starts at EOF

  appendFileSync(f, JSON.stringify({ type: "ai-title", aiTitle: "Hello" }) + "\n");
  appendFileSync(f, JSON.stringify({ type: "assistant", cwd: "/home/u/repo/foo",
    message: { model: "claude-opus-4-8", stop_reason: "end_turn",
      usage: { input_tokens: 1, cache_read_input_tokens: 99999 },
      content: [{ type: "text", text: "hi" }] } }) + "\n");

  store.pollOnce(2000);
  const sessions = store.sessions();
  expect(sessions.length).toBe(1);
  const s = sessions[0]!;
  expect(s.title).toBe("Hello");
  expect(s.status).toBe("waiting");
  expect(s.tokens.contextPct).toBeCloseTo(0.5, 2);

  rmSync(root, { recursive: true, force: true });
});
