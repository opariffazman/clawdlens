# ClawdLens — Energy/Pulse Overhaul · Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm complete)
**Repo:** https://github.com/opariffazman/clawdlens
**Issue:** #3 (UI overhaul 2/4 — Energy/Pulse, depends on #2 Chrome & Theme)

## Goal

Replace the energy pulse's **free-running global wall-clock** with a **comet anchored to
the player cursor**. Today `Flow.tsx`/`Git.tsx` compute `headRow = (performance.now()/120)
% span` — decoupled from the player, it always restarts at the top and loops forever
regardless of playback. The new pulse:

- **Represents the actual playback speed** — its travel time between nodes is the player's
  `interval()` (which already folds in `speed()` and backlog).
- **Travels point-to-point, following the cursor** — a bright head pinned to the newest
  revealed node glides one node down the spine each time a beat reveals; it never restarts
  from the top.
- **Reads as prominent, pulsating energy** — a near-white head, a long neon tail, and a
  slow "breathe" on the parked head when nothing new is revealing.

This is **spec 2 of 4** in the UI/UX overhaul. Build order: **#2 Chrome → #3 Pulse (this)
→ #4 Lens → #5 Nav.** It renders inside the Chrome shipped by #2 and obeys its
transparent-OLED, no-bg-fill constraint (see [[transparent-no-bg-fills]]).

## Non-goals (out of scope)

- **Reveal / `progress` math** — the cursor-driven reveal (`progress = cursor/total`,
  Git's `revealed`/`buildingY`) is unchanged; the pulse rides on top of it.
- **Files/Tasks panels** — they have no spine/pulse; untouched.
- **Navigation, keymaps, lifecycle** — #5 Nav. The existing `p` (pulse toggle), `+/-`
  (speed), scrub/pause keys stay as-is; the pulse only consumes their effects.
- **Core data pipeline** (parse/reducer/status) — untouched.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Pulse model | **Comet follows cursor** — head pinned to the newest revealed node, glides node→node over one playback `interval()`; never loops from the top |
| Prominence | **Bold neon flow** — near-white head fading through the lane color, **tail = 7 cells**, head node glyph `◉` glows |
| Idle (caught-up live / paused) | **Breathe at head node** — head parks on the newest node and pulses a slow sine (`~1.8s`) brightness |
| Speed coupling | Glide duration = `player.interval()` (speed-divided + backlog-adaptive); no separate speed knob |
| Clock | Derive phase from **`Date.now()`** (the clock `tick()` advances on) — drop `performance.now()` entirely, removing the old global wall-clock and any cross-clock drift |
| Canvas | **fg-only** comet gradient; nothing painted on the bg (transparent-OLED rule) |
| Pulse off (`p`) | No comet/breathe; spine stays dim; `live={false}` (cheap static) |

## Architecture / approach

**Pure-core-first.** The pulse is decomposed into three layers:

1. **Cadence (player owns it).** The player already computes `interval()` (private) and
   tracks `lastAdvanceAt`. Expose both as getters so the renderer can derive the glide.
   No new timing state is stored — phase is computed, not held.
2. **Pure math (`anim.ts`, TDD).** Phase, comet color gradient, and breathe are pure
   functions with `bun:test` coverage. No I/O, no clock captured internally (clock passed
   in as `now`).
3. **Render (`Flow.tsx` + `Git.tsx`).** Thin buffered `setCell` draw that reads the pure
   functions at frame time. The two panels share the same comet logic; only the anchor
   row differs (Flow: newest beat node; Git: existing `buildingY`).

**Why frame-time, not React-render-time.** The glide + breathe want smooth motion. The
panels' `renderAfter` already runs at ~16fps when `live={true}` (the React tick is only
10fps). The inputs the renderer needs (`anchorRow`, `lastAdvanceMs`, `intervalMs`) are
**stable between advances**, so `renderAfter` can call `Date.now()` itself each frame and
compute a smooth phase without extra React state. This keeps the panels a thin render of
scalars while still animating at frame rate.

**Rejected approaches** (from brainstorm): (b) *continuous train* — many pulses flowing
down the whole spine; overtly "river-like" but not point-to-point and not anchored to a
single cursor point. (c) *spark per advance* — one discrete spark on each advance, dim
between; cheapest but fails "prominent/pulsating".

## Components / Changes

### 1. `src/core/player.ts` — expose cadence (2 getters)

Add to the returned object (no behavior change):

```ts
intervalMs(): number      // = interval()  — current adaptive, speed-divided ms
lastAdvanceMs(): number   // = lastAdvanceAt (−1 before the first advance)
```

- `intervalMs` surfaces the existing private `interval()` (`max(min, base*factor)/speed`).
- `lastAdvanceMs` surfaces the existing `lastAdvanceAt` closure var.
- Tests (`tests/player.test.ts`): `intervalMs()` shrinks as `setSpeed` rises and as
  backlog grows; `lastAdvanceMs()` is `−1` before the first `tick`, then advances and is
  monotonic across `tick`s.

### 2. `src/ui/anim.ts` — pure pulse math (TDD)

Keep `spinnerFrame`, `pulseIntensity`, `lerpHex`, hex helpers. Add:

```ts
// 0..1 progress from the last advance toward the next; 1 when parked
pulsePhase(now: number, lastAdvanceMs: number, intervalMs: number): number

// fg-only comet gradient: head (d≈0) → hot near-white; mid → lane; tail end → dim
cometColor(d: number, tail: number, laneHex: string, hotHex: string, dimHex: string): string

// slow breathing brightness for the parked head, range ~0.6..1.0
breathe(now: number, periodMs?: number): number   // default periodMs = 1800
```

- `pulsePhase` = `clamp((now − lastAdvanceMs) / intervalMs, 0, 1)`; returns `1` when
  `lastAdvanceMs < 0` or `intervalMs <= 0` (park on head, breathe). Clamp-to-1 also covers
  caught-up-live and paused (a stale `lastAdvanceMs` overshoots → parks).
- `cometColor` two-stage blend so the bright tip concentrates at the head:
  `base = lerpHex(dimHex, laneHex, t)` then `lerpHex(base, hotHex, t*t)`, where
  `t = pulseIntensity(d, tail)` (1 at head → 0 past the tail). Returns `dimHex` for
  `t <= 0`. Pure string→string; **no bg** is ever touched.
- `breathe` = `0.6 + 0.4 * (0.5 + 0.5*sin(2π·now/periodMs))` → smooth `0.6..1.0`.
- Tests (`tests/anim.test.ts`): `pulsePhase` endpoints (0 just after advance, →1 across the
  interval, clamps past it, `1` for `lastAdvanceMs<0`); `cometColor(0,…)` near `hotHex`,
  `cometColor(tail,…)` == `dimHex`; `breathe` stays in `[0.6,1]` and repeats by `periodMs`.

### 3. `src/ui/panels/Flow.tsx` — comet on the beat spine

- Remove the `performance.now()/120` wall-clock and the `% span` head loop.
- New props from App (all stable between advances): `lastAdvanceMs: number`,
  `intervalMs: number` (keep `cursor`, `pulse`, `width`, `height`, `beats`).
- Bump `TAIL` 4 → **7**. Use the shared near-white `theme.pulseHot` (see §6) as `HOT`.
- In `renderAfter` (runs each frame while `live={pulse}`):
  - `const now = Date.now();`
  - `const phase = pulsePhase(now, lastAdvanceMs, intervalMs);`
  - **Anchor** = newest revealed node row: `anchorY = (cursor − 1) * ROW_STRIDE` (guard
    `cursor < 1` → no comet).
  - **Head position** glides into the anchor: `headY = anchorY − (1 − phase) * ROW_STRIDE`.
  - For each spine cell at display row `y`: `d = headY − y`;
    `color = pulse ? cometColor(d, TAIL, laneColor, HOT, wireDim) : wireDim`.
  - **Head node** (`◉` on `cursor−1`): draw in `lerpHex(laneHot, HOT, breathe(now))` (or
    lerp lane↔HOT by `breathe`) so it pulses while parked and is bright while moving.
  - `pulse` off → all spine `wireDim`, node colors as today, no comet, no breathe.
- Node label/icon drawing is unchanged.

### 4. `src/ui/panels/Git.tsx` — same comet on the commit spine

Git reveals oldest→HEAD; the **building edge** (`buildingY`, newest revealed commit, chrono)
is the anchor. The pulse flows **down** toward HEAD, tail trailing up (older).

- Remove the `performance.now()/120` wall-clock head.
- New props: `lastAdvanceMs`, `intervalMs` (keep `commits`, `width`, `height`, `progress`).
- `TAIL` 4 → **7**; reuse the same `HOT`.
- In `renderAfter` (`live={animating}`, `animating = progress < 1`):
  - `const now = Date.now(); const phase = pulsePhase(now, lastAdvanceMs, intervalMs);`
  - `headY = buildingY − (1 − phase) * ROW_STRIDE`.
  - Per revealed wire cell at chrono `y`: `d = headY − y`; **at-rest tint preserved** so
    each branch keeps its color — `intensity` floor stays: color =
    `cometColor(d, TAIL, laneHex, HOT, wireDim)` blended with the existing `0.4` lane floor
    (i.e. never dimmer than today's resting lane tint). Concretely: if the comet color is
    dimmer than `lerpHex(wireDim, laneHex, 0.4)`, use the floor.
  - Commit node `●`/`◉` at the building edge gets the `breathe` brightening like Flow.
- Reveal threshold logic (`minIdx`/`minY`/`buildingY`) is unchanged.

### 5. `src/ui/Showcase.tsx` + `src/ui/App.tsx` — wire the cadence

- App already holds `activePlayer`, `cursor`, `progress`. Read the two new scalars once per
  render: `const lastAdvanceMs = activePlayer?.lastAdvanceMs() ?? -1;`
  `const intervalMs = activePlayer?.intervalMs() ?? 1000;`
- Pass both through `Showcase` to `Flow` and `Git`.
- No change to `forceRepaint` triggers: the comet animates inside `renderAfter` (cursor
  still drives the repaint-on-move for ghosting; pulse-only frames keep the cheap diff).

### 6. `src/ui/theme.ts` — shared `pulseHot` token

Add `pulseHot: "#F2FBFF"` (near-white) so Flow and Git share one comet-head color (no
per-file literal). The existing `wireHot` (`#00E5FF`, cyan, currently unused) is **not**
reused — the brainstorm chose a near-white tip, and the lane color already supplies the
hue as the comet fades from head to tail. `wireDim` stays the tail/dim end.

## Data flow

```
player.tick(Date.now())  ──advances──▶  cursor, lastAdvanceAt, interval()
        │                                         │
App reads: cursor, progress, lastAdvanceMs(), intervalMs()
        │
Showcase ─▶ Flow/Git props (anchor scalars, stable between advances)
        │
renderAfter @16fps:  now=Date.now()
   phase   = pulsePhase(now, lastAdvanceMs, intervalMs)   // 0→1 across one interval
   headY   = anchor − (1−phase)·ROW_STRIDE                // glides into newest node
   cell    = cometColor(headY−y, 7, lane, HOT, wireDim)   // fg-only neon tail
   headNode= lerp(lane, HOT, breathe(now))                // parked-head breathing
```

## Testing & verification

- `bun test`:
  - `tests/anim.test.ts` — `pulsePhase` (endpoints/clamp/`<0` park), `cometColor`
    (head=hot, tail-end=dim, mid=lane), `breathe` (bounds + period).
  - `tests/player.test.ts` — `intervalMs()` reacts to `setSpeed` + backlog;
    `lastAdvanceMs()` is `−1` pre-tick then monotonic.
- `bunx tsc --noEmit` (strict + `noUncheckedIndexedAccess`).
- **tmux visual** (`tmux new-session -d -s cl -x 150 -y 36 "bun run dev"`):
  - Live: comet head glides node→node, tail trails, head node breathes when caught up.
  - `+`/`-`: glide visibly speeds up / slows down (speed coupling).
  - `space` (pause) and `h`/scrub: head parks on the cursor node and breathes, no top-loop.
  - `R` replay: comet rides the replay cursor; `Git` comet rides the building edge.
  - `p`: comet off → dim static spine (Flow) / resting lane tint (Git).
  - `-e` frame-diff two captures to confirm the gradient animates; `CL_ICONS=unicode` ok.
  - Full transparency preserved (no bg patches behind the comet).

## Risks / open questions

- **Glide smoothness at high speed/backlog** — when the player advances several nodes in one
  `tick` (large backlog), the anchor jumps multiple nodes and only the last hop glides;
  acceptable (content is flying by), but confirm it doesn't strobe in tmux. Tune `TAIL` and
  `min` interval if needed.
- **`Date.now()` resolution inside `renderAfter`** — 16fps ≈ 62ms/frame, well within 1ms
  clock resolution; glide is as smooth as the frame rate allows.
- **Git resting tint vs comet** — must keep each branch's at-rest color (the `0.4` floor)
  so non-pulsed branches stay readable; the comet only brightens above the floor.
- **`HOT` near-white on light terminals** — design targets dark/OLED; near-white head may
  wash out on light backgrounds, but that's consistent with the rest of the theme.
```