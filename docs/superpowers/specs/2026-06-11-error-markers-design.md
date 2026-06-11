# Error Markers + Jump-to-Error — Design

Date: 2026-06-11
Status: approved (issue #22 carries the validated scope; autonomous resume)

## Problem

Error beats (tool_result `is_error`) color a Flow label red but are easy to
miss in a long timeline, and there is no way to navigate to them. Issue #22.
Scope note from the issue: permission-prompt blocking is NOT visible in JSONL
(CLAUDE.md gotcha) — errors only.

## Prior art — agent-flow

`error` event type + scrubber `EventMarkers` in `control-bar.tsx`, colored by
type.

## Design

### Error beat definition

A beat with `ok === false` (reducer already pairs `tool_result.is_error` onto
the originating tool beat). API-level errors that never appear as entries are
invisible to a passive tailer — out of scope, documented.

### Player: coalescing must not swallow errors (`src/core/player.ts`)

Today `rebuild()` merges runs of same kind+label+lane keeping the FIRST
beat's fields — a later `ok=false` in a run vanishes. Fix: a beat with
`ok === false` breaks the run (never merges into the previous beat, and the
next beat starts fresh). Errors stay singular nodes — accurate markers AND
stable jump targets. (`setBeats` re-coalesces every poll, so an error landing
late splits the run on the next rebuild; cursor clamp already handles it.)

New player methods:

- `jumpError(dir: 1 | -1): boolean` — search coalesced beats for `ok === false`
  strictly after the head (`cursor - 1`) for `+1`, strictly before for `-1`;
  on hit `cursor = idx + 1` (error beat lands at the revealed head), `pause()`;
  returns whether it moved. No wrap-around (predictable scrubbing).

### Keys (`src/ui/keymap.ts`, `App.tsx`, help)

- `e` → `{ type: "error-next" }`, `E` (shift) → `{ type: "error-prev" }`.
- App dispatcher: `player?.jumpError(±1)` (auto-pauses like ↑/↓ scrub).
- Menu help rows + command palette entries (`errors.next` / `errors.prev`);
  CLAUDE.md Keys line updated.

### Render

- **Flow** (`src/ui/panels/Flow.tsx`): node with `beat.ok === false` renders
  glyph `✗` in `theme.err` (label is already red via the existing branch).
- **Lens timeline** (`src/core/lens-bands.ts` + `lens/skillTimeline.ts`):
  `lensTimeline` output gains `errors: { ts: number }[]`; the axis row draws a
  red `✖` tick per error (same reveal gating as milestone `◆`; milestone wins
  the cell on collision — rarer signal placed last).

## Testing

- `tests/player.test.ts`: error beat breaks coalescing (run of 3 with middle
  error → 3 nodes); `jumpError(1)` lands cursor past the next error + pauses;
  `jumpError(-1)` finds prior; returns false (cursor unmoved) when none;
  no wrap.
- `tests/keymap.test.ts`: `e`/`E` mappings.
- `tests/lens-bands.test.ts`: `lensTimeline().errors` ts extraction +
  reveal gating.
- Visual tmux pass: red ✗ node in Flow, ✖ tick on the Lens axis, `e` hops the
  cursor between errors.

## Out of scope

Permission-prompt markers (not in JSONL); API-error entries (no parsed shape
today); error count badge in header.
