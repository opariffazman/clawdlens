# Lens pipes & vertical expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-line wires with dedicated port-routed pipes, draw the loop-back as a clean U-return pipe (killing the "blue box"), and make `i` explode the `tool` card *downward* into a vertical stack of its per-action cards.

**Architecture:** `pipeline-flow.ts` gains a live `toolBreakdown` + `activeTool`. `pipeline-geometry.ts` replaces `cardWire`/`fineCardLayout` with port pipe routers (`pipeForward`/`pipeReturn`/`pipeBranch`) + `expandStack`. `Lens.tsx` renders cards joined by discrete arrow-headed pipes, a U-return loop in its own channel, and (when `infoOn`) a vertical tool expansion. Main pipeline stays coarse; `i` toggles the tool expansion only.

**Tech Stack:** Bun, TypeScript (strict, `noUncheckedIndexedAccess`), React 19, `@opentui/core` buffered render, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-07-clawdlens-lens-pipes-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/core/pipeline-flow.ts` | add `toolBreakdown` + `activeTool` to main `LaneFlow` |
| `src/core/pipeline-geometry.ts` | add `pipeForward`/`pipeReturn`/`pipeBranch`/`expandStack`; remove `cardWire` + `fineCardLayout` |
| `src/ui/panels/Lens.tsx` | ports + dedicated pipes + U-return + vertical tool expand |
| `tests/pipeline-flow.test.ts` · `tests/pipeline-geometry.test.ts` | new tests; drop `cardWire`/`fineCardLayout` tests |

---

## Task 1: `toolBreakdown` + `activeTool` in `deriveFlow`

**Files:**
- Modify: `src/core/pipeline-flow.ts`
- Modify: `tests/pipeline-flow.test.ts` (append tests)

- [ ] **Step 1: Append tests to `tests/pipeline-flow.test.ts`:**

```ts
test("toolBreakdown counts tool beats by iconKey, cursor-synced", () => {
  const beats = [
    beat({ kind: "tool", iconKey: "bash", ok: true }),
    beat({ kind: "tool", iconKey: "edit", ok: true }),
    beat({ kind: "tool", iconKey: "bash", ok: true }),
    beat({ kind: "thinking" }),
  ];
  expect(deriveFlow(beats, 2, 5).main.toolBreakdown).toEqual({ bash: 1, edit: 1 });
  const f = deriveFlow(beats, 4, 5).main;
  expect(f.toolBreakdown).toEqual({ bash: 2, edit: 1 });
  expect(f.counts["tool"]).toBe(3); // coarse aggregate unchanged
});

test("activeTool is the head tool's iconKey, else null", () => {
  expect(deriveFlow([beat({ kind: "tool", iconKey: "edit" })], 1, 5).main.activeTool).toBe("edit");
  // completed tool: head still the tool beat, activeKind becomes result, activeTool stays the action
  expect(deriveFlow([beat({ kind: "tool", iconKey: "bash", ok: true })], 1, 5).main.activeTool).toBe("bash");
  expect(deriveFlow([beat({ kind: "thinking" })], 1, 5).main.activeTool).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test tests/pipeline-flow.test.ts` → FAIL (`toolBreakdown`/`activeTool` undefined).

- [ ] **Step 3: Implement.** In `src/core/pipeline-flow.ts`:

(a) Add two fields to the `LaneFlow` interface (after `err: number;`):
```ts
  toolBreakdown: Record<string, number>; // live tool counts keyed by iconKey
  activeTool: string | null;             // head tool's iconKey (for the expand highlight)
```

(b) In `laneFlow(...)`, after the `ok`/`err` loop, add:
```ts
  const toolBreakdown: Record<string, number> = {};
  for (const b of beats) if (b.kind === "tool") toolBreakdown[b.iconKey] = (toolBreakdown[b.iconKey] ?? 0) + 1;
  const activeTool = head?.kind === "tool" ? head.iconKey : null;
```

(c) Add `toolBreakdown, activeTool` to the returned object literal (after `ok, err,`).

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline-flow.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit`. EXPECTED: errors only in `src/ui/panels/Lens.tsx` (still uses `cardWire`/`fineCardLayout` until Task 3). If anything else errors, STOP and report.
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-flow.ts tests/pipeline-flow.test.ts
git commit -m "feat(lens): live toolBreakdown + activeTool on the flow lane"
```

---

## Task 2: Pipe routers + `expandStack` in geometry

**Files:**
- Modify: `src/core/pipeline-geometry.ts`
- Modify: `tests/pipeline-geometry.test.ts` (replace contents)

- [ ] **Step 1: Replace `tests/pipeline-geometry.test.ts` with:**

```ts
import { test, expect } from "bun:test";
import { coarseCardRect, pipeForward, pipeReturn, pipeBranch, expandStack, type Rect, LEFT, TOP } from "../src/core/pipeline-geometry";

test("coarseCardRect places cards on fixed slots", () => {
  const think = coarseCardRect("think");
  const tool = coarseCardRect("tool");
  expect(think.x).toBe(LEFT);
  expect(think.y).toBe(TOP);
  expect(tool.x).toBeGreaterThan(think.x);
  expect(coarseCardRect("result").x).toBeGreaterThan(tool.x);
  expect(coarseCardRect("skill").y).toBeGreaterThan(think.y);
});

test("pipeForward is a horizontal run on the mid-row ending in an arrowhead at the target port", () => {
  const a = coarseCardRect("think");
  const b = coarseCardRect("tool");
  const cells = pipeForward(a, b);
  const my = a.y + (a.h >> 1);
  expect(cells.every((c) => c.y === my)).toBe(true);
  expect(cells.every((c) => c.x >= a.x + a.w && c.x < b.x)).toBe(true);
  expect(cells[cells.length - 1]!.ch).toBe("▶");
  expect(cells[cells.length - 1]!.x).toBe(b.x - 1);
});

test("pipeReturn is a U below: corners + a left arrowhead on the channel row", () => {
  const a = coarseCardRect("result");
  const b = coarseCardRect("think");
  const channelY = a.y + a.h;
  const cells = pipeReturn(a, b, channelY);
  expect(cells.some((c) => c.ch === "╯")).toBe(true);
  expect(cells.some((c) => c.ch === "╰")).toBe(true);
  expect(cells.some((c) => c.ch === "◀")).toBe(true);
  expect(cells.some((c) => c.y === channelY)).toBe(true);
});

test("pipeBranch trunks from the parent and tees into each child", () => {
  const parent = coarseCardRect("tool");
  const children = expandStack(parent, 3);
  const cells = pipeBranch(parent, children);
  expect(cells.some((c) => c.ch === "│")).toBe(true); // trunk
  expect(cells.filter((c) => c.ch === "├" || c.ch === "└").length).toBe(3); // one tee per child
  expect(cells.filter((c) => c.ch === "└").length).toBe(1); // last child uses └
});

test("expandStack stacks n single-row child rects below the parent", () => {
  const parent = coarseCardRect("tool");
  const rects = expandStack(parent, 3);
  expect(rects.length).toBe(3);
  expect(rects.every((r) => r.h === 1)).toBe(true);
  expect(rects.every((r) => r.y >= parent.y + parent.h)).toBe(true);
  expect(rects[0]!.y).toBeLessThan(rects[1]!.y);
  expect(rects[1]!.y).toBeLessThan(rects[2]!.y);
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test tests/pipeline-geometry.test.ts` → FAIL.

- [ ] **Step 3: In `src/core/pipeline-geometry.ts`, delete `cardWire` and `fineCardLayout`, and append the routers:**

```ts
// forward pipe: a (left) → b (right), same row. Horizontal on the mid-row,
// terminating in ▶ at b's left input port.
export function pipeForward(a: Rect, b: Rect): Cell[] {
  const y = a.y + (a.h >> 1);
  const cells: Cell[] = [];
  for (let x = a.x + a.w; x < b.x - 1; x++) cells.push({ x, y, ch: "─" });
  cells.push({ x: b.x - 1, y, ch: "▶" });
  return cells;
}

// return pipe: a (right) → b (left). Down from a's bottom port to channelY, a
// run left, up into b's bottom port — a clean U with a ◀ arrowhead.
export function pipeReturn(a: Rect, b: Rect, channelY: number): Cell[] {
  const cells: Cell[] = [];
  const ax = a.x + (a.w >> 1);
  const bx = b.x + (b.w >> 1);
  for (let y = a.y + a.h; y < channelY; y++) cells.push({ x: ax, y, ch: "│" });
  cells.push({ x: ax, y: channelY, ch: "╯" });
  for (let x = ax - 1; x > bx + 1; x--) cells.push({ x, y: channelY, ch: "─" });
  cells.push({ x: bx + 1, y: channelY, ch: "◀" });
  cells.push({ x: bx, y: channelY, ch: "╰" });
  for (let y = channelY - 1; y >= b.y + b.h; y--) cells.push({ x: bx, y, ch: "│" });
  return cells;
}

// branch pipe: vertical trunk from the parent's bottom, with a tee into each
// child's left port (children are single-row rects from expandStack).
export function pipeBranch(parent: Rect, children: Rect[]): Cell[] {
  const cells: Cell[] = [];
  if (children.length === 0) return cells;
  const tx = parent.x + 1;
  const last = children[children.length - 1]!;
  for (let y = parent.y + parent.h; y < last.y; y++) cells.push({ x: tx, y, ch: "│" });
  for (const c of children) {
    cells.push({ x: tx, y: c.y, ch: c === last ? "└" : "├" });
    for (let x = tx + 1; x < c.x - 1; x++) cells.push({ x, y: c.y, ch: "─" });
    cells.push({ x: c.x - 1, y: c.y, ch: "▶" });
  }
  return cells;
}

// vertical stack of n single-row child slots below the parent card
export function expandStack(parent: Rect, n: number): Rect[] {
  const rects: Rect[] = [];
  const x = parent.x + 4;
  const y0 = parent.y + parent.h;
  for (let i = 0; i < n; i++) rects.push({ x, y: y0 + i, w: CARD_W, h: 1 });
  return rects;
}
```

Also remove the now-unused `rankOf` import IF it is no longer referenced after deleting `fineCardLayout` — check: `import { slotOf, rankOf } from "./pipeline";` → `rankOf` is only used by `fineCardLayout`. After deletion, change the import to `import { slotOf } from "./pipeline";` (leave `rankOf` exported from pipeline.ts; the Lens uses it in Task 4 to order children).

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline-geometry.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit`. EXPECTED: errors only in `src/ui/panels/Lens.tsx` (still imports `cardWire`/`fineCardLayout`; fixed in Task 3). If anything else errors, STOP and report.
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): port pipe routers + expandStack; drop cardWire/fineCardLayout"
```

---

## Task 3: `Lens.tsx` — ports + dedicated pipes + U-return (coarse)

**Files:**
- Modify: `src/ui/panels/Lens.tsx` (full replace)

- [ ] **Step 1: Replace the entire contents of `src/ui/panels/Lens.tsx` with:**

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { coarseCardRect, pipeForward, pipeReturn, pipeBranch, expandStack, type Rect, type Cell, LEFT, TOP, CARD_H } from "../../core/pipeline-geometry";
import { rankOf } from "../../core/pipeline";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  presented: Beat[];
  cursor: number;
  total: number;
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
const MAX_CHILDREN = 6;
const COARSE_STAGES = ["think", "tool", "result", "chat"];
const STAGE_ICON: Record<string, IconKey> = { think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text" };
const STAGE_COL: Record<string, number> = { think: 0, tool: 1, skill: 1, result: 2, chat: 3 };

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
  const r = Math.min(2, Math.round(phase * 2)); // capped radius so it stays on the card
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

// pick the routed pipe for a trail transition between two coarse kinds
function wireFor(from: string, to: string, layout: Map<string, Rect>, channelY: number): Cell[] {
  const a = layout.get(from); const b = layout.get(to);
  if (!a || !b) return [];
  if (a.y === b.y && b.x > a.x) return pipeForward(a, b);
  if (a.y === b.y && b.x < a.x) return pipeReturn(a, b, channelY);
  // different rows (involves skill): a vertical branch from the upper card to the lower
  return a.y < b.y ? pipeBranch(a, [b]) : pipeBranch(b, [a]);
}

export function Lens({ presented, cursor, total, pulse, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  const presentKinds = [...COARSE_STAGES];
  const showSkill = !infoOn && (flow.main.counts["skill"] ?? 0) > 0; // skill card hidden during tool expand (skill expand is issue #9)
  if (showSkill) presentKinds.push("skill");
  const layout = new Map<string, Rect>(presentKinds.map((k) => [k, coarseCardRect(k as Parameters<typeof coarseCardRect>[0])]));
  const channelY = TOP + CARD_H; // loop-return channel just below the top card row

  const backbone: [string, string][] = [["think", "tool"], ["tool", "result"], ["result", "chat"], ["result", "think"]];
  if (showSkill) backbone.push(["tool", "skill"]);

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

        // 1. dim backbone pipes
        for (const [a, b] of backbone) {
          for (const c of wireFor(a, b, layout, channelY)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
        }

        // 2. live comet on the current transition (+ faint trail)
        const trail = flow.main.trail;
        for (let i = 0; i + 1 < trail.length; i++) {
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

        // 4. milestone bloom (centered, capped)
        const ak = flow.main.activeKind;
        if (flow.main.milestone && ak && layout.has(ak) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = layout.get(ak)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y, flow.main.milestone, phase, laneHexOf(ak), width, height);
        }

        // 5. subagent lanes + 6. HUD band — placed below the real content bottom
        const bottoms = [...layout.values()].map((r) => r.y + r.h);
        let sy = Math.max(channelY + 1, ...bottoms) + 1;
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

- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit` → clean repo-wide.
- [ ] **Step 3: Full tests** — `bun test` → all pass.

- [ ] **Step 4: Visual verification via tmux** (the pane may be taller than `-y`; capture the full frame):

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 44 "bun run dev"; sleep 4; tmux capture-pane -t cl -p | grep -n .
tmux send-keys -t cl R; sleep 1; tmux capture-pane -t cl -ep > /tmp/p1.txt; sleep 1; tmux capture-pane -t cl -ep > /tmp/p2.txt; diff /tmp/p1.txt /tmp/p2.txt | head -20
tmux kill-session -t cl
```
Expected: cards joined by discrete `──▶` pipes (arrowhead into each card); the `result→think` loop is a clean **U below the top row** (corners `╯ ╰`, a `◀`), NOT a box-top; comet rides the active pipe; counts climb on replay. No orphaned "box" below the cards. Paste the frame. Adjust only `channelY`/spacing if the U overlaps a card.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): dedicated port-routed pipes + clean U-return loop"
```

---

## Task 4: Vertical tool expand (`i`)

**Files:**
- Modify: `src/ui/panels/Lens.tsx`

- [ ] **Step 1: Compute the tool children + their rects.** In `Lens`, after the `layout` / `channelY` / `backbone` setup and BEFORE the `return`, add:

```tsx
  // tool vertical expansion (i): per-action child cards stacked under the tool card
  const toolRect = layout.get("tool")!;
  const childKinds = infoOn
    ? Object.keys(flow.main.toolBreakdown).sort((a, b) => rankOf(a) - rankOf(b)).slice(0, MAX_CHILDREN)
    : [];
  const childRects = expandStack(toolRect, childKinds.length);
```

- [ ] **Step 2: Draw the branch + child rows.** Inside `renderAfter`, AFTER the cards loop (section 3) and BEFORE the milestone bloom (section 4), add:

```tsx
        // 3b. tool vertical expansion
        if (childKinds.length > 0) {
          for (const c of pipeBranch(toolRect, childRects)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
          childKinds.forEach((k, i) => {
            const r = childRects[i]!;
            const activeChild = k === flow.main.activeTool;
            const laneHex = laneHexOf("tool");
            const fg = RGBA.fromHex(activeChild ? (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : theme.fg) : theme.dim);
            const label = `${iconFor(k as IconKey)} ${k} ×${flow.main.toolBreakdown[k] ?? 0}`;
            drawStr(buffer, r.x, r.y, clip(label, width - r.x - 2), fg, width, height);
          });
          const extra = Object.keys(flow.main.toolBreakdown).length - childKinds.length;
          if (extra > 0) drawStr(buffer, toolRect.x + 4, (childRects[childRects.length - 1]?.y ?? toolRect.y + toolRect.h) + 1, `+${extra} more`, RGBA.fromHex(theme.dim), width, height);
        }
```

- [ ] **Step 3: Push sublanes/HUD below the expansion too.** In section 5, replace:

```tsx
        const bottoms = [...layout.values()].map((r) => r.y + r.h);
        let sy = Math.max(channelY + 1, ...bottoms) + 1;
```
with:
```tsx
        const bottoms = [...layout.values()].map((r) => r.y + r.h);
        const childBottom = childRects.length > 0 ? childRects[childRects.length - 1]!.y + 2 : 0;
        let sy = Math.max(channelY + 1, childBottom, ...bottoms) + 1;
```

- [ ] **Step 4: Typecheck** — `bunx tsc --noEmit` → clean.
- [ ] **Step 5: Full tests** — `bun test` → all pass.

- [ ] **Step 6: Visual verification via tmux:**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 44 "bun run dev"; sleep 4
echo "=== coarse ==="; tmux capture-pane -t cl -p | grep -n . | head -12
tmux send-keys -t cl i; sleep 1; echo "=== i (tool expanded) ==="; tmux capture-pane -t cl -p | grep -n . | head -18
tmux send-keys -t cl i; sleep 1; echo "=== back ==="; tmux capture-pane -t cl -p | grep -n . | head -10
tmux kill-session -t cl
```
Expected: `i` drops a vertical branch tree (`├─▶`/`└─▶`) from the `tool` card into per-action rows (`⚙ bash ×4`, `✎ edit ×2`, …), the active action highlighted; `i` again collapses it. Sublanes/HUD sit below the expansion. Paste captures; iterate spacing only if rows overlap.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): vertical tool expand into per-action cards (i) (#4)"
```

---

## Self-Review

**Spec coverage:**
- Dedicated port-routed pipes (arrowheads at ports) → Task 2 `pipeForward` + Task 3 `wireFor`/render.
- Clean U-return loop (kills the blue box) → Task 2 `pipeReturn` + Task 3 backbone `result→think` on `channelY`.
- Vertical tool expand on `i` → Task 1 `toolBreakdown`/`activeTool` + Task 2 `pipeBranch`/`expandStack` + Task 4 render.
- Generic mechanism for future skill expand → `pipeBranch`/`expandStack` take any parent+children (issue #9).
- Capped/centered bloom → Task 3 `drawBurst` (radius ≤2, centered on card).
- `cardWire`/`fineCardLayout` removed → Task 2.
- Sublanes/HUD below real content bottom (incl. expansion) → Task 3/4 `sy` computation.

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `toolBreakdown`/`activeTool` (Task 1) read by Lens (Task 4). `pipeForward`/`pipeReturn`/`pipeBranch`/`expandStack`/`Rect`/`Cell` (Task 2) used by Lens (Tasks 3-4). `rankOf` still exported from `pipeline.ts`, imported by Lens (Task 4) for child ordering. `Lens` Props gains nothing new (`total`/`infoOn` already present from prior work). Removed `cardWire`/`fineCardLayout` have no importers after Task 3.
