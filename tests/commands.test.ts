import { test, expect } from "bun:test";
import { COMMANDS, filterCommands, commandSuggestions } from "../src/core/commands";

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

test("commandSuggestions: empty query yields no ghost", () => {
  expect(commandSuggestions("", "log")).toEqual([]);
});

test("commandSuggestions: prefix completion ghosts the remainder", () => {
  const sug = commandSuggestions("gi", "log");
  expect(sug[0]!.ghost).toBe("t");            // "gi" + "t" = git
  expect(sug[0]!.command.id).toBe("panel.git");
});

test("commandSuggestions: prefix-only, not fuzzy/substring", () => {
  // "it" is a substring of "git" but not a prefix → no suggestion
  expect(commandSuggestions("it", "log")).toHaveLength(0);
});

test("commandSuggestions: respects panel context", () => {
  expect(commandSuggestions("sc", "git").map((s) => s.command.id)).toContain("git.scope");
  expect(commandSuggestions("sc", "files").map((s) => s.command.id)).not.toContain("git.scope");
});

test("commandSuggestions: no match yields empty", () => {
  expect(commandSuggestions("zzzzz", "log")).toEqual([]);
});
