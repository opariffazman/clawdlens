# Live-busy ring keep-alive — design

**Date:** 2026-06-12
**Status:** Approved

## Problem

On live, the Lens active-component box looks dead while the session is actually
working. Example: the `devops-bootcamp` session mid-Bash shows a static box with
no motion, reading as "not doing anything."

### Root cause

The orbiting coral ring on the active node is gated on `animating` (`animate`
prop). `animate` comes from `shouldAnimate(mode, lastAdvanceMs, intervalMs, now)`,
which is true only while the player is `playing` AND advanced within the last
~2 intervals. When the live player **catches up** (mode stays `playing`, but no
new beats arrive, so `now - lastAdvanceMs > intervalMs*2`), `animate` flips to
false and the ring stops.

The only fallback is `thinkPulse = (status==="working"||"running") && activeKind==="think"`,
which breathes the think box during long thinks. Any other active kind — most
importantly `tool` during a long Bash (`activeKind==="tool"`, `status==="running"`) —
has **no** keep-alive, so the box sits completely still on live.

This is an animation-gate gap, not a data bug: the active kind, tool detail, and
status are all correct in the store; nothing re-runs the render loop or spins the
ring once the timeline catches up.

## Goal

Whenever the **real session** is busy on live, the active component box shows
continuous motion (the orbiting ring), driven off the wall clock independent of
whether the timeline player is advancing — and the specific running tool is
surfaced both as a live sub-node and in the NOW HUD line.

## Design

### Live signal

Add a `live` boolean into Lens meaning "watching the live head" = player
`playing` AND caught up:

```
live = player ? (player.mode() === "playing" && player.backlog() === 0) : false
```

Gating on `live` (not status alone) keeps a paused/replay scrub static — we only
keep-alive when the user is actually at the live head.

### Ring keep-alive

```
liveBusy = live && (status === "working" || status === "running")  // ring on active node, RING_MS (fast)
liveWait = live && status === "waiting"                            // ring on chat node, RING_WAIT_MS (slow)

ring draws when: (animating || liveBusy || liveWait) && !flow.main.errored && status !== "error"
box `live` prop: animate || liveBusy || liveWait
```

- `liveBusy` **strictly generalizes** the current `thinkPulse` (think-while-working)
  to every active kind, so `thinkPulse` is removed.
- The ring animates off `now % periodMs` (see `drawRing`), so setting the box
  `live` prop true is enough to make it spin — no dependence on beat advances.
- Existing ring infrastructure is reused unchanged: `drawRing`, `ringKey`
  (waiting→`chat`, else active kind's box), and `RING_MS` vs `RING_WAIT_MS`
  (already keyed on `status==="waiting"`). Only the **gate condition** widens.

### Show the tool

**Sub-node (default sub-row, `infoOn=false`).** When `liveBusy && activeKind==="tool"`
and there is a pending (running) tool, prepend a live sub-node:
- glyph = active tool icon (`iconFor(iconKeyFor(activeToolName))` / existing `activeTool` iconKey)
- label = tool name (+ short detail if room), e.g. `Bash · npm test`
- `live: true` → breathes via the existing `it.live && (animating || liveBusy)` path

**HUD line.** The NOW band already prints `⚙ tool · detail`. Kept as-is; the
"Both" choice is satisfied by adding the sub-node alongside it.

### Pure-core support

`core/pipeline-flow.ts` `LaneFlow` gains `activeToolName: string | null` — the
head beat's `label` when the head is a tool (the human tool name, e.g. `Bash`),
else null. (`activeTool` already exposes the iconKey; the name is needed for the
sub-node label.)

## Components / files

| File | Change |
|------|--------|
| `core/pipeline-flow.ts` | add `activeToolName` to `LaneFlow` (head tool label) |
| `ui/anim.ts` | add pure predicate `ringSpin(status, live, animating) → { spin, slow }` |
| `ui/App.tsx` | compute `live`; pass to `Showcase` |
| `ui/Showcase.tsx` | thread `live` prop into `Lens` |
| `ui/panels/Lens.tsx` | accept `live`; use `ringSpin`; widen ring gate + box `live`; inject active-tool sub-node; drop `thinkPulse` |

## Pure predicate

Extract the gate so it is unit-testable without rendering:

```ts
// ui/anim.ts
export function ringSpin(status: Status, live: boolean, animating: boolean): { spin: boolean; slow: boolean } {
  if (status === "error") return { spin: false, slow: false };
  const busy = live && (status === "working" || status === "running");
  const wait = live && status === "waiting";
  return { spin: animating || busy || wait, slow: !animating && wait };
}
```

The Lens consumes `{ spin }` to gate the ring + box `live`, and uses
`status==="waiting"` (as today) to pick `RING_WAIT_MS`. `slow` documents the
waiting-only slow case for the test matrix; the existing RING_MS/RING_WAIT_MS
selection already encodes it, so Lens need not read `slow` directly.

## Error handling

- Errors stop the ring (existing behavior preserved: `!flow.main.errored && status !== "error"`).
- No `live` player (no session) → `live=false` → no keep-alive → CLAWDLENS splash
  and idle states unaffected.

## Testing

**TDD pure core (failing test first):**
- `pipeline-flow.test.ts`: `activeToolName` = head tool's label when head is a
  pending tool; `null` when head is non-tool or there are no beats.
- `anim.test.ts`: `ringSpin` matrix —
  - working+live → `{spin:true, slow:false}`
  - running+live → `{spin:true, slow:false}`
  - waiting+live → `{spin:true, slow:true}`
  - idle+live → `{spin:false}`
  - dormant/done+live → `{spin:false}`
  - working+!live → `{spin:false}` (paused/replay scrub stays static)
  - working+live but animating=true → `{spin:true}` (replay reveal still spins)
  - error (any) → `{spin:false}`

**Visual verify (tmux, per CLAUDE.md):** run in tmux, focus a working session,
capture two `-e` frames a beat apart while caught-up, diff to confirm the ring
border cells advance (recolor) with no new beats. Confirm the tool sub-node
appears and breathes during a live tool call.

## Out of scope (YAGNI)

- No new animation styles (breathe-only, combined) — ring only, per decision.
- No changes to replay/scrub pacing or `shouldAnimate`.
- No tool sub-node in `infoOn` (tool-breakdown) view — that view already lists
  tools; the live-tool node is a default-view affordance.
