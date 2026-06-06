import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTailer } from "../src/core/tailer";

// Byte math: each "XXXX\n" line is exactly 5 bytes.
// File: "AAAA\nBBBB\nCCCC\nDDDD\nEEEE\n" = 25 bytes
// tailBytes=13 → seed offset = 25 - 13 = 12, which lands mid-"CCCC"
// (bytes 0-4="AAAA\n", 5-9="BBBB\n", 10-14="CCCC\n", 15-19="DDDD\n", 20-24="EEEE\n")
// Read from 12: "CC\nDDDD\nEEEE\n" → split → ["CC", "DDDD", "EEEE", ""]
// carry="" (trailing empty), lines = ["CC", "DDDD", "EEEE"]
// seededMid=true → drop first → ["DDDD", "EEEE"]
test("tailBytes seeds mid-file, drops partial first line, subsequent reads are incremental", () => {
  const dir = mkdtempSync(join(tmpdir(), "hf-tail-"));
  const f = join(dir, "s.jsonl");
  // 5 lines × 5 bytes each = 25 bytes total
  writeFileSync(f, "AAAA\nBBBB\nCCCC\nDDDD\nEEEE\n");

  const tail = createTailer();
  // tailBytes=13 lands at offset 12 (mid "CCCC\n"), so partial "CC" is dropped
  const lines = tail.read(f, { tailBytes: 13 });
  expect(lines).toEqual(["DDDD", "EEEE"]);

  // subsequent read (no tailBytes) picks up only new lines
  appendFileSync(f, "FFFF\n");
  const more = tail.read(f);
  expect(more).toEqual(["FFFF"]);

  rmSync(dir, { recursive: true, force: true });
});

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
