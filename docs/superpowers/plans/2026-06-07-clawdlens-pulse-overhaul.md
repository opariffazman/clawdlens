# Energy/Pulse Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-running global wall-clock energy pulse with a comet anchored to the player cursor — a bright near-white head that glides node→node over one playback interval (so it represents real playback speed), with a 7-cell neon tail and a breathing parked head when caught-up/paused.

**Architecture:** Pure-core-first. The player exposes its existing cadence (`intervalMs`, `lastAdvanceMs`); `anim.ts` gains three pure, unit-tested functions (`pulsePhase`, `cometColor`, `breathe`); `Flow.tsx` and `Git.tsx` drop `performance.now()` and render the comet from those functions at frame time using `Date.now()`. Spec: `docs/superpowers/specs/2026-06-07-clawdlens-pulse-overhaul-design.md`.

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · React 19 · `@opentui/core` buffered `setCell` · `bun:test` · tmux for visual verification.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/core/player.ts` | Cadence ownership | Add 2 getters: `intervalMs()`, `lastAdvanceMs()` |
| `src/ui/anim.ts` | Pure animation math | Add `pulsePhase`, `cometColor`, `breathe` (keep `pulseIntensity`, `lerpHex`) |
| `src/ui/theme.ts` | Color tokens | Add `pulseHot: "#F2FBFF"` |
| `src/ui/panels/Flow.tsx` | Beat-spine comet render | Replace wall-clock pulse with cursor-anchored comet |
| `src/ui/panels/Git.tsx` | Commit-spine comet render | Same comet, anchored to the building edge; keep 0.4 branch floor |
| `src/ui/Showcase.tsx` | Panel composition | Thread `lastAdvanceMs`/`intervalMs` to Flow + Git |
| `src/ui/App.tsx` | State/wiring | Read the two cadence scalars from `activePlayer`, pass to Showcase |
| `tests/player.test.ts` | Player tests | Add cadence-getter tests |
| `tests/anim.test.ts` | Anim tests | Add `pulsePhase`/`cometColor`/`breathe` tests |

---

## Task 1: Player cadence getters

**Files:**
- Modify: `src/core/player.ts` (returned object, ~line 67)
- Test: `tests/player.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/player.test.ts`:

```ts
test("intervalMs reflects speed (faster speed → smaller interval)", () => {
  const p = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B")]);
  const base = p.intervalMs();
  p.setSpeed(2);
  expect(p.intervalMs()).toBeLessThan(base);
  expect(p.intervalMs()).toBeCloseTo(base / 2, 5);
});

test("lastAdvanceMs is -1 before first tick, then set", () => {
  const p = createPlayer({ baseIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B")]);
  expect(p.lastAdvanceMs()).toBe(-1);
  p.tick(500);
  expect(p.lastAdvanceMs()).toBeGreaterThanOrEqual(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/player.test.ts`
Expected: FAIL — `p.intervalMs is not a function` / `p.lastAdvanceMs is not a function`.

- [ ] **Step 3: Add the getters**

In `src/core/player.ts`, inside the returned object, add two methods right after `speed(): number { return speed; },`:

```ts
    intervalMs(): number { return interval(); },
    lastAdvanceMs(): number { return lastAdvanceAt; },
```

(`interval()` and `lastAdvanceAt` already exist in the closure — these only surface them, no behavior change.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/player.test.ts`
Expected: PASS (all player tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/core/player.ts tests/player.test.ts
git commit -m "feat(player): expose intervalMs/lastAdvanceMs for the pulse"
```

---

## Task 2: `pulsePhase` (anim.ts, pure)

**Files:**
- Modify: `src/ui/anim.ts`
- Test: `tests/anim.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/anim.test.ts` (and add `pulsePhase` to the import on line 2):

```ts
test("pulsePhase ramps 0→1 across one interval and clamps past it", () => {
  expect(pulsePhase(1000, 1000, 200)).toBeCloseTo(0, 5);   // just advanced
  expect(pulsePhase(1100, 1000, 200)).toBeCloseTo(0.5, 5); // halfway
  expect(pulsePhase(1200, 1000, 200)).toBeCloseTo(1, 5);   // arrived
  expect(pulsePhase(9999, 1000, 200)).toBe(1);             // clamps past the end
});

test("pulsePhase parks at 1 before the first advance or with a bad interval", () => {
  expect(pulsePhase(500, -1, 200)).toBe(1);  // lastAdvanceMs < 0
  expect(pulsePhase(500, 1000, 0)).toBe(1);  // intervalMs <= 0
});
```

Update the import line:

```ts
import { spinnerFrame, pulseIntensity, lerpHex, pulsePhase } from "../src/ui/anim";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/anim.test.ts`
Expected: FAIL — `pulsePhase is not a function`.

- [ ] **Step 3: Implement `pulsePhase`**

In `src/ui/anim.ts`, after `pulseIntensity` (line 10), add:

```ts
// 0..1 progress from the last advance toward the next. Parks at 1 (head sits on
// the newest node, breathing) when there is no advance to interpolate from.
export function pulsePhase(now: number, lastAdvanceMs: number, intervalMs: number): number {
  if (lastAdvanceMs < 0 || intervalMs <= 0) return 1;
  const p = (now - lastAdvanceMs) / intervalMs;
  return Math.max(0, Math.min(1, p));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/anim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/anim.ts tests/anim.test.ts
git commit -m "feat(anim): pulsePhase — cursor-anchored 0..1 glide progress"
```

---

## Task 3: `cometColor` (anim.ts, pure)

**Files:**
- Modify: `src/ui/anim.ts`
- Test: `tests/anim.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/anim.test.ts` and add `cometColor` to the import line:

```ts
test("cometColor: hot head, dim tail-end, floor preserved", () => {
  const lane = "#00E5FF", hot = "#F2FBFF", dim = "#2E3440";
  expect(cometColor(0, 7, lane, hot, dim)).toBe("#f2fbff");          // head (d=0) → hot
  expect(cometColor(7, 7, lane, hot, dim)).toBe(dim);                // past tail, no floor → dimHex unchanged
  expect(cometColor(7, 7, lane, hot, dim, 0.4)).toBe(lerpHex(dim, lane, 0.4)); // floor → resting lane tint
});
```

Update the import line to include `cometColor`:

```ts
import { spinnerFrame, pulseIntensity, lerpHex, pulsePhase, cometColor } from "../src/ui/anim";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/anim.test.ts`
Expected: FAIL — `cometColor is not a function`.

- [ ] **Step 3: Implement `cometColor`**

In `src/ui/anim.ts`, after `pulsePhase`, add:

```ts
// fg-only comet gradient along the spine. `d` = cells from the head (0 = head).
// Two-stage blend: dim→lane by tail position, then lane→hot concentrated at the
// head (t²). `floor` keeps a minimum lane tint (Git's resting branch color).
export function cometColor(
  d: number,
  tail: number,
  laneHex: string,
  hotHex: string,
  dimHex: string,
  floor = 0,
): string {
  const t = pulseIntensity(d, tail); // 1 at head → 0 past the tail
  const laneAmt = Math.max(floor, t);
  if (laneAmt <= 0) return dimHex;
  const base = lerpHex(dimHex, laneHex, laneAmt);
  return lerpHex(base, hotHex, t * t);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/anim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/anim.ts tests/anim.test.ts
git commit -m "feat(anim): cometColor — neon head→lane→dim gradient with floor"
```

---

## Task 4: `breathe` (anim.ts, pure)

**Files:**
- Modify: `src/ui/anim.ts`
- Test: `tests/anim.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/anim.test.ts` and add `breathe` to the import line:

```ts
test("breathe stays within [0.6,1] and repeats by period", () => {
  for (const t of [0, 200, 450, 900, 1800]) {
    const v = breathe(t, 1800);
    expect(v).toBeGreaterThanOrEqual(0.6 - 1e-9);
    expect(v).toBeLessThanOrEqual(1 + 1e-9);
  }
  expect(breathe(0, 1800)).toBeCloseTo(breathe(1800, 1800), 5); // one full period
});
```

Update the import line to include `breathe`:

```ts
import { spinnerFrame, pulseIntensity, lerpHex, pulsePhase, cometColor, breathe } from "../src/ui/anim";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/anim.test.ts`
Expected: FAIL — `breathe is not a function`.

- [ ] **Step 3: Implement `breathe`**

In `src/ui/anim.ts`, after `cometColor`, add:

```ts
// slow sine brightness for the parked head, mapped to [0.6, 1.0].
export function breathe(now: number, periodMs = 1800): number {
  const s = 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / periodMs);
  return 0.6 + 0.4 * s;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/anim.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/anim.ts tests/anim.test.ts
git commit -m "feat(anim): breathe — slow sine brightness for the parked head"
```

---

## Task 5: `pulseHot` theme token

**Files:**
- Modify: `src/ui/theme.ts:3-13`

- [ ] **Step 1: Add the token**

In `src/ui/theme.ts`, add `pulseHot` to the `theme` object (after `wireHot`):

```ts
  wireDim: "#2E3440",
  wireHot: "#00E5FF",
  pulseHot: "#F2FBFF",
  laneColors: ["#00E5FF", "#C792EA", "#FFCB6B", "#5AF78E", "#82AAFF", "#F78C6C"],
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme.ts
git commit -m "feat(theme): add near-white pulseHot for the comet head"
```

---

## Task 6: Flow comet (Flow.tsx + wire through Showcase/App)

**Files:**
- Modify: `src/ui/panels/Flow.tsx`
- Modify: `src/ui/Showcase.tsx`
- Modify: `src/ui/App.tsx`

This task is visual (buffered `setCell`), so it is verified by tmux capture, not a unit test.

- [ ] **Step 1: Rewrite `Flow.tsx`**

Replace the whole file `src/ui/panels/Flow.tsx` with:

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutFlow, ROW_STRIDE } from "../../core/flow-layout";
import type { Beat } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  beats: Beat[]; // presented (paced) beats from the player
  cursor: number; // index of the focused/current beat (history or live head)
  pulse: boolean;
  lastAdvanceMs: number; // player cadence: when the last beat revealed
  intervalMs: number;    // player cadence: ms until the next reveal (speed-divided)
  width: number;
  height: number;
}

const ICON_COL = 6; // x where node icon/label start (after the gutter)
const TAIL = 7; // comet tail length in cells

// Safe fallback that uses only setCell; we prefer buffer.drawText where possible.
function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Flow({ beats, cursor, pulse, lastAdvanceMs, intervalMs, width, height }: Props) {
  const graph = layoutFlow(beats);
  const bg = TRANSPARENT; // cell background stays transparent so the terminal bg shows through
  const dimWire = RGBA.fromHex(theme.wireDim);

  // viewport: center on the cursor, clamped so we never scroll past the ends.
  const total = graph.rows;
  const top = Math.max(0, Math.min(Math.max(0, total - height), cursor * ROW_STRIDE - Math.floor(height / 2)));

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT); // reset to transparent each frame (no ghosting, no forced bg)
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const anchorY = (cursor - 1) * ROW_STRIDE;        // newest revealed node row
        const headY = anchorY - (1 - phase) * ROW_STRIDE; // comet head glides into the node

        // connectors (segments) with comet coloring
        for (const seg of graph.segments) {
          const laneCol = graph.lanes.find((l) => l.id === seg.lane)?.column ?? 0;
          const laneColor = theme.laneColors[laneCol % theme.laneColors.length]!;
          for (const c of seg.cells) {
            const y = c.y - top;
            if (y < 0 || y >= height) continue;
            let color = dimWire;
            if (pulse && cursor > 0) {
              color = RGBA.fromHex(cometColor(headY - c.y, TAIL, laneColor, theme.pulseHot, theme.wireDim));
            }
            const x = ICON_COL - 2 + c.x;
            if (x < 0 || x >= width) continue;
            buffer.setCell(x, y, c.ch, color, bg);
          }
        }

        // nodes (icon + label) — the newest revealed node (cursor-1) is the comet head; it breathes
        for (const node of graph.nodes) {
          const y = node.row * ROW_STRIDE - top;
          if (y < 0 || y >= height) continue;
          const b = beats[node.row];
          if (!b) continue;
          const focused = node.row === cursor - 1;
          const labelColor = RGBA.fromHex(
            b.kind === "skill" ? theme.accent : focused ? theme.fg : b.ok === false ? theme.err : theme.fg,
          );
          const laneHex = theme.laneColors[node.column % theme.laneColors.length]!;
          const iconColor = RGBA.fromHex(
            pulse && focused ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex,
          );
          const x = ICON_COL - 2 + node.column * 2;
          if (x < 0 || x >= width) continue;
          buffer.setCell(x, y, focused ? "◉" : "○", iconColor, bg);
          const text = ` ${iconFor(b.iconKey)} ${b.label}${b.count > 1 ? ` ×${b.count}` : ""}${
            b.detail ? " · " + b.detail : ""
          }`;
          const clipped = text.slice(0, Math.max(0, width - x - 2));
          if (clipped.length > 0) drawStr(buffer, x + 1, y, clipped, labelColor, bg);
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Add the two cadence props to `Showcase.tsx`**

In `src/ui/Showcase.tsx`, add to the `Props` interface (after `cursor: number;`):

```ts
  lastAdvanceMs: number;     // player cadence for the pulse
  intervalMs: number;        // player cadence for the pulse
```

Add them to the destructure in the function signature (after `cursor,`):

```ts
export function Showcase({ session, panel, presented, cursor, lastAdvanceMs, intervalMs, pulse, lensOn, marker, width, height, commits, full, progress, filesSort, tasksHideDone, paletteOpen, paletteQuery, paletteGhost }: Props) {
```

Update the Flow render line (replace the existing `panel === "log"` line):

```tsx
        {panel === "log" && <Flow beats={presented} cursor={cursor} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 3: Compute and pass the scalars in `App.tsx`**

In `src/ui/App.tsx`, after the `progress` line (~line 81), add:

```ts
  const lastAdvanceMs = activePlayer ? activePlayer.lastAdvanceMs() : -1;
  const intervalMs = activePlayer ? activePlayer.intervalMs() : 1000;
```

In the `<Showcase ... />` JSX, add the two props (after `cursor={cursor}`):

```tsx
          cursor={cursor}
          lastAdvanceMs={lastAdvanceMs}
          intervalMs={intervalMs}
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (Git still uses its old props — untouched this task).

- [ ] **Step 5: Visual check (tmux)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
```
Expected: the **Log** panel shows a bright `◉` head node with a colored spine; switch to it if needed. Then drive keys and re-capture:
- `tmux send-keys -t cl R` (replay) then capture twice ~0.4s apart with `-e`; the comet gradient should be at different spine rows between frames (it glides), not looping from the top.
- `tmux send-keys -t cl +` a few times: glide visibly faster. `tmux send-keys -t cl -` : slower.
- `tmux send-keys -t cl space` (pause): head parks on the newest node and breathes (use `-e` frame-diff to see the head color pulse).
- `tmux send-keys -t cl p` (pulse off): spine goes flat-dim, no comet.

```bash
tmux send-keys -t cl R; sleep 1; tmux capture-pane -t cl -ep > /tmp/f1.txt; sleep 1; tmux capture-pane -t cl -ep > /tmp/f2.txt; diff /tmp/f1.txt /tmp/f2.txt | head -40
```
Expected: a non-empty diff (animation is running).

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/Flow.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(flow): cursor-anchored comet pulse (speed-driven, breathing head)"
```

---

## Task 7: Git comet (Git.tsx + wire through Showcase)

**Files:**
- Modify: `src/ui/panels/Git.tsx`
- Modify: `src/ui/Showcase.tsx` (Git render line)

Visual task — verified by tmux capture.

- [ ] **Step 1: Rewrite `Git.tsx`**

Replace the whole file `src/ui/panels/Git.tsx` with:

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutGitGraph } from "../../core/git-graph";
import { ROW_STRIDE } from "../../core/flow-layout";
import type { Commit } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";

const ICON_COL = 4;
const COL_WIDTH = 2;
const TAIL = 7;

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Git({ commits, width, height, progress, lastAdvanceMs, intervalMs }: { commits: Commit[]; width: number; height: number; progress: number; lastAdvanceMs: number; intervalMs: number }) {
  const total = commits.length;
  if (total === 0) return <text fg={theme.dim}>not a git repo (or no commits)</text>;
  const revealed = Math.max(1, Math.ceil(progress * total)); // synced to the Flow cursor
  const animating = progress < 1;

  // `git log` is date-desc (HEAD first) — the lane algorithm needs that order.
  // We DISPLAY chronologically (oldest at top, HEAD at bottom) like the Flow:
  // flip the y-axis, reveal oldest-first, and follow the building edge.
  const graph = layoutGitGraph(commits);
  const rowsTotal = graph.rows;                 // (total-1)*ROW_STRIDE + 1
  const minIdx = total - revealed;              // date-desc index threshold (>= = revealed/older)
  const minY = minIdx * ROW_STRIDE;             // date-desc y threshold for revealed cells
  const buildingY = rowsTotal - 1 - minY;       // chrono row of the newest revealed commit
  const top = Math.max(0, Math.min(Math.max(0, rowsTotal - height), buildingY - height + 2));

  const refColor = RGBA.fromHex(theme.warn);
  const subjColor = RGBA.fromHex(theme.fg);
  const hashColor = RGBA.fromHex(theme.ok);

  return (
    <box
      style={{ width, height }}
      buffered
      live={animating}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const headY = buildingY - (1 - phase) * ROW_STRIDE; // comet glides into the building edge

        // wires — chronological (oldest top), comet flows downward toward HEAD
        for (const seg of graph.segments) {
          for (const cell of seg.cells) {
            if (cell.y < minY) continue; // not yet revealed (newer)
            const chronoY = rowsTotal - 1 - cell.y;
            const y = chronoY - top;
            if (y < 0 || y >= height) continue;
            const x = ICON_COL + cell.x;
            if (x < 0 || x >= width) continue;
            const laneHex = theme.laneColors[Math.floor(cell.x / COL_WIDTH) % theme.laneColors.length]!;
            // 0.4 floor keeps each branch tinted its own color at rest; comet brightens above it
            const hex = animating
              ? cometColor(headY - chronoY, TAIL, laneHex, theme.pulseHot, theme.wireDim, 0.4)
              : lerpHex(theme.wireDim, laneHex, 0.4);
            buffer.setCell(x, y, cell.ch, RGBA.fromHex(hex), TRANSPARENT);
          }
        }

        // commit nodes + labels — the building edge (newest revealed) breathes
        for (const node of graph.nodes) {
          if (node.row < minIdx) continue; // not revealed (newer than the building edge)
          const chronoY = rowsTotal - 1 - node.row * ROW_STRIDE;
          const y = chronoY - top;
          if (y < 0 || y >= height) continue;
          const commit = commits[node.row]!;
          const x = ICON_COL + node.column * COL_WIDTH;
          const laneHex = theme.laneColors[node.column % theme.laneColors.length]!;
          const isEdge = node.row === minIdx;
          const dotColor = RGBA.fromHex(animating && isEdge ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
          buffer.setCell(x, y, isEdge ? "◉" : "●", dotColor, TRANSPARENT);
          const labelX = ICON_COL + (graph.columns + 1) * COL_WIDTH;
          const refStr = commit.refs.length ? `(${commit.refs.join(", ")}) ` : "";
          drawStr(buffer, labelX, y, commit.shortHash + " ", hashColor, TRANSPARENT);
          let cx = labelX + 8;
          if (refStr) { drawStr(buffer, cx, y, refStr, refColor, TRANSPARENT); cx += refStr.length; }
          const subj = commit.subject.slice(0, Math.max(0, width - cx - 1));
          drawStr(buffer, cx, y, subj, subjColor, TRANSPARENT);
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Pass the cadence props to Git in `Showcase.tsx`**

In `src/ui/Showcase.tsx`, update the Git render line (replace the existing `panel === "git"` line):

```tsx
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} progress={progress} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} />}
```

(`lastAdvanceMs`/`intervalMs` are already destructured in `Showcase` from Task 6.)

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Visual check (tmux)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux send-keys -t cl :; tmux send-keys -t cl "git" Enter; sleep 1; tmux capture-pane -t cl -p
```
(`:` opens the command palette; `git` + Enter switches to the Git panel — see `core/commands.ts`.)
Expected: the commit graph builds up; the newest revealed commit shows a bright `◉` with a colored spine flowing toward it; other branches keep their own dim color (the 0.4 floor). Frame-diff while building to confirm motion:

```bash
tmux send-keys -t cl r; sleep 1; tmux capture-pane -t cl -ep > /tmp/g1.txt; sleep 1; tmux capture-pane -t cl -ep > /tmp/g2.txt; diff /tmp/g1.txt /tmp/g2.txt | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/Git.tsx src/ui/Showcase.tsx
git commit -m "feat(git): share the cursor-anchored comet on the commit spine"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 2: Full test suite**

Run: `bun test`
Expected: PASS (all suites, including the new anim + player cases).

- [ ] **Step 3: tmux verification matrix**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4
```
Confirm, capturing after each (`tmux capture-pane -t cl -ep`):
- **Log panel, live/replay:** comet head glides node→node; tail trails up; no top-loop restart.
- **Speed:** `+` faster glide, `-` slower (visible coupling).
- **Pause/scrub:** `space` / `h` → head parks on the cursor node and breathes; frame-diff shows the head color pulsing while the rest is static.
- **Pulse off:** `p` → flat dim spine, no comet/breathe; `live` stops the loop.
- **Git panel:** building edge `◉` is bright + breathing while building; branches keep their floor color; comet flows toward HEAD.
- **Unicode fallback:** `tmux kill-session -t cl; tmux new-session -d -s cl -x 150 -y 36 "CL_ICONS=unicode bun run dev"; sleep 4; tmux capture-pane -t cl -p` — no glyph misalignment / ghosting while scrubbing.

```bash
tmux kill-session -t cl 2>/dev/null
```

- [ ] **Step 4: Self-review the diff**

Run: `git diff main --stat`
Expected: only the 9 files in the File Structure table changed. No stray edits to Files/Tasks panels or the core pipeline.

- [ ] **Step 5: No commit**

Verification only — nothing new to commit. The branch `feat/pulse-overhaul` is ready for `superpowers:finishing-a-development-branch` (PR to `main`, CI gates: typecheck + test).

---

## Notes for the implementer

- **Clock:** always use `Date.now()` inside `renderAfter` (the same clock `player.tick` advances on). Do **not** reintroduce `performance.now()` — mixing clocks reintroduces drift.
- **Off-by-one fix:** the old Flow highlighted `node.row === cursor`, which never matched (presented rows are `0..cursor-1`). The new code uses `cursor - 1`, so the head node is correctly the newest revealed beat — this is intended.
- **Git/Flow cadence approximation:** Git reveals commits proportional to `progress`, while the comet phase is the beat interval; the building edge may not move every beat. The comet retargets to the current `buildingY` each interval — visually fine, no fix needed.
- **Tuning knobs** (adjust live in tmux if needed): `TAIL` (7), `breathe` period (1800ms), `pulseHot` (`#F2FBFF`). All single constants.
- **OpenTUI gotcha:** `live={pulse}` / `live={animating}` is what runs the continuous render loop — `renderer.targetFps` alone does not. Keep those props.
```