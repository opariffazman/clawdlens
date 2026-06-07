# Lens HUD redesign (n8n boxed cards, two grains) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped single-line Lens with n8n-style boxed cards, live cursor-synced counts, a HUD band (NOW + VITALS) that fills the vertical space, and an `i`-toggled detail zoom between a coarse 5-stage overview and a fine per-action canvas.

**Architecture:** A pure grain mapper (`nodeKindOf`/`rankOf`) lets the pure model produce nodes at coarse (BeatKind) or fine (tool→iconKey) grain. `deriveFlow` becomes grain-aware and exposes live `counts`/`ok`/`err`. `pipeline-geometry` gains card rects (coarse fixed slots + fine wrapping strip) and a `cardWire` Manhattan router. `Lens.tsx` is rewritten to draw boxed cards with box→box wires/pulses + a HUD band. The orphaned static `buildPipeline`/`edgeVisible` are removed.

**Tech Stack:** Bun, TypeScript (strict, `noUncheckedIndexedAccess`), React 19, `@opentui/core` buffered render, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-07-clawdlens-lens-hud-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/core/pipeline.ts` | `PipeKind`, `slotOf`, **new** `Grain`/`nodeKindOf`/`rankOf`; **remove** `buildPipeline`/`edgeVisible`/`EDGE_MIN_FRAC`/`PipeNode`/`PipeEdge`/`PipelineGraph` |
| `src/core/pipeline-flow.ts` | grain-aware `deriveFlow`; `LaneFlow` gains live `counts`/`ok`/`err`; `activeKind`/`trail` become `string` |
| `src/core/pipeline-geometry.ts` | card geometry: `Rect`, card consts, `coarseCardRect`, `fineCardLayout`, `cardWire`; **remove** `nodePos`/`edgePath` |
| `src/ui/panels/Lens.tsx` | rewrite: boxed cards + HUD band + two grains |
| `src/ui/Showcase.tsx` | drop `full` from `<Lens>` |
| `src/ui/App.tsx` | `infoOn` default → `false` |
| `tests/pipeline.test.ts` · `tests/pipeline-flow.test.ts` · `tests/pipeline-geometry.test.ts` | rewritten/extended |

---

## Task 1: Grain mapper in `pipeline.ts` (+ remove orphaned aggregate)

**Files:**
- Modify: `src/core/pipeline.ts`
- Modify: `tests/pipeline.test.ts` (replace contents)

- [ ] **Step 1: Replace `tests/pipeline.test.ts` with:**

```ts
import { test, expect } from "bun:test";
import { slotOf, nodeKindOf, rankOf } from "../src/core/pipeline";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: "b", ts: 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: "L", count: 1, lane: "main", ...p };
}

test("slotOf returns fixed coarse slots", () => {
  expect(slotOf("think")).toEqual({ col: 0, row: 0 });
  expect(slotOf("tool")).toEqual({ col: 1, row: 0 });
  expect(slotOf("skill")).toEqual({ col: 1, row: 1 });
  expect(slotOf("result")).toEqual({ col: 2, row: 0 });
  expect(slotOf("chat")).toEqual({ col: 3, row: 0 });
});

test("nodeKindOf: coarse maps BeatKind; fine explodes tool to its iconKey", () => {
  expect(nodeKindOf(beat({ kind: "thinking" }), "coarse")).toBe("think");
  expect(nodeKindOf(beat({ kind: "text" }), "coarse")).toBe("chat");
  expect(nodeKindOf(beat({ kind: "skill" }), "coarse")).toBe("skill");
  expect(nodeKindOf(beat({ kind: "tool", iconKey: "bash" }), "coarse")).toBe("tool");
  expect(nodeKindOf(beat({ kind: "tool", iconKey: "bash" }), "fine")).toBe("bash");
  expect(nodeKindOf(beat({ kind: "tool", iconKey: "edit" }), "fine")).toBe("edit");
  expect(nodeKindOf(beat({ kind: "thinking" }), "fine")).toBe("think");
  expect(nodeKindOf(beat({ kind: "wait" }), "coarse")).toBeNull();
});

test("rankOf: think < tool-actions < skill < result < chat", () => {
  expect(rankOf("think")).toBeLessThan(rankOf("bash"));
  expect(rankOf("bash")).toBeLessThan(rankOf("result"));
  expect(rankOf("skill")).toBeLessThan(rankOf("result"));
  expect(rankOf("result")).toBeLessThan(rankOf("chat"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/pipeline.test.ts`
Expected: FAIL — `nodeKindOf`/`rankOf` not exported.

- [ ] **Step 3: Rewrite `src/core/pipeline.ts` to:**

```ts
import type { Beat, BeatKind } from "./types";

export type PipeKind = "think" | "tool" | "skill" | "result" | "chat";
export type Grain = "coarse" | "fine";

const SLOT: Record<PipeKind, { col: number; row: number }> = {
  think:  { col: 0, row: 0 },
  tool:   { col: 1, row: 0 },
  skill:  { col: 1, row: 1 },
  result: { col: 2, row: 0 },
  chat:   { col: 3, row: 0 },
};

export function slotOf(kind: PipeKind): { col: number; row: number } {
  return SLOT[kind];
}

const COARSE_OF: Partial<Record<BeatKind, string>> = {
  thinking: "think", text: "chat", skill: "skill", tool: "tool",
};

// Map a beat to a node id at the requested grain. Coarse = BeatKind grain;
// fine = a tool beat becomes its specific iconKey (bash/edit/read/...).
// Returns null for beats with no stage (wait/phase, and the never-emitted result).
export function nodeKindOf(b: Beat, grain: Grain): string | null {
  const c = COARSE_OF[b.kind];
  if (!c) return null;
  if (grain === "fine" && b.kind === "tool") return b.iconKey;
  return c;
}

// Canonical left→right ordering for card layout (covers coarse + fine kinds).
const RANK: Record<string, number> = {
  think: 0, bash: 1, edit: 2, read: 3, search: 4, web: 5, task: 6, todo: 7,
  tool: 8, skill: 9, result: 10, chat: 11,
};
export function rankOf(kind: string): number {
  return RANK[kind] ?? 99;
}
```

(Everything else in the old `pipeline.ts` — `buildPipeline`, `edgeVisible`, `EDGE_MIN_FRAC`, `PipeNode`, `PipeEdge`, `PipelineGraph`, the private `kindOf`, `ORDER` — is removed.)

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit`. Expected: errors ONLY in `src/core/pipeline-flow.ts` (imports `PipeKind` — still exported, fine) and `src/ui/panels/Lens.tsx` (imports the removed `buildPipeline`/`edgeVisible`). These are fixed in Tasks 2 and 4 respectively. If any OTHER file errors, STOP and report (an unexpected consumer of the removed exports).
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline.ts tests/pipeline.test.ts
git commit -m "feat(lens): grain mapper (nodeKindOf/rankOf); drop static buildPipeline"
```

(tsc is not yet clean repo-wide — Tasks 2/4 restore it. That's expected for this incremental step.)

---

## Task 2: Grain-aware `deriveFlow` + live counts

**Files:**
- Modify: `src/core/pipeline-flow.ts`
- Modify: `tests/pipeline-flow.test.ts` (append tests)

- [ ] **Step 1: Append tests to `tests/pipeline-flow.test.ts`:**

```ts
test("live counts climb with the cursor (coarse)", () => {
  const beats = [beat({ kind: "thinking" }), beat({ kind: "tool", ok: true }), beat({ kind: "thinking" })];
  expect(deriveFlow(beats, 1, 3).main.counts["think"]).toBe(1);
  const f = deriveFlow(beats, 3, 3).main;
  expect(f.counts["think"]).toBe(2);
  expect(f.counts["tool"]).toBe(1);
  expect(f.counts["result"]).toBe(1);
});

test("ok/err tally live from completed tools", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: true }), beat({ kind: "tool", ok: false })], 2, 3).main;
  expect(f.ok).toBe(1);
  expect(f.err).toBe(1);
});

test("fine grain splits tool counts by action; coarse lumps them", () => {
  const beats = [beat({ kind: "tool", iconKey: "bash", ok: true }), beat({ kind: "tool", iconKey: "edit", ok: true })];
  const fine = deriveFlow(beats, 2, 5, "fine").main;
  expect(fine.counts["bash"]).toBe(1);
  expect(fine.counts["edit"]).toBe(1);
  expect(fine.counts["tool"]).toBeUndefined();
  expect(fine.activeKind).toBe("result"); // edit completed -> result
  const coarse = deriveFlow(beats, 2, 5, "coarse").main;
  expect(coarse.counts["tool"]).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test tests/pipeline-flow.test.ts` → FAIL (`counts` undefined; `deriveFlow` arity).

- [ ] **Step 3: Replace `src/core/pipeline-flow.ts` with:**

```ts
import type { Beat, IconKey } from "./types";
import { nodeKindOf, type Grain } from "./pipeline";

export interface LaneFlow {
  lane: string;
  label: string;
  activeKind: string | null;
  trail: string[];                       // last K distinct stages, oldest -> newest
  actionIcon: IconKey | null;            // glyph for the active node
  detail: string | null;
  errored: boolean;
  milestone: "commit" | "branch" | null;
  isOpen: boolean;
  counts: Record<string, number>;        // live, cursor-synced node tallies
  ok: number;                            // completed-tool successes (live)
  err: number;                           // completed-tool failures (live)
}

export interface FlowState {
  main: LaneFlow;
  subLanes: LaneFlow[];
  agentsLive: number;
}

// expand beats -> node-id steps at the given grain, synthesizing `result` after
// a completed tool (ok defined)
function expand(beats: Beat[], grain: Grain): string[] {
  const steps: string[] = [];
  for (const b of beats) {
    const k = nodeKindOf(b, grain);
    if (!k) continue;
    steps.push(k);
    if (b.kind === "tool" && b.ok !== undefined) steps.push("result");
  }
  return steps;
}

function lastDistinct(steps: string[], n: number): string[] {
  const c: string[] = [];
  for (const s of steps) if (c.at(-1) !== s) c.push(s);
  return c.slice(Math.max(0, c.length - n));
}

function laneFlow(lane: string, label: string, beats: Beat[], isOpen: boolean, trailLen: number, grain: Grain): LaneFlow {
  const steps = expand(beats, grain);
  const trail = lastDistinct(steps, trailLen);
  const activeKind = trail.at(-1) ?? null;
  const head = beats.at(-1) ?? null;
  const errored = head?.kind === "tool" && head.ok === false;
  const counts: Record<string, number> = {};
  for (const s of steps) counts[s] = (counts[s] ?? 0) + 1;
  let ok = 0;
  let err = 0;
  for (const b of beats) if (b.kind === "tool" && b.ok !== undefined) { if (b.ok) ok += 1; else err += 1; }
  return {
    lane, label, activeKind, trail,
    actionIcon: activeKind === "result" ? "result" : (head?.iconKey ?? null),
    detail: head?.detail ?? head?.label ?? null,
    errored, milestone: head?.milestone ?? null, isOpen, counts, ok, err,
  };
}

function subLabel(taskBeat: Beat | undefined): string {
  if (!taskBeat) return "agent";
  return taskBeat.label.replace(/^Task · /, "") || (taskBeat.detail ?? "agent");
}

export function deriveFlow(beats: Beat[], cursor: number, trailLen: number, grain: Grain = "coarse"): FlowState {
  const revealed = beats.slice(0, Math.max(0, cursor));
  const mainBeats = revealed.filter((b) => b.lane === "main");
  const main = laneFlow("main", "main", mainBeats, false, trailLen, grain);

  const order: string[] = [];
  const byLane = new Map<string, Beat[]>();
  for (const b of revealed) {
    if (b.lane === "main") continue;
    if (!byLane.has(b.lane)) { byLane.set(b.lane, []); order.push(b.lane); }
    byLane.get(b.lane)!.push(b);
  }

  const subLanes: LaneFlow[] = [];
  for (const lane of order) {
    const task = mainBeats.find((b) => b.toolUseId === lane);
    const isOpen = task ? task.ok === undefined : false;
    if (!isOpen) continue;
    subLanes.push(laneFlow(lane, subLabel(task), byLane.get(lane)!, true, trailLen, grain));
  }

  return { main, subLanes, agentsLive: subLanes.length };
}
```

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline-flow.test.ts` → PASS (existing 12 + new 3). The existing tests pass unchanged (grain defaults to `"coarse"`; `activeKind`/`trail` widened to `string`).
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit`. Expected: remaining errors ONLY in `src/ui/panels/Lens.tsx` (still imports the removed `buildPipeline`; fixed in Task 4). If other files error, STOP and report.
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-flow.ts tests/pipeline-flow.test.ts
git commit -m "feat(lens): grain-aware deriveFlow with live counts/ok/err"
```

---

## Task 3: Card geometry in `pipeline-geometry.ts`

**Files:**
- Modify: `src/core/pipeline-geometry.ts` (replace contents)
- Modify: `tests/pipeline-geometry.test.ts` (replace contents)

- [ ] **Step 1: Replace `tests/pipeline-geometry.test.ts` with:**

```ts
import { test, expect } from "bun:test";
import { coarseCardRect, fineCardLayout, cardWire, CARD_W, LEFT, TOP } from "../src/core/pipeline-geometry";

test("coarseCardRect places cards on fixed slots", () => {
  const think = coarseCardRect("think");
  const tool = coarseCardRect("tool");
  expect(think.x).toBe(LEFT);
  expect(think.y).toBe(TOP);
  expect(tool.x).toBeGreaterThan(think.x);
  expect(coarseCardRect("result").x).toBeGreaterThan(tool.x);
  expect(coarseCardRect("skill").y).toBeGreaterThan(think.y);
});

test("fineCardLayout orders by rank and wraps at width", () => {
  const wide = fineCardLayout(["chat", "bash", "think"], 200);
  expect(wide.get("think")!.x).toBeLessThan(wide.get("bash")!.x);
  expect(wide.get("bash")!.x).toBeLessThan(wide.get("chat")!.x);
  expect(wide.get("think")!.y).toBe(wide.get("chat")!.y); // one row when wide

  const narrow = fineCardLayout(["think", "bash", "edit", "read", "web"], CARD_W + 5);
  const ys = [...narrow.values()].map((r) => r.y);
  expect(Math.max(...ys)).toBeGreaterThan(Math.min(...ys)); // wrapped to >1 row
});

test("cardWire same-row forward is a horizontal run between card edges", () => {
  const a = coarseCardRect("think");
  const b = coarseCardRect("tool");
  const cells = cardWire(a, b);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.y === a.y + (a.h >> 1))).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
});

test("cardWire different-row produces a connected L-path", () => {
  const a = coarseCardRect("tool");
  const b = coarseCardRect("skill"); // below tool
  const cells = cardWire(a, b);
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.some((c) => c.y > a.y + a.h - 1)).toBe(true); // drops below the source row
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test tests/pipeline-geometry.test.ts` → FAIL (exports gone/renamed).

- [ ] **Step 3: Replace `src/core/pipeline-geometry.ts` with:**

```ts
import type { PipeKind } from "./pipeline";
import { slotOf, rankOf } from "./pipeline";

export interface Cell { x: number; y: number; ch: string }
export interface Rect { x: number; y: number; w: number; h: number }

export const LEFT = 2;
export const TOP = 1;
export const CARD_W = 11;
export const CARD_H = 3;
export const ARROW_GAP = 4;  // horizontal space between cards (carries the wire)
export const ROW_GAP = 2;    // vertical gap between card rows

// coarse: each stage on its fixed slot, rendered as a card box
export function coarseCardRect(kind: PipeKind): Rect {
  const { col, row } = slotOf(kind);
  return { x: LEFT + col * (CARD_W + ARROW_GAP), y: TOP + row * (CARD_H + ROW_GAP), w: CARD_W, h: CARD_H };
}

// fine: order by rank, lay out left→right, wrap to a new row at `width`
export function fineCardLayout(kinds: string[], width: number): Map<string, Rect> {
  const ordered = [...kinds].sort((a, b) => rankOf(a) - rankOf(b));
  const map = new Map<string, Rect>();
  let x = LEFT;
  let y = TOP;
  for (const k of ordered) {
    if (x > LEFT && x + CARD_W > width) { x = LEFT; y += CARD_H + ROW_GAP; }
    map.set(k, { x, y, w: CARD_W, h: CARD_H });
    x += CARD_W + ARROW_GAP;
  }
  return map;
}

// Manhattan wire (cells only, excludes card glyphs) from card a to card b:
//  - same row, b right of a  → straight horizontal on a's midline
//  - same row, b left of a   → arc one row below the cards (back-edge)
//  - different rows          → horizontal on a's midline to b's x, then vertical into b
export function cardWire(a: Rect, b: Rect): Cell[] {
  const cells: Cell[] = [];
  const acy = a.y + (a.h >> 1);
  const bcy = b.y + (b.h >> 1);

  if (a.y === b.y && b.x > a.x) {
    for (let x = a.x + a.w; x < b.x; x++) cells.push({ x, y: acy, ch: "─" });
    return cells;
  }
  if (a.y === b.y && b.x < a.x) {
    const yArc = a.y + a.h;
    const xa = a.x + (a.w >> 1);
    const xb = b.x + (b.w >> 1);
    cells.push({ x: xa, y: yArc, ch: "╮" });
    for (let x = xa - 1; x > xb; x--) cells.push({ x, y: yArc, ch: "─" });
    cells.push({ x: xb, y: yArc, ch: "╭" });
    return cells;
  }
  // different rows
  const endX = b.x >= a.x ? b.x - 1 : b.x + b.w;
  const startX = b.x >= a.x ? a.x + a.w : a.x - 1;
  const stepX = endX >= startX ? 1 : -1;
  for (let x = startX; x !== endX + stepX; x += stepX) cells.push({ x, y: acy, ch: "─" });
  const stepY = bcy >= acy ? 1 : -1;
  for (let y = acy + stepY; y !== bcy + stepY; y += stepY) cells.push({ x: endX, y, ch: "│" });
  return cells;
}
```

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline-geometry.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit`. Expected: remaining errors ONLY in `src/ui/panels/Lens.tsx` (imports the removed `nodePos`/`edgePath`/`buildPipeline`; fixed in Task 4).
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): card geometry — coarse rects, fine wrapping layout, cardWire"
```

---

## Task 4: `Lens.tsx` rewrite — coarse boxed cards + HUD band

**Files:**
- Modify: `src/ui/panels/Lens.tsx` (full replace)
- Modify: `src/ui/Showcase.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Replace the entire contents of `src/ui/panels/Lens.tsx` with:**

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { coarseCardRect, cardWire, type Rect, LEFT, TOP, CARD_H, ROW_GAP } from "../../core/pipeline-geometry";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  presented: Beat[];
  cursor: number;
  pulse: boolean;
  lastAdvanceMs: number;
  intervalMs: number;
  status: Status;
  infoOn: boolean;
  width: number;
  height: number;
}

const TRAIL_HOPS = 3;
const TAIL = 6;
const COARSE_STAGES = ["think", "tool", "result", "chat"];
const STAGE_ICON: Record<string, IconKey> = { think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text" };
const STAGE_COL: Record<string, number> = { think: 0, tool: 1, skill: 1, result: 2, chat: 3 };

function laneHexOf(kind: string) { return theme.laneColors[(STAGE_COL[kind] ?? 0) % theme.laneColors.length]!; }
function clip(s: string, n: number) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }
function statusHex(s: Status) {
  return s === "error" ? theme.err : s === "waiting" ? theme.warn
    : s === "idle" || s === "dormant" ? theme.dim : theme.ok;
}

function put(buf: OptimizedBuffer, x: number, y: number, ch: string, fg: RGBA, w: number, h: number) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  buf.setCell(x, y, ch, fg, TRANSPARENT);
}
function drawStr(buf: OptimizedBuffer, x: number, y: number, s: string, fg: RGBA, w: number, h: number) {
  for (let i = 0; i < s.length; i++) put(buf, x + i, y, s[i]!, fg, w, h);
}

function drawCard(buf: OptimizedBuffer, r: Rect, icon: string, name: string, content: string, contentFg: RGBA, border: RGBA, active: boolean, w: number, h: number) {
  const title = ` ${icon} ${name} `;
  put(buf, r.x, r.y, "╭", border, w, h);
  put(buf, r.x + r.w - 1, r.y, "╮", border, w, h);
  for (let i = 1; i < r.w - 1; i++) {
    const ch = title[i - 1];
    put(buf, r.x + i, r.y, ch ?? "─", ch ? contentFg : border, w, h);
  }
  put(buf, r.x, r.y + 1, "│", border, w, h);
  put(buf, r.x + r.w - 1, r.y + 1, "│", border, w, h);
  drawStr(buf, r.x + 1, r.y + 1, clip(content, r.w - 3), contentFg, w, h);
  if (active) put(buf, r.x + r.w - 2, r.y + 1, "◉", border, w, h);
  put(buf, r.x, r.y + r.h - 1, "╰", border, w, h);
  put(buf, r.x + r.w - 1, r.y + r.h - 1, "╯", border, w, h);
  for (let i = 1; i < r.w - 1; i++) put(buf, r.x + i, r.y + r.h - 1, "─", border, w, h);
}

function drawBurst(buf: OptimizedBuffer, cx: number, cy: number, kind: "commit" | "branch", phase: number, laneHex: string, w: number, h: number) {
  const r = Math.round(phase * 3);
  const fade = 1 - phase;
  if (r <= 0 || fade <= 0) return;
  const col = RGBA.fromHex(lerpHex(theme.wireDim, kind === "commit" ? laneHex : theme.warn, fade));
  if (kind === "commit") {
    const ring: [number, number][] = [[r, 0], [-r, 0], [0, 1], [0, -1], [r - 1, 1], [-(r - 1), -1]];
    const g = "✦✧·*";
    ring.forEach(([dx, dy], i) => put(buf, cx + dx, cy + dy, g[i % g.length]!, col, w, h));
  } else {
    ([[r, 0], [r, -1], [r - 1, 1], [1, -1]] as [number, number][]).forEach(([dx, dy]) => put(buf, cx + dx, cy + dy, "*", col, w, h));
    put(buf, cx + 1, cy, "+", col, w, h);
  }
}

function drawHud(buf: OptimizedBuffer, flow: { main: LaneFlow; agentsLive: number }, status: Status, tempo: number, total: number, cursor: number, w: number, h: number) {
  const bandH = 4;
  const top = h - bandH;
  if (top < TOP + 2) return;
  const border = RGBA.fromHex(theme.dim);
  // borders + labels
  put(buf, LEFT, top, "┌", border, w, h);
  put(buf, LEFT, top + bandH - 1, "└", border, w, h);
  for (let x = LEFT + 1; x < w - 2; x++) { put(buf, x, top, "─", border, w, h); put(buf, x, top + bandH - 1, "─", border, w, h); }
  put(buf, w - 2, top, "┐", border, w, h);
  put(buf, w - 2, top + bandH - 1, "┘", border, w, h);
  drawStr(buf, LEFT + 2, top, " NOW ", RGBA.fromHex(theme.accent), w, h);
  // NOW line
  const m = flow.main;
  const nowLine = m.activeKind
    ? `${iconFor(m.actionIcon ?? STAGE_ICON[m.activeKind] ?? "tool")} ${m.activeKind}${m.detail ? " · " + m.detail : ""}`
    : "idle";
  drawStr(buf, LEFT + 2, top + 1, clip(nowLine, w - 5), RGBA.fromHex(m.errored ? theme.err : theme.fg), w, h);
  // VITALS line
  const succTotal = m.ok + m.err;
  const succ = succTotal > 0 ? Math.round((100 * m.ok) / succTotal) : 100;
  const bars = Math.max(0, Math.min(4, Math.round(tempo * 4)));
  const tempoBar = "▮".repeat(bars) + "▯".repeat(4 - bars);
  let cx = LEFT + 2;
  put(buf, cx, top + 2, "●", RGBA.fromHex(statusHex(status)), w, h); cx += 2;
  const rest = `${status}   tempo ${tempoBar}   ✓${succ}% ${m.ok}/${m.err}   ${flow.agentsLive} agent   beats ${cursor}/${total}`;
  drawStr(buf, cx, top + 2, clip(rest, w - cx - 3), RGBA.fromHex(theme.dim), w, h);
}

function drawSubLane(buf: OptimizedBuffer, ln: LaneFlow, y: number, now: number, animating: boolean, w: number, h: number) {
  const taskHex = theme.laneColors[5 % theme.laneColors.length]!;
  put(buf, LEFT + 2, y, iconFor("task"), RGBA.fromHex(taskHex), w, h);
  drawStr(buf, LEFT + 4, y, clip(ln.label, 14), RGBA.fromHex(theme.dim), w, h);
  if (!ln.activeKind) return;
  const x = LEFT + 20;
  const laneHex = laneHexOf(ln.activeKind);
  const headi = animating ? Math.floor((now / 120) % 3) : 99;
  for (let i = 0; i < 3; i++) put(buf, x + i, y, "·", RGBA.fromHex(i === headi ? laneHex : theme.wireDim), w, h);
  const glyph = ln.errored ? "✗" : iconFor(ln.actionIcon ?? STAGE_ICON[ln.activeKind] ?? "tool");
  const col = ln.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
  put(buf, x + 4, y, glyph, RGBA.fromHex(col), w, h);
}

export function Lens({ presented, cursor, pulse, lastAdvanceMs, intervalMs, status, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  // present kinds + layout (coarse): 4 fixed cards, skill added if active
  const presentKinds = [...COARSE_STAGES];
  if ((flow.main.counts["skill"] ?? 0) > 0) presentKinds.push("skill");
  const layout = new Map<string, Rect>(presentKinds.map((k) => [k, coarseCardRect(k as Parameters<typeof coarseCardRect>[0])]));
  const backbone: [string, string][] = [["think", "tool"], ["tool", "result"], ["result", "chat"]];
  if (presentKinds.includes("skill")) backbone.push(["tool", "skill"]);

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(1, 600 / intervalMs)) : 0;

        // 1. dim backbone wires (box -> box)
        for (const [a, b] of backbone) {
          const ra = layout.get(a); const rb = layout.get(b);
          if (!ra || !rb) continue;
          for (const c of cardWire(ra, rb)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
        }

        // 2. live comet on the current transition (+ faint trail)
        const trail = flow.main.trail;
        for (let i = 0; i + 1 < trail.length; i++) {
          const ra = layout.get(trail[i]!); const rb = layout.get(trail[i + 1]!);
          if (!ra || !rb) continue;
          const cells = cardWire(ra, rb);
          const laneHex = laneHexOf(trail[i + 1]!);
          if (i === trail.length - 2 && animating) {
            const head = phase * cells.length;
            cells.forEach((c, ci) => put(buffer, c.x, c.y, flow.main.errored ? "┉" : c.ch,
              RGBA.fromHex(cometColor(head - ci, TAIL, flow.main.errored ? theme.err : laneHex, theme.pulseHot, theme.wireDim, 0.2 + 0.3 * tempo)), width, height));
          } else {
            const baseI = 0.2 + 0.3 * ((i + 1) / Math.max(1, trail.length - 1));
            cells.forEach((c) => put(buffer, c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, baseI)), width, height));
          }
        }

        // 3. cards
        for (const k of presentKinds) {
          const r = layout.get(k)!;
          const active = k === flow.main.activeKind;
          const laneHex = laneHexOf(k);
          const border = RGBA.fromHex(active ? (flow.main.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex)) : theme.dim);
          const icon = iconFor(active ? (flow.main.actionIcon ?? STAGE_ICON[k] ?? "tool") : (STAGE_ICON[k] ?? "tool"));
          const content = k === "result" ? `✓${flow.main.ok} ✗${flow.main.err}` : `×${flow.main.counts[k] ?? 0}`;
          drawCard(buffer, r, icon, k, content, RGBA.fromHex(active ? theme.fg : theme.dim), border, active, width, height);
        }

        // 4. milestone bloom on the active card
        const ak = flow.main.activeKind;
        if (flow.main.milestone && ak && layout.has(ak) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = layout.get(ak)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y + r.h, flow.main.milestone, phase, laneHexOf(ak), width, height);
        }

        // 5. subagent lanes (below the card rows)
        let sy = TOP + 2 * (CARD_H + ROW_GAP);
        if (flow.agentsLive > 0) {
          drawStr(buffer, LEFT, sy, `▸ ${flow.agentsLive} agent${flow.agentsLive > 1 ? "s" : ""} live`, RGBA.fromHex(theme.accent), width, height);
          sy += 1;
          flow.subLanes.slice(0, 3).forEach((ln) => { drawSubLane(buffer, ln, sy, now, animating, width, height); sy += 1; });
        }

        // 6. HUD band (anchored to the bottom)
        drawHud(buffer, flow, status, tempo, presented.length, cursor, width, height);
      }}
    />
  );
}
```

- [ ] **Step 2: Update `src/ui/Showcase.tsx`** — the `<Lens>` no longer takes `full`. Replace the lens render line:

```tsx
        {panel === "lens" && <Lens full={agg} presented={presented} cursor={cursor} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} status={session.status} infoOn={infoOn} width={width - 4} height={bodyHeight} />}
```
with:
```tsx
        {panel === "lens" && <Lens presented={presented} cursor={cursor} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} status={session.status} infoOn={infoOn} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 3: Update `src/ui/App.tsx`** — flip the `infoOn` default to overview:

```ts
  const [infoOn, setInfoOn] = useState(false);
```

- [ ] **Step 4: Typecheck** — `bunx tsc --noEmit` → now clean repo-wide (Lens no longer imports the removed exports).
- [ ] **Step 5: Full tests** — `bun test` → all pass.

- [ ] **Step 6: Visual verification via tmux**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
```
Expected: Lens default tab; **boxed cards** `╭◇ think╮ … ╭◈ tool╮ …` connected by dim wires; an active card with a bright breathing border + `◉`; a `result` card with `✓/✗`; a **HUD band at the bottom** with a `NOW` line (full action) + a `VITALS` line. Replay to see the comet + live counts climb:
```bash
tmux send-keys -t cl R; sleep 1; tmux capture-pane -t cl -ep > /tmp/h1.txt; sleep 1; tmux capture-pane -t cl -ep > /tmp/h2.txt; diff /tmp/h1.txt /tmp/h2.txt | head -20
tmux send-keys -t cl p; sleep 1; tmux capture-pane -t cl -p | sed -n '4,20p'   # pulse off freezes the comet
tmux kill-session -t cl
```
Expected: non-empty diff (comet moving, counts climbing); `p` freezes. Iterate on spacing/alignment if cards overlap or the band is clipped (adjust `CARD_W`/`ARROW_GAP`/`bandH` only if needed; keep behavior). If the default session has no beats, switch to an active one via `:`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/Lens.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(lens): boxed n8n cards + HUD band, live counts (coarse)"
```

---

## Task 5: Fine grain drill-down (`i` toggle)

**Files:**
- Modify: `src/ui/panels/Lens.tsx`

- [ ] **Step 1: Make the layout grain-aware.** In `Lens.tsx`, add `fineCardLayout` and `rankOf` to the imports:

```tsx
import { coarseCardRect, fineCardLayout, cardWire, type Rect, LEFT, TOP, CARD_H, ROW_GAP } from "../../core/pipeline-geometry";
```

Add `infoOn` back to the destructured props in the `Lens({ … })` signature (after `status`):

```tsx
export function Lens({ presented, cursor, pulse, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
```

Replace the coarse-only layout block:

```tsx
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  // present kinds + layout (coarse): 4 fixed cards, skill added if active
  const presentKinds = [...COARSE_STAGES];
  if ((flow.main.counts["skill"] ?? 0) > 0) presentKinds.push("skill");
  const layout = new Map<string, Rect>(presentKinds.map((k) => [k, coarseCardRect(k as Parameters<typeof coarseCardRect>[0])]));
  const backbone: [string, string][] = [["think", "tool"], ["tool", "result"], ["result", "chat"]];
  if (presentKinds.includes("skill")) backbone.push(["tool", "skill"]);
```

with:

```tsx
  const grain = infoOn ? "fine" : "coarse";
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, grain);
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  // present kinds + layout per grain
  let presentKinds: string[];
  let layout: Map<string, Rect>;
  let backbone: [string, string][];
  if (grain === "coarse") {
    presentKinds = [...COARSE_STAGES];
    if ((flow.main.counts["skill"] ?? 0) > 0) presentKinds.push("skill");
    layout = new Map(presentKinds.map((k) => [k, coarseCardRect(k as Parameters<typeof coarseCardRect>[0])]));
    backbone = [["think", "tool"], ["tool", "result"], ["result", "chat"]];
    if (presentKinds.includes("skill")) backbone.push(["tool", "skill"]);
  } else {
    // fine: a card per node that has fired; no dense static backbone (the live
    // comet/trail carries the flow). Always include the visited kinds + result.
    presentKinds = Object.keys(flow.main.counts);
    layout = fineCardLayout(presentKinds, width);
    backbone = [];
  }
```

(The rest of the render — backbone loop, comet/trail loop, cards loop, bloom, sublanes, HUD — already reads `presentKinds`/`layout`/`backbone` generically and works unchanged for both grains. `STAGE_COL`/`STAGE_ICON` fall back via `?? 0` / `?? "tool"`, and fine kinds resolve their own `IconKey` through `iconFor` since `actionIcon`/the kind id are `IconKey`s.)

- [ ] **Step 2: Make fine-grain card icons/colors resolve.** In the cards loop, the idle icon for a fine kind should be the kind itself (it's an `IconKey`), not the coarse `STAGE_ICON`. Replace the `icon` line inside the cards loop:

```tsx
          const icon = iconFor(active ? (flow.main.actionIcon ?? STAGE_ICON[k] ?? "tool") : (STAGE_ICON[k] ?? "tool"));
```
with:
```tsx
          const idleIcon = (STAGE_ICON[k] ?? k) as IconKey; // coarse stage icon, else the fine kind is itself an IconKey
          const icon = iconFor(active ? (flow.main.actionIcon ?? idleIcon) : idleIcon);
```

And make `laneHexOf` stable for fine kinds — replace the `laneHexOf` helper:

```tsx
function laneHexOf(kind: string) { return theme.laneColors[(STAGE_COL[kind] ?? 0) % theme.laneColors.length]!; }
```
with:
```tsx
function laneHexOf(kind: string) {
  const col = STAGE_COL[kind] ?? (kind.charCodeAt(0) % theme.laneColors.length);
  return theme.laneColors[col % theme.laneColors.length]!;
}
```

- [ ] **Step 3: Typecheck** — `bunx tsc --noEmit` → clean.
- [ ] **Step 4: Full tests** — `bun test` → all pass.

- [ ] **Step 5: Visual verification via tmux**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 4; tmux capture-pane -t cl -p | sed -n '4,20p'
tmux send-keys -t cl i; sleep 1; echo "=== after i (fine) ==="; tmux capture-pane -t cl -p | sed -n '4,24p'
tmux send-keys -t cl i; sleep 1; echo "=== back to coarse ==="; tmux capture-pane -t cl -p | sed -n '4,20p'
tmux kill-session -t cl
```
Expected: `i` switches from the 5-stage overview to the **fine canvas** where the `tool` card is replaced by per-action cards (`⚙ bash`, `✎ edit`, `▤ read`, …), wrapping to multiple rows if wide; the comet hops between the action cards; `i` again returns to coarse. (Use a session with varied tool use via `:` if the current one is sparse.) Iterate spacing only if cards overlap.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): i-toggle fine per-action card canvas (#4)"
```

---

## Self-Review

**Spec coverage:**
- Boxed cards + box→box wires/pulses → Task 3 geometry + Task 4 `drawCard`/`cardWire`.
- HUD band (NOW + VITALS), fills vertical space, anchored bottom → Task 4 `drawHud`.
- Live cursor-synced counts + `✓/✗` → Task 2 `counts`/`ok`/`err`, rendered Task 4.
- Two grains, `i` zoom (default coarse) → Task 1 `nodeKindOf`/grain, Task 2 grain-aware `deriveFlow`, Task 5 fine layout + `infoOn` default false (Task 4).
- Fine = tool explodes to iconKey, wrapping strip → Task 1 fine map, Task 3 `fineCardLayout`, Task 5.
- Comet/trail, active highlight, milestone bloom, failure flash, subagent lanes, session vitality (tempo/status/idle) → Task 4 render.
- Remove orphaned `buildPipeline`/`edgeVisible` → Task 1.
- Drop `full` from `<Lens>`; `infoOn` default false → Task 4.

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `Grain`/`nodeKindOf`/`rankOf` (Task 1) consumed by `pipeline-flow` (Task 2) and `pipeline-geometry` (Task 3). `LaneFlow.counts/ok/err`, `activeKind: string` (Task 2) read by `Lens` (Tasks 4-5). `Rect`/`coarseCardRect`/`fineCardLayout`/`cardWire`/`CARD_H`/`ROW_GAP`/`LEFT`/`TOP` (Task 3) used by `Lens`. `Lens` Props (no `full`, has `infoOn`/cadence/`status`) match the Showcase call site (Task 4). Removed `nodePos`/`edgePath`/`buildPipeline` have no remaining importers after Task 4.
