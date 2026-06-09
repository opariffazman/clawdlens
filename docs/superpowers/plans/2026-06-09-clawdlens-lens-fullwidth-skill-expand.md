# Lens full-width pipeline + skill-stage expand (#9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Lens pipeline fill the terminal's full width (cards spread, long gap arrows, vertically centered) and apply the tool's vertical-expand mechanism to the `skill` stage so `i` explodes both tool and skill into per-child stacks (closes #9).

**Architecture:** Pure-core-first. `pipeline-flow.ts` gains `skillBreakdown`/`activeSkill` (mirrors `toolBreakdown`/`activeTool`). `pipeline-geometry.ts` gains `coarseLayout(width, top)` (width-aware card spread + skill sub-column) and `pipeElbow` (tool→skill branch), and `pipeForward` switches to a heavy `━` run. `Lens.tsx` consumes these: computes a vertical-centering `top`, decides wide (side-by-side skill) vs narrow (skill under tool) from the gap, and renders both expand stacks via the existing `expandStack`/`pipeBranch`.

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · React 19 · `@opentui/react`/`@opentui/core` · `bun:test`. Pure modules are TDD'd; the panel is verified visually in tmux.

**Spec:** `docs/superpowers/specs/2026-06-09-clawdlens-lens-fullwidth-skill-expand-design.md`

**Commands:** `bun test` (suite) · `bunx tsc --noEmit` (typecheck) · tmux capture for visual (see Task 4).

---

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/core/pipeline-flow.ts` | derive live `LaneFlow` from beats | add `skillBreakdown` + `activeSkill` |
| `src/core/pipeline-geometry.ts` | pure card/pipe geometry | add `coarseLayout`, `pipeElbow`, `MAX_CARD_W`; heavy `━` `pipeForward`; (Task 5) remove `coarseCardRect` |
| `src/ui/panels/Lens.tsx` | render the Lens HUD | full-width layout, vertical centering, skill column + dual expand + narrow fallback |
| `tests/pipeline-flow.test.ts` | flow unit tests | add `skillBreakdown`/`activeSkill` tests |
| `tests/pipeline-geometry.test.ts` | geometry unit tests | add `coarseLayout`/`pipeElbow` tests; heavy-forward assertion; (Task 5) drop `coarseCardRect` test |

Tasks 1–3 are pure/TDD and keep every commit green (nothing is removed until its callers are gone). Task 4 rewrites the panel. Task 5 removes the now-dead `coarseCardRect`. Task 6 is final verification.

---

## Task 1: `skillBreakdown` + `activeSkill` in the flow

**Files:**
- Modify: `src/core/pipeline-flow.ts` (the `LaneFlow` interface near line 4; `laneFlow()` near lines 46–66)
- Test: `tests/pipeline-flow.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/pipeline-flow.test.ts`:

```ts
test("skillBreakdown counts skill beats by name, cursor-synced", () => {
  const beats = [
    beat({ kind: "skill", skill: "tdd", label: "tdd" }),
    beat({ kind: "skill", skill: "brainstorming", label: "brainstorming" }),
    beat({ kind: "skill", skill: "tdd", label: "tdd" }),
    beat({ kind: "thinking" }),
  ];
  expect(deriveFlow(beats, 2, 5).main.skillBreakdown).toEqual({ tdd: 1, brainstorming: 1 });
  const f = deriveFlow(beats, 4, 5).main;
  expect(f.skillBreakdown).toEqual({ tdd: 2, brainstorming: 1 });
  expect(f.counts["skill"]).toBe(3);
});

test("skillBreakdown falls back to label when the skill name is absent", () => {
  const f = deriveFlow([beat({ kind: "skill", label: "writing-plans" })], 1, 5).main;
  expect(f.skillBreakdown).toEqual({ "writing-plans": 1 });
});

test("activeSkill is the head skill beat's name, else null", () => {
  expect(deriveFlow([beat({ kind: "skill", skill: "tdd", label: "tdd" })], 1, 5).main.activeSkill).toBe("tdd");
  expect(deriveFlow([beat({ kind: "tool", iconKey: "bash" })], 1, 5).main.activeSkill).toBeNull();
  expect(deriveFlow([beat({ kind: "thinking" })], 1, 5).main.activeSkill).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/pipeline-flow.test.ts`
Expected: FAIL — `skillBreakdown` / `activeSkill` are `undefined` (TS may also error that the properties don't exist on `LaneFlow`).

- [ ] **Step 3: Add the two fields to the `LaneFlow` interface**

In `src/core/pipeline-flow.ts`, in `interface LaneFlow`, add after the `activeTool` line:

```ts
  skillBreakdown: Record<string, number>; // live skill counts keyed by skill name
  activeSkill: string | null;             // head skill beat's name (for the expand highlight)
```

- [ ] **Step 4: Populate them in `laneFlow()`**

In `laneFlow()`, after the existing `const activeTool = ...` line, add:

```ts
  const skillBreakdown: Record<string, number> = {};
  for (const b of beats) if (b.kind === "skill") { const n = b.skill ?? b.label; skillBreakdown[n] = (skillBreakdown[n] ?? 0) + 1; }
  const activeSkill = head?.kind === "skill" ? (head.skill ?? head.label) : null;
```

Then add `skillBreakdown, activeSkill,` to the returned object (next to `toolBreakdown, activeTool,`):

```ts
    errored, milestone: head?.milestone ?? null, isOpen, counts, ok, err, toolBreakdown, activeTool, skillBreakdown, activeSkill,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test tests/pipeline-flow.test.ts`
Expected: PASS (all flow tests, including the three new ones).

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-flow.ts tests/pipeline-flow.test.ts
git commit -m "feat(lens): add skillBreakdown + activeSkill to LaneFlow (#9)"
```

---

## Task 2: `coarseLayout` — width-aware card spread

**Files:**
- Modify: `src/core/pipeline-geometry.ts`
- Test: `tests/pipeline-geometry.test.ts`

`coarseCardRect` stays for now (still imported by `Lens.tsx`); `coarseLayout` is added alongside it and removed in Task 5.

- [ ] **Step 1: Write the failing tests**

Add to `tests/pipeline-geometry.test.ts` (and add `coarseLayout` to the existing import from `../src/core/pipeline-geometry`):

```ts
test("coarseLayout spreads four cards across the width in flow order, non-overlapping", () => {
  const m = coarseLayout(160, TOP);
  const order = ["think", "tool", "result", "chat"].map((k) => m.get(k as any)!);
  for (let i = 1; i < order.length; i++) {
    expect(order[i]!.x).toBeGreaterThan(order[i - 1]!.x + order[i - 1]!.w);
    expect(order[i]!.y).toBe(TOP);
  }
  const last = order[3]!;
  expect(last.x + last.w).toBeLessThanOrEqual(160);
  expect(last.x + last.w).toBeGreaterThan(160 - 2 - 18); // reaches toward the right edge
});

test("coarseLayout caps card width and pushes slack into the gaps", () => {
  const narrow = coarseLayout(80, TOP);
  const wide = coarseLayout(200, TOP);
  const gap = (m: Map<any, any>) => m.get("tool")!.x - (m.get("think")!.x + m.get("think")!.w);
  expect(wide.get("think")!.w).toBeLessThanOrEqual(18); // cardW capped
  expect(gap(wide)).toBeGreaterThan(gap(narrow)); // wider terminal => fatter gaps
});

test("coarseLayout places the skill card one row below, between tool and result", () => {
  const m = coarseLayout(200, TOP);
  const skill = m.get("skill")!, tool = m.get("tool")!, result = m.get("result")!;
  expect(skill.y).toBeGreaterThan(tool.y + tool.h);
  expect(skill.x).toBeGreaterThanOrEqual(tool.x + tool.w);
  expect(skill.x + skill.w).toBeLessThanOrEqual(result.x);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `coarseLayout` is not exported / not a function.

- [ ] **Step 3: Implement `coarseLayout`**

In `src/core/pipeline-geometry.ts`, add after `coarseCardRect` (keep `CARD_W`, `ARROW_GAP`, `CARD_H`, `ROW_GAP`, `LEFT`, `TOP` as-is):

```ts
export const MAX_CARD_W = 18;

// Width-aware coarse layout: think · tool · result · chat justified across the
// full width (cardW capped, slack flows into the gaps), with the skill card one
// row below, centered in the tool→result gap. `top` is supplied by the caller
// (the panel centers the block vertically).
export function coarseLayout(width: number, top: number): Map<PipeKind, Rect> {
  const usable = Math.max(4 * CARD_W + 3 * ARROW_GAP, width - LEFT - 2);
  const cardW = Math.max(CARD_W, Math.min(MAX_CARD_W, Math.floor(usable * 0.16)));
  const gap = Math.max(ARROW_GAP, Math.floor((usable - 4 * cardW) / 3));
  const colX = (c: number) => LEFT + c * (cardW + gap);
  const m = new Map<PipeKind, Rect>();
  m.set("think", { x: colX(0), y: top, w: cardW, h: CARD_H });
  m.set("tool", { x: colX(1), y: top, w: cardW, h: CARD_H });
  m.set("result", { x: colX(2), y: top, w: cardW, h: CARD_H });
  m.set("chat", { x: colX(3), y: top, w: cardW, h: CARD_H });
  const toolR = m.get("tool")!;
  const resultR = m.get("result")!;
  const gapInner = resultR.x - (toolR.x + toolR.w);
  const sx = toolR.x + toolR.w + Math.max(0, Math.floor((gapInner - cardW) / 2));
  m.set("skill", { x: Math.min(sx, resultR.x - cardW), y: top + CARD_H + ROW_GAP, w: cardW, h: CARD_H });
  return m;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS (existing `coarseCardRect`/pipe tests still green + the three new ones).

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): coarseLayout fills width with capped cards + skill sub-column"
```

---

## Task 3: heavy `━` forward pipe + `pipeElbow` for the skill branch

**Files:**
- Modify: `src/core/pipeline-geometry.ts` (`pipeForward` near lines 22–28; add `pipeElbow`)
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Update the `pipeForward` test + add `pipeElbow` tests**

In `tests/pipeline-geometry.test.ts`, change the existing `pipeForward` assertion so the run cells are heavy `━` (only the final arrowhead stays `▶`). Replace the body of the `"pipeForward is a horizontal run..."` test with:

```ts
  const a = coarseCardRect("think");
  const b = coarseCardRect("tool");
  const cells = pipeForward(a, b);
  const my = a.y + (a.h >> 1);
  expect(cells.every((c) => c.y === my)).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
  expect(cells.slice(0, -1).every((c) => c.ch === "━")).toBe(true); // heavy run
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);
```

Add `pipeElbow` to the import line, and append:

```ts
test("pipeElbow routes down the parent's right edge then into the child's left port", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 40, y: 6, w: 13, h: 3 };
  const cells = pipeElbow(a, b);
  expect(cells.some((c) => c.ch === "│" && c.x === a.x + a.w - 1)).toBe(true); // stem on a's right edge
  expect(cells.some((c) => c.ch === "╰")).toBe(true);                          // corner
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);                            // arrow at b's left port
});

test("pipeElbow drops a left-trunk stem when the child sits directly below", () => {
  const a = { x: 2, y: 1, w: 13, h: 3 };
  const b = { x: 2, y: 9, w: 13, h: 3 };
  const cells = pipeElbow(a, b);
  const cx = a.x + 1; // left trunk, collinear with pipeBranch — clears left-aligned child labels
  expect(cells.every((c) => c.x === cx)).toBe(true);
  expect(cells[cells.length - 1]!.ch).toBe("▼");
  expect(cells[cells.length - 1]!.y).toBe(b.y);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — `pipeForward` still emits `─` (heavy-run assertion fails) and `pipeElbow` is undefined.

- [ ] **Step 3: Switch `pipeForward` to heavy `━` and add `pipeElbow`**

In `src/core/pipeline-geometry.ts`, change the run glyph in `pipeForward` from `"─"` to `"━"`:

```ts
export function pipeForward(a: Rect, b: Rect): Cell[] {
  const y = a.y + (a.h >> 1);
  const cells: Cell[] = [];
  for (let x = a.x + a.w; x < b.x - 1; x++) cells.push({ x, y, ch: "━" });
  cells.push({ x: b.x - 1, y, ch: "▶" });
  return cells;
}
```

Add `pipeElbow` (after `pipeBranch`):

```ts
// branch a parent to a child that hangs below it. If the child is to the
// lower-right (own sub-column), route down the parent's right edge, corner,
// then right into the child's left-mid port. If the child sits directly below
// (narrow fallback), drop a centered vertical stem into the child's top port.
export function pipeElbow(a: Rect, b: Rect): Cell[] {
  const cells: Cell[] = [];
  if (b.x >= a.x + a.w) {
    const ex = a.x + a.w - 1;
    const by = b.y + (b.h >> 1);
    for (let y = a.y + a.h; y < by; y++) cells.push({ x: ex, y, ch: "│" });
    cells.push({ x: ex, y: by, ch: "╰" });
    for (let x = ex + 1; x < b.x - 1; x++) cells.push({ x, y: by, ch: "─" });
    cells.push({ x: b.x - 1, y: by, ch: "▶" });
  } else {
    const cx = a.x + 1; // left trunk (collinear with pipeBranch) — clears left-aligned child labels
    for (let y = a.y + a.h; y < b.y; y++) cells.push({ x: cx, y, ch: "│" });
    cells.push({ x: cx, y: b.y, ch: "▼" });
  }
  return cells;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: PASS (heavy-forward + both `pipeElbow` cases + existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): heavy forward pipe + pipeElbow for the skill branch"
```

---

## Task 4: rewrite `Lens.tsx` — full-width layout + dual expand

**Files:**
- Modify (replace whole file): `src/ui/panels/Lens.tsx`

This is a UI task — verified visually in tmux, not by unit tests. The render helpers (`laneHexOf`, `clip`, `statusHex`, `put`, `drawStr`, `drawCard`, `drawBurst`, `drawHud`, `drawSubLane`) are unchanged; only `STAGE_COL.skill` (distinct hue), `wireFor` (skill via `pipeElbow`), and the component body change.

- [ ] **Step 1: Replace the entire contents of `src/ui/panels/Lens.tsx` with:**

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { coarseLayout, pipeForward, pipeReturn, pipeBranch, pipeElbow, expandStack, type Rect, type Cell, LEFT, TOP, CARD_H, ROW_GAP } from "../../core/pipeline-geometry";
import { rankOf } from "../../core/pipeline";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  presented: Beat[];
  cursor: number;
  total: number;
  animate: boolean;
  lastAdvanceMs: number;
  intervalMs: number;
  status: Status;
  infoOn: boolean;
  width: number;
  height: number;
}

const TRAIL_HOPS = 3;
const TAIL = 6;
const MAX_CHILDREN = 6;
const SKILL_SIDE_MIN = 16; // min (skill.x - tool.x) to render skill side-by-side; else stack under tool
const COARSE_STAGES = ["think", "tool", "result", "chat"];
const STAGE_ICON: Record<string, IconKey> = { think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text" };
const STAGE_COL: Record<string, number> = { think: 0, tool: 1, skill: 4, result: 2, chat: 3 };

function laneHexOf(kind: string) {
  const col = STAGE_COL[kind] ?? (kind.charCodeAt(0) % theme.laneColors.length);
  return theme.laneColors[col % theme.laneColors.length]!;
}
function clip(s: string, n: number) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }
function statusHex(s: Status) {
  return s === "error" ? theme.err : s === "waiting" ? theme.warn : s === "idle" || s === "dormant" ? theme.dim : theme.ok;
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
  for (let i = 1; i < r.w - 1; i++) { const ch = title[i - 1]; put(buf, r.x + i, r.y, ch ?? "─", ch ? contentFg : border, w, h); }
  put(buf, r.x, r.y + 1, "│", border, w, h);
  put(buf, r.x + r.w - 1, r.y + 1, "│", border, w, h);
  drawStr(buf, r.x + 1, r.y + 1, clip(content, r.w - 3), contentFg, w, h);
  if (active) put(buf, r.x + r.w - 2, r.y + 1, "◉", border, w, h);
  put(buf, r.x, r.y + r.h - 1, "╰", border, w, h);
  put(buf, r.x + r.w - 1, r.y + r.h - 1, "╯", border, w, h);
  for (let i = 1; i < r.w - 1; i++) put(buf, r.x + i, r.y + r.h - 1, "─", border, w, h);
}

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

function drawHud(buf: OptimizedBuffer, flow: { main: LaneFlow; agentsLive: number }, status: Status, tempo: number, total: number, cursor: number, w: number, h: number) {
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
    ? `${iconFor(m.actionIcon ?? STAGE_ICON[m.activeKind] ?? "tool")} ${m.activeKind}${m.detail ? " · " + m.detail : ""}`
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

function drawSubLane(buf: OptimizedBuffer, ln: LaneFlow, y: number, now: number, animating: boolean, w: number, h: number) {
  const taskHex = theme.laneColors[5 % theme.laneColors.length]!;
  put(buf, LEFT + 2, y, iconFor("task"), RGBA.fromHex(taskHex), w, h);
  drawStr(buf, LEFT + 4, y, clip(ln.label, 14), RGBA.fromHex(theme.dim), w, h);
  if (!ln.activeKind) return;
  const x = LEFT + 20;
  const laneHex = laneHexOf(ln.activeKind);
  const headi = animating ? Math.floor((now / 120) % 3) : 99;
  for (let i = 0; i < 3; i++) put(buf, x + i, y, "·", RGBA.fromHex(i === headi ? laneHex : theme.wireDim), w, h);
  const glyph = ln.errored ? "✗" : iconFor(ln.actionIcon ?? (STAGE_ICON[ln.activeKind] ?? ln.activeKind) as IconKey);
  const col = ln.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
  put(buf, x + 4, y, glyph, RGBA.fromHex(col), w, h);
}

// pick the routed pipe for a transition between two coarse kinds
function wireFor(from: string, to: string, layout: Map<string, Rect>, channelY: number): Cell[] {
  const a = layout.get(from); const b = layout.get(to);
  if (!a || !b) return [];
  if (to === "skill") return pipeElbow(a, b);
  if (from === "skill") return pipeElbow(b, a).reverse();
  if (a.y === b.y && b.x > a.x) return pipeForward(a, b);
  if (a.y === b.y && b.x < a.x) return pipeReturn(a, b, channelY);
  return a.y < b.y ? pipeBranch(a, [b]) : pipeBranch(b, [a]).reverse();
}

export function Lens({ presented, cursor, total, animate, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = animate && !idle;

  const hasSkill = (flow.main.counts["skill"] ?? 0) > 0;

  // expand child kinds (i): tool by rank, skill by count desc then name
  const toolChildKinds = infoOn
    ? Object.keys(flow.main.toolBreakdown).sort((a, b) => rankOf(a) - rankOf(b)).slice(0, MAX_CHILDREN)
    : [];
  const skillChildKinds = infoOn && hasSkill
    ? Object.keys(flow.main.skillBreakdown).sort((a, b) => (flow.main.skillBreakdown[b]! - flow.main.skillBreakdown[a]!) || (a < b ? -1 : 1)).slice(0, MAX_CHILDREN)
    : [];
  const toolExtra = Object.keys(flow.main.toolBreakdown).length - toolChildKinds.length;
  const skillExtra = Object.keys(flow.main.skillBreakdown).length - skillChildKinds.length;

  // wide (side-by-side skill) vs narrow (skill under tool) — from the spread's gap
  const probe = coarseLayout(width, TOP);
  const wide = (probe.get("skill")!.x - probe.get("tool")!.x) >= SKILL_SIDE_MIN;

  // vertical centering: estimate the block height, center between TOP and the HUD band
  const bandH = 4;
  const hudTop = height - bandH;
  const sublaneRows = flow.agentsLive > 0 ? Math.min(3, flow.agentsLive) + 1 : 0;
  const toolN = toolChildKinds.length;
  const skillN = skillChildKinds.length;
  let maxBottomRel = CARD_H + toolN + (toolExtra > 0 ? 1 : 0);
  if (hasSkill) {
    const skillTopRel = wide ? (CARD_H + ROW_GAP) : (CARD_H + toolN + (toolExtra > 0 ? 1 : 0) + ROW_GAP);
    maxBottomRel = Math.max(maxBottomRel, skillTopRel + CARD_H + skillN + (skillExtra > 0 ? 1 : 0));
  }
  const blockH = maxBottomRel + 2;
  const top = Math.max(TOP, TOP + Math.floor((hudTop - TOP - sublaneRows - blockH) / 2));

  const layout = coarseLayout(width, top);
  const channelY = top + CARD_H + 1;

  const toolRect = layout.get("tool")!;
  const toolChildRects = expandStack(toolRect, toolN);
  const toolBlockBottom = toolN > 0 ? toolChildRects[toolChildRects.length - 1]!.y + 1 + (toolExtra > 0 ? 1 : 0) : toolRect.y + CARD_H;

  // place skill: wide → gap column (from coarseLayout); narrow → below the tool block
  let skillRect = layout.get("skill")!;
  if (hasSkill && !wide) {
    skillRect = { x: toolRect.x, y: toolBlockBottom + ROW_GAP, w: toolRect.w, h: CARD_H };
    layout.set("skill", skillRect);
  }
  const skillChildRects = hasSkill ? expandStack(skillRect, skillN) : [];

  const presentKinds = [...COARSE_STAGES];
  if (hasSkill) presentKinds.push("skill");

  const backbone: [string, string][] = [["think", "tool"], ["tool", "result"], ["result", "chat"]];
  if (hasSkill) backbone.push(["tool", "skill"]);

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animate}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(1, 600 / intervalMs)) : 0;

        // while tool is expanded, hide back-edge (loop) pipes — the stack uses that space
        const expanded = toolN > 0;
        const isReturn = (from: string, to: string) => {
          const a = layout.get(from); const b = layout.get(to);
          return !!a && !!b && a.y === b.y && b.x < a.x;
        };

        for (const [a, b] of backbone) {
          if (expanded && isReturn(a, b)) continue;
          for (const c of wireFor(a, b, layout, channelY)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
        }

        const trail = flow.main.trail;
        for (let i = 0; i + 1 < trail.length; i++) {
          if (expanded && isReturn(trail[i]!, trail[i + 1]!)) continue;
          const cells = wireFor(trail[i]!, trail[i + 1]!, layout, channelY);
          if (cells.length === 0) continue;
          const laneHex = laneHexOf(trail[i + 1]!);
          if (i === trail.length - 2 && animating) {
            const head = phase * cells.length;
            cells.forEach((c, ci) => put(buffer, c.x, c.y, c.ch, RGBA.fromHex(cometColor(head - ci, TAIL, flow.main.errored ? theme.err : laneHex, theme.pulseHot, theme.wireDim, 0.2 + 0.3 * tempo)), width, height));
          } else {
            const baseI = 0.2 + 0.3 * ((i + 1) / Math.max(1, trail.length - 1));
            cells.forEach((c) => put(buffer, c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, baseI)), width, height));
          }
        }

        for (const k of presentKinds) {
          const r = layout.get(k)!;
          const active = k === flow.main.activeKind;
          const laneHex = laneHexOf(k);
          const border = RGBA.fromHex(active ? (flow.main.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex)) : theme.dim);
          const icon = iconFor(active ? (flow.main.actionIcon ?? STAGE_ICON[k] ?? "tool") : (STAGE_ICON[k] ?? "tool"));
          const content = k === "result" ? `✓${flow.main.ok} ✗${flow.main.err}` : `×${flow.main.counts[k] ?? 0}`;
          drawCard(buffer, r, icon, k, content, RGBA.fromHex(active ? theme.fg : theme.dim), border, active, width, height);
        }

        // tool vertical expansion
        if (toolN > 0) {
          for (const c of pipeBranch(toolRect, toolChildRects)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
          toolChildKinds.forEach((k, i) => {
            const r = toolChildRects[i]!;
            const activeChild = k === flow.main.activeTool;
            const laneHex = laneHexOf("tool");
            const fg = RGBA.fromHex(activeChild ? (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : theme.fg) : theme.dim);
            drawStr(buffer, r.x, r.y, clip(`${iconFor(k as IconKey)} ${k} ×${flow.main.toolBreakdown[k] ?? 0}`, width - r.x - 2), fg, width, height);
          });
          if (toolExtra > 0) drawStr(buffer, toolRect.x + 4, (toolChildRects[toolChildRects.length - 1]?.y ?? toolRect.y + toolRect.h) + 1, `+${toolExtra} more`, RGBA.fromHex(theme.dim), width, height);
        }

        // skill vertical expansion (#9)
        if (hasSkill && skillN > 0) {
          for (const c of pipeBranch(skillRect, skillChildRects)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
          skillChildKinds.forEach((k, i) => {
            const r = skillChildRects[i]!;
            const activeChild = k === flow.main.activeSkill;
            const laneHex = laneHexOf("skill");
            const fg = RGBA.fromHex(activeChild ? (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : theme.fg) : theme.dim);
            drawStr(buffer, r.x, r.y, clip(`${iconFor("skill")} ${k} ×${flow.main.skillBreakdown[k] ?? 0}`, width - r.x - 2), fg, width, height);
          });
          if (skillExtra > 0) drawStr(buffer, skillRect.x + 4, (skillChildRects[skillChildRects.length - 1]?.y ?? skillRect.y + skillRect.h) + 1, `+${skillExtra} more`, RGBA.fromHex(theme.dim), width, height);
        }

        const ak = flow.main.activeKind;
        if (flow.main.milestone && ak && layout.has(ak) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = layout.get(ak)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y, flow.main.milestone, phase, laneHexOf(ak), width, height);
        }

        const bottoms = [...layout.values()].map((r) => r.y + r.h);
        const toolChildBottom = toolChildRects.length > 0 ? toolChildRects[toolChildRects.length - 1]!.y + 2 : 0;
        const skillChildBottom = skillChildRects.length > 0 ? skillChildRects[skillChildRects.length - 1]!.y + 2 : 0;
        let sy = Math.max(channelY + 1, toolChildBottom, skillChildBottom, ...bottoms) + 1;
        if (flow.agentsLive > 0) {
          drawStr(buffer, LEFT, sy, `▸ ${flow.agentsLive} agent${flow.agentsLive > 1 ? "s" : ""} live`, RGBA.fromHex(theme.accent), width, height);
          sy += 1;
          flow.subLanes.slice(0, 3).forEach((ln) => { drawSubLane(buffer, ln, sy, now, animating, width, height); sy += 1; });
        }
        drawHud(buffer, flow, status, tempo, total, cursor, width, height);
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (If `coarseCardRect` is reported unused, ignore — Task 5 removes it.)

- [ ] **Step 3: Visual check — WIDE (side-by-side skill)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 170 -y 44 "bun run dev"; sleep 5
tmux capture-pane -t cl -p
tmux send-keys -t cl "i"; sleep 1; tmux capture-pane -t cl -p
tmux kill-session -t cl
```
Expected: the 4 cards spread across the full width with long `━━━▶` arrows in the gaps; the card block is vertically centered (not jammed top-left); the skill card sits in its own column (distinct blue-ish hue) between tool and result, joined by an elbow. After `i`: tool's action children stack under tool AND skill's per-skill children stack under skill, side by side; counts present; HUD intact.

- [ ] **Step 4: Visual check — NARROW (skill stacks under tool)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 90 -y 40 "bun run dev"; sleep 5
tmux send-keys -t cl "i"; sleep 1; tmux capture-pane -t cl -p
tmux kill-session -t cl
```
Expected: cards still spread to fill 90 cols; on `i`, the skill card and its children render **below** the tool stack in a single column (sequential, no overlap). If you see overlap or premature fallback, tune `SKILL_SIDE_MIN` and/or the `MAX_CARD_W`/`* 0.16` factor in `coarseLayout`, then re-check.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): full-width pipeline, vertical centering, skill dual-expand (#9)"
```

---

## Task 5: remove the dead `coarseCardRect`

**Files:**
- Modify: `src/core/pipeline-geometry.ts` (delete `coarseCardRect`)
- Modify: `tests/pipeline-geometry.test.ts` (drop the `coarseCardRect`-specific test; repoint the pipe tests' rect setup)

- [ ] **Step 1: Confirm `coarseCardRect` has no remaining non-test callers**

Run: `grep -rn "coarseCardRect" src/`
Expected: no matches in `src/` (only `tests/` after Task 4).

- [ ] **Step 2: Repoint the geometry tests off `coarseCardRect`**

In `tests/pipeline-geometry.test.ts`: delete the test `"coarseCardRect places cards on fixed slots"`. In the remaining pipe tests that still call `coarseCardRect(...)` (the `pipeForward`, `pipeReturn`, and `pipeBranch`/`expandStack` setups), replace each `coarseCardRect("X")` rect with a literal rect, e.g.:

```ts
// pipeForward test
const a = { x: 2, y: 1, w: 13, h: 3 };
const b = { x: 30, y: 1, w: 13, h: 3 };
```
```ts
// pipeReturn tests
const a = { x: 48, y: 1, w: 13, h: 3 }; // "result"
const b = { x: 2, y: 1, w: 13, h: 3 };  // "think"
```
```ts
// pipeBranch + expandStack tests
const parent = { x: 25, y: 1, w: 13, h: 3 }; // "tool"
```
Remove `coarseCardRect` from the import line (keep `coarseLayout`, `pipeForward`, `pipeReturn`, `pipeBranch`, `pipeElbow`, `expandStack`, `LEFT`, `TOP`).

- [ ] **Step 3: Delete `coarseCardRect` from geometry**

In `src/core/pipeline-geometry.ts`, remove the `coarseCardRect` function (the `slotOf`-based one). Keep `slotOf`'s importers untouched elsewhere (it is still used by `pipeline.ts` consumers); only `coarseCardRect` is deleted. `CARD_W`/`ARROW_GAP` stay (used by `coarseLayout` and `expandStack`).

- [ ] **Step 4: Run tests + typecheck**

Run: `bun test tests/pipeline-geometry.test.ts && bunx tsc --noEmit`
Expected: PASS, no type errors, no unused-symbol complaints.

- [ ] **Step 5: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "refactor(lens): drop unused coarseCardRect after coarseLayout migration"
```

---

## Task 6: full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Visual frame-diff for the comet/pulse (animation still runs)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 170 -y 44 "bun run dev"; sleep 5
tmux capture-pane -t cl -e -p > /tmp/lens_a.txt; sleep 1; tmux capture-pane -t cl -e -p > /tmp/lens_b.txt
diff /tmp/lens_a.txt /tmp/lens_b.txt | head -30
tmux kill-session -t cl
```
Expected: a non-empty diff on the active pipe cells (comet animating); cards/skill column stable; no stale ghost fragments (the existing `forceRepaint` handles cursor/panel moves).

- [ ] **Step 4: Confirm `#9` acceptance**

Verify against the issue: on `i`, the skill card explodes into a vertical stack of per-skill cards driven by `skillBreakdown`, connected by a branch from the skill card's port, mirroring the tool expansion. Both expand together. Confirmed in Task 4 Step 3.

- [ ] **Step 5: Finish the branch**

Invoke `superpowers:finishing-a-development-branch` to choose how to integrate (the repo convention is branch → PR with CI gates: `tsc --noEmit` + `bun test`). Reference issue #9 in the PR so it auto-closes.

---

## Self-review notes

- **Spec coverage:** full-width spread + capped cards (Task 2); vertical centering (Task 4 `top`); heavy `━` gap arrows (Task 3); skill in its own gap column with distinct hue (`STAGE_COL.skill=4`, Task 4); `i` expands both stacks (Task 4); `skillBreakdown`/`activeSkill` (Task 1); narrow fallback → skill under tool, sequential (Task 4 `wide`/`skillRect` + `pipeElbow` stem). All spec sections map to a task.
- **Type consistency:** `coarseLayout(width, top) → Map<PipeKind, Rect>`, `pipeElbow(a, b) → Cell[]`, `skillBreakdown: Record<string,number>`, `activeSkill: string|null` are used identically wherever referenced.
- **No placeholders:** every code step contains the actual code; tmux commands are concrete with expected output. `SKILL_SIDE_MIN`/`MAX_CARD_W`/`0.16` are explicit, with a tuning note in Task 4 Steps 3–4 (visual is the source of truth for these aesthetic constants).
