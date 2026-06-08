# Header full-fold cost/tokens — design

**Date:** 2026-06-09
**Branch:** `fix/header-full-fold-cost`
**Issue:** #12 (follow-up to PR #11 — the reverted Task 4)
**Status:** approved, ready for plan

## Problem

The header (`src/ui/Header.tsx`) reads from the live `session` prop, which the store
seeds from the **64 KB backfill window** (the file's tail). For long sessions that
window holds only a fraction of the transcript, so the header's **cumulative** fields
are undercounted:

- **`session.costUSD`** (`Header.tsx:39`) — accumulated additively in the reducer
  (`costUSD = estimateCostUSD(cumulativeTokens, model)`). With backfill-only seeding it
  sums only the tail's tokens → the displayed cost is the tail's cost, not the session's.
- **`session.startedTs`** → `elapsed` (`Header.tsx:23`) — set to the first entry *in the
  window*, not the true session start, so the elapsed timer reads far too short.

`contextPct` / `contextTokens` (`Header.tsx:21,24,38`) are **not** victims: they are set
*absolutely* from the last usage entry, identical in both folds. `status`
(`Header.tsx:20,32`) is recomputed live by the store every poll.

### Reproduced

Against a real 3.9 MB transcript:

| Field | Full fold | Backfill window |
|---|---|---|
| `costUSD` | **$511.91** | $12.71 (2.5%) |
| `tokens.input / output` | 127773 / 1218289 | 19818 / 8459 |
| `contextTokens` / `contextPct` | 713204 / 0.71 | 713204 / 0.71 (identical) |

A **40× cost undercount**; `contextPct` confirmed unaffected.

### Why the one-line fix (`<Header session={agg}/>`) was reverted in PR #11

Routing the *whole* header through the full-fold state breaks two live fields:

1. **Stale status.** `loadSession` (`src/core/loadTranscript.ts`) folds entries but never
   calls `deriveStatus` (only the store's `recompute` does, `sessionStore.ts:62`). So the
   full fold's `status` stays at the `newSession` default `"idle"` (`reducer.ts:106`) —
   verified: full fold reports `idle` on the reproduced session. A running session would
   wrongly show **idle**.
2. **Frozen ctx%.** The aggregate `full` state refreshes only on `[panel, selected?.id,
   gitScope]` (`App.tsx:83`), not `lastActivityTs`, and is `null` on the `log` panel. Cost
   and ctx would freeze at switch time instead of climbing live.

So the header genuinely needs **live** `status` + `contextPct` AND **full-fold**
cumulative `costUSD` + `startedTs`. The two sources can't be swapped wholesale.

## The realization that points to the fix

`App.tsx` already folds the selected session's **whole** transcript on every activity
tick — `selectedFullBeats = useMemo(() => store.fullBeats(id), [id, lastActivityTs])`
(`App.tsx:67`, added by PR #11 to fix the beats undercount). `store.fullBeats` is
`loadSession(file).beats` — it computes the entire `SessionState`, **with the correct
cumulative `costUSD` and `startedTs`**, then discards everything but `beats`.

The correct whole-session cost is already being computed, live, once per poll for the
selected session — and thrown away. The fix is to stop discarding it.

## Design (approach B, refined)

Source the header's **cumulative** fields (`costUSD`, `startedTs`) from that already-live
full fold, and keep its **live** fields (`status`, `contextPct`, `contextTokens`, `model`)
from the live `session`. A small, pure field-level merge.

### Data flow

```
selected session (live `session`):  status ✓ live · contextPct ✓ live · costUSD ✗ tail
selectedFull = useMemo(store.fullSession(id), [id, lastActivityTs]):  costUSD ✓ whole · startedTs ✓ whole · beats ✓ whole
                                                                       status = "idle" (loadSession never derives) — NOT used

header = mergeHeaderSession(live, selectedFull)
       = { ...live, costUSD: full.costUSD, startedTs: full.startedTs || live.startedTs }
         // live status/contextPct preserved; whole-session cost/elapsed grafted in
player  ← selectedFull.beats   (unchanged from PR #11, now via .beats of the same fold)
```

`selectedFull` re-folds on `lastActivityTs`, so the header's cost **climbs live** as the
watched session grows — better than the issue's plain-B sketch, at zero extra cost.

### Components touched

- **New `src/ui/headerSession.ts`** — pure `mergeHeaderSession(live, full)`:
  - `null` live → return `live` (passthrough; Showcase's guard handles a null session).
  - `null` full (not yet folded) → return `live` unchanged.
  - else → `{ ...live, costUSD: full.costUSD, startedTs: full.startedTs > 0 ? full.startedTs : live.startedTs }`.
  - The full fold is a **superset** of the backfill window, so `full.costUSD >= live.costUSD`
    always — the override never *lowers* the displayed cost.
- **`src/ui/App.tsx`** — repurpose the existing memo:
  - `selectedFullBeats` (`Beat[]`) → `selectedFull` (`SessionState | null`) via
    `store.fullSession(selected.id)`, **same deps** `[selected?.id, selected?.lastActivityTs, store]`.
  - `usePlayers(sessions, selected?.id ?? null, selectedFull?.beats ?? [])` — beats from `.beats`.
  - Pass `mergeHeaderSession(selected, selectedFull)` as Showcase's `session` prop
    (`App.tsx:233`).
- **No change** to `Header.tsx`, `Showcase.tsx`, `usePlayers.ts`, the store,
  `loadTranscript.ts`, or the reducer.

### Why passing the merged session as Showcase's `session` prop is safe

Showcase reads `session` for: the null guard, `agg = full ?? session` (consumed only as
`agg.fileHeat` / `agg.todos` / `agg.lens`), `Lens status={session.status}`, and
`<Header session={session}/>`. The merge overrides only `costUSD` and `startedTs` — fields
**no consumer reads except the Header**. `status` and `tokens` stay live. So overriding at
the App→Showcase boundary is globally correct (no consumer wants the backfill cost) and
needs **zero** change to Showcase or Header.

### Why bounded (acceptance criterion: no unbounded startup cost)

`selectedFull` folds **only** the one selected session, and only when `selected.id` or
`lastActivityTs` changes — identical to the bound PR #11 already established with
`selectedFullBeats`. `store.fullBeats` → `store.fullSession` is the same `loadSession` call
(one reads `.beats`, the other the whole state); no new fold, no new I/O. Unselected
sessions never full-fold.

## Error handling / edge cases

- **Selected session not yet folded / null:** `selectedFull` is `null` →
  `mergeHeaderSession` returns the live session → header shows backfill cost until the
  first fold (one poll), as today. No crash.
- **Genuinely empty session** (full fold yields 0 entries): `full.costUSD` 0,
  `full.startedTs` 0 → guard keeps `live.startedTs`; cost 0 matches the live ~0. Correct.
- **1M-context models:** untouched — `contextPct`/`contextTokens` still come from the live
  session and `effectiveContextLimit` is unchanged (CLAUDE.md gotcha preserved).

## Testing

Pure-core / wiring, TDD:

1. **Cost contract (core).** A transcript with an early high-usage `assistant` entry, a
   ~70 KB metadata blob, then a small-usage `assistant` entry. Assert:
   - `loadSession(file).costUSD` (full fold) sums **both** usages.
   - a backfill-window fold (`createTailer().read(file, { tailBytes: 65536 })`) sees only
     the tail → `backfill.costUSD < full.costUSD` and `backfill.tokens.input < full.tokens.input`.
   This locks the undercount-and-fix contract (the deferred PR #11 test item 2).
2. **Merge seam (wiring).** Unit-test `mergeHeaderSession` directly (no React tree):
   - `costUSD` and `startedTs` come from `full`; `status` and `tokens.contextPct` come from `live`.
   - `mergeHeaderSession(live, null)` returns `live` unchanged.
   - `mergeHeaderSession(null, full)` returns `null`.
   - `full.startedTs === 0` → merged `startedTs` falls back to `live.startedTs`.
3. **Visual (tmux).** On a long running session, the header `$cost` reflects the whole
   session (not the backfill tail), the status badge stays correct (not idle), and ctx% is
   unchanged.

## Out of scope

- Live-refreshing the **aggregate** panels (Files/Tasks/Git) on new activity — a separate
  pre-existing limitation; the aggregate `full` state stays snapshot-on-switch.
- Correcting cumulative `input`/`output` *totals* anywhere they aren't displayed (the
  header shows only `contextTokens`, which is absolute and already correct).
- Any change to discovery, the status heuristic, `loadSession`'s contract, or the backfill
  design.
