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
  store.pollOnce(1000); // discovers file, starts at backfill

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

test("backfill: pre-existing lines in file are folded on first pollOnce", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-store-"));
  const proj = join(root, "-home-u-repo-bar");
  mkdirSync(proj, { recursive: true });
  const f = join(proj, "sid2.jsonl");

  // Write content BEFORE the store is created (session already running)
  writeFileSync(f,
    JSON.stringify({ type: "ai-title", aiTitle: "Pre-existing Title" }) + "\n" +
    JSON.stringify({ type: "assistant", cwd: "/home/u/repo/bar",
      message: { model: "claude-sonnet-4-5", stop_reason: "end_turn",
        usage: { input_tokens: 100, cache_read_input_tokens: 900 },
        content: [{ type: "text", text: "done" }] } }) + "\n"
  );

  const store = createStore({ root });
  store.pollOnce(5000); // first poll — backfill should fold the pre-existing tail

  const sessions = store.sessions();
  expect(sessions.length).toBe(1);
  const s = sessions[0]!;
  expect(s.title).toBe("Pre-existing Title");
  expect(s.model).toBe("claude-sonnet-4-5");
  // contextPct = (100 + 900) / 200000 = 0.005
  expect(s.tokens.contextPct).toBeGreaterThan(0);

  rmSync(root, { recursive: true, force: true });
});

test("empty session file yields idle status (zero-activity guard)", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-store-"));
  const proj = join(root, "-home-u-repo-baz");
  mkdirSync(proj, { recursive: true });
  const f = join(proj, "sid3.jsonl");
  writeFileSync(f, ""); // completely empty

  const store = createStore({ root });
  store.pollOnce(1000);

  const sessions = store.sessions();
  expect(sessions.length).toBe(1);
  expect(sessions[0]!.status).toBe("idle");

  rmSync(root, { recursive: true, force: true });
});
