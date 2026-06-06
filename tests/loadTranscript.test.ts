import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBeats } from "../src/core/loadTranscript";

test("loadBeats folds the entire transcript file into beats", () => {
  const dir = mkdtempSync(join(tmpdir(), "hf-load-"));
  const f = join(dir, "s.jsonl");
  const lines = [
    JSON.stringify({ type: "assistant", cwd: "/r", message: { model: "claude-opus-4-8", content: [{ type: "thinking", thinking: "x" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { description: "build" } }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
  ];
  writeFileSync(f, lines.join("\n") + "\n");
  const beats = loadBeats(f);
  expect(beats.length).toBe(3);
  expect(beats[0]!.kind).toBe("thinking");
  expect(beats[1]!.iconKey).toBe("bash");
  expect(beats[2]!.label).toBe("says");
  rmSync(dir, { recursive: true, force: true });
});
