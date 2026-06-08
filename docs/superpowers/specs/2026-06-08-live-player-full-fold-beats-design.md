# Live player full-fold beats — design

**Date:** 2026-06-08
**Branch:** `fix/live-player-full-fold-beats`
**Status:** approved, ready for plan

## Problem

Some sessions show **0 beats** in the live Lens/Flow timeline despite being real, long sessions. Reproduced on `c86d202a` (5.5 MB transcript): the last 64 KB of the file is entirely `attachment`, `file-history-snapshot`, `worktree-state`, `permission-mode` entries — **no `assistant` entries**, so the reducer produces no beats.

### Root cause

The live player sources its beat timeline from the **byte-bounded backfill window**. On first discovery the store reads only the last `BACKFILL_BYTES` (64 KB) of each transcript (`sessionStore.ts:16`, `tailer.ts:17`) and folds that window into `SessionState.beats`. `usePlayers` then seeds the live player with those backfill beats (`usePlayers.ts:15`).

Bytes are the wrong unit. Beat-producing entries (`assistant`, and `user` tool_results) are small (~200 B–2 KB), but metadata entries (`file-history-snapshot`, `attachment`) can be ~100 KB each. A cluster of large metadata entries at EOF fills the entire window, evicting every `assistant` entry → **zero beats**.

The same window also **undercounts cumulative tokens/cost** for the live view: the reducer accumulates `input`/`output` additively, so a backfill-seeded session reports only the tail's token sum, not the session total.

### The inconsistency that points to the fix

There are three consumers of session beats/aggregates. Two already use the **full fold**; only the live player still uses the byte window:

| Consumer | Beat source | Correct? |
|---|---|---|
| Replay player (`r` key) | `store.fullBeats(id)` — full fold | ✓ |
| Aggregate panels (Files/Tasks/Git/Lens) | `store.fullSession(id)` — full fold | ✓ |
| **Live player** (`usePlayers`) | `s.beats` — 64 KB byte window | ✗ |

This is not a missing heuristic — it is an inconsistency. The fix aligns the live player with the path the other two already use.

## Constraints

- **Scale:** 1896 transcript files, 408 MB total, median 80 KB, p90 293 KB, max 14 MB (measured under `~/.claude/projects`). Full-folding **every** session at startup is not acceptable — that is precisely why the bounded read exists. The fix must keep unselected-session cost bounded.
- **Live append:** while watching an active session, new beats must keep appearing and the energy-pulse must keep running.
- **Transparent / pure-core conventions** unchanged. No new I/O outside the store.

## Design

Source the live player's beats for the **selected** session from the full fold, refreshed when the session changes or gains new activity — identical to how replay and the aggregate panels already work. Retain the byte backfill **only** as a cheap metadata seed for the session list (status, title, ctx%, lens phase), where beat-completeness is irrelevant.

### Data flow

```
discover (all sessions, cheap)
  └─ store.pollOnce → backfill 64KB tail → SessionState  (list metadata only: status/title/ctx)

selected session:
  App: selectedFullBeats = store.fullBeats(selectedId)        // full fold
       memoized on (selectedId, selected.lastActivityTs)      // re-fold on switch / new activity
  └─ usePlayers seeds the SELECTED player with selectedFullBeats
     └─ player.rebuild() preserves head/cursor → live append keeps animating
```

Unselected sessions keep seeding their (never-rendered) players from `s.beats` — unchanged, and irrelevant since only the selected player ticks and only its panels render.

### Why bounded

A full fold happens **only** for the one selected session, and only when `selectedId` or `lastActivityTs` changes. That is the same cost profile replay already pays (`store.fullBeats` on demand). For an actively streaming session, `lastActivityTs` advances ~once per 750 ms poll → at most one fold per poll of the single watched file. Unselected sessions never full-fold, so the 408 MB / 1896-file startup stays bounded.

### Why permanent, not a patch

- Removes the byte window as a beat source entirely — no magic byte threshold to tune (bumping 64 KB → 256 KB only moves the cliff to bigger metadata clusters).
- One source of truth for beats: the full transcript, shared by all three consumers.
- Eliminates the whole bug class: zero beats **and** token/cost undercount for the watched session.

### Components touched

- **`src/ui/App.tsx`** — compute `selectedFullBeats` via `useMemo` keyed on `(selected?.id, selected?.lastActivityTs)`; pass to `usePlayers`. (Optional, same root cause: read header token/cost for the selected session from the full-fold `full` state so the displayed total is the session total, not the backfill tail.)
- **`src/ui/usePlayers.ts`** — accept the selected session's full beats; seed the selected player from them instead of `s.beats`. Unselected players unchanged.
- **No store/tailer/reducer change.** The byte backfill keeps its current role (list metadata); `fullBeats`/`fullSession` already exist.

## Error handling / edge cases

- **Genuinely empty sessions** (e.g. `07c9bd8b`, `bceb7a0f` — only `mode`/`attachment`/`user`, no `assistant`): full fold correctly yields 0 beats. This is correct behavior, not the bug — nothing to render. Unchanged.
- **Selected session not yet discovered / null:** `selectedFullBeats` is `[]`; player shows empty, as today.
- **Session switch mid-replay:** unaffected — replay already uses `fullBeats`; this change makes the *live* player consistent with it.
- **Large file (14 MB) actively streaming while selected:** one full fold per ~750 ms poll. `loadSession` is `readFileSync` + split + reducer fold — acceptable for a single file the user is actively watching; matches replay's existing cost.

## Testing

Pure-core / wiring, TDD:

1. **Regression fixture (core):** a transcript whose final 64 KB is entirely metadata entries (`file-history-snapshot`/`attachment`/`worktree-state`) preceded by real `assistant` entries. Assert:
   - `loadBeats(file)` (full fold) yields the assistant beats.
   - A backfill-window fold of the same file yields **0** beats — documents the precise failure the fix routes around.
2. **Token correctness (core, optional):** assert `loadSession(file).tokens` cumulative input/output exceeds a backfill-window fold of the same file (undercount demonstrated + fixed by full fold).
3. **Wiring:** assert the selected player is seeded from full beats (e.g. `usePlayers` seeds the selected player from the passed full-beats array, not `s.beats`). Unit-test the seeding seam directly rather than the React tree.

## Out of scope

- Reworking the backfill into a semantic window (not needed once beats come from the full fold).
- Live-refreshing the aggregate panels on new activity (separate pre-existing limitation; `full` currently snapshots on panel/session switch).
- Any change to discovery, status heuristics, or the player's pacing algorithm.
