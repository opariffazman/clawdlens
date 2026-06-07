# Lens Panel (CI/CD pipeline hawk-eye) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Lens placeholder with a frozen, legible CI/CD-style pipeline that aggregates the whole session into five reusable BeatKind stages with flowing edge energy and a cursor flare.

**Architecture:** Pure `src/core/pipeline.ts` folds the whole-session beats into a `PipelineGraph` (nodes with counts, weighted data-driven edges, fixed lifecycle slots) — unit-tested TDD. A thin buffered `src/ui/panels/Lens.tsx` renders it with `setCell` + energy animation (same substrate as `Flow`/`Git`). Showcase passes the aggregate fold; `DEFAULT_PANEL` flips `log`→`lens`.

**Tech Stack:** Bun, TypeScript (strict, noUncheckedIndexedAccess), React 19, `@opentui/core` buffered rendering, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-07-clawdlens-lens-panel-design.md`

**Rendering refinement vs spec (legibility-driven, approved goal = "easy to understand"):** the spec said "one energy dot per edge." With 5 nodes, multiple forward edges overlap the same horizontal gap and several back-edges stack — per-edge dots would be noisy. So the renderer draws **one dot per spine gap** (weight = hottest forward edge crossing that gap), **one dot per back-arc** (top 2 by weight), and **one on the skill branch**. Fewer dots = calmer = more legible. The pure graph still keeps every edge (so it stays fully testable); only the renderer coalesces.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/core/pipeline.ts` | **new** — pure `buildPipeline(beats)→PipelineGraph`, `edgeVisible()` predicate, `EDGE_MIN_FRAC`, types. No I/O. |
| `tests/pipeline.test.ts` | **new** — TDD suite for the pure aggregator. |
| `src/ui/panels/Lens.tsx` | replace placeholder with buffered pipeline render (nodes, spine, back-arcs, skill branch, energy, flare). |
| `src/ui/Showcase.tsx` | pass `full / presented / cursor / pulse / width / height` to `<Lens>`. |
| `src/core/types.ts` | flip `DEFAULT_PANEL` `"log"` → `"lens"`. |
| `tests/chrome.test.ts` | update the `DEFAULT_PANEL` expectation to `"lens"`. |

---

## Task 1: Pure pipeline aggregator (`src/core/pipeline.ts`)

**Files:**
- Create: `tests/pipeline.test.ts`
- Create: `src/core/pipeline.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/pipeline.test.ts`:

```ts
import { test, expect } from "bun:test";
import { buildPipeline, edgeVisible, EDGE_MIN_FRAC } from "../src/core/pipeline";
import type { Beat } from "../src/core/types";

let seq = 0;
function beat(p: Partial<Beat>): Beat {
  seq += 1;
  return {
    id: p.id ?? `b${seq}`, ts: p.ts ?? 0, kind: p.kind ?? "tool",
    iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: p.count ?? 1,
    lane: p.lane ?? "main", ...p,
  };
}

test("empty beats -> empty graph", () => {
  const g = buildPipeline([]);
  expect(g.nodes).toEqual([]);
  expect(g.edges).toEqual([]);
  expect(g.maxCount).toBe(0);
  expect(g.maxWeight).toBe(0);
});

test("beat kinds map to pipe kinds; wait/phase ignored", () => {
  const g = buildPipeline([
    beat({ kind: "thinking" }),
    beat({ kind: "text" }),
    beat({ kind: "skill" }),
    beat({ kind: "tool" }),       // no ok -> no synthetic result
    beat({ kind: "wait" }),
    beat({ kind: "phase" }),
  ]);
  expect(g.nodes.map((n) => n.kind).sort()).toEqual(["chat", "skill", "think", "tool"]);
  expect(g.nodes.find((n) => n.kind === "result")).toBeUndefined();
});

test("completed tool synthesizes a result node with ok/err split", () => {
  const g = buildPipeline([
    beat({ kind: "tool", ok: true }),
    beat({ kind: "tool", ok: false }),
    beat({ kind: "tool", ok: true }),
  ]);
  const result = g.nodes.find((n) => n.kind === "result")!;
  expect(result.count).toBe(3);
  expect(result.ok).toBe(2);
  expect(result.err).toBe(1);
});

test("pending tool (ok undefined) makes no result", () => {
  const g = buildPipeline([beat({ kind: "tool" })]);
  expect(g.nodes.find((n) => n.kind === "result")).toBeUndefined();
  expect(g.nodes.find((n) => n.kind === "tool")!.count).toBe(1);
});

test("node count includes consecutive duplicates", () => {
  const g = buildPipeline([beat({ kind: "thinking" }), beat({ kind: "thinking" }), beat({ kind: "tool" })]);
  expect(g.nodes.find((n) => n.kind === "think")!.count).toBe(2);
});

test("edges come from the coalesced sequence -> no self-edges", () => {
  const g = buildPipeline([beat({ kind: "thinking" }), beat({ kind: "thinking" }), beat({ kind: "tool" })]);
  expect(g.edges.some((e) => e.from === e.to)).toBe(false);
  expect(g.edges.find((e) => e.from === "think" && e.to === "tool")!.weight).toBe(1);
});

test("edge weights accumulate over repeated transitions", () => {
  const g = buildPipeline([
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
  ]);
  expect(g.edges.find((e) => e.from === "think" && e.to === "tool")!.weight).toBe(2);
  expect(g.edges.find((e) => e.from === "tool" && e.to === "think")!.weight).toBe(1);
});

test("back-edge classification by column order", () => {
  const g = buildPipeline([
    beat({ kind: "tool", ok: true }), // steps: tool, result
    beat({ kind: "thinking" }),       // result -> think (back)
    beat({ kind: "skill" }),          // think -> skill (fwd 0->1)
    beat({ kind: "tool" }),           // skill -> tool (back, equal col 1)
  ]);
  const get = (f: string, t: string) => g.edges.find((e) => e.from === f && e.to === t)!;
  expect(get("tool", "result").back).toBe(false);
  expect(get("result", "think").back).toBe(true);
  expect(get("think", "skill").back).toBe(false);
  expect(get("skill", "tool").back).toBe(true);
});

test("edgeVisible thresholds rare edges but keeps the floor", () => {
  expect(edgeVisible(40, 40)).toBe(true);
  expect(edgeVisible(1, 40)).toBe(false); // ceil(0.05*40)=2 -> 1 dropped
  expect(edgeVisible(1, 10)).toBe(true);  // ceil(0.05*10)=1 -> floor keeps it
  expect(EDGE_MIN_FRAC).toBe(0.05);
});

test("maxCount and maxWeight reflect the largest node/edge", () => {
  const g = buildPipeline([
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
    beat({ kind: "thinking" }),
  ]);
  expect(g.maxCount).toBe(3);  // think x3
  expect(g.maxWeight).toBe(2); // think->tool x2
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/pipeline.test.ts`
Expected: FAIL — `Cannot find module '../src/core/pipeline'`.

- [ ] **Step 3: Write the implementation**

Create `src/core/pipeline.ts`:

```ts
import type { Beat, BeatKind } from "./types";

export type PipeKind = "think" | "tool" | "skill" | "result" | "chat";

export interface PipeNode {
  kind: PipeKind;
  count: number;   // frequency over ALL steps (not coalesced)
  ok?: number;     // result node only
  err?: number;    // result node only
  col: number;     // fixed slot column
  row: number;     // fixed slot row
}

export interface PipeEdge {
  from: PipeKind;
  to: PipeKind;
  weight: number;  // frequency over the coalesced transition sequence
  back: boolean;   // runs against column order -> drawn as an arc
}

export interface PipelineGraph {
  nodes: PipeNode[];
  edges: PipeEdge[];
  maxCount: number;
  maxWeight: number;
}

// rare-edge cutoff: an edge is drawn iff weight >= max(1, ceil(EDGE_MIN_FRAC*maxWeight))
export const EDGE_MIN_FRAC = 0.05;

const SLOT: Record<PipeKind, { col: number; row: number }> = {
  think:  { col: 0, row: 0 },
  tool:   { col: 1, row: 0 },
  skill:  { col: 1, row: 1 },
  result: { col: 2, row: 0 },
  chat:   { col: 3, row: 0 },
};
const ORDER: PipeKind[] = ["think", "tool", "skill", "result", "chat"];

function kindOf(k: BeatKind): PipeKind | null {
  switch (k) {
    case "thinking": return "think";
    case "text":     return "chat";
    case "skill":    return "skill";
    case "tool":     return "tool";
    default:         return null; // wait, phase (result is synthetic, never a beat)
  }
}

export function edgeVisible(weight: number, maxWeight: number): boolean {
  return weight >= Math.max(1, Math.ceil(EDGE_MIN_FRAC * maxWeight));
}

export function buildPipeline(beats: Beat[]): PipelineGraph {
  // 1. expand beats -> step sequence, synthesizing `result` after completed tools
  const steps: PipeKind[] = [];
  let ok = 0;
  let err = 0;
  for (const b of beats) {
    const k = kindOf(b.kind);
    if (!k) continue;
    steps.push(k);
    if (b.kind === "tool" && b.ok !== undefined) {
      steps.push("result");
      if (b.ok) ok += 1; else err += 1;
    }
  }

  // 2. node counts over ALL steps
  const counts = new Map<PipeKind, number>();
  for (const s of steps) counts.set(s, (counts.get(s) ?? 0) + 1);

  const nodes: PipeNode[] = [];
  for (const k of ORDER) {
    const count = counts.get(k) ?? 0;
    if (count === 0) continue;
    const slot = SLOT[k];
    const node: PipeNode = { kind: k, count, col: slot.col, row: slot.row };
    if (k === "result") { node.ok = ok; node.err = err; }
    nodes.push(node);
  }

  // 3. edges over the COALESCED sequence (drop consecutive dupes -> no self-loops)
  const coalesced: PipeKind[] = [];
  for (const s of steps) if (coalesced[coalesced.length - 1] !== s) coalesced.push(s);

  const edgeMap = new Map<string, PipeEdge>();
  for (let i = 0; i + 1 < coalesced.length; i++) {
    const from = coalesced[i]!;
    const to = coalesced[i + 1]!;
    const key = `${from}>${to}`;
    const e = edgeMap.get(key);
    if (e) e.weight += 1;
    else edgeMap.set(key, { from, to, weight: 1, back: SLOT[to].col <= SLOT[from].col });
  }
  const edges = [...edgeMap.values()];

  const maxCount = nodes.reduce((m, n) => Math.max(m, n.count), 0);
  const maxWeight = edges.reduce((m, e) => Math.max(m, e.weight), 0);
  return { nodes, edges, maxCount, maxWeight };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/pipeline.test.ts`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline.ts tests/pipeline.test.ts
git commit -m "feat(lens): pure pipeline aggregator — beats to weighted stage graph"
```

---

## Task 2: Lens panel render + wiring + default flip

**Files:**
- Modify: `src/core/types.ts:118`
- Modify: `tests/chrome.test.ts:10`
- Modify: `src/ui/panels/Lens.tsx` (full replace)
- Modify: `src/ui/Showcase.tsx:64`

- [ ] **Step 1: Flip the default panel**

In `src/core/types.ts`, change line 118 from:

```ts
export const DEFAULT_PANEL: PanelId = "log";
```
to:
```ts
export const DEFAULT_PANEL: PanelId = "lens";
```

- [ ] **Step 2: Update the chrome test expectation**

In `tests/chrome.test.ts` line 10, change:

```ts
  expect(DEFAULT_PANEL).toBe("log");
```
to:
```ts
  expect(DEFAULT_PANEL).toBe("lens");
```

- [ ] **Step 3: Replace the Lens placeholder with the real panel**

Replace the entire contents of `src/ui/panels/Lens.tsx` with:

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { buildPipeline, edgeVisible, type PipeKind, type PipeNode } from "../../core/pipeline";
import type { Beat, BeatKind, SessionState } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulseIntensity, lerpHex } from "../anim";

interface Props {
  full: SessionState | null;   // whole-session fold (aggregate source)
  presented: Beat[];           // paced beats (for the cursor flare)
  cursor: number;
  pulse: boolean;
  width: number;
  height: number;
}

const LEFT = 2;
const TOP = 1;
const COL_GAP = 14; // cells between stage columns (fits "◍ result" + arrow + stat)
const ROW_GAP = 4;  // vertical block per stage row (row0 spine vs row1 skill)
const TAIL = 4;     // energy tail length
const BARS = "▁▂▃▄▅▆▇█";

const PIPE_OF: Partial<Record<BeatKind, PipeKind>> = {
  thinking: "think", text: "chat", skill: "skill", tool: "tool",
};

function xOf(col: number) { return LEFT + col * COL_GAP; }
function laneOf(col: number) { return theme.laneColors[col % theme.laneColors.length]!; }
function frac(n: number, max: number) { return max > 0 ? n / max : 0; }

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, TRANSPARENT);
}
function barChar(f: number) {
  return BARS[Math.max(0, Math.min(BARS.length - 1, Math.round(f * (BARS.length - 1))))]!;
}

type Cell = { x: number; y: number; ch: string };

// one energy dot riding a run of cells; dir +1 = toward end, -1 = toward start
function energyRun(
  buf: OptimizedBuffer, cells: Cell[], weight: number, maxWeight: number,
  laneHex: string, animating: boolean, now: number, restBoost: number, dir: 1 | -1,
) {
  const n = cells.length;
  if (n === 0) return;
  const wf = frac(weight, maxWeight);
  const rest = Math.min(1, 0.22 + 0.35 * wf + restBoost);
  const span = n + TAIL;
  const head = animating ? (now * (0.5 + 1.6 * wf)) % span : -999;
  for (let i = 0; i < n; i++) {
    const c = cells[i]!;
    const pos = dir === 1 ? i : n - 1 - i;
    let intensity = rest;
    if (animating) {
      const d = (((head - pos) % span) + span) % span;
      intensity = Math.max(rest, pulseIntensity(d, TAIL));
    }
    buf.setCell(c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, intensity)), TRANSPARENT);
  }
}

export function Lens({ full, presented, cursor, pulse, width, height }: Props) {
  const graph = buildPipeline(full?.beats ?? []);
  if (graph.nodes.length === 0) return <text fg={theme.dim}>no activity yet</text>;

  const byKind = new Map<PipeKind, PipeNode>(graph.nodes.map((n) => [n.kind, n]));
  const colOf = (k: PipeKind) => byKind.get(k)?.col ?? 0;
  const nameAt = (col: number) =>
    graph.nodes.find((n) => n.row === 0 && n.col === col)?.kind ?? "";

  const drawn = graph.edges.filter(
    (e) => edgeVisible(e.weight, graph.maxWeight) && byKind.has(e.from) && byKind.has(e.to),
  );
  const liveKind = PIPE_OF[(presented[cursor]?.kind ?? "") as BeatKind] ?? null;
  const flareEdge =
    liveKind != null
      ? drawn.filter((e) => e.to === liveKind).sort((a, b) => b.weight - a.weight)[0]
      : undefined;

  const spineCols = graph.nodes.filter((n) => n.row === 0).map((n) => n.col).sort((a, b) => a - b);
  const animating = pulse;

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animating}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = (globalThis.performance?.now?.() ?? 0) / 120;

        // forward spine: one dot per gap between adjacent present row-0 columns
        for (let i = 0; i + 1 < spineCols.length; i++) {
          const c0 = spineCols[i]!;
          const c1 = spineCols[i + 1]!;
          const fwd = drawn.filter(
            (e) => !e.back &&
              Math.min(colOf(e.from), colOf(e.to)) <= c0 &&
              Math.max(colOf(e.from), colOf(e.to)) >= c1,
          );
          if (fwd.length === 0) continue;
          const weight = fwd.reduce((m, e) => Math.max(m, e.weight), 0);
          const start = xOf(c0) + 2 + nameAt(c0).length + 1;
          const end = xOf(c1) - 1;
          if (end <= start) continue;
          const cells: Cell[] = [];
          for (let x = start; x < end; x++) cells.push({ x, y: TOP, ch: "─" });
          cells.push({ x: end, y: TOP, ch: "▶" });
          const boost = fwd.some((e) => e === flareEdge) ? 0.45 : 0;
          energyRun(buffer, cells, weight, graph.maxWeight, laneOf(c0), animating, now, boost, 1);
        }

        // back-edge arcs: top 2 by weight, stacked on rows below the row-0 stats
        const backs = drawn.filter((e) => e.back).sort((a, b) => b.weight - a.weight).slice(0, 2);
        backs.forEach((e, idx) => {
          const xa = xOf(Math.min(colOf(e.from), colOf(e.to)));
          const xb = xOf(Math.max(colOf(e.from), colOf(e.to)));
          const yArc = TOP + 2 + idx;
          if (yArc >= height || xb <= xa) return;
          const cells: Cell[] = [{ x: xb, y: yArc, ch: "╯" }];
          for (let x = xb - 1; x > xa; x--) cells.push({ x, y: yArc, ch: "─" });
          cells.push({ x: xa, y: yArc, ch: "◂" });
          const boost = e === flareEdge ? 0.45 : 0;
          energyRun(buffer, cells, e.weight, graph.maxWeight, laneOf(colOf(e.to)), animating, now, boost, -1);
        });

        // skill branch: vertical feeder from the row-1 skill node up into the spine
        const skill = byKind.get("skill");
        if (skill) {
          const x = xOf(skill.col);
          const yMid = TOP + ROW_GAP;
          const cells: Cell[] = [];
          for (let y = yMid - 1; y > TOP; y--) cells.push({ x, y, ch: "│" });
          cells.push({ x, y: TOP, ch: "┴" });
          const w = drawn
            .filter((e) => e.from === "skill" || e.to === "skill")
            .reduce((m, e) => Math.max(m, e.weight), 0);
          energyRun(buffer, cells, w, graph.maxWeight, laneOf(skill.col), animating, now, 0, -1);
        }

        // nodes + labels + stats
        for (const n of graph.nodes) {
          const x = xOf(n.col);
          const yGlyph = TOP + n.row * ROW_GAP;
          const yStat = yGlyph + 1;
          if (x >= width || yGlyph >= height) continue;
          const focused = n.kind === liveKind;
          const glyph = focused ? "◉" : n.count > 1 ? "◍" : "○";
          buffer.setCell(x, yGlyph, glyph, RGBA.fromHex(laneOf(n.col)), TRANSPARENT);
          drawStr(buffer, x + 2, yGlyph, n.kind, RGBA.fromHex(focused ? theme.accent : theme.fg));

          let cx = x + 2;
          const cnt = `×${n.count} `;
          drawStr(buffer, cx, yStat, cnt, RGBA.fromHex(theme.dim));
          cx += cnt.length;
          buffer.setCell(cx, yStat, barChar(frac(n.count, graph.maxCount)), RGBA.fromHex(laneOf(n.col)), TRANSPARENT);
          cx += 2;
          if (n.kind === "result") {
            if ((n.ok ?? 0) > 0) { const s = `✓${n.ok} `; drawStr(buffer, cx, yStat, s, RGBA.fromHex(theme.ok)); cx += s.length; }
            if ((n.err ?? 0) > 0) { const s = `✗${n.err}`; drawStr(buffer, cx, yStat, s, RGBA.fromHex(theme.err)); }
          }
        }
      }}
    />
  );
}
```

- [ ] **Step 4: Wire the props in Showcase**

In `src/ui/Showcase.tsx`, replace line 64:

```tsx
        {panel === "lens" && <Lens />}
```
with:
```tsx
        {panel === "lens" && <Lens full={agg} presented={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
```

(`agg`, `presented`, `cursor`, `pulse`, `width`, `bodyHeight` are all already in scope in this component.)

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `bun test`
Expected: PASS — including the updated `chrome.test.ts` and the new `pipeline.test.ts`.

- [ ] **Step 7: Visual verification via tmux**

The agent has no TTY — drive the TUI through tmux (per CLAUDE.md):

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
```

Expected: the app opens on the **Lens** tab by default; a frozen left→right pipeline of stage nodes (`◍`/`○` + name) with `×count` + bar on the row below; the `result` node shows `✓/✗`. Confirm the energy + flare animate (capture two frames with `-e` and diff):

```bash
tmux capture-pane -t cl -ep > /tmp/f1.txt; sleep 1; tmux capture-pane -t cl -ep > /tmp/f2.txt; diff /tmp/f1.txt /tmp/f2.txt | head
```

Expected: the diff is non-empty (energy dots moving). Press `p` to confirm the pulse toggle stills the wires:

```bash
tmux send-keys -t cl p; sleep 1; tmux capture-pane -t cl -p | head; tmux kill-session -t cl
```

If a session has no activity, the panel shows `no activity yet` — pick a session with beats via `:` to verify the graph.

- [ ] **Step 8: Commit**

```bash
git add src/core/types.ts tests/chrome.test.ts src/ui/panels/Lens.tsx src/ui/Showcase.tsx
git commit -m "feat(lens): CI/CD pipeline hawk-eye panel, default tab (#4)"
```

---

## Self-Review

**Spec coverage:**
- 5 BeatKind stages + mapping table → Task 1 `kindOf` + tests (Step 1/3).
- Synthetic `result` from tool `ok`/`err` → Task 1 expand loop + tests.
- Data-driven coalesced weighted edges, no self-loops → Task 1 + tests.
- Back-edge classification → Task 1 `back` + test.
- Threshold (`EDGE_MIN_FRAC`, `edgeVisible`) → Task 1 + test.
- Fixed lifecycle slots, frozen layout → `SLOT` + `xOf`/`ROW_GAP` in render.
- Flowing energy ∝ weight, cursor flare → `energyRun` + `flareEdge` in Task 2.
- `result` ✓/✗ badge, counts + proportional bar → render stat row.
- Pulse toggle honored (`live={animating}`, static when off) → Task 2.
- Empty state → `no activity yet`.
- Showcase wiring + `DEFAULT_PANEL` flip + chrome test → Task 2 Steps 1/2/4.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `buildPipeline`/`edgeVisible`/`EDGE_MIN_FRAC`/`PipeKind`/`PipeNode` names match between `pipeline.ts`, the test, and `Lens.tsx`. `Beat.iconKey`/`Beat.kind`/`Beat.ok` match `types.ts`. `Lens` Props match the Showcase call site (`full/presented/cursor/pulse/width/height`).
