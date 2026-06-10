import { test, expect } from "bun:test";
import { projectKeyForCwd, projectSessionsFor, resolveFocus } from "../src/core/focus";

function s(id: string, project: string, cwd: string, lastActivityTs: number) {
  return { id, project, cwd, lastActivityTs };
}

test("projectKeyForCwd encodes every non-alphanumeric as dash, preserves case", () => {
  expect(projectKeyForCwd("/home/debian/repo/harness-flow")).toBe("-home-debian-repo-harness-flow");
  expect(projectKeyForCwd("/home/debian/repo/harness-flow/.claude/worktrees/x")).toBe("-home-debian-repo-harness-flow--claude-worktrees-x");
  expect(projectKeyForCwd("/home/u/_work/My.Repo")).toBe("-home-u--work-My-Repo");
});

test("projectSessionsFor: exact project-dir match wins", () => {
  const a = s("a", "-home-u-repo-x", "/home/u/repo/x", 1);
  const b = s("b", "-home-u-repo-y", "/home/u/repo/y", 2);
  expect(projectSessionsFor([a, b], "/home/u/repo/x")).toEqual([a]);
});

test("projectSessionsFor: containment fallback catches subdirectory sessions when no exact match", () => {
  const sub = s("sub", "-home-u-mono-packages-app", "/home/u/mono/packages/app", 1);
  const other = s("o", "-home-u-elsewhere", "/home/u/elsewhere", 2);
  expect(projectSessionsFor([sub, other], "/home/u/mono")).toEqual([sub]);
});

test("projectSessionsFor: exact match suppresses containment ($HOME guard)", () => {
  const home = s("h", "-home-u", "/home/u", 1);
  const deep = s("d", "-home-u-repo-x", "/home/u/repo/x", 2);
  // /home/u IS a project dir → only its own sessions, not everything beneath it
  expect(projectSessionsFor([home, deep], "/home/u")).toEqual([home]);
});

test("resolveFocus: user pin always wins while the session exists", () => {
  const a = s("a", "-p", "/p", 1);
  const b = s("b", "-p", "/p", 99);
  expect(resolveFocus({ sessions: [a, b], invocationCwd: "/p", selectedId: "a", userPinned: true }))
    .toEqual({ id: "a", reason: "keep" });
});

test("resolveFocus: pinned session gone → falls back to project resolution", () => {
  const b = s("b", "-p", "/p", 99);
  expect(resolveFocus({ sessions: [b], invocationCwd: "/p", selectedId: "gone", userPinned: true }))
    .toEqual({ id: "b", reason: "project-follow" });
});

test("resolveFocus: project mode follows the newest session in the project", () => {
  const old = s("old", "-p", "/p", 10);
  const fresh = s("fresh", "-p", "/p", 20);
  const other = s("other", "-q", "/q", 999); // foreign activity must NOT steal focus
  const d = resolveFocus({ sessions: [other, fresh, old], invocationCwd: "/p", selectedId: "old", userPinned: false });
  expect(d).toEqual({ id: "fresh", reason: "project-follow" });
});

test("resolveFocus: project mode keeps the newest once selected", () => {
  const fresh = s("fresh", "-p", "/p", 20);
  expect(resolveFocus({ sessions: [fresh], invocationCwd: "/p", selectedId: "fresh", userPinned: false }))
    .toEqual({ id: "fresh", reason: "keep" });
});

test("resolveFocus: outside any project — picks the globally newest ONCE, then keeps", () => {
  const a = s("a", "-x", "/x", 10);
  const b = s("b", "-y", "/y", 20);
  const initial = resolveFocus({ sessions: [a, b], invocationCwd: "/nowhere", selectedId: null, userPinned: false });
  expect(initial).toEqual({ id: "b", reason: "global-initial" });
  // later: a becomes more active — selection must NOT move
  const later = resolveFocus({ sessions: [{ ...a, lastActivityTs: 99 }, b], invocationCwd: "/nowhere", selectedId: "b", userPinned: false });
  expect(later).toEqual({ id: "b", reason: "keep" });
});

test("resolveFocus: no sessions → null", () => {
  expect(resolveFocus({ sessions: [], invocationCwd: "/p", selectedId: null, userPinned: false }))
    .toEqual({ id: null, reason: "global-initial" });
});
