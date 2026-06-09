# Header reveal animation (cursor-synced cost/ctx) — design

**Date:** 2026-06-09
**Branch:** `feat/header-reveal-animation` (built on `fix/header-full-fold-cost` / PR #13)
**Status:** approved, ready for plan

## Problem

The panels (Lens/Flow/Files/Tasks/Git) reveal in sync with the player cursor —
`progress = cursor/total` — so they visibly build up 0→full during the initial
reveal, on replay (`r`), and when scrubbing (`↑`/`↓`). The **header**, by contrast,
always shows the whole-session totals (`$cost`, `ctx%`), static, even mid-reveal.
The user expects `$cost` and `ctx%` to **count up in lockstep with the cursor**, like
the rest of the dashboard.

This works for already-finished sessions too: the per-beat values are re-derived by
folding the stored transcript (every `usage` field is in the `.jsonl`), so selecting
or replaying a completed session sweeps the cursor 0→end and the header counts up
alongside — no dependence on having watched it live.

## Design (approach A — per-beat cumulative snapshot)

Stamp each beat, at fold time, with the cumulative cost + context tokens **as of that
beat**. The header displays the snapshot **at the cursor**. One rule — *value-at-cursor*
— covers every mode:

| Mode | cursor | header shows |
|---|---|---|
| Initial reveal / replay | sweeps 0→end | counts up 0→total |
| Scrub `↑`/`↓` | moves back/forward | value at that point in history |
| Live edge / paused at head | `cursor == head` | the whole-session total (**unchanged**) |
| Empty session (no beats) | 0 | the merged total (fallback) |

At the head, the snapshot **equals** the whole-session total (the last beat carries the
final cumulative), so the feature is purely **additive**: identical to PR #13 at rest,
counting up only when `cursor < head`.

### Why the limit stays stable (the gauge doesn't reset)

`ctx%` is `contextTokens / effectiveContextLimit(model, contextTokens)`, and
`effectiveContextLimit` infers a 1M window once `ctx > 200k`. If the gauge's denominator
were recomputed from the *animating* ctx, a 1M session would fill to ~100% of 200k, then
snap back to ~20% when the inference flips at 200k. To avoid that, the header derives the
**limit once from the session's final ctx** (stable for the whole sweep) and animates only
the numerator. So a 1M session's bar fills smoothly `0 → final%` (e.g. 0→94%), always ≤100%.

### Data model

`src/core/types.ts` — add to `Beat`:

```ts
export interface BeatSnap { cost: number; ctxTokens: number }
// in Beat:
  snap?: BeatSnap;  // cumulative cost + context tokens as of this beat (reveal animation)
```

Only `cost` + `ctxTokens` are stored. `ctx%` is derived in the header against the stable
final limit (above); `pct` is never persisted per beat.

### Components touched

- **`src/core/reducer.ts`** — `pushBeat` stamps `snap: { cost: s.costUSD, ctxTokens: s.tokens.contextTokens }`.
  All beats are pushed inside `foldAssistant`, *after* that entry's usage is folded, so the
  snapshot reflects the running cumulative cost/ctx at that beat. Non-usage turns carry the
  value forward (the running totals are unchanged between usage entries).
- **`src/core/player.ts`** — `rebuild` (coalescing) keeps the **later** beat's snap when
  merging adjacent same-kind/label/lane beats: `snap: b.snap ?? last.snap`. (Coalescing
  equality is unchanged — `snap` doesn't affect *what* merges, only the kept value.)
- **New `src/ui/headerReveal.ts`** — two pure helpers:
  - `cursorSnapshot(beats: Beat[], cursor: number): BeatSnap | null` — `beats.length === 0 → null`
    (caller falls back to totals); `cursor <= 0 → { cost: 0, ctxTokens: 0 }` (start of reveal);
    else `beats[min(cursor, beats.length) - 1].snap ?? null` (snapshot-less beats → null fallback).
  - `headerValues(session: SessionState, reveal: BeatSnap | null): { cost; ctxTokens; pct; limit }`
    — `limit = effectiveContextLimit(session.model, session.tokens.contextTokens)` (stable, final).
    With `reveal`: `{ cost: reveal.cost, ctxTokens: reveal.ctxTokens, pct: limit>0 ? reveal.ctxTokens/limit : 0, limit }`.
    Without: the session's own `costUSD` / `contextTokens` / `contextPct` / `limit` (current behavior).
- **`src/ui/Header.tsx`** — accept an optional `reveal?: BeatSnap` prop; render cost/gauge/%/numerator
  from `headerValues(session, reveal)` instead of reading `session` fields directly. `status`,
  `model`, `elapsed` unchanged (not animated).
- **`src/ui/App.tsx`** — `const reveal = activePlayer ? cursorSnapshot(activePlayer.all(), cursor) : null;`
  pass to Showcase.
- **`src/ui/Showcase.tsx`** — thread `reveal` through to `<Header>`.

### Data flow

```
full fold (loadSession) → beats each stamped snap{cost,ctxTokens}   (reducer.pushBeat)
  → player.rebuild coalesces, keeps later snap
  → App: reveal = cursorSnapshot(activePlayer.all(), cursor)
  → Header: headerValues(mergeHeaderSession-session, reveal)
       cost/ctxTokens/pct ← reveal (or session totals if no reveal); limit ← final session ctx (stable)
```

`mergeHeaderSession` (PR #13) still supplies the base session — the **stable limit** (final ctx),
`status`, `model`, `elapsed`, and the no-beats fallback. The replay player and the live player both
seed from the full fold, so both carry snapshots; the same `cursorSnapshot` call serves both.

## Error handling / edge cases

- **No beats / snapshot-less beats** (synthetic beats in tests, or a beat predating this feature):
  `cursorSnapshot` returns `null` → `headerValues` shows the session totals — exactly today's behavior.
- **cursor at head** → snapshot is the final cumulative → header shows totals (identical to PR #13;
  no visual change at rest).
- **cursor 0 during replay** → `{ cost: 0, ctxTokens: 0 }` → `$0.00`, `0%` — matches the empty panels.
- **1M-context sessions** → limit fixed at the final inferred value for the whole sweep; gauge ≤100%.

## Testing (TDD)

1. **Reducer (core):** fold two assistant entries that carry usage; assert the beats' `snap.cost`
   and `snap.ctxTokens` are non-decreasing and the last beat's snap equals the session's final
   `costUSD` / `contextTokens`.
2. **Coalescing (core):** `player.rebuild` on adjacent mergeable beats keeps the **later** snap.
3. **`cursorSnapshot` (unit):** cursor 0 → zeros; mid → `beats[cursor-1].snap`; empty beats → null;
   snapshot-less beat → null.
4. **`headerValues` (unit):** with `reveal` → cost/ctxTokens from reveal, `pct = ctxTokens/finalLimit`,
   limit from the **final** session ctx (assert it does NOT move when the reveal ctx is below 200k while
   final ctx is above — the stable-limit property); without `reveal` → session totals unchanged.
5. **Visual (tmux):** replay (`r`) a large session; the header `$cost` counts up 0→total and the ctx
   gauge fills smoothly 0→final% in step with the panels; at the head it rests on the totals.

## Out of scope

- Animating `elapsed`, `status`, or `model` (decided: only `$cost` + `ctx%`).
- Per-lane / subagent-scoped snapshots.
- Changing the player's pacing/cadence or the coalescing equality rule.
- Reworking `effectiveContextLimit` (the 1M inference itself is unchanged).
