# Responsive sub-nodes + loop-on-top

**Date:** 2026-06-12
**Panel:** Lens (`src/ui/panels/Lens.tsx`, `src/core/pipeline-geometry.ts`)

## Problem

The Lens canvas renders the tool/skill sub-node tree and the backward
chat→think return loop in the same region *below* the node row. Two issues:

1. **Truncation despite slack.** Sub-node labels are hard-capped at
   `clip(it.label, 14)` and `SUB_PITCH` is a fixed `16`. A wide terminal buys
   more sub-nodes horizontally but never wider labels — `Bash · npm test` clips
   even with 200 columns free. The display is not responsive to `$COLUMNS`.
2. **Loop/sub-row collision.** `channelY = max(nameBottom, sr.labelY+1)` forces
   the backward loop *under* the sub-node tree. Its horizontal segment cuts
   across beneath the tool labels — visual pollution that worsens as more tools
   become active and the tree grows.

## Goals

- Sub-node pitch and label width are **pure functions of available width and
  item count** — full text when slack allows, graceful `+N more` overflow when
  crowded. Fully dynamic on terminal columns.
- Separate the two concerns onto opposite sides of the node row: **loop above,
  sub-nodes below**, so neither crowds the other.

## Non-goals

- No change to node boxes, forward wires, bottom bands (economy/ctx/heartbeat/
  timeline), HUD, ribbon, or the data model / reducer.
- Sub-nodes stay **fan-anchored at the tool's diamond port** (preserve the
  n8n hang-from-tool parent→child link). Arms spread wider as pitch grows,
  clamped to panel edges — they do not detach to full-panel width.

## Design

### Part 1 — Backward loop routes above the row

Today `wireLoop(a, b, channelY)` draws a rounded U *below* the row, with
`channelY` at the bottom of the name/sub-row block.

Change:

- Add an **above** routing — either a new pure fn `wireLoopAbove(a, b, channelY)`
  or a `dir: "above" | "below"` parameter on `wireLoop`. It mirrors the U
  vertically: exits chat's output port upward, runs left across a channel row
  *above* the boxes, drops down into think's input port. Corner glyphs flip
  (`╮╯` ↔ `╭╰` on the appropriate corners); the entering `▶` is unchanged.
- The **`+1` reserved channel row moves from the bottom of the block to the top.**
  Net vertical budget is unchanged: `blockNeed()` keeps its `+1`, but it is now
  spent above the row instead of below.
- Row top placement: `top = max(regionTop + 1, regionTop + ((regionBottom -
  regionTop - blockH) >> 1))` so there is always a channel row between the
  ribbon and the boxes when a loop is present. `channelY = top - 1`.
- `loopOn` guard changes from `channelY < regionBottom` to **`top - 1 >=
  regionTop`** (room exists above). Backward-hop detection (`backCount`,
  `hotBack`) is unchanged.
- Sub-row no longer reserves loop space: `blockBottom` / `channelY` coupling for
  the sub-row drops. Sub-nodes extend downward toward `regionBottom` freely.

### Part 2 — Responsive sub-node geometry

`subRow(tool, n, width)` becomes width-driven and returns a new `labelW` field.

```
innerSpan   = width - LEFT - 2
PITCH_MIN   = SUB_W + 3                 // floor: circle + min gap, no collision
maxLabelLen = max label length among the items
fit         = floor(innerSpan / PITCH_MIN)            // circles that fit at floor
shown       = min(n, fit)
pitch       = clamp(floor(innerSpan / shown), PITCH_MIN, maxLabelLen + 2)
labelW      = pitch - 1                               // labels fill cell, no overlap
```

Resulting behavior, all driven by the live `width`:

- **Wide + few tools** → `pitch` grows up to `maxLabelLen + 2`; full labels
  (`Bash · npm test`) shown, spread out under the tool.
- **Wide + many tools** → `pitch` floors at `PITCH_MIN`; labels clip to
  `labelW`; surplus rolls into the existing `+N more` indicator.
- **Narrow** → same floor logic, fewer shown.

The fan trunk still originates at the tool diamond and centers the shown
circles under the tool, clamped to panel edges (existing clamp logic, now with
dynamic `pitch`/`span`).

`SubRowLayout` gains `labelW: number`. `PITCH_MIN` is exported.

### Part 3 — Render wiring (`Lens.tsx`)

- Call the above-routing loop fn; set `channelY = top - 1`; move the `+1`
  reserve to `top` placement; update the `loopOn` guard.
- `drawSubNode` takes the label width from layout: `clip(it.label, layout.labelW)`
  replaces the hard-coded `clip(it.label, 14)`. (Pass `labelW` through to
  `drawSubNode`, or read it where the circles are drawn.)
- No other render zones change.

## Files

| File | Change |
|------|--------|
| `src/core/pipeline-geometry.ts` | `wireLoopAbove` (or `dir` param); dynamic `pitch`/`labelW` in `subRow`; `labelW` on `SubRowLayout`; export `PITCH_MIN` |
| `src/core/pipeline-geometry.test.ts` | New failing tests (TDD) — see below |
| `src/ui/panels/Lens.tsx` | Above-loop call; top `+1` reserve; `channelY = top-1`; `loopOn` guard; `drawSubNode` uses `labelW` |

## Testing

Pure-core unit tests (`bun test`), written failing first:

- `subRow`: pitch spreads to `maxLabelLen+2` when wide + few items.
- `subRow`: pitch floors at `PITCH_MIN` and `shown` drops + `+N more` when wide + many.
- `subRow`: `labelW === pitch - 1`; labels never overlap (circle spans disjoint).
- `subRow`: narrow width still clamps within panel; no negative coords.
- `wireLoopAbove`: channel row above the boxes; correct flipped corner glyphs;
  enters think input port with `▶`; coordinates mirror `wireLoop`.

Visual verification via tmux at three widths (`-x 90`, `-x 150`, `-x 220`) on a
many-tools live session: full labels when wide, `+N more` when crowded, loop
arcs cleanly above the row with no sub-node overlap. Frame-diff (`-e`) confirms
the orbiting ring / pulse still animate.
