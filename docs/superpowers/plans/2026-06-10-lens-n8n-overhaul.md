# Lens n8n Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remodel the Lens panel into an n8n-canvas look-alike: big block-art icons in boxy nodes (names below), trigger half-pill, dashed tree-fan sub-nodes for skills/agents, straight+curved wires with persistent green trail and ×N labels, and an orbiting coral ring on the active node.

**Architecture:** Pure-core-first. New layout/wire/ring geometry replaces the old card geometry in `src/core/pipeline-geometry.ts` (TDD). `src/core/pipeline-flow.ts` gains per-hop traversal counts (`hops`, `lastHop`). A new `src/ui/panels/lens/iconArt.ts` holds 13 hand-crafted 7×3 block-art glyphs. `src/ui/panels/Lens.tsx` is rewritten to render the new grammar; ribbon/economy/heartbeat/skillTimeline/HUD zones are reused untouched. Spec: `docs/superpowers/specs/2026-06-10-clawdlens-lens-n8n-overhaul-design.md`.

**Tech Stack:** Bun, TypeScript strict (`noUncheckedIndexedAccess`), React 19 + @opentui (buffered `setCell` drawing), `bun:test`. Work on branch `feat/lens-n8n-overhaul` (already created, spec committed).

**Verification commands (used throughout):**
- `bun test` — full suite
- `bunx tsc --noEmit` — typecheck
- tmux visual: `tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/pipeline-flow.ts` (modify) | + `hops` (per-transition counts) and `lastHop` on `LaneFlow` |
| `src/core/pipeline-geometry.ts` (rewrite in place) | node-row layout + width ladder, border/port/badge/diamond/bolt cells, forward/loop wires, sub-row tree fan. Old card API deleted at the end (Task 9) |
| `src/ui/panels/lens/iconArt.ts` (create) | 13 block-art glyphs (12 IconKeys + `prompt`), 7×3, single-width glyphs only |
| `src/ui/theme.ts` (modify) | + `coral: "#FF6D5A"` |
| `src/ui/panels/Lens.tsx` (rewrite) | render: boxes, ports, badges, wires, ring, sub-row, ladders; zones reused |
| `tests/pipeline-flow.test.ts` (modify) | hops/lastHop tests |
| `tests/pipeline-geometry.test.ts` (modify) | new-API tests added; legacy tests deleted in Task 9 |
| `tests/icon-art.test.ts` (create) | dimensions + glyph-safety |
| `CLAUDE.md` (modify) | Lens description line refresh (Task 11) |

---

### Task 1: pipeline-flow — per-hop counts + last hop

**Files:**
- Modify: `src/core/pipeline-flow.ts`
- Test: `tests/pipeline-flow.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/pipeline-flow.test.ts`:

```ts
test("hops counts distinct-collapsed transitions; lastHop is the newest", () => {
  const f = deriveFlow([
    beat({ kind: "thinking" }), beat({ kind: "tool", ok: true }),   // think>tool, tool>result
    beat({ kind: "thinking" }), beat({ kind: "tool" }),             // result>think, think>tool
  ], 4, 3);
  expect(f.main.hops["think>tool"]).toBe(2);
  expect(f.main.hops["tool>result"]).toBe(1);
  expect(f.main.hops["result>think"]).toBe(1);
  expect(f.main.lastHop).toBe("think>tool");
});

test("hops empty and lastHop null with fewer than two distinct steps", () => {
  const f = deriveFlow([beat({ kind: "thinking" }), beat({ kind: "thinking" })], 2, 3);
  expect(f.main.hops).toEqual({});
  expect(f.main.lastHop).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline-flow.test.ts`
Expected: 2 FAIL — `hops` is `undefined` on `LaneFlow`.

- [ ] **Step 3: Implement**

In `src/core/pipeline-flow.ts`, add to the `LaneFlow` interface (after `activeSkill`):

```ts
  hops: Record<string, number>;          // "think>tool" -> distinct-collapsed traversal count
  lastHop: string | null;                // newest transition, e.g. "tool>result"
```

In `laneFlow()` (after the `activeSkill` line, before `return`):

```ts
  const seq: string[] = [];
  for (const s of steps) if (seq.at(-1) !== s) seq.push(s);
  const hops: Record<string, number> = {};
  for (let i = 0; i + 1 < seq.length; i++) {
    const k = `${seq[i]}>${seq[i + 1]}`;
    hops[k] = (hops[k] ?? 0) + 1;
  }
  const lastHop = seq.length >= 2 ? `${seq[seq.length - 2]}>${seq[seq.length - 1]}` : null;
```

Add `hops, lastHop,` to the returned object literal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pipeline-flow.test.ts`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-flow.ts tests/pipeline-flow.test.ts
git commit -m "feat(flow): per-hop traversal counts + lastHop for wire trail/labels"
```

---

### Task 2: geometry — constants + nodeLayout width ladder

New API is ADDED alongside the legacy exports (Lens still imports them until Task 8; legacy is deleted in Task 9).

**Files:**
- Modify: `src/core/pipeline-geometry.ts`
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/pipeline-geometry.test.ts` (extend the import at the top of the file):

```ts
import { nodeLayout, BOX_W, BOX_W_NARROW, BOX_H_ART, BOX_H_GLYPH } from "../src/core/pipeline-geometry";

test("nodeLayout full width: trigger + labels, 5 boxes in row order, non-overlapping", () => {
  const nl = nodeLayout(150, TOP, "art");
  expect(nl.row).toEqual(["prompt", "think", "tool", "result", "chat"]);
  expect(nl.showTrigger).toBe(true);
  expect(nl.showLabels).toBe(true);
  expect(nl.boxW).toBe(BOX_W);
  expect(nl.boxH).toBe(BOX_H_ART);
  const rects = nl.row.map((k) => nl.boxes.get(k)!);
  for (let i = 0; i + 1 < rects.length; i++) expect(rects[i + 1]!.x).toBeGreaterThan(rects[i]!.x + rects[i]!.w);
});

test("nodeLayout width ladder: labels drop, then trigger drops, then boxes narrow", () => {
  expect(nodeLayout(104, TOP, "art").showLabels).toBe(false);
  expect(nodeLayout(104, TOP, "art").showTrigger).toBe(true);
  const noTrig = nodeLayout(80, TOP, "art");
  expect(noTrig.showTrigger).toBe(false);
  expect(noTrig.row).toEqual(["think", "tool", "result", "chat"]);
  expect(noTrig.boxW).toBe(BOX_W);
  expect(nodeLayout(60, TOP, "art").boxW).toBe(BOX_W_NARROW);
});

test("nodeLayout glyph mode uses the short box height", () => {
  expect(nodeLayout(150, TOP, "glyph").boxH).toBe(BOX_H_GLYPH);
  expect(nodeLayout(150, 5, "glyph").boxes.get("think")!.y).toBe(5);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `nodeLayout` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/pipeline-geometry.ts`:

```ts
// ─── n8n-style node row ──────────────────────────────────────────────────────

export type BoxMode = "art" | "glyph";
export const BOX_W = 13;
export const BOX_W_NARROW = 9;
export const BOX_H_ART = 7;
export const BOX_H_GLYPH = 5;
export const NAME_ROWS = 2;          // name + detail line below each box
export const SUB_ROWS = 7;           // ┆ + fan + ┆ + 3-row circle + label
export const SUB_W = 5;
export const SUB_H = 3;
export const SUB_PITCH = 16;
const GAP_LABEL = 9;                 // min gap that fits an embedded ×N label
const GAP_MIN = 5;                   // min gap for ─▶ + ports
const GAP_SQUEEZE = 3;
const ROW_FULL = ["prompt", "think", "tool", "result", "chat"];

export interface NodeLayout {
  boxes: Map<string, Rect>;
  row: string[];
  mode: BoxMode;
  boxW: number;
  boxH: number;
  showTrigger: boolean;
  showLabels: boolean;
}

function rowNeed(n: number, bw: number, gap: number): number {
  return LEFT + n * bw + (n - 1) * gap + 2;
}

// Width ladder: full (trigger+labels) → drop labels → drop trigger → narrow boxes.
// Slack beyond the minimum flows into the gaps (justified row, like the old coarseLayout).
export function nodeLayout(width: number, top: number, mode: BoxMode): NodeLayout {
  const boxH = mode === "art" ? BOX_H_ART : BOX_H_GLYPH;
  const showLabels = width >= rowNeed(5, BOX_W, GAP_LABEL);
  const showTrigger = width >= rowNeed(5, BOX_W, GAP_MIN);
  const row = showTrigger ? [...ROW_FULL] : ROW_FULL.slice(1);
  const boxW = showTrigger || width >= rowNeed(4, BOX_W, GAP_MIN) ? BOX_W : BOX_W_NARROW;
  const n = row.length;
  const gap = Math.max(GAP_SQUEEZE, Math.floor((width - LEFT - 2 - n * boxW) / (n - 1)));
  const boxes = new Map<string, Rect>();
  row.forEach((k, i) => boxes.set(k, { x: LEFT + i * (boxW + gap), y: top, w: boxW, h: boxH }));
  return { boxes, row, mode, boxW, boxH, showTrigger, showLabels };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS (new + legacy).

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(geometry): nodeLayout with n8n width ladder (labels/trigger/narrow)"
```

---

### Task 3: geometry — border cells, ports, badge, diamond, bolt

**Files:**
- Modify: `src/core/pipeline-geometry.ts`
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append (extend the new-API import with `borderCells, portIn, portOut, badgeCell, diamondCell, boltCell`):

```ts
test("borderCells walks clockwise from top-left with sharp corners", () => {
  const cells = borderCells({ x: 2, y: 1, w: 4, h: 3 });
  expect(cells.length).toBe(2 * 4 + 2 * 3 - 4);
  expect(cells[0]).toEqual({ x: 2, y: 1, ch: "┌" });
  expect(cells[3]).toEqual({ x: 5, y: 1, ch: "┐" });
  expect(cells.find((c) => c.x === 5 && c.y === 3)!.ch).toBe("┘");
  expect(cells.find((c) => c.x === 2 && c.y === 3)!.ch).toBe("└");
  expect(cells[cells.length - 1]).toEqual({ x: 2, y: 2, ch: "│" });
});

test("borderCells roundedLeft makes the trigger half-pill", () => {
  const cells = borderCells({ x: 2, y: 1, w: 4, h: 3 }, true);
  expect(cells[0]!.ch).toBe("╭");
  expect(cells.find((c) => c.x === 2 && c.y === 3)!.ch).toBe("╰");
  expect(cells[3]!.ch).toBe("┐");
});

test("port/badge/diamond/bolt cells sit on the border at the spec positions", () => {
  const r = { x: 10, y: 2, w: 13, h: 7 };
  expect(portIn(r)).toEqual({ x: 10, y: 5 });
  expect(portOut(r)).toEqual({ x: 22, y: 5 });
  expect(badgeCell(r)).toEqual({ x: 21, y: 8 });
  expect(diamondCell(r)).toEqual({ x: 16, y: 8 });
  expect(boltCell(r)).toEqual({ x: 9, y: 5 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `borderCells` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/pipeline-geometry.ts`:

```ts
// Border cells ordered CLOCKWISE from the top-left corner — the box draw and the
// orbiting ring share this array (the ring recolors a window of it).
export function borderCells(r: Rect, roundedLeft = false): Cell[] {
  const cells: Cell[] = [];
  const x1 = r.x + r.w - 1, y1 = r.y + r.h - 1;
  cells.push({ x: r.x, y: r.y, ch: roundedLeft ? "╭" : "┌" });
  for (let x = r.x + 1; x < x1; x++) cells.push({ x, y: r.y, ch: "─" });
  cells.push({ x: x1, y: r.y, ch: "┐" });
  for (let y = r.y + 1; y < y1; y++) cells.push({ x: x1, y, ch: "│" });
  cells.push({ x: x1, y: y1, ch: "┘" });
  for (let x = x1 - 1; x > r.x; x--) cells.push({ x, y: y1, ch: "─" });
  cells.push({ x: r.x, y: y1, ch: roundedLeft ? "╰" : "└" });
  for (let y = y1 - 1; y > r.y; y--) cells.push({ x: r.x, y, ch: "│" });
  return cells;
}

export function portIn(r: Rect): { x: number; y: number } {
  return { x: r.x, y: r.y + (r.h >> 1) };
}
export function portOut(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w - 1, y: r.y + (r.h >> 1) };
}
// n8n status badge: inside the bottom-right corner, on the border row
export function badgeCell(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w - 2, y: r.y + r.h - 1 };
}
// ◇ sub-node port, bottom-border center
export function diamondCell(r: Rect): { x: number; y: number } {
  return { x: r.x + (r.w >> 1), y: r.y + r.h - 1 };
}
// ⚡ floats one cell outside the trigger's left edge (n8n bolt)
export function boltCell(r: Rect): { x: number; y: number } {
  return { x: r.x - 1, y: r.y + (r.h >> 1) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(geometry): clockwise borderCells (+half-pill), ports, badge, diamond, bolt"
```

---

### Task 4: geometry — forward wire (embedded label) + rounded loop

**Files:**
- Modify: `src/core/pipeline-geometry.ts`
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append (extend import with `wireForward, wireLoop`):

```ts
test("wireForward runs ─ between boxes and lands ▶ before the input port", () => {
  const a = { x: 2, y: 1, w: 13, h: 7 };
  const b = { x: 24, y: 1, w: 13, h: 7 };
  const cells = wireForward(a, b);
  expect(cells[0]).toEqual({ x: 15, y: 4, ch: "─" });
  expect(cells[cells.length - 1]).toEqual({ x: 23, y: 4, ch: "▶" });
  expect(cells.every((c) => c.y === 4)).toBe(true);
});

test("wireForward embeds the ×N label mid-wire when it fits, omits it when not", () => {
  const a = { x: 2, y: 1, w: 13, h: 7 };
  const b = { x: 24, y: 1, w: 13, h: 7 };
  const labelled = wireForward(a, b, "×42");
  expect(labelled.map((c) => c.ch).join("")).toContain("×42");
  const tight = wireForward(a, { x: 19, y: 1, w: 13, h: 7 }, "×42424242");
  expect(tight.map((c) => c.ch).join("")).not.toContain("×4");
});

test("wireLoop routes a rounded U below the row into the target's input port", () => {
  const a = { x: 50, y: 1, w: 13, h: 7 };   // chat
  const b = { x: 2, y: 1, w: 13, h: 7 };    // think
  const cells = wireLoop(a, b, 12);
  expect(cells[0]).toEqual({ x: 63, y: 4, ch: "╮" });
  expect(cells.find((c) => c.ch === "╯")).toEqual({ x: 63, y: 12, ch: "╯" });
  expect(cells.find((c) => c.ch === "╰")).toEqual({ x: 0, y: 12, ch: "╰" });
  expect(cells.find((c) => c.ch === "╭")).toEqual({ x: 0, y: 4, ch: "╭" });
  expect(cells[cells.length - 1]).toEqual({ x: 1, y: 4, ch: "▶" });
});
```

(Note: in the loop test `b.x - 2 = 0` — fine, geometry is pure; the panel clips at draw time.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `wireForward` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/pipeline-geometry.ts`:

```ts
// straight forward wire at mid-box height; optional ×N label embedded mid-run
// (n8n item-count pill). Caller draws ● / ○ on the box borders themselves.
export function wireForward(a: Rect, b: Rect, label?: string): Cell[] {
  const y = a.y + (a.h >> 1);
  const x0 = a.x + a.w, x1 = b.x - 2;
  const cells: Cell[] = [];
  for (let x = x0; x <= x1; x++) cells.push({ x, y, ch: "─" });
  cells.push({ x: b.x - 1, y, ch: "▶" });
  if (label && x1 - x0 + 1 >= label.length + 4) {
    const lx = x0 + ((x1 - x0 + 1 - label.length) >> 1);
    for (let i = 0; i < label.length; i++) cells[lx - x0 + i] = { x: lx + i, y, ch: label[i]! };
  }
  return cells;
}

// backward wire: exits just right of a's output port, rounded U below the row
// (n8n smoothstep), rises just left of b and enters b's input port with ▶.
export function wireLoop(a: Rect, b: Rect, channelY: number): Cell[] {
  const cells: Cell[] = [];
  const midA = a.y + (a.h >> 1);
  const midB = b.y + (b.h >> 1);
  const ax = a.x + a.w;
  const bx = b.x - 2;
  cells.push({ x: ax, y: midA, ch: "╮" });
  for (let y = midA + 1; y < channelY; y++) cells.push({ x: ax, y, ch: "│" });
  cells.push({ x: ax, y: channelY, ch: "╯" });
  for (let x = ax - 1; x > bx; x--) cells.push({ x, y: channelY, ch: "─" });
  cells.push({ x: bx, y: channelY, ch: "╰" });
  for (let y = channelY - 1; y > midB; y--) cells.push({ x: bx, y, ch: "│" });
  cells.push({ x: bx, y: midB, ch: "╭" });
  cells.push({ x: b.x - 1, y: midB, ch: "▶" });
  return cells;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(geometry): straight labelled forward wires + rounded-U backward loop"
```

---

### Task 5: geometry — sub-row tree fan

**Files:**
- Modify: `src/core/pipeline-geometry.ts`
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Append (extend import with `subRow, subPortCell, SUB_W, SUB_H, SUB_PITCH, SUB_ROWS`):

```ts
test("subRow lays circles at SUB_PITCH centered under the tool diamond", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };       // diamond at x=66, y=8
  const sr = subRow(tool, 2, 150);
  expect(sr.shown).toBe(2);
  expect(sr.circles.length).toBe(2);
  const c0 = sr.circles[0]!, c1 = sr.circles[1]!;
  expect(c1.x - c0.x).toBe(SUB_PITCH);
  expect(c0.w).toBe(SUB_W);
  expect(c0.h).toBe(SUB_H);
  // rows: ┆ at dy+1, fan at dy+2, ┆ at dy+3, circle top at dy+4, label at dy+7
  expect(c0.y).toBe(8 + 4);
  expect(sr.labelY).toBe(8 + SUB_ROWS);
  // fan glyphs: rounded ends, ┴ junction under the trunk
  const fan = sr.cells.filter((c) => c.y === 10);
  expect(fan.find((c) => c.ch === "╭")).toBeTruthy();
  expect(fan.find((c) => c.ch === "╮")).toBeTruthy();
  expect(fan.find((c) => c.x === 66)!.ch).toBe("┴");
});

test("subRow with one aligned child is a straight dashed drop", () => {
  const tool = { x: 60, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 1, 150);
  expect(sr.shown).toBe(1);
  expect(sr.cells.every((c) => c.ch === "┆")).toBe(true);
});

test("subRow caps shown by width and clamps circles inside the panel", () => {
  const tool = { x: 10, y: 2, w: 13, h: 7 };
  const sr = subRow(tool, 8, 60);
  expect(sr.shown).toBeLessThan(8);
  for (const c of sr.circles) {
    expect(c.x).toBeGreaterThanOrEqual(LEFT);
    expect(c.x + c.w).toBeLessThanOrEqual(58);
  }
});

test("subPortCell is the circle's top-center", () => {
  expect(subPortCell({ x: 10, y: 5, w: 5, h: 3 })).toEqual({ x: 12, y: 5 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `subRow` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/pipeline-geometry.ts`:

```ts
export interface SubRowLayout {
  cells: Cell[];      // dashed trunk + rounded fan + dashed drops
  circles: Rect[];    // SUB_W × SUB_H sub-node boxes
  labelY: number;     // row for the names under the circles
  shown: number;
}

// Skills/agents hang under tool like n8n AI sub-nodes: ◇ port (caller draws it),
// dashed trunk, rounded tree fan, dashed drops into 3-row circles, names below.
export function subRow(tool: Rect, n: number, width: number): SubRowLayout {
  const dx = tool.x + (tool.w >> 1);
  const dy = tool.y + tool.h - 1;
  const fit = Math.max(0, Math.floor((width - LEFT - 2 - SUB_W) / SUB_PITCH) + 1);
  const shown = Math.min(n, fit);
  const cells: Cell[] = [];
  const circles: Rect[] = [];
  if (shown === 0) return { cells, circles, labelY: dy, shown };
  const span = (shown - 1) * SUB_PITCH;
  let cx0 = dx - (span >> 1);
  cx0 = Math.max(LEFT + (SUB_W >> 1), Math.min(cx0, width - 2 - (SUB_W >> 1) - span));
  const xs = Array.from({ length: shown }, (_, i) => cx0 + i * SUB_PITCH);
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
  return { cells, circles, labelY: fanY + 2 + SUB_H, shown };
}

// ◇ on the sub-node's top border (n8n diamond-to-diamond dashed wires)
export function subPortCell(c: Rect): { x: number; y: number } {
  return { x: c.x + (c.w >> 1), y: c.y };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(geometry): sub-row tree fan — dashed trunk, rounded split, circles"
```

---

### Task 6: iconArt — 13 block-art glyphs

**Files:**
- Create: `src/ui/panels/lens/iconArt.ts`
- Test: `tests/icon-art.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/icon-art.test.ts`:

```ts
import { test, expect } from "bun:test";
import { ICON_ART, ART_W, ART_H } from "../src/ui/panels/lens/iconArt";

// Box drawing U+2500-257F, blocks U+2580-259F, geometric U+25A0-25FF, space.
// All single-cell-wide — protects against the tmux wide-glyph ghosting gotcha.
const ALLOWED = /^[─-╿▀-▟■-◿ ]+$/u;

test("every art is exactly ART_H rows of ART_W single-width glyphs", () => {
  for (const [key, rows] of Object.entries(ICON_ART)) {
    expect(rows.length).toBe(ART_H);
    for (const row of rows) {
      expect([...row].length).toBe(ART_W);
      expect(ALLOWED.test(row)).toBe(true);
    }
  }
});

test("covers all 12 IconKeys plus prompt", () => {
  const keys = Object.keys(ICON_ART).sort();
  expect(keys).toEqual(["bash", "edit", "prompt", "read", "result", "search", "skill", "task", "text", "thinking", "todo", "tool"].sort());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/icon-art.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/ui/panels/lens/iconArt.ts`:

```ts
import type { IconKey } from "../../../core/types";

// Hand-crafted n8n-style "huge" icons: 7×3 cells of single-width block/box/
// geometric glyphs ONLY (no emoji/wide glyphs — tmux ghosting gotcha).
// Visual polish is welcome as long as tests/icon-art.test.ts stays green.
export const ART_W = 7;
export const ART_H = 3;

export type ArtKey = IconKey | "prompt";

export const ICON_ART: Record<ArtKey, [string, string, string]> = {
  prompt:   ["▗▄▄▄▄▄▖", "▐█████▌", " ▝▜▘▀▀ "],  // speech bubble, tail left
  thinking: [" ▄███▄ ", " ▀███▀ ", "  ▘█▝  "],  // lightbulb
  text:     ["▗▄▄▄▄▄▖", "▐ ▪ ▪ ▌", " ▀▀▀▜▘ "],  // chat bubble, typing dots
  tool:     ["▗▖ ▗▄▖ ", " ▜█▛▀▘ ", "  ▐█▖  "],  // wrench
  bash:     ["▛▀▀▀▀▀▜", "▌▸ ▖  ▐", "▙▄▄▄▄▄▟"],  // terminal, prompt caret
  edit:     ["    ▗▄▖", "  ▗▟█▛ ", " ▟█▛▘  "],  // pencil, diagonal
  read:     ["▛▀▀▀▀▜ ", "▌▪▪▪ ▐ ", "▙▄▄▄▄▟ "],  // document with lines
  search:   [" ▄▀▀▄  ", " ▀▄▄▀  ", "    ▝▙ "],  // magnifier
  web:      [" ▗▄█▄▖ ", "▐██▌██▌", " ▝▀█▀▘ "],  // globe with meridian
  task:     ["  ▟█▙  ", " ▞ █ ▚ ", "▐▌▐█▌▐▌"],  // fan-out / sitemap
  skill:    ["  ▗▙▖  ", "▄▟███▙▄", " ▝▛▀▜▘ "],  // star
  todo:     ["▣ ▬▬▬▬ ", "▣ ▬▬▬▬ ", "▢ ▬▬▬▬ "],  // checklist
  result:   ["     ▗▟", "▜▖  ▟▛ ", " ▜▄▟▘  "],  // check mark
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/icon-art.test.ts`
Expected: PASS. If a row length assertion fails, count the row's glyphs and pad/trim spaces — every row must be exactly 7 chars.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/lens/iconArt.ts tests/icon-art.test.ts
git commit -m "feat(lens): 7x3 block-art icon set (12 IconKeys + prompt)"
```

---

### Task 7: theme — coral token

**Files:**
- Modify: `src/ui/theme.ts`

- [ ] **Step 1: Add the token**

In `src/ui/theme.ts`, add after `accent`:

```ts
  coral: "#FF6D5A",   // n8n primary — Lens ring, trigger bolt, active accents
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme.ts
git commit -m "feat(theme): n8n coral token for the lens ring/bolt"
```

---

### Task 8: Lens.tsx — render rewrite

**Files:**
- Rewrite: `src/ui/panels/Lens.tsx`

The props interface is UNCHANGED (App.tsx needs no edits). Bands/HUD helpers are reused. The old card/rail/comet rendering is fully replaced.

- [ ] **Step 1: Replace `src/ui/panels/Lens.tsx` with:**

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow } from "../../core/pipeline-flow";
import {
  nodeLayout, borderCells, portIn, portOut, badgeCell, diamondCell, boltCell,
  wireForward, wireLoop, subRow, subPortCell,
  NAME_ROWS, SUB_ROWS, BOX_H_ART, BOX_H_GLYPH, LEFT, TOP,
  type BoxMode, type NodeLayout, type Rect,
} from "../../core/pipeline-geometry";
import { rankOf } from "../../core/pipeline";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { breathe, lerpHex, pulsePhase } from "../anim";
import { iconFor } from "../icons";
import { put, drawStr, clip, laneHexOf } from "./lens/draw";
import { ICON_ART, ART_W, ART_H, type ArtKey } from "./lens/iconArt";
import { detectLensFromBeats } from "../../core/lens";
import { drawPhaseRibbon } from "./lens/phaseRibbon";
import { drawEconomy } from "./lens/economy";
import { drawHeartbeat } from "./lens/heartbeat";
import { drawSkillTimeline } from "./lens/skillTimeline";

interface Props {
  presented: Beat[];
  cursor: number;
  total: number;
  animate: boolean;
  lastAdvanceMs: number;
  intervalMs: number;
  status: Status;
  infoOn: boolean;
  tokens: import("../../core/types").SessionTokens;
  width: number;
  height: number;
}

const TRAIL_HOPS = 3;
const RING_MS = 1500;
const RING_WAIT_MS = 4500;
const STAGE_GLYPH: Record<string, IconKey> = { think: "thinking", tool: "tool", result: "result", chat: "text" };
const STAGE_ART: Record<string, ArtKey> = { prompt: "prompt", think: "thinking", tool: "tool", result: "result", chat: "text" };

interface SubItem { glyph: string; label: string; live: boolean; hex: string }

function statusHex(s: Status) {
  return s === "error" ? theme.err : s === "waiting" ? theme.warn : s === "idle" || s === "dormant" ? theme.dim : theme.ok;
}

// box: border + centered art/glyph + name/detail BELOW (n8n anatomy)
function drawNodeBox(
  buf: OptimizedBuffer, r: Rect, mode: BoxMode, key: string,
  name: string, detail: string, border: RGBA, iconHex: string, nameFg: RGBA,
  w: number, h: number,
) {
  for (const c of borderCells(r, key === "prompt")) put(buf, c.x, c.y, c.ch, border, w, h);
  const icon = RGBA.fromHex(iconHex);
  if (mode === "art") {
    const rows = ICON_ART[STAGE_ART[key] ?? "tool"];
    const ax = r.x + ((r.w - ART_W) >> 1);
    const ay = r.y + ((r.h - ART_H) >> 1);
    rows.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) if (row[j] !== " ") put(buf, ax + j, ay + i, row[j]!, icon, w, h);
    });
  } else {
    put(buf, r.x + (r.w >> 1), r.y + (r.h >> 1), iconFor(STAGE_GLYPH[key] ?? "tool"), icon, w, h);
  }
  const nm = clip(name, r.w + 2);
  drawStr(buf, r.x + ((r.w - nm.length) >> 1), r.y + r.h, nm, nameFg, w, h);
  const dt = clip(detail, r.w + 2);
  if (dt) drawStr(buf, r.x + ((r.w - dt.length) >> 1), r.y + r.h + 1, dt, RGBA.fromHex(theme.dim), w, h);
}

// milestone sparkle on the active box (ported unchanged from the old Lens)
function drawBurst(buf: OptimizedBuffer, cx: number, cy: number, kind: "commit" | "branch", phase: number, laneHex: string, w: number, h: number) {
  const r = Math.min(2, Math.round(phase * 2));
  const fade = 1 - phase;
  if (r <= 0 || fade <= 0) return;
  const col = RGBA.fromHex(lerpHex(theme.wireDim, kind === "commit" ? laneHex : theme.warn, fade));
  if (kind === "commit") {
    const ring: [number, number][] = [[r, 0], [-r, 0], [0, -1], [r - 1, -1]];
    const g = "✦✧·";
    ring.forEach(([dx, dy], i) => put(buf, cx + dx, cy + dy, g[i % g.length]!, col, w, h));
  } else {
    ([[r, 0], [r, -1], [1, -1]] as [number, number][]).forEach(([dx, dy]) => put(buf, cx + dx, cy + dy, "*", col, w, h));
  }
}

// orbiting coral ring: recolor the border cells with a chasing arc (n8n conic ring)
function drawRing(buf: OptimizedBuffer, r: Rect, rounded: boolean, now: number, periodMs: number, w: number, h: number) {
  const cells = borderCells(r, rounded);
  const head = Math.floor(((now % periodMs) / periodMs) * cells.length);
  const arc = Math.max(4, cells.length >> 2);
  cells.forEach((c, i) => {
    const d = (i - head + cells.length) % cells.length;
    const hex = d < arc ? lerpHex(theme.coral, theme.pulseHot, Math.max(0, 1 - d / 2) * 0.6) : lerpHex(theme.dim, theme.coral, 0.2);
    put(buf, c.x, c.y, c.ch, RGBA.fromHex(hex), w, h);
  });
}

function drawSubNode(buf: OptimizedBuffer, c: Rect, it: SubItem, labelY: number, now: number, animating: boolean, w: number, h: number) {
  const hex = it.live && animating ? lerpHex(it.hex, theme.pulseHot, breathe(now)) : it.hex;
  const border = RGBA.fromHex(it.live ? hex : theme.dim);
  for (const cell of borderCells(c)) {
    const rounded = cell.ch === "┌" ? "╭" : cell.ch === "┐" ? "╮" : cell.ch === "└" ? "╰" : cell.ch === "┘" ? "╯" : cell.ch;
    put(buf, cell.x, cell.y, rounded, border, w, h);
  }
  const p = subPortCell(c);
  put(buf, p.x, p.y, "◇", RGBA.fromHex(theme.dim), w, h);
  put(buf, c.x + (c.w >> 1), c.y + (c.h >> 1), it.glyph, RGBA.fromHex(hex), w, h);
  const lbl = clip(it.label, 14);
  drawStr(buf, c.x + (c.w >> 1) - (lbl.length >> 1), labelY, lbl, RGBA.fromHex(it.live ? theme.fg : theme.dim), w, h);
}

function drawHud(buf: OptimizedBuffer, flow: ReturnType<typeof deriveFlow>, status: Status, tempo: number, total: number, cursor: number, w: number, h: number) {
  const bandH = 4;
  const top = h - bandH;
  if (top < TOP + 2) return;
  const border = RGBA.fromHex(theme.dim);
  put(buf, LEFT, top, "┌", border, w, h);
  put(buf, LEFT, top + bandH - 1, "└", border, w, h);
  for (let x = LEFT + 1; x < w - 2; x++) { put(buf, x, top, "─", border, w, h); put(buf, x, top + bandH - 1, "─", border, w, h); }
  put(buf, w - 2, top, "┐", border, w, h);
  put(buf, w - 2, top + bandH - 1, "┘", border, w, h);
  for (let y = top + 1; y < top + bandH - 1; y++) { put(buf, LEFT, y, "│", border, w, h); put(buf, w - 2, y, "│", border, w, h); }
  drawStr(buf, LEFT + 2, top, " NOW ", RGBA.fromHex(theme.accent), w, h);
  const m = flow.main;
  const nowLine = m.activeKind
    ? `${iconFor(m.actionIcon ?? STAGE_GLYPH[m.activeKind] ?? "tool")} ${m.activeKind}${m.detail ? " · " + m.detail : ""}`
    : "idle";
  drawStr(buf, LEFT + 2, top + 1, clip(nowLine, w - 6), RGBA.fromHex(m.errored ? theme.err : theme.fg), w, h);
  const succTotal = m.ok + m.err;
  const succ = succTotal > 0 ? Math.round((100 * m.ok) / succTotal) : 100;
  const bars = Math.max(0, Math.min(4, Math.round(tempo * 4)));
  const tempoBar = "▮".repeat(bars) + "▯".repeat(4 - bars);
  let cx = LEFT + 2;
  put(buf, cx, top + 2, "●", RGBA.fromHex(statusHex(status)), w, h); cx += 2;
  const rest = `${status}   tempo ${tempoBar}   ✓${succ}% ${m.ok}/${m.err}   ${flow.agentsLive} agent${flow.agentsLive === 1 ? "" : "s"}   beats ${cursor}/${total}`;
  drawStr(buf, cx, top + 2, clip(rest, w - cx - 3), RGBA.fromHex(theme.dim), w, h);
}

export function Lens({ presented, cursor, total, animate, lastAdvanceMs, intervalMs, status, infoOn, tokens, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  const lensState = detectLensFromBeats(presented.slice(0, cursor));
  const ribbonOn = lensState.lensId === "superpowers";
  const animating = animate;

  // sub-row occupants: default = latest skill + live agents; `i` = tool breakdown
  const items: SubItem[] = [];
  if (infoOn) {
    for (const k of Object.keys(flow.main.toolBreakdown).sort((a, b) => rankOf(a) - rankOf(b))) {
      items.push({ glyph: iconFor(k as IconKey), label: `${k} ×${flow.main.toolBreakdown[k]}`, live: false, hex: laneHexOf("tool") });
    }
  } else {
    const lastGroup = lensState.skillGroups[lensState.skillGroups.length - 1];
    const skillName = flow.main.activeSkill ?? lastGroup?.skill;
    if (skillName) {
      const short = skillName.split(":").pop() ?? skillName;
      items.push({ glyph: iconFor("skill"), label: `${short} ×${flow.main.skillBreakdown[skillName] ?? 1}`, live: flow.main.activeKind === "skill", hex: laneHexOf("skill") });
    }
    for (const ln of flow.subLanes) items.push({ glyph: iconFor("task"), label: ln.label, live: true, hex: laneHexOf("task") });
  }

  // height ladder: art -> glyph -> drop economy -> heartbeat -> timeline -> ribbon -> sub-row
  const bandH = 4;
  const hudTop = height - bandH;
  const hasTimeline = lensState.skillGroups.length > 0 || presented.slice(0, cursor).some((b) => b.iconKey === "task");
  let ribbon = ribbonOn ? 2 : 0, econ = 1, heart = 1, time = hasTimeline ? 3 : 0;
  let mode: BoxMode = "art";
  let sub = items.length > 0 ? SUB_ROWS : 0;
  // sub-row rows OVERLAP the name rows (trunk/fan pass behind the labels — wires
  // run behind nodes in n8n too), so the block needs boxH + max(sub, NAME_ROWS).
  const blockNeed = () => (mode === "art" ? BOX_H_ART : BOX_H_GLYPH) + Math.max(sub, NAME_ROWS) + 1; // +1 loop channel
  const usable = hudTop - TOP;
  while (usable - ribbon - econ - heart - time < blockNeed()) {
    if (mode === "art") mode = "glyph";
    else if (econ) econ = 0;
    else if (heart) heart = 0;
    else if (time) time = 0;
    else if (ribbon) ribbon = 0;
    else if (sub) sub = 0;
    else break;
  }
  const showRibbon = ribbon > 0, showEconomy = econ > 0, showHeartbeat = heart > 0, showTimeline = time > 0;
  const showSub = sub > 0;

  const regionTop = TOP + ribbon;
  const regionBottom = hudTop - (econ + heart + time);
  const boxH = mode === "art" ? BOX_H_ART : BOX_H_GLYPH;
  const blockH = boxH + (showSub ? SUB_ROWS : NAME_ROWS);
  const top = Math.max(regionTop, regionTop + ((regionBottom - regionTop - blockH) >> 1));
  const nl: NodeLayout = nodeLayout(width, top, mode);
  const row = nl.row;

  // wire segment cover from hops
  const segN = row.length - 1;
  const cover: number[] = new Array(segN).fill(0);
  let backCount = 0;
  const idx = (k: string) => row.indexOf(k);
  for (const [k, n] of Object.entries(flow.main.hops)) {
    const gt = k.indexOf(">");
    const ia = idx(k.slice(0, gt)), ib = idx(k.slice(gt + 1));
    if (ia < 0 || ib < 0) continue;
    if (ib > ia) for (let s = ia; s < ib; s++) cover[s]! += n;
    else backCount += n;
  }
  if (nl.showTrigger && flow.main.trail.length > 0) cover[0] = Math.max(cover[0]!, 1);
  let hotLo = -1, hotHi = -2, hotBack: [string, string] | null = null;
  if (flow.main.lastHop) {
    const gt = flow.main.lastHop.indexOf(">");
    const a = flow.main.lastHop.slice(0, gt), b = flow.main.lastHop.slice(gt + 1);
    const ia = idx(a), ib = idx(b);
    if (ia >= 0 && ib >= 0) { if (ib > ia) { hotLo = ia; hotHi = ib - 1; } else hotBack = [a, b]; }
  }

  const sr = showSub ? subRow(nl.boxes.get("tool")!, items.length, width) : null;
  const nameBottom = top + boxH + NAME_ROWS;
  const blockBottom = Math.max(nameBottom, sr ? sr.labelY + 1 : 0);
  const channelY = blockBottom;
  const loopOn = (backCount > 0 || hotBack) && channelY < regionBottom;

  const activeK = flow.main.activeKind;
  const ringKey = status === "waiting" ? "chat" : activeK && nl.boxes.has(activeK) ? activeK : null;
  const ringMs = status === "waiting" ? RING_WAIT_MS : RING_MS;

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animate}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        if (showRibbon) drawPhaseRibbon(buffer, LEFT, TOP, lensState, animating, now, width, height);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(1, 600 / intervalMs)) : 0;
        const hotHex = flow.main.errored ? theme.err : theme.ok;

        // forward wires with persistent trail + embedded ×N labels
        for (let i = 0; i < segN; i++) {
          const a = nl.boxes.get(row[i]!)!, b = nl.boxes.get(row[i + 1]!)!;
          const hex = i >= hotLo && i <= hotHi ? hotHex : cover[i]! > 0 ? lerpHex(theme.wireDim, theme.ok, 0.35) : theme.wireDim;
          const lbl = nl.showLabels && row[i] !== "prompt" && cover[i]! > 0 ? `×${cover[i]}` : undefined;
          for (const c of wireForward(a, b, lbl)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(hex), width, height);
        }

        // backward loop (rounded U below the row)
        if (loopOn) {
          const [la, lb] = hotBack ?? ["chat", "think"];
          const a = nl.boxes.get(la) ?? nl.boxes.get("chat")!;
          const b = nl.boxes.get(lb) ?? nl.boxes.get("think")!;
          const hex = hotBack ? hotHex : lerpHex(theme.wireDim, theme.ok, 0.35);
          for (const c of wireLoop(a, b, channelY)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(hex), width, height);
        }

        // sub-row: dashed tree fan + circles
        if (sr) {
          const d = diamondCell(nl.boxes.get("tool")!);
          for (const c of sr.cells) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
          sr.circles.forEach((c, i) => drawSubNode(buffer, c, items[i]!, sr.labelY, now, animating, width, height));
          put(buffer, d.x, d.y, "◇", RGBA.fromHex(theme.dim), width, height);
          if (items.length > sr.shown) {
            const last = sr.circles[sr.circles.length - 1]!;
            drawStr(buffer, last.x + last.w + 2, last.y + 1, `+${items.length - sr.shown} more`, RGBA.fromHex(theme.dim), width, height);
          }
        }

        // node boxes
        for (const k of row) {
          const r = nl.boxes.get(k)!;
          const active = k === activeK;
          const laneHex = k === "prompt" ? theme.coral : laneHexOf(k);
          const border = RGBA.fromHex(active ? (flow.main.errored ? theme.err : laneHex) : theme.dim);
          const name = k;
          const detail =
            k === "prompt" ? `turn ${(flow.main.counts["chat"] ?? 0) + 1}`
            : k === "result" ? `✓${flow.main.ok} ✗${flow.main.err}`
            : active && flow.main.detail ? flow.main.detail
            : `×${flow.main.counts[k] ?? 0}`;
          drawNodeBox(buffer, r, mode, k, name, detail, border, laneHex, RGBA.fromHex(active ? theme.fg : theme.dim), width, height);
          // ports (chat's dangling output stays — n8n shows the bare port circle)
          if (k !== "prompt") put(buffer, portIn(r).x, portIn(r).y, "○", RGBA.fromHex(theme.dim), width, height);
          put(buffer, portOut(r).x, portOut(r).y, "●", RGBA.fromHex(theme.dim), width, height);
          // badge
          const bc = badgeCell(r);
          if (flow.main.errored && active) put(buffer, bc.x, bc.y, "✗", RGBA.fromHex(theme.err), width, height);
          else if ((flow.main.counts[k] ?? 0) > 0) put(buffer, bc.x, bc.y, "✓", RGBA.fromHex(theme.ok), width, height);
          // trigger bolt
          if (k === "prompt") {
            const b = boltCell(r);
            put(buffer, b.x, b.y, "⚡", RGBA.fromHex(theme.coral), width, height);
          }
        }

        // orbiting ring on the active (or waiting) node — n8n: errors stop the ring
        if (ringKey && animating && !flow.main.errored && status !== "error") {
          drawRing(buffer, nl.boxes.get(ringKey)!, ringKey === "prompt", now, ringMs, width, height);
        }

        // milestone burst (commit/branch) on the active box, as before
        const ak2 = flow.main.activeKind;
        if (flow.main.milestone && ak2 && nl.boxes.has(ak2) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = nl.boxes.get(ak2)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y, flow.main.milestone, pulsePhase(now, lastAdvanceMs, intervalMs), laneHexOf(ak2), width, height);
        }

        // bottom bands + HUD (unchanged zones)
        let by = hudTop;
        if (showEconomy) { by -= 1; drawEconomy(buffer, LEFT, by, tokens, width, height); }
        if (showHeartbeat) { by -= 1; drawHeartbeat(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
        if (showTimeline) { by -= 3; drawSkillTimeline(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
        drawHud(buffer, flow, status, tempo, total, cursor, width, height);
      }}
    />
  );
}
```

Notes for the implementer:
- `⚡` (U+26A1) renders 1 cell in most terminals but is emoji-presentation in some. If tmux capture shows misalignment at the bolt, swap to `↯` (U+21AF) or `ϟ` (U+03DF) — single-width alternatives. Do NOT use an emoji variant selector.
- Draw ORDER is load-bearing: wires → loop → sub-row → boxes/names → ring → burst. Names and boxes overwrite wire/fan cells beneath them — that's the n8n "wires pass behind nodes/labels" look, and the dashed `┆`/`┄` glyphs make the hidden cells read as natural dash gaps.

- [ ] **Step 2: Typecheck + full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: clean typecheck; all tests pass (no test imports Lens.tsx render internals).

- [ ] **Step 3: Quick smoke render in tmux**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p | head -40
```
Expected: node boxes with block art, names below, wires with ▶, no stack traces.

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): n8n-style render — block-art boxes, ports, trail wires, ring, sub-row"
```

---

### Task 9: remove legacy geometry API + legacy tests

**Files:**
- Modify: `src/core/pipeline-geometry.ts` (delete old functions)
- Modify: `tests/pipeline-geometry.test.ts` (delete old tests)
- Possibly modify: `src/core/pipeline.ts` (drop `slotOf` if now unused)

- [ ] **Step 1: Find remaining users of the legacy API**

```bash
grep -rn "coarseLayout\|pipeForward\|pipeReturn\|pipeBranch\|pipeElbow\|railCells\|railSegment\|expandStack\|CARD_W\|CARD_H\|ARROW_GAP\|ROW_GAP\|MAX_CARD_W\|slotOf" src/ tests/ --include="*.ts" --include="*.tsx"
```
Expected: hits only in `src/core/pipeline-geometry.ts`, `tests/pipeline-geometry.test.ts`, and (for `slotOf`) `src/core/pipeline.ts` + `tests/pipeline.test.ts`. If Lens.tsx or anything else still imports one, fix that first.

- [ ] **Step 2: Delete legacy code**

From `src/core/pipeline-geometry.ts` delete: `CARD_W`, `CARD_H`, `ARROW_GAP`, `ROW_GAP`, `MAX_CARD_W`, `coarseLayout`, `pipeForward`, `pipeReturn`, `pipeBranch`, `pipeElbow`, `railCells`, `railSegment`, `expandStack` (keep `Cell`, `Rect`, `LEFT`, `TOP`, and everything added in Tasks 2–5). Remove the now-unused `import type { PipeKind }` if nothing references it.

From `tests/pipeline-geometry.test.ts` delete the legacy tests (`expandStack…`, `coarseLayout…`, `pipeForward…`, `pipeReturn…`, `pipeBranch…`, `pipeElbow…`, `railCells…`, `railSegment…`) and prune the import list to the new API only.

If the grep in Step 1 showed `slotOf` used only by `pipeline.ts` itself and its test: delete `slotOf` + `SLOT` from `src/core/pipeline.ts` and its test block from `tests/pipeline.test.ts` (`nodeKindOf` and `rankOf` stay — flow and Lens use them).

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; all remaining tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A src/core tests
git commit -m "refactor(geometry): drop legacy card/rail API superseded by the n8n layout"
```

---

### Task 10: tmux visual verification + polish

**Files:** possibly small fixes anywhere in `src/ui/panels/Lens.tsx`, `src/ui/panels/lens/iconArt.ts`

- [ ] **Step 1: Full-size frame (150×36)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 5; tmux capture-pane -t cl -p
```
Check: trigger half-pill `╭ ╰` + bolt; 5 boxes with art; names+details below; `○`/`●` ports; `▶` arrowheads; `×N` labels on traversed wires; sub-row circles with `◇`+`┆`+fan when a skill/agent exists; HUD intact; no overlap.

- [ ] **Step 2: Ring animation (two frames, colored)**

```bash
tmux capture-pane -t cl -e -p > /tmp/f1.txt; sleep 1; tmux capture-pane -t cl -e -p > /tmp/f2.txt; diff /tmp/f1.txt /tmp/f2.txt | head -20
```
Expected: diffs ONLY in color escape sequences around the active box border (the orbiting arc), assuming a live session is animating. If no live session, replay one (`tmux send-keys -t cl r`).

- [ ] **Step 3: Width ladder (100×30) and short height (80×24)**

```bash
tmux kill-session -t cl; tmux new-session -d -s cl -x 100 -y 30 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
tmux kill-session -t cl; tmux new-session -d -s cl -x 80 -y 24 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
```
Check: 100×30 → no wire labels, trigger may drop; 80×24 → 4 boxes, glyph mode (5-row boxes), bands dropped in order, HUD never overlapped.

- [ ] **Step 4: Unicode fallback + key drive**

```bash
tmux kill-session -t cl; tmux new-session -d -s cl -x 150 -y 36 "CL_ICONS=unicode bun run dev"; sleep 4; tmux capture-pane -t cl -p
tmux send-keys -t cl i; sleep 1; tmux capture-pane -t cl -p   # sub-row flips to tool breakdown
tmux send-keys -t cl i
tmux kill-session -t cl
```

- [ ] **Step 5: Polish pass**

Fix any art that reads badly, misaligned cells, or collisions found above. Iterate per issue: smallest change → recapture → confirm. Block-art edits must keep `tests/icon-art.test.ts` green.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "fix(lens): visual polish from tmux verification pass"
```
(Skip the commit if no changes were needed.)

---

### Task 11: gates, docs, finish

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Full gates**

Run: `bunx tsc --noEmit && bun test`
Expected: both clean. If not, fix before proceeding.

- [ ] **Step 2: Update CLAUDE.md**

In the Architecture block, replace the `panels/Lens.tsx` line with:

```
  panels/Lens.tsx  default: n8n-style canvas — trigger half-pill + stage boxes (block-art icons, names below), skills/agents as dashed sub-nodes, persistent green trail wires, orbiting coral ring on the active node; `i` flips sub-row to tool breakdown
```

In the Architecture block, replace the `pipeline-geometry` description inside the `src/core/` listing (it is listed via `flow-layout.ts`'s sibling — add a line if absent):

```
  pipeline-geometry.ts  n8n node-row layout: width ladder, border/port/badge cells, straight+rounded wires, sub-row tree fan
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md lens + geometry descriptions for the n8n overhaul"
```

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill — push `feat/lens-n8n-overhaul`, open the PR (CI gates: typecheck + test), summarize the visual changes with a tmux capture snippet in the PR body.
