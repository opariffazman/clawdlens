# Per-Tool Timing Stats — Design

Date: 2026-06-11
Status: approved (issue #21 carries the validated scope; autonomous resume)

## Problem

`toolStats` counts calls per tool but says nothing about time. "Which tool is
the bottleneck" needs durations: tool_use entry ts → paired tool_result entry
ts. Issue #21. Constraint: passive JSONL fold only.

## Prior art — agent-flow

`tool_call_start`/`tool_call_end` events + `tool-detail-popup.tsx`. ClawdLens
already pairs results via `pendingTools` — durations are a small extension.

## Design

### Reducer accumulator (`src/core/reducer.ts` + `types.ts`, pure)

- `pendingTools` value widens from `string` (beat id) to
  `{ beatId: string; name: string; ts: number }` — internal accumulator, shape
  change is invisible outside the reducer except `newSession`.
- New `SessionState.toolTimings: Record<string, ToolTiming>` with
  `ToolTiming { count: number; totalMs: number; minMs: number; maxMs: number }`
  (avg derived = total/count).
- `foldUser` (which currently `void ts`) computes
  `durMs = max(0, resultEntryTs - pending.ts)` per paired tool_result and folds
  it into `toolTimings[pending.name]` immutably.
- `toolStats` stays as-is: it counts every tool_use (including unresolved /
  in-flight); `toolTimings` only resolved pairs. Both are aggregates → consumed
  through the existing `fullSession()` fold, no new App gate.

Caveat (documented, accepted): result-entry ts includes queueing + any
permission-prompt wait (indistinguishable via JSONL — CLAUDE.md gotcha), so
durations read as wall-clock "time until result", not pure execution time.

### Surface: lens `i` detail (view model in `src/core/lens-bands.ts`)

- New pure `toolTimingView(timings): Row[]` — rows sorted by `totalMs` desc
  (bottleneck first): `{ name, count, avgMs, maxMs, totalMs }`.
- Lens `i` flip (existing tool-breakdown sub-row) renders the timing rows:
  `Bash ×12 · avg 2.3s · max 12s`, truncating gracefully at narrow widths
  (count always survives; avg, then max, dropped under pressure).
- New `fmtDur(ms)` in `src/ui/format.ts`: `<1s` → `0.4s`, `<60s` → `12s`,
  else `1m35s`.

## Testing

- `tests/reducer.test.ts`: tool_use→tool_result pair yields one timing entry
  with correct durMs; two calls same tool fold min/max/total; unresolved
  tool_use contributes nothing; error result still times (is_error pairs too);
  Task tool pairs time like any other.
- `tests/lens-bands.test.ts`: `toolTimingView` ordering + avg derivation.
- `tests/format.test.ts`: `fmtDur` boundaries (999ms, 1s, 59.9s, 95s).

## Out of scope

Sortable full-screen table panel (Files-style) — the lens `i` band answers the
question; a dedicated panel can come later if the band proves cramped.
