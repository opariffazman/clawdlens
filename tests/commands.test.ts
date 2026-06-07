import { test, expect } from "bun:test";
import { COMMANDS, filterCommands } from "../src/core/commands";

test("registry has stable ids and panel switches", () => {
  const ids = COMMANDS.map((c) => c.id);
  for (const id of ["panel.lens", "panel.log", "nav.sessions", "app.quit"]) {
    expect(ids).toContain(id);
  }
});

test("empty query returns all context-applicable commands", () => {
  const onLog = filterCommands("", "log").map((c) => c.id);
  expect(onLog).toContain("panel.git");
  expect(onLog).not.toContain("git.scope");   // git-only, hidden off the git panel
});

test("context commands appear only on their panel", () => {
  expect(filterCommands("scope", "git").map((c) => c.id)).toContain("git.scope");
  expect(filterCommands("scope", "files").map((c) => c.id)).not.toContain("git.scope");
});

test("alias matches and fuzzy ranking orders results", () => {
  expect(filterCommands("refresh", "log").map((c) => c.id)).toContain("view.rescan");
  const q = filterCommands("git", "log");
  expect(q[0]!.id).toBe("panel.git");          // exact/leading match ranks first
});

test("no match yields empty list", () => {
  expect(filterCommands("zzzzz", "log")).toHaveLength(0);
});
