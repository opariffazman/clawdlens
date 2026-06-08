import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSession } from "../src/core/loadTranscript";
import { createTailer } from "../src/core/tailer";
import { parseLine } from "../src/core/parse";
import { newSession, applyEntry } from "../src/core/reducer";
import type { SessionState } from "../src/core/types";

// Two assistant turns carrying usage, separated by a ~70 KB metadata entry. The
// store's first read folds only the last 64 KB (tailer tailBytes), which lands
// inside the metadata blob — so the byte window sees only the SECOND (small)
// turn. The full fold sums BOTH turns -> higher cumulative cost. This is exactly
// the header cost undercount the UI fix routes around.
function writeCostTranscript(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "hf-cost-"));
  const file = join(dir, "s.jsonl");
  const big = "x".repeat(70000);
  const lines = [
    JSON.stringify({ type: "assistant", cwd: "/r", message: { model: "claude-opus-4-8", usage: { input_tokens: 100000, output_tokens: 50000 }, content: [{ type: "text", text: "early" }] } }),
    JSON.stringify({ type: "file-history-snapshot", snapshot: big }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: "text", text: "late" }] } }),
  ];
  writeFileSync(file, lines.join("\n") + "\n");
  return { dir, file };
}

function foldLines(file: string, lines: string[]): SessionState {
  let s = newSession("bf", file);
  for (const raw of lines) { const e = parseLine(raw); if (e) s = applyEntry(s, e, 0); }
  return s;
}

test("full fold recovers cumulative cost the 64 KB backfill window drops", () => {
  const { dir, file } = writeCostTranscript();

  const full = loadSession(file);
  const backfill = foldLines(file, createTailer().read(file, { tailBytes: 65536 }));

  // Full fold sums both turns; the backfill window sees only the late small turn.
  expect(full.tokens.input).toBe(101000);
  expect(backfill.tokens.input).toBe(1000);
  expect(full.costUSD).toBeGreaterThan(backfill.costUSD);
  expect(backfill.costUSD).toBeGreaterThan(0); // model present on the late turn -> cost computed

  rmSync(dir, { recursive: true, force: true });
});
