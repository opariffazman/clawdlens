import { test, expect } from "bun:test";
import { parseGitLog, GIT_LOG_ARGS } from "../src/core/git-log";

const US = "\x1f";
test("parses commits with parents, refs, subject", () => {
  const stdout = [
    `aaaaaaa1${US}bbbbbbb2 ccccccc3${US}HEAD -> main, tag: v1${US}merge: feature`,
    `bbbbbbb2${US}ddddddd4${US}${US}feat: wires`,
    `ddddddd4${US}${US}${US}init`,
  ].join("\n");
  const commits = parseGitLog(stdout);
  expect(commits.length).toBe(3);
  expect(commits[0]!.shortHash).toBe("aaaaaaa");
  expect(commits[0]!.parents).toEqual(["bbbbbbb2", "ccccccc3"]);
  expect(commits[0]!.refs).toEqual(["HEAD -> main", "tag: v1"]);
  expect(commits[0]!.subject).toBe("merge: feature");
  expect(commits[2]!.parents).toEqual([]);
});

test("empty / malformed -> empty array", () => {
  expect(parseGitLog("")).toEqual([]);
  expect(parseGitLog("\n  \n")).toEqual([]);
});

test("GIT_LOG_ARGS requests the right format (no diff)", () => {
  expect(GIT_LOG_ARGS).toContain("--no-patch");
  expect(GIT_LOG_ARGS.join(" ")).toContain("%H");
});
