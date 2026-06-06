import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSessions } from "../src/core/discover";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hf-"));
  const proj = join(root, "-home-u-repo-foo");
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, "abc.jsonl"), "{}\n");
  writeFileSync(join(proj, "notes.txt"), "ignore me");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("finds .jsonl files and ignores others", () => {
  const found = discoverSessions(root);
  expect(found.length).toBe(1);
  expect(found[0]!.id).toBe("abc");
  expect(found[0]!.file.endsWith("abc.jsonl")).toBe(true);
});
