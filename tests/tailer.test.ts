import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTailer } from "../src/core/tailer";

test("reads only newly appended lines; resets on truncation; tails large files from end", () => {
  const dir = mkdtempSync(join(tmpdir(), "hf-tail-"));
  const f = join(dir, "s.jsonl");
  writeFileSync(f, "line1\nline2\n");

  const tail = createTailer();
  // first read of an existing file starts at EOF (no replay)
  expect(tail.read(f, { startAtEof: true })).toEqual([]);

  appendFileSync(f, "line3\n");
  expect(tail.read(f)).toEqual(["line3"]);

  appendFileSync(f, "partial"); // no newline yet
  expect(tail.read(f)).toEqual([]); // incomplete line held back
  appendFileSync(f, " done\n");
  expect(tail.read(f)).toEqual(["partial done"]);

  // truncation resets offset
  writeFileSync(f, "fresh\n");
  expect(tail.read(f)).toEqual(["fresh"]);

  rmSync(dir, { recursive: true, force: true });
});
