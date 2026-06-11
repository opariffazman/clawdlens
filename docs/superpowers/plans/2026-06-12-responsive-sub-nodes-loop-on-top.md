# Responsive sub-nodes + loop-on-top Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lens sub-node labels/pitch responsive to terminal columns and route the backward return loop above the node row so it stops colliding with the tool/skill tree.

**Architecture:** Two pure-core changes in `pipeline-geometry.ts` (dynamic `subRow` pitch + `labelW`; an `"above"` direction for `wireLoop`), then wire them into `Lens.tsx` (move the reserved loop channel from below to above the row, feed `labelW` to `drawSubNode`). Geometry stays pure and unit-tested; the render change is verified via typecheck + tmux.

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · `bun:test` · OpenTUI buffered render.

**Spec:** `docs/superpowers/specs/2026-06-12-responsive-sub-nodes-loop-on-top-design.md`

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/core/pipeline-geometry.ts` | Pure n8n-node geometry | `PITCH_MIN` export; dynamic pitch + `labelW` in `subRow` (new `maxLabelLen` param); `labelW` on `SubRowLayout`; `dir` param on `wireLoop` |
| `tests/pipeline-geometry.test.ts` | Geometry unit tests | Update `subRow` calls (new arg) + assertions; add wide/crowded/`labelW` cases; add `wireLoop` "above" case |
| `src/ui/panels/Lens.tsx` | Lens render | Reserve loop channel above (`channelY = top - 1`); call `wireLoop(..., "above")`; pass `maxLabelLen` to `subRow`; pass `labelW` to `drawSubNode` |

---

## Task 1: Dynamic sub-node pitch + `labelW`

**Files:**
- Modify: `src/core/pipeline-geometry.ts` (the `SubRowLayout` interface + `subRow`, near lines 18–20, 127–168)
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Update the geometry tests to the new `subRow` contract (failing)**

In `tests/pipeline-geometry.test.ts`, add `PITCH_MIN` to the import on line 2 (keep `SUB_PITCH`):

```ts
import { nodeLayout, BOX_W, BOX_W_WIDE, BOX_W_NARROW, BOX_H_ART, BOX_H_GLYPH, borderCells, portIn, portOut, badgeCell, diamondCell, boltCell, wireForward, wireLoop, subRow, subPortCell, SUB_W, SUB_H, SUB_PITCH, PITCH_MIN, SUB_ROWS, LEFT, TOP } from "../src/core/pipeline-geometry";
```

Replace the four existing `subRow` tests (the blocks at lines 98–143) with these. Note each `subRow(...)` call now passes a 4th arg `maxLabelLen`:

```ts
test("subRow pitch resolves to SUB_PITCH at the legacy label budget, centered under the diamond", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };       // diamond at x=66, y=8
  const sr = subRow(tool, 2, 150, 14);             // maxLabelLen 14 → want 16 → pitch 16
  expect(sr.shown).toBe(2);
  expect(sr.circles.length).toBe(2);
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(SUB_PITCH);             // 16
  expect(sr.labelW).toBe(SUB_PITCH - 1);           // 15
  expect(c0.w).toBe(SUB_W);
  expect(c0.h).toBe(SUB_H);
  expect(c0.y).toBe(8 + 4);
  expect(sr.labelY).toBe(8 + SUB_ROWS);
  const fan = sr.cells.filter((c) => c.y === 10);
  expect(fan.find((c) => c.ch === "╭")).toBeTruthy();
  expect(fan.find((c) => c.ch === "╮")).toBeTruthy();
  expect(fan.find((c) => c.x === 66)!.ch).toBe("┴");
});

test("subRow spreads pitch toward full labels when wide with few items", () => {
  const tool = { x: 80, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 2, 200, 30);             // lots of slack, long labels
  expect(sr.shown).toBe(2);
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(32);                    // want = 30 + 2, fits
  expect(sr.labelW).toBe(31);                      // pitch - 1
});

test("subRow floors pitch and overflows shown when many tools crowd the width", () => {
  const tool = { x: 50, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 20, 120, 20);            // 20 items, tight columns
  expect(sr.shown).toBe(14);                       // capped → caller shows +6 more
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(PITCH_MIN);             // floored to 8
  expect(sr.labelW).toBe(PITCH_MIN - 1);           // 7
});

test("subRow with one aligned child is a straight dashed drop", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 1, 150, 10);
  expect(sr.shown).toBe(1);
  expect(sr.cells.every((c) => c.ch === "┆")).toBe(true);
});

test("subRow caps shown by width and clamps circles inside the panel", () => {
  const tool = { x: 10, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 8, 60, 10);
  expect(sr.shown).toBeLessThan(8);
  for (const c of sr.circles) {
    expect(c.x).toBeGreaterThanOrEqual(LEFT);
    expect(c.x + c.w).toBeLessThanOrEqual(58);
  }
});

test("subRow with zero items (or no width) is empty", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };
  expect(subRow(tool, 0, 150, 10).shown).toBe(0);
  expect(subRow(tool, 0, 150, 10).cells).toEqual([]);
  expect(subRow(tool, 0, 150, 10).labelW).toBe(0);
  expect(subRow(tool, 3, 5, 10).shown).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `subRow` is called with 4 args but currently takes 3; `sr.labelW` is `undefined`; `PITCH_MIN` is not exported (import error). Errors mention `labelW` / `PITCH_MIN`.

- [ ] **Step 3: Add `PITCH_MIN`, `labelW`, and the `maxLabelLen` param to `subRow`**

In `src/core/pipeline-geometry.ts`, add the `PITCH_MIN` constant next to the other sub-row constants (after line 18, the `SUB_PITCH` line):

```ts
export const PITCH_MIN = SUB_W + 3;  // crowding floor: circle + min gap, no label collision
```

Add `labelW` to the `SubRowLayout` interface (the block at lines 127–132):

```ts
export interface SubRowLayout {
  cells: Cell[];      // dashed trunk + rounded fan + dashed drops
  circles: Rect[];    // SUB_W × SUB_H sub-node boxes
  labelY: number;     // row for the names under the circles (= tool bottom row when shown===0 — skip drawing)
  shown: number;
  labelW: number;     // per-circle label width budget (= pitch - 1), 0 when nothing shown
}
```

Replace the whole `subRow` function (lines 136–168) with this width-driven version:

```ts
// Skills/agents hang under tool like n8n AI sub-nodes: ◇ port (caller draws it),
// dashed trunk, rounded tree fan, dashed drops into 3-row circles, names below.
// Pitch + label width are derived from the panel width and item count: spread to
// full labels when slack allows, floor at PITCH_MIN then overflow to caller's +N.
export function subRow(tool: Rect, n: number, width: number, maxLabelLen: number): SubRowLayout {
  const dx = tool.x + (tool.w >> 1);
  const dy = tool.y + tool.h - 1;
  const innerSpan = width - LEFT - 2;
  const fit = Math.max(0, Math.floor((innerSpan - SUB_W) / PITCH_MIN) + 1);
  const shown = Math.min(n, fit);
  const cells: Cell[] = [];
  const circles: Rect[] = [];
  if (shown === 0) return { cells, circles, labelY: dy, shown, labelW: 0 };
  const want = maxLabelLen + 2;                       // full-label pitch target
  const room = Math.floor(innerSpan / shown);         // per-item slot at this count
  const pitch = Math.max(PITCH_MIN, Math.min(want, room));
  const labelW = Math.max(SUB_W, pitch - 1);
  const span = (shown - 1) * pitch;
  let cx0 = dx - (span >> 1);
  cx0 = Math.max(LEFT + (SUB_W >> 1), Math.min(cx0, width - 2 - ((SUB_W + 1) >> 1) - span));
  const xs = Array.from({ length: shown }, (_, i) => cx0 + i * pitch);
  const fanY = dy + 2;
  cells.push({ x: dx, y: dy + 1, ch: "┆" });
  const lo = Math.min(xs[0]!, dx), hi = Math.max(xs[xs.length - 1]!, dx);
  if (lo === hi) {
    cells.push({ x: dx, y: fanY, ch: "┆" });
  } else {
    for (let x = lo; x <= hi; x++) {
      let ch = "┄";
      if (x === dx) ch = x === lo ? "╰" : x === hi ? "╯" : "┴";
      else if (x === lo) ch = "╭";
      else if (x === hi) ch = "╮";
      else if (xs.includes(x)) ch = "┬";
      cells.push({ x, y: fanY, ch });
    }
  }
  for (const cx of xs) {
    cells.push({ x: cx, y: fanY + 1, ch: "┆" });
    circles.push({ x: cx - (SUB_W >> 1), y: fanY + 2, w: SUB_W, h: SUB_H });
  }
  return { cells, circles, labelY: fanY + 2 + SUB_H, shown, labelW };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS (all subRow cases green).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: errors only in `src/ui/panels/Lens.tsx` (it still calls `subRow` with 3 args / reads no `labelW`) — those are fixed in Task 3. No errors inside `pipeline-geometry.ts` or the test.

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): responsive sub-node pitch + labelW from column width"
```

---

## Task 2: Backward loop routes above the row

**Files:**
- Modify: `src/core/pipeline-geometry.ts` (`wireLoop`, lines 108–123)
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Add a failing test for the "above" route**

Add this test in `tests/pipeline-geometry.test.ts` right after the existing "wireLoop routes a rounded U below the row…" test (after line 96):

```ts
test("wireLoop above routes a rounded U over the row into the target's input port", () => {
  const a = { x: 50, y: 5, w: 13, h: 7 };   // chat, mid at y=8
  const b = { x: 2, y: 5, w: 13, h: 7 };    // think, mid at y=8
  const cells = wireLoop(a, b, 2, "above");  // channel row above the boxes
  expect(cells[0]).toEqual({ x: 63, y: 8, ch: "╯" });            // turn up out of chat
  expect(cells.find((c) => c.ch === "╮")).toEqual({ x: 63, y: 2, ch: "╮" });
  expect(cells.find((c) => c.ch === "╭")).toEqual({ x: 0, y: 2, ch: "╭" });
  expect(cells.find((c) => c.ch === "╰")).toEqual({ x: 0, y: 8, ch: "╰" });
  expect(cells[cells.length - 1]).toEqual({ x: 1, y: 8, ch: "▶" });
  expect(cells.filter((c) => c.ch === "─").every((c) => c.y === 2)).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/pipeline-geometry.test.ts -t "wireLoop above"`
Expected: FAIL — `wireLoop` ignores the 4th arg and still routes below; `cells[0].ch` is `"╮"` not `"╯"`.

- [ ] **Step 3: Add the `dir` parameter to `wireLoop`**

Replace the `wireLoop` function (lines 106–123) in `src/core/pipeline-geometry.ts` with:

```ts
// backward wire: exits just right of a's output port, rounded U in a channel row
// (n8n smoothstep), rises/drops to just left of b and enters b's input port with ▶.
// dir "below" (default) routes under the row; "above" mirrors it over the row.
export function wireLoop(a: Rect, b: Rect, channelY: number, dir: "above" | "below" = "below"): Cell[] {
  const cells: Cell[] = [];
  const midA = a.y + (a.h >> 1);
  const midB = b.y + (b.h >> 1);
  const ax = a.x + a.w;
  const bx = b.x - 2;
  if (dir === "below") {
    cells.push({ x: ax, y: midA, ch: "╮" });
    for (let y = midA + 1; y < channelY; y++) cells.push({ x: ax, y, ch: "│" });
    cells.push({ x: ax, y: channelY, ch: "╯" });
    for (let x = ax - 1; x > bx; x--) cells.push({ x, y: channelY, ch: "─" });
    cells.push({ x: bx, y: channelY, ch: "╰" });
    for (let y = channelY - 1; y > midB; y--) cells.push({ x: bx, y, ch: "│" });
    cells.push({ x: bx, y: midB, ch: "╭" });
  } else {
    cells.push({ x: ax, y: midA, ch: "╯" });
    for (let y = midA - 1; y > channelY; y--) cells.push({ x: ax, y, ch: "│" });
    cells.push({ x: ax, y: channelY, ch: "╮" });
    for (let x = ax - 1; x > bx; x--) cells.push({ x, y: channelY, ch: "─" });
    cells.push({ x: bx, y: channelY, ch: "╭" });
    for (let y = channelY + 1; y < midB; y++) cells.push({ x: bx, y, ch: "│" });
    cells.push({ x: bx, y: midB, ch: "╰" });
  }
  cells.push({ x: b.x - 1, y: midB, ch: "▶" });
  return cells;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS — both the existing "below" test and the new "above" test are green (the below test is unchanged because `dir` defaults to `"below"`).

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): wireLoop above-row routing direction"
```

---

## Task 3: Wire the loop above and feed labelW in Lens

**Files:**
- Modify: `src/ui/panels/Lens.tsx` (lines 120–132 `drawSubNode`; 240–241 `top`; 266–270 sub-row/loop; 321 loop draw; 329 sub-node draw)

This task changes render code (no pure unit test); verification is typecheck + `bun test` (nothing regresses) + tmux visual.

- [ ] **Step 1: Reserve the loop channel above the row and set `channelY = top - 1`**

In `src/ui/panels/Lens.tsx`, the block at lines 240–241 currently reads:

```ts
  const blockH = boxH + Math.max(showSub ? SUB_ROWS : 0, (bigNames ? LABEL_H : 1) + 1);
  const top = Math.max(regionTop, regionTop + ((regionBottom - regionTop - blockH) >> 1));
```

Replace those two lines with (centers the block but always keeps one row above for the loop channel — the `+1` budget already lives in `blockNeed()`):

```ts
  const blockH = boxH + Math.max(showSub ? SUB_ROWS : 0, (bigNames ? LABEL_H : 1) + 1);
  const loopReserve = 1;
  const top = Math.max(regionTop + loopReserve, regionTop + loopReserve + ((regionBottom - regionTop - loopReserve - blockH) >> 1));
```

- [ ] **Step 2: Pass `maxLabelLen` to `subRow`, route the loop above, drop the bottom channel coupling**

Replace the block at lines 266–270:

```ts
  const sr = showSub ? subRow(nl.boxes.get("tool")!, items.length, width) : null;
  const nameBottom = top + boxH + (bigNames ? LABEL_H : 1) + 1;
  const blockBottom = Math.max(nameBottom, sr ? sr.labelY + 1 : 0);
  const channelY = blockBottom;
  const loopOn = (backCount > 0 || hotBack !== null) && channelY < regionBottom;
```

with (loop channel is now the reserved row above the boxes; sub-row no longer constrains it):

```ts
  const maxLabelLen = items.reduce((m, it) => Math.max(m, [...it.label].length), 0);
  const sr = showSub ? subRow(nl.boxes.get("tool")!, items.length, width, maxLabelLen) : null;
  const channelY = top - 1;
  const loopOn = (backCount > 0 || hotBack !== null) && channelY >= regionTop;
```

- [ ] **Step 3: Draw the loop with the "above" direction**

At line 321 (inside `if (loopOn)`), change:

```ts
          for (const c of wireLoop(a, b, channelY)) put(buffer, c.x, c.y, c.ch, col, width, height);
```

to:

```ts
          for (const c of wireLoop(a, b, channelY, "above")) put(buffer, c.x, c.y, c.ch, col, width, height);
```

- [ ] **Step 4: Thread `labelW` into `drawSubNode`**

Change the `drawSubNode` signature (line 120) to accept `labelW`:

```ts
function drawSubNode(buf: OptimizedBuffer, c: Rect, it: SubItem, labelY: number, labelW: number, now: number, pulse: boolean, w: number, h: number) {
```

Inside it (line 130), replace the hard-coded cap:

```ts
  const lbl = clip(it.label, 14);
```

with the responsive budget:

```ts
  const lbl = clip(it.label, labelW);
```

Update the call site (line 329) to pass `sr.labelW`:

```ts
          sr.circles.forEach((c, i) => drawSubNode(buffer, c, items[i]!, sr.labelY, sr.labelW, now, spin, width, height));
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: typecheck clean (no errors); all tests PASS.

- [ ] **Step 6: Visual verification via tmux at three widths**

Run each, capture, and eyeball:

```bash
tmux new-session -d -s cl -x 90 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p; tmux kill-session -t cl
tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p; tmux kill-session -t cl
tmux new-session -d -s cl -x 220 -y 40 "bun run dev"; sleep 4; tmux capture-pane -t cl -p; tmux kill-session -t cl
```

Expected, confirmed by eye:
- At 220 cols with few tools: sub-node labels show full text (e.g. `Bash · npm test`), spread wider than at 90.
- At 90 cols with many tools: labels clip and a `+N more` appears; nothing overlaps.
- The backward return loop arcs in the row ABOVE the boxes (between ribbon and the node row); no horizontal loop segment cuts under the sub-node tree.
- The orbiting ring still spins (frame-diff two captures with `-e` if confirming animation).

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): route return loop above row, responsive sub-node labels"
```

---

## Self-Review

**Spec coverage:**
- Spec Part 1 (loop above) → Task 2 (geometry) + Task 3 Steps 1–3 (reserve above, `channelY = top-1`, `"above"` draw, `loopOn` guard). ✓
- Spec Part 2 (responsive pitch/labelW, fan-anchored, `+N more`) → Task 1 (dynamic `subRow`) + Task 3 Step 4 (`labelW` to `drawSubNode`). ✓
- Spec Part 3 (render wiring) → Task 3. ✓
- Spec testing section → Task 1/2 unit tests + Task 3 Step 6 tmux. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `subRow(tool, n, width, maxLabelLen)` 4-arg signature used identically in source + all tests + the Lens call. `SubRowLayout.labelW` defined in Task 1, consumed in Task 3. `wireLoop(a, b, channelY, dir?)` default `"below"` keeps the old call valid; `"above"` used in Task 3. `drawSubNode(..., labelW, ...)` signature + call site match. `PITCH_MIN` exported in Task 1, imported in the test. ✓
