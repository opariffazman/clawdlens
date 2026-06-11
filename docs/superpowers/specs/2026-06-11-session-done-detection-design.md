# Session-Done Detection — Design

Date: 2026-06-11
Status: approved (issue #23 carries the validated scope; autonomous resume)

## Problem

A session whose turn finished reads as `waiting` (◑, pulsing) forever — until
90 s flips it to `idle`, 30 min to `dormant`. The focus seek policy (PR #19)
treats `waiting` as active → jumps live; a freshly-finished session should
instead read "done" and auto-replay. Issue #23.

## Prior art — agent-flow

`session-watcher.ts` `INACTIVITY_TIMEOUT_MS = 30000`: no file growth for 30 s →
`agent_complete`; re-spawn on resumed activity.

## Design

### New status `done` (`src/core/status.ts`, pure)

`Status` union gains `"done"`. Derivation refines the `end_turn` branch only:

```
end_turn + ageMs ≤ DONE_MS (30 000)  → waiting   (just finished — user may reply)
end_turn + ageMs > DONE_MS           → done      (turn complete + quiet = finished)
dormant (30 min) still wins above both.
```

**Deviation from agent-flow (deliberate):** plain inactivity is NOT enough —
a session that stalls mid-run without `end_turn` (crash, kill) stays on the
existing `idle` path. Marking it ✓ done would lie. `done` = *completed turn* +
quiet, which is the ClawdLens-visible analogue of agent-flow's heuristic with
fewer false positives.

Reactivation is automatic: a new transcript entry updates `lastActivityTs`
(and usually `stop_reason`), so the next `deriveStatus` leaves `done` without
any extra mechanism.

### UI

- `statusGlyph` (`src/ui/format.ts`): `done` → `✓`, `theme.ok`, no pulse.
  Header badge and `:`→sessions picker rows inherit it for free.
- Focus seek policy (`App.tsx`): active set stays {running, working, waiting} →
  `toLive()`; `done` joins {idle, dormant, error} → `replay()` — exactly the
  issue's complement to PR #19.
- Audit every `Status` switch/comparison site (typecheck surfaces them;
  `noUncheckedIndexedAccess` strict).

## Testing

- `tests/status.test.ts`: end_turn at 29 s → waiting; at 31 s → done; done +
  age > 30 min → dormant; non-end_turn stall at 31 s → working/idle path
  unchanged; new entry after done → re-derives by normal rules.
- `tests/format.test.ts` (or icons): done glyph/color row.
- Visual tmux pass: header shows ✓ on a finished session; picker badge; focus
  auto-replays a done session.

## Out of scope

File-mtime watching (the tailer already surfaces new lines; entry timestamps
are the ground truth ClawdLens uses everywhere else).
