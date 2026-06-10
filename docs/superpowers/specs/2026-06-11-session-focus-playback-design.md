# Session Focus + Unified Playback — Design

Date: 2026-06-11
Status: approved (user confirmed all four design decisions)

## Problems

### P1 — Session selection has no user control

`App.tsx` resolves the shown session as `sessions.find(selectedId) ?? sessions[0]`,
where `sessions` re-sorts by `lastActivityTs` every poll. With no explicit
selection, ClawdLens follows whichever session across ALL projects was most
recently active — it jumps between unrelated projects mid-watch.

Wanted behavior (user-specified):

- Invoked inside a Claude project folder → automatically monitor that
  project's session.
- If that session is not running → automatically play (replay) the latest
  session of that project.
- No surprise cross-project switching.

### P2 — Playback keys inconsistent (all reproduced against green suite)

The player (`src/core/player.ts`) has three modes — `live` / `paused` /
`history` — coupling "where am I viewing" (cursor) with "is time advancing".
Four dead combos, each empirically reproduced:

| Trace | Repro | Root cause |
|---|---|---|
| A | scrub (↑) then `space` → nothing | `pause()` guarded `mode==="live"`, `play()` guarded `mode==="paused"`; `history` has no space exit. App's toggle assumes total functions. |
| B | pause 60 s, resume → cursor 15→100 in one tick | `play()` never re-bases `lastAdvanceAt`; tick pays off the entire paused duration as instant advances. |
| C | `space` (pause) then ↓ → nothing | `stepForward()` guarded `mode==="history"`. |
| D | scrub back 10, `space`, tick → stuck forever | A + no "play from cursor" path exists. |

Additionally App.tsx maintains a second, duplicate replay player (`r` key)
with its own tick interval, beats source, and marker branch — a parallel copy
of the same buggy machine.

## Prior art — agent-flow (patoles/agent-flow)

Direct sibling (web/VS Code visualizer for Claude Code + Codex). Findings that
shaped this design:

- **Workspace scoping**: filters sessions by reading `cwd` from each JSONL's
  first lines with *containment* matching (sessions started in subdirectories
  count). Encoded dir = non-alphanumeric → `-`, symlinks resolved first.
- **Auto-select**: first *active* session, else most recent; auto-switches when
  a new session spawns in the workspace.
- **Playback**: exactly two modes — LIVE (read-only track) ↔ REVIEW
  (scrub/play/pause/speed) — plus an explicit "Resume Live" seek-to-head.
- **Session done** heuristic: 30 s without file growth → completed; reactivate
  on new writes.

## Design

### D1 — Unified 2-mode player (`src/core/player.ts` rewrite)

State: `cursor: number`, `mode: "playing" | "paused"`, plus existing
`speed`, `loop`, `lastAdvanceAt`, coalesced beats. The separate `head` and the
`replay` option are removed. "Live" is **derived**, never stored:
`atLive() === playing && cursor ≥ coalesced.length` (and the tail keeps
following as beats append).

API + semantics:

| Method | Behavior |
|---|---|
| `tick(now)` | only advances when `playing`; same adaptive interval (`backlog = length - cursor`); advancing past appended beats IS live-follow |
| `pause()` | total: `mode = paused` |
| `play()` | total: `mode = playing`, `lastAdvanceAt = -1` (tick re-bases on next call — no time-debt burst) |
| `toggle()` | `playing ? pause() : play()` — the `space` handler, total by construction |
| `stepBack()` | `pause(); cursor = max(0, cursor-1)` — works from any mode |
| `stepForward()` | `pause(); cursor = min(length, cursor+1)` — works from any mode |
| `replay()` | `cursor = 0; play()` — replaces the duplicate replay player |
| `toLive()` | `cursor = length; play()` — agent-flow's "Resume Live" |
| `setBeats(beats)` | re-coalesce; clamp cursor to length; mode preserved |

`PlayMode` becomes `"playing" | "paused"`. Loop (screensaver wrap) kept: when
`loop && cursor ≥ length`, tick wraps cursor to 0.

Consumer updates:

- `App.tsx`: delete `replay` state + its tick effect + marker branch; `r` →
  `player.replay()`; `space` → `player.toggle()`; new `l` → `player.toLive()`.
- `keymap.ts`: `l` → `{ type: "live" }`; help rows + command palette gain
  `play.live` ("Go Live", alias `live`).
- `anim.ts` `shouldAnimate`: `mode === "playing"` && recent advance (same
  shape as today's `live` check).
- Marker: `▸ live` (playing, caught up) · `▸ n/N` (playing, catching up) ·
  `⏸ n/N` (paused) · speed suffix unchanged.

### D2 — cwd-scoped session focus (`src/core/focus.ts`, new pure module)

```ts
projectKeyForCwd(cwd): string            // realpath → non-alnum → "-"
projectSessionsFor(sessions, cwd): S[]   // exact project-dir match if any,
                                         // else cwd-containment matches
resolveFocus({ sessions, invocationCwd, selectedId, userPinned }): {
  id: string | null;
  reason: "keep" | "project-follow" | "global-initial";
}
```

Matching rule (ordered):

1. **Exact**: `session.project === projectKeyForCwd(invocationCwd)`.
2. **Containment fallback** (only when exact yields nothing):
   `session.cwd` starts with `invocationCwd + "/"` — covers monorepo roots
   whose sessions live in subdirectory project dirs. The exact-first order
   keeps broad cwds (e.g. `$HOME`, itself a project dir) from swallowing every
   session beneath them.

Resolution rules:

- `userPinned` and selected still exists → `keep`. Pinning is set the moment
  the user picks a session in the `:`→sessions picker, cleared never (restart
  re-evaluates).
- Project sessions exist → newest by `lastActivityTs`; differs from current
  selection → `project-follow` (auto-switch stays INSIDE the project).
- No project match → `selectedId` if set (`keep`), else newest overall once
  (`global-initial`). After that initial pick the selection never auto-moves.

On every selection change (focus-driven or manual), App applies the position
policy on the (re-seeded full-transcript) player:

- status ∈ {`running`, `working`, `waiting`} → `toLive()` — monitoring means now
- status ∈ {`idle`, `dormant`, `error`} → `replay()` — auto-play the story

`index.tsx` passes `realpathSync(process.cwd())` into `App` (keeps focus.ts
pure and the cwd testable). Header shows `⌂ <project>` while project-locked.

### Edge cases

- No sessions at all → CLAWDLENS splash (unchanged).
- Project newest session deleted/rotated → next resolveFocus picks the new
  newest in-project; global pin falls back to newest overall if the pinned
  file disappears.
- `setBeats` shrink (transcript rotation) → cursor clamped.
- Idle session wakes during auto-play → beats append, playback continues into
  live-follow naturally (cached-then-stream; no mode change needed).
- Manual pick of a session in ANOTHER project → hard pin (project follow off).

## Testing

- `tests/player.test.ts` rewrite: port surviving semantics (coalescing,
  pacing, adaptive interval, speed, loop) + regression tests for traces A–D
  (named, with the bug as the test description).
- `tests/focus.test.ts` (new): encoding (`/`, `.`, `_`, case), exact vs
  containment, $HOME-broad-cwd guard, pin precedence, project-follow on newer
  session, global-initial pins once.
- `usePlayers`/`smoke`/`keymap` test updates for the new PlayMode + `l` key.
- Visual: tmux session per CLAUDE.md — verify space toggles after scrub,
  resume advances pace (no burst), `r` replays, `l` snaps live, no
  cross-project jumps while a foreign session is active.

## Out of scope → GitHub issues (agent-flow-inspired backlog)

Filed as issues with superpowers-resume instructions:

1. Context-token breakdown panel (system/user/tools/reasoning/subagent pools).
2. Per-tool timing stats (count, avg/min/max duration, total) panel or lens band.
3. Error/permission markers on the timeline + jump-to-next-error.
4. Session-done detection (30 s inactivity → completed badge; reactivate on write).

Considered, rejected: hooks-based event push (ClawdLens is hook-free by
design), Codex rollout support (different market, M-L effort — revisit),
mouse-interactive tool popups (TUI keyboard model instead).
