// cwd-scoped session focus: which session should ClawdLens show?
// Pure — the invocation cwd is resolved (realpath) by the caller.

export interface FocusSession { id: string; projectDir: string; cwd: string; lastActivityTs: number }

export interface FocusInput {
  sessions: FocusSession[];
  invocationCwd: string;
  selectedId: string | null;
  userPinned: boolean;
}

export interface FocusDecision { id: string | null; reason: "keep" | "project-follow" | "global-initial" }

// Claude encodes a session's cwd into its project dir name: every
// non-alphanumeric → "-" (verified against ~/.claude/projects: /, ., _ all dash; case kept).
export function projectKeyForCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

// Exact project-dir match if any, else cwd-containment (sessions started in
// subdirectories — monorepo roots). Exact-first keeps broad cwds (e.g. $HOME,
// itself a project dir) from swallowing every session beneath them.
export function projectSessionsFor<S extends { projectDir: string; cwd: string }>(
  sessions: S[],
  invocationCwd: string,
): S[] {
  const key = projectKeyForCwd(invocationCwd);
  const exact = sessions.filter((x) => x.projectDir === key);
  if (exact.length > 0) return exact;
  const prefix = invocationCwd === "/" ? "/" : invocationCwd + "/";
  return sessions.filter((x) => x.cwd.startsWith(prefix));
}

export function resolveFocus(i: FocusInput): FocusDecision {
  const exists = i.selectedId != null && i.sessions.some((x) => x.id === i.selectedId);
  if (i.userPinned && exists) return { id: i.selectedId, reason: "keep" };
  const proj = projectSessionsFor(i.sessions, i.invocationCwd);
  if (proj.length > 0) {
    const newest = proj.reduce((a, b) =>
      b.lastActivityTs !== a.lastActivityTs
        ? (b.lastActivityTs > a.lastActivityTs ? b : a)
        : (b.id > a.id ? b : a)
    );
    if (newest.id === i.selectedId) return { id: newest.id, reason: "keep" };
    return { id: newest.id, reason: "project-follow" };
  }
  if (exists) return { id: i.selectedId, reason: "keep" };
  const newest = i.sessions.length
    ? i.sessions.reduce((a, b) =>
        b.lastActivityTs !== a.lastActivityTs
          ? (b.lastActivityTs > a.lastActivityTs ? b : a)
          : (b.id > a.id ? b : a)
      )
    : null;
  return { id: newest ? newest.id : null, reason: "global-initial" };
}
