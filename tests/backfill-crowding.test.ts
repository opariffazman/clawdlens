import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBeats } from "../src/core/loadTranscript";
import { createTailer } from "../src/core/tailer";
import { parseLine } from "../src/core/parse";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Beat } from "../src/core/types";

// A transcript with two real assistant turns followed by one ~70 KB metadata
// entry. The store's first read only folds the last 64 KB (tailer tailBytes),
// which lands inside the metadata blob — so the byte window sees no assistant
// entries and produces 0 beats. The full fold must still recover both beats.
function writeCrowdedTranscript(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "hf-crowd-"));
  const file = join(dir, "s.jsonl");
  const big = "x".repeat(70000);
  const lines = [
    JSON.stringify({ type: "assistant", cwd: "/r", message: { model: "claude-opus-4-8", content: [{ type: "thinking", thinking: "plan" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
    JSON.stringify({ type: "file-history-snapshot", snapshot: big }),
  ];
  writeFileSync(file, lines.join("\n") + "\n");
  return { dir, file };
}

function foldLines(lines: string[]): Beat[] {
  let s = newSession("w", "f");
  for (const raw of lines) {
    const e = parseLine(raw);
    if (e) s = applyEntry(s, e, 0);
  }
  return s.beats;
}

test("full fold recovers beats that the 64 KB backfill window crowds out", () => {
  const { dir, file } = writeCrowdedTranscript();

  // Full fold: both assistant turns become beats.
  const full = loadBeats(file);
  expect(full.length).toBe(2);
  expect(full[0]!.kind).toBe("thinking");
  expect(full[1]!.label).toBe("says");

  // Byte-backfill window (the store's first-read path): metadata crowds out
  // every assistant entry -> 0 beats. This is the bug the fix routes around.
  const backfillLines = createTailer().read(file, { tailBytes: 65536 });
  const backfillBeats = foldLines(backfillLines);
  expect(backfillBeats.length).toBe(0);

  rmSync(dir, { recursive: true, force: true });
});
