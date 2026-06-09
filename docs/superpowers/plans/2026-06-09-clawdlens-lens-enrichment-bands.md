# Lens enrichment: stacked context bands — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Lens panel's empty space with four cursor-synced context bands — phase ribbon, skill/agent timeline, activity heartbeat, token-economy line — all derived from the revealed beat window (no new I/O).

**Architecture:** Pure data derivation in `src/core/` (TDD), shared buffer primitives + one focused renderer per band in `src/ui/panels/lens/`, composed by `Lens.tsx` into vertical zones (ribbon at top, pipeline in the middle, bands stacked above the NOW HUD). Bands self-hide on empty data and drop in priority order when height is tight.

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · React 19 · `@opentui/react`/`@opentui/core` · `bun:test`. Pure modules TDD'd; bands verified visually in tmux.

**Spec:** `docs/superpowers/specs/2026-06-09-clawdlens-lens-enrichment-bands-design.md`

**Commands:** `bun test` · `bunx tsc --noEmit` · tmux capture (CLAUDE.md visual-testing). The currently-running session (this repo) is a **superpowers** session (has phases + skills); a past `slides-*` session is **non-superpowers** (skills, no phases) — use both for visual checks.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/core/lens.ts` | (modify) extract `detectLensFromBeats(beats)` from `detectLens(s)` |
| `src/core/lens-bands.ts` | (new, pure) `Span`/`TimeRange`/`LensTimeline`/`HeartBucket`/`EconomyView` types; `tsToX`, `lensTimeline`, `heartbeatBuckets`, `economyView` |
| `src/ui/panels/lens/draw.ts` | (new) shared buffer primitives extracted from `Lens.tsx`: `put`, `drawStr`, `clip`, `laneHexOf`, `STAGE_COL` |
| `src/ui/panels/lens/phaseRibbon.ts` | (new) `drawPhaseRibbon(...)` |
| `src/ui/panels/lens/economy.ts` | (new) `drawEconomy(...)` |
| `src/ui/panels/lens/heartbeat.ts` | (new) `drawHeartbeat(...)` |
| `src/ui/panels/lens/skillTimeline.ts` | (new) `drawSkillTimeline(...)` |
| `src/ui/panels/Lens.tsx` | (modify) zone layout; import shared primitives; compose the four bands; pipeline no longer force-centered |
| `src/ui/Showcase.tsx` | (modify) pass `tokens={agg.tokens}` to `<Lens>` |
| `tests/lens.test.ts` · `tests/lens-bands.test.ts` | unit tests |

Tasks 1–4 are pure/TDD (each commit green). Task 5 is a no-behavior refactor. Tasks 6–9 add one band each (zone reservation + renderer + wiring + visual). Task 10 is drop-order + final verification.

---

## Task 1: `detectLensFromBeats` refactor

**Files:**
- Modify: `src/core/lens.ts`
- Test: `tests/lens.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/lens.test.ts` (create the file if absent, with the imports shown):

```ts
import { test, expect } from "bun:test";
import { detectLens, detectLensFromBeats } from "../src/core/lens";
import { newSession } from "../src/core/reducer";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: p.ts ?? 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p };
}

test("detectLensFromBeats matches detectLens over the same beats", () => {
  const beats = [
    beat({ kind: "skill", skill: "brainstorming", label: "brainstorming", ts: 1 }),
    beat({ kind: "tool", label: "Write", detail: "x-design.md", ts: 2 }),
    beat({ kind: "skill", skill: "writing-plans", label: "writing-plans", ts: 3 }),
  ];
  const s = { ...newSession("x", "x"), beats };
  expect(detectLensFromBeats(beats)).toEqual(detectLens(s));
});

test("detectLensFromBeats over a partial slice reflects only those beats", () => {
  const beats = [
    beat({ kind: "skill", skill: "brainstorming", label: "brainstorming", ts: 1 }),
    beat({ kind: "skill", skill: "writing-plans", label: "writing-plans", ts: 3 }),
  ];
  const partial = detectLensFromBeats(beats.slice(0, 1));
  expect(partial.skillGroups.map((g) => g.skill)).toEqual(["brainstorming"]);
  expect(partial.activePhase).toBe("Brainstorm");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/lens.test.ts`
Expected: FAIL — `detectLensFromBeats` is not exported.

- [ ] **Step 3: Implement the extraction**

In `src/core/lens.ts`, replace the `detectLens` function with a beats-based core + a thin wrapper:

```ts
export function detectLensFromBeats(beats: Beat[]): LensState {
  const history: { phase: string; ts: number }[] = [];
  const groups: { skill: string; beatIds: string[]; ts: number }[] = [];
  let active: string | null = null;
  let sawSuperpowers = false;
  let curGroup: { skill: string; beatIds: string[]; ts: number } | null = null;

  for (const b of beats) {
    const skill = b.skill ?? (b.kind === "skill" ? b.label : undefined);
    if (skill) {
      if (SUPERPOWERS_SIGNAL.test(skill)) sawSuperpowers = true;
      if (!curGroup || curGroup.skill !== skill) { curGroup = { skill, beatIds: [], ts: b.ts }; groups.push(curGroup); }
      curGroup.beatIds.push(b.id);
    }
    const phase = phaseForBeat(b);
    if (phase) {
      if (phase === "Spec" || phase === "Plan") sawSuperpowers = true;
      if (phase !== active) { active = phase; history.push({ phase, ts: b.ts }); }
    }
  }
  return {
    lensId: sawSuperpowers ? "superpowers" : null,
    activePhase: sawSuperpowers ? active : null,
    phaseHistory: sawSuperpowers ? history : [],
    skillGroups: groups,
  };
}

export function detectLens(s: SessionState): LensState {
  return detectLensFromBeats(s.beats);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/lens.test.ts && bunx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens.ts tests/lens.test.ts
git commit -m "refactor(lens): extract detectLensFromBeats for cursor-windowed band data"
```

---

## Task 2: `lens-bands.ts` — `tsToX` + `lensTimeline`

**Files:**
- Create: `src/core/lens-bands.ts`
- Test: `tests/lens-bands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lens-bands.test.ts`:

```ts
import { test, expect } from "bun:test";
import { tsToX, lensTimeline } from "../src/core/lens-bands";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: p.ts ?? 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p };
}

test("tsToX maps start->0, end->width-1, monotonic, safe when start===end", () => {
  const r = { startTs: 100, endTs: 200, cursorTs: 200 };
  expect(tsToX(100, r, 50)).toBe(0);
  expect(tsToX(200, r, 50)).toBe(49);
  expect(tsToX(150, r, 50)).toBeGreaterThan(tsToX(120, r, 50));
  const deg = { startTs: 5, endTs: 5, cursorTs: 5 };
  expect(tsToX(5, deg, 50)).toBe(0); // no divide-by-zero
});

test("lensTimeline: skill spans abut and the last span ends at cursorTs", () => {
  const beats = [
    beat({ id: "s1", kind: "skill", skill: "brainstorming", label: "brainstorming", ts: 10 }),
    beat({ id: "t1", kind: "tool", skill: "brainstorming", label: "Read", ts: 15 }),
    beat({ id: "s2", kind: "skill", skill: "writing-plans", label: "writing-plans", ts: 20 }),
    beat({ id: "t2", kind: "tool", skill: "writing-plans", label: "Read", ts: 40 }),
  ];
  const tl = lensTimeline(beats, 4);
  expect(tl.range.startTs).toBe(10);
  expect(tl.range.endTs).toBe(40);
  expect(tl.range.cursorTs).toBe(40);
  expect(tl.skills.map((s) => s.label)).toEqual(["brainstorming", "writing-plans"]);
  expect(tl.skills[0]!.endTs).toBe(20);            // abuts the next group's start
  expect(tl.skills[1]!.endTs).toBe(40);            // last group -> cursorTs
});

test("lensTimeline: an agent span runs from the Task beat across its lane's beats", () => {
  const beats = [
    beat({ id: "T1", kind: "tool", iconKey: "task", label: "Task · code-reviewer", toolUseId: "L1", ts: 5 }),
    beat({ id: "a1", kind: "thinking", lane: "L1", ts: 7 }),
    beat({ id: "a2", kind: "tool", lane: "L1", label: "Grep", ts: 9 }),
    beat({ id: "m1", kind: "tool", label: "Bash", milestone: "commit", ts: 12 }),
  ];
  const tl = lensTimeline(beats, 4);
  expect(tl.agents.length).toBe(1);
  expect(tl.agents[0]!.label).toBe("code-reviewer");
  expect(tl.agents[0]!.startTs).toBe(5);
  expect(tl.agents[0]!.endTs).toBe(9);             // last beat on lane L1
  expect(tl.milestones).toEqual([{ ts: 12, kind: "commit" }]);
});

test("lensTimeline: cursorTs clamps to the revealed beat", () => {
  const beats = [beat({ ts: 10 }), beat({ ts: 20 }), beat({ ts: 30 })];
  expect(lensTimeline(beats, 2).range.cursorTs).toBe(20); // beats[cursor-1]
  expect(lensTimeline(beats, 0).range.cursorTs).toBe(10); // <=0 -> startTs
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/lens-bands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/core/lens-bands.ts`:

```ts
import type { Beat } from "./types";
import { detectLensFromBeats } from "./lens";

export interface Span { key: string; label: string; startTs: number; endTs: number }
export interface TimeRange { startTs: number; endTs: number; cursorTs: number }
export interface LensTimeline {
  range: TimeRange;
  skills: Span[];
  agents: Span[];
  milestones: { ts: number; kind: "commit" | "branch" }[];
}

// map a timestamp to an x column within [0, width-1] over the range; safe when
// the range is degenerate (single beat / zero span).
export function tsToX(ts: number, range: TimeRange, width: number): number {
  const w = Math.max(1, width);
  const span = range.endTs - range.startTs;
  if (span <= 0) return 0;
  const f = (ts - range.startTs) / span;
  return Math.max(0, Math.min(w - 1, Math.floor(f * (w - 1))));
}

function rangeOf(beats: Beat[], cursor: number): TimeRange {
  const startTs = beats[0]?.ts ?? 0;
  const endTs = beats[beats.length - 1]?.ts ?? startTs;
  const idx = Math.min(Math.max(0, cursor), beats.length);
  const cursorTs = idx > 0 ? beats[idx - 1]!.ts : startTs;
  return { startTs, endTs, cursorTs };
}

// skill + agent spans + milestones over the WHOLE beat list; the renderer clips
// to range.cursorTs for the reveal.
export function lensTimeline(beats: Beat[], cursor: number): LensTimeline {
  const range = rangeOf(beats, cursor);

  const groups = detectLensFromBeats(beats).skillGroups;
  const skills: Span[] = groups.map((g, i) => ({
    key: `${g.skill}:${i}`,
    label: g.skill,
    startTs: g.ts,
    endTs: groups[i + 1]?.ts ?? range.cursorTs,
  }));

  const agentByLane = new Map<string, { label: string; startTs: number; endTs: number }>();
  for (const b of beats) {
    if (b.iconKey === "task" && b.toolUseId) {
      agentByLane.set(b.toolUseId, { label: b.label.replace(/^Task · /, ""), startTs: b.ts, endTs: b.ts });
    }
  }
  for (const b of beats) {
    const a = agentByLane.get(b.lane);
    if (a) a.endTs = Math.max(a.endTs, b.ts);
  }
  const agents: Span[] = [...agentByLane.entries()].map(([key, a]) => ({ key, label: a.label, startTs: a.startTs, endTs: a.endTs }));

  const milestones = beats.filter((b) => b.milestone).map((b) => ({ ts: b.ts, kind: b.milestone! }));

  return { range, skills, agents, milestones };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/lens-bands.test.ts && bunx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens-bands.ts tests/lens-bands.test.ts
git commit -m "feat(lens): lens-bands tsToX + lensTimeline (skill/agent spans, milestones)"
```

---

## Task 3: `heartbeatBuckets`

**Files:**
- Modify: `src/core/lens-bands.ts`
- Test: `tests/lens-bands.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lens-bands.test.ts` (add `heartbeatBuckets` to the import from `../src/core/lens-bands`):

```ts
test("heartbeatBuckets: width buckets, only beats with index < cursor counted", () => {
  const beats = [
    beat({ kind: "thinking", ts: 0 }),
    beat({ kind: "tool", ts: 50 }),
    beat({ kind: "tool", ts: 100 }),
  ];
  const full = heartbeatBuckets(beats, 3, 10);
  expect(full.length).toBe(10);
  expect(full.reduce((n, b) => n + b.count, 0)).toBe(3);
  const partial = heartbeatBuckets(beats, 1, 10);
  expect(partial.reduce((n, b) => n + b.count, 0)).toBe(1); // only beats[0]
});

test("heartbeatBuckets: dominant kind per bucket; safe when start===end", () => {
  const beats = [beat({ kind: "tool", ts: 5 }), beat({ kind: "tool", ts: 5 }), beat({ kind: "skill", ts: 5 })];
  const b = heartbeatBuckets(beats, 3, 4);
  const filled = b.find((x) => x.count > 0)!;
  expect(filled.kind).toBe("tool"); // 2 tool vs 1 skill
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/lens-bands.test.ts`
Expected: FAIL — `heartbeatBuckets` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/lens-bands.ts`:

```ts
export interface HeartBucket { count: number; kind: string }

// beats-per-time-window across the full [start..end] axis; only beats with
// index < cursor are counted (so the band fills left->right on reveal). Each
// bucket reports its dominant beat kind for coloring.
export function heartbeatBuckets(beats: Beat[], cursor: number, width: number): HeartBucket[] {
  const w = Math.max(1, width);
  const buckets: HeartBucket[] = Array.from({ length: w }, () => ({ count: 0, kind: "" }));
  if (beats.length === 0) return buckets;
  const startTs = beats[0]!.ts;
  const endTs = beats[beats.length - 1]!.ts;
  const span = Math.max(1, endTs - startTs);
  const kindCounts: Record<string, number>[] = buckets.map(() => ({}));
  const n = Math.min(Math.max(0, cursor), beats.length);
  for (let i = 0; i < n; i++) {
    const b = beats[i]!;
    const idx = Math.min(w - 1, Math.floor(((b.ts - startTs) / span) * w));
    buckets[idx]!.count += 1;
    kindCounts[idx]![b.kind] = (kindCounts[idx]![b.kind] ?? 0) + 1;
  }
  for (let i = 0; i < w; i++) {
    let best = "", bestN = 0;
    for (const [k, c] of Object.entries(kindCounts[i]!)) if (c > bestN) { bestN = c; best = k; }
    buckets[i]!.kind = best;
  }
  return buckets;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/lens-bands.test.ts && bunx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens-bands.ts tests/lens-bands.test.ts
git commit -m "feat(lens): heartbeatBuckets — beats-per-window with dominant kind"
```

---

## Task 4: `economyView`

**Files:**
- Modify: `src/core/lens-bands.ts`
- Test: `tests/lens-bands.test.ts`

Note: per the spec's de-dup, the economy band omits cost (the header already counts it up); it shows in/out/cache%/web.

- [ ] **Step 1: Write the failing tests**

Append to `tests/lens-bands.test.ts` (add `economyView` to the import):

```ts
import { newSessionTokens } from "../src/core/types";

test("economyView: humanized in/out, cache% = cacheRead/(cacheRead+cacheCreate+input), web", () => {
  const t = { ...newSessionTokens(), input: 12000, output: 3000, cacheRead: 90000, cacheCreate: 6000, webCalls: 2 };
  const v = economyView(t);
  expect(v.inTok).toBe("12k");
  expect(v.outTok).toBe("3k");
  expect(v.cachePct).toBe(Math.round((90000 / (90000 + 6000 + 12000)) * 100)); // 83
  expect(v.web).toBe(2);
});

test("economyView: zero tokens -> sane zeros", () => {
  const v = economyView(newSessionTokens());
  expect(v).toEqual({ inTok: "0", outTok: "0", cachePct: 0, web: 0 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/lens-bands.test.ts`
Expected: FAIL — `economyView` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/lens-bands.ts` (add `SessionTokens` to the type import at the top: `import type { Beat, SessionTokens } from "./types";`):

```ts
export interface EconomyView { inTok: string; outTok: string; cachePct: number; web: number }

function kfmt(n: number): string { return n >= 1000 ? Math.round(n / 1000) + "k" : String(n); }

export function economyView(t: SessionTokens): EconomyView {
  const denom = t.cacheRead + t.cacheCreate + t.input;
  return {
    inTok: kfmt(t.input),
    outTok: kfmt(t.output),
    cachePct: denom > 0 ? Math.round((t.cacheRead / denom) * 100) : 0,
    web: t.webCalls,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test tests/lens-bands.test.ts && bunx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens-bands.ts tests/lens-bands.test.ts
git commit -m "feat(lens): economyView — token breakdown (in/out/cache%/web)"
```

---

## Task 5: extract shared buffer primitives to `lens/draw.ts`

**Files:**
- Create: `src/ui/panels/lens/draw.ts`
- Modify: `src/ui/panels/Lens.tsx`

No-behavior refactor: move the shared primitives out so the band renderers can reuse them. Verified by tsc + suite + an unchanged visual.

- [ ] **Step 1: Create `src/ui/panels/lens/draw.ts`**

```ts
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { theme, TRANSPARENT } from "../../theme";
import type { IconKey } from "../../../core/types";

export interface Rect { x: number; y: number; w: number; h: number }

// lane color per pipeline stage / arbitrary key (skills hash to a stable hue)
export const STAGE_COL: Record<string, number> = { think: 0, tool: 1, skill: 4, result: 2, chat: 3 };
export function laneHexOf(kind: string): string {
  const col = STAGE_COL[kind] ?? (kind.charCodeAt(0) % theme.laneColors.length);
  return theme.laneColors[col % theme.laneColors.length]!;
}

export function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s;
}

export function put(buf: OptimizedBuffer, x: number, y: number, ch: string, fg: RGBA, w: number, h: number) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  buf.setCell(x, y, ch, fg, TRANSPARENT);
}

export function drawStr(buf: OptimizedBuffer, x: number, y: number, s: string, fg: RGBA, w: number, h: number) {
  for (let i = 0; i < s.length; i++) put(buf, x + i, y, s[i]!, fg, w, h);
}

export type { IconKey };
```

- [ ] **Step 2: Point `Lens.tsx` at the shared module**

In `src/ui/panels/Lens.tsx`: delete the local `STAGE_COL`, `laneHexOf`, `clip`, `put`, `drawStr` definitions, and the local `type Rect`/`Cell` aliases that duplicate them. Keep `Cell` from `pipeline-geometry`. Add the import:

```ts
import { put, drawStr, clip, laneHexOf, STAGE_COL } from "./lens/draw";
```

Leave `drawCard`, `drawBurst`, `drawHud`, `drawSubLane`, `wireFor` in `Lens.tsx` (they stay local). They already call `put`/`drawStr`/`clip`/`laneHexOf`, which now resolve to the import.

- [ ] **Step 3: Typecheck + suite**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc clean; all tests pass (no test references the moved symbols).

- [ ] **Step 4: Visual unchanged**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 6
tmux capture-pane -t cl -p | sed -n '5,24p'; tmux kill-session -t cl 2>/dev/null
```
Expected: the Lens renders exactly as before (pipeline, rail, HUD) — the refactor changed nothing visible.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/lens/draw.ts src/ui/panels/Lens.tsx
git commit -m "refactor(lens): extract shared buffer primitives to lens/draw.ts"
```

---

## Task 6: zone scaffold + Phase ribbon

**Files:**
- Create: `src/ui/panels/lens/phaseRibbon.ts`
- Modify: `src/ui/panels/Lens.tsx`

Introduces the top zone and bottom-band-budget scaffold, and renders the first band.

- [ ] **Step 1: Create `src/ui/panels/lens/phaseRibbon.ts`**

```ts
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { LensState } from "../../../core/types";
import { SUPERPOWERS_PHASES } from "../../../core/lens";
import { theme } from "../../theme";
import { breathe, lerpHex } from "../../anim";
import { put, drawStr } from "./draw";

// horizontal stepper of superpowers phases at row `y`. Hidden by the caller when
// lens.lensId !== "superpowers".
export function drawPhaseRibbon(buf: OptimizedBuffer, x: number, y: number, lens: LensState, animating: boolean, now: number, w: number, h: number) {
  const done = new Set(lens.phaseHistory.map((p) => p.phase));
  let cx = x;
  SUPERPOWERS_PHASES.forEach((phase, i) => {
    const isActive = phase === lens.activePhase;
    const isDone = done.has(phase) && !isActive;
    const glyph = isActive ? "●" : isDone ? "✓" : "○";
    const col = isActive
      ? (animating ? lerpHex(theme.accent, theme.pulseHot, breathe(now)) : theme.accent)
      : isDone ? theme.ok : theme.dim;
    put(buf, cx, y, glyph, RGBA.fromHex(col), w, h); cx += 2;
    drawStr(buf, cx, y, phase, RGBA.fromHex(isActive ? theme.fg : theme.dim), w, h); cx += phase.length + 1;
    if (i < SUPERPOWERS_PHASES.length - 1) { put(buf, cx, y, "─", RGBA.fromHex(theme.wireDim), w, h); cx += 2; }
  });
}
```

- [ ] **Step 2: Wire the ribbon + zone scaffold into `Lens.tsx`**

Add imports:

```ts
import { detectLensFromBeats } from "../../core/lens";
import { drawPhaseRibbon } from "./lens/phaseRibbon";
```

In the component body (near the top, after `const flow = deriveFlow(...)`):

```ts
  const lensState = detectLensFromBeats(presented.slice(0, cursor));
  const ribbonOn = lensState.lensId === "superpowers";
  const RIBBON_ROWS = ribbonOn ? 2 : 0; // ribbon row + 1 spacer
```

Find the vertical-centering block. Change it so the pipeline region starts below the ribbon and reserves the bottom-band rows (initially just the existing sublanes). Replace the `blockTop`/`top` computation:

```ts
  // zones: ribbon at the very top; the pipeline centered in the region between the
  // ribbon and the bottom band stack; HUD anchored at the bottom.
  const bottomBandRows = 0; // grows as bands are added (Tasks 7-9)
  const regionTop = TOP + RIBBON_ROWS;
  const regionBottom = hudTop - sublaneRows - bottomBandRows;
  const blockTop = Math.max(regionTop, regionTop + Math.floor((regionBottom - regionTop - blockH) / 2));
  const top = blockTop + RAIL_ROWS;
  const railY = blockTop;
```

(`hudTop`, `sublaneRows`, `blockH`, `RAIL_ROWS` keep their existing definitions above this; only `blockTop`/`top`/`railY` change, plus the new `regionTop`/`regionBottom`/`bottomBandRows`.)

At the very start of the `renderAfter` callback, after `buffer.clear(TRANSPARENT)`, draw the ribbon:

```ts
        if (ribbonOn) drawPhaseRibbon(buffer, LEFT, TOP, lensState, animating, now, width, height);
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Visual — superpowers session shows the ribbon advancing**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 40 "bun run dev"; sleep 6
tmux capture-pane -t cl -p | sed -n '5,9p'; tmux kill-session -t cl 2>/dev/null
```
Expected: a top row like `◇/✓ Brainstorm ─ ● Plan ─ ○ …`; the active phase lit; the pipeline sits a couple rows lower than before. (This running session is a superpowers session, so the ribbon shows.) On a non-superpowers `slides-*` session the ribbon row is blank.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/lens/phaseRibbon.ts src/ui/panels/Lens.tsx
git commit -m "feat(lens): phase ribbon band + zone scaffold"
```

---

## Task 7: Economy band + `tokens` prop

**Files:**
- Create: `src/ui/panels/lens/economy.ts`
- Modify: `src/ui/panels/Lens.tsx`, `src/ui/Showcase.tsx`

- [ ] **Step 1: Create `src/ui/panels/lens/economy.ts`**

```ts
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { SessionTokens } from "../../../core/types";
import { economyView } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { drawStr } from "./draw";

export function drawEconomy(buf: OptimizedBuffer, x: number, y: number, tokens: SessionTokens, w: number, h: number) {
  const e = economyView(tokens);
  const line = `↑ in ${e.inTok}   ↓ out ${e.outTok}   ⟳ cache ${e.cachePct}%   ◉ web ${e.web}`;
  drawStr(buf, x, y, line, RGBA.fromHex(theme.dim), w, h);
}
```

- [ ] **Step 2: Pass `tokens` from Showcase**

In `src/ui/Showcase.tsx`, the `lens` line — add `tokens={agg.tokens}`:

```tsx
{panel === "lens" && <Lens presented={presented} cursor={cursor} total={playerTotal} animate={animate} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} status={session.status} infoOn={infoOn} tokens={agg.tokens} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 3: Wire the economy band into `Lens.tsx`**

Add the prop to the `Props` interface and the destructure:

```ts
  tokens: import("../../core/types").SessionTokens;
```
```ts
export function Lens({ presented, cursor, total, animate, lastAdvanceMs, intervalMs, status, infoOn, tokens, width, height }: Props) {
```

Add import:

```ts
import { drawEconomy } from "./lens/economy";
```

Reserve one row for it and place it directly above the HUD. Change `bottomBandRows`:

```ts
  const ECONOMY_ROWS = 1;
  const bottomBandRows = ECONOMY_ROWS; // grows further in Tasks 8-9
```

In `renderAfter`, after the sublanes block and before `drawHud(...)`, draw the economy line on the row just above the HUD band:

```ts
        drawEconomy(buffer, LEFT, hudTop - ECONOMY_ROWS, tokens, width, height);
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Visual**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 40 "bun run dev"; sleep 6
tmux capture-pane -t cl -p | sed -n '30,38p'; tmux kill-session -t cl 2>/dev/null
```
Expected: a line just above the NOW band like `↑ in 30k   ↓ out 5k   ⟳ cache 94%   ◉ web 2`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/panels/lens/economy.ts src/ui/panels/Lens.tsx src/ui/Showcase.tsx
git commit -m "feat(lens): economy band (token breakdown) + tokens prop"
```

---

## Task 8: Activity heartbeat band

**Files:**
- Create: `src/ui/panels/lens/heartbeat.ts`
- Modify: `src/ui/panels/Lens.tsx`

- [ ] **Step 1: Create `src/ui/panels/lens/heartbeat.ts`**

```ts
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { Beat } from "../../../core/types";
import { heartbeatBuckets } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { laneHexOf, put, drawStr } from "./draw";

const SPARK = "▁▂▃▄▅▆▇█";
// BeatKind -> a pipeline lane key for coloring
const KIND_KEY: Record<string, string> = { thinking: "think", text: "chat", tool: "tool", skill: "skill", result: "result" };

export function drawHeartbeat(buf: OptimizedBuffer, x: number, y: number, w: number, beats: Beat[], cursor: number, h: number) {
  const label = "beats ";
  const barW = Math.max(1, w - label.length);
  drawStr(buf, x, y, label, RGBA.fromHex(theme.dim), w, h);
  const buckets = heartbeatBuckets(beats, cursor, barW);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  buckets.forEach((b, i) => {
    if (b.count === 0) { put(buf, x + label.length + i, y, "·", RGBA.fromHex(theme.wireDim), w, h); return; }
    const lvl = Math.min(SPARK.length - 1, Math.floor((b.count / max) * (SPARK.length - 1)));
    const hex = laneHexOf(KIND_KEY[b.kind] ?? b.kind);
    put(buf, x + label.length + i, y, SPARK[lvl]!, RGBA.fromHex(hex), w, h);
  });
}
```

- [ ] **Step 2: Wire into `Lens.tsx`**

Add import:

```ts
import { drawHeartbeat } from "./lens/heartbeat";
```

Grow the bottom budget and render the heartbeat one row above the economy line:

```ts
  const HEARTBEAT_ROWS = 1;
  const bottomBandRows = ECONOMY_ROWS + HEARTBEAT_ROWS; // grows further in Task 9
```

In `renderAfter`, before the economy draw:

```ts
        drawHeartbeat(buffer, LEFT, hudTop - ECONOMY_ROWS - HEARTBEAT_ROWS, width - LEFT - 2, presented, cursor, height);
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Visual — heartbeat fills left→right with the cursor**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 40 "bun run dev"; sleep 6
tmux capture-pane -t cl -p | sed -n '28,36p'; tmux kill-session -t cl 2>/dev/null
```
Expected: a `beats ▁▂▃▅▇█…` sparkline above the economy line; tinted by dominant kind; empty future buckets show faint `·`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/lens/heartbeat.ts src/ui/panels/Lens.tsx
git commit -m "feat(lens): activity heartbeat band"
```

---

## Task 9: Skill & agent timeline band

**Files:**
- Create: `src/ui/panels/lens/skillTimeline.ts`
- Modify: `src/ui/panels/Lens.tsx`

- [ ] **Step 1: Create `src/ui/panels/lens/skillTimeline.ts`**

```ts
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { Beat } from "../../../core/types";
import { lensTimeline, tsToX, type Span } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { laneHexOf, clip, put, drawStr } from "./draw";

const LABEL_W = 8; // left gutter for the lane label

function drawLane(buf: OptimizedBuffer, x: number, y: number, w: number, label: string, spans: Span[], range: ReturnType<typeof lensTimeline>["range"], colorKey: (s: Span) => string, h: number) {
  drawStr(buf, x, y, clip(label, LABEL_W - 1), RGBA.fromHex(theme.dim), w, h);
  const trackX = x + LABEL_W;
  const trackW = Math.max(1, w - LABEL_W - 1);
  for (const s of spans) {
    if (s.startTs > range.cursorTs) continue;                 // not revealed yet
    const x0 = trackX + tsToX(s.startTs, range, trackW);
    const x1 = trackX + tsToX(Math.min(s.endTs, range.cursorTs), range, trackW);
    const hex = RGBA.fromHex(laneHexOf(colorKey(s)));
    for (let cx = x0; cx <= Math.max(x0, x1); cx++) put(buf, cx, y, "▓", hex, w, h);
    drawStr(buf, x0 + 1, y, clip(s.label, Math.max(0, x1 - x0 - 1)), RGBA.fromHex(theme.fg), w, h);
  }
}

export function drawSkillTimeline(buf: OptimizedBuffer, x: number, y: number, w: number, beats: Beat[], cursor: number, h: number) {
  const tl = lensTimeline(beats, cursor);
  drawLane(buf, x, y, w, "skills", tl.skills, tl.range, (s) => s.label, h);
  drawLane(buf, x, y + 1, w, "agents", tl.agents, tl.range, () => "task", h);
  // axis row: playhead + milestone ticks
  const trackX = x + LABEL_W;
  const trackW = Math.max(1, w - LABEL_W - 1);
  const ay = y + 2;
  for (let cx = trackX; cx < trackX + trackW; cx++) put(buf, cx, ay, "─", RGBA.fromHex(theme.wireDim), w, h);
  for (const m of tl.milestones) {
    if (m.ts > tl.range.cursorTs) continue;
    put(buf, trackX + tsToX(m.ts, tl.range, trackW), ay, "◆", RGBA.fromHex(theme.warn), w, h);
  }
  put(buf, trackX + tsToX(tl.range.cursorTs, tl.range, trackW), ay, "▲", RGBA.fromHex(theme.accent), w, h);
}
```

- [ ] **Step 2: Wire into `Lens.tsx`**

Add import:

```ts
import { drawSkillTimeline } from "./lens/skillTimeline";
```

Grow the bottom budget (timeline = 2 lanes + axis = 3 rows) and render it above the heartbeat — but only when there is something to show:

```ts
  const hasTimeline = lensState.skillGroups.length > 0 || presented.slice(0, cursor).some((b) => b.iconKey === "task");
  const TIMELINE_ROWS = hasTimeline ? 3 : 0;
  const bottomBandRows = ECONOMY_ROWS + HEARTBEAT_ROWS + TIMELINE_ROWS;
```

In `renderAfter`, before the heartbeat draw:

```ts
        if (TIMELINE_ROWS > 0) drawSkillTimeline(buffer, LEFT, hudTop - ECONOMY_ROWS - HEARTBEAT_ROWS - TIMELINE_ROWS, width - LEFT - 2, presented, cursor, height);
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Visual — superpowers AND non-superpowers**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 44 "bun run dev"; sleep 6
tmux capture-pane -t cl -p | sed -n '20,34p'; tmux kill-session -t cl 2>/dev/null
```
Expected: a `skills │▓ <skill> ▓│ …` lane, an `agents │▓ <type> ▓│` lane, and an axis row with `▲` at the cursor + `◆` milestone ticks. On a `slides-*` session (no phases) the skills lane still shows the custom skills.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/lens/skillTimeline.ts src/ui/panels/Lens.tsx
git commit -m "feat(lens): skill & agent timeline band"
```

---

## Task 10: short-terminal drop-order + final verification

**Files:**
- Modify: `src/ui/panels/Lens.tsx`

- [ ] **Step 1: Add the drop-order guard**

The bottom bands must drop (economy → heartbeat → timeline) when the pipeline + HUD wouldn't otherwise fit. After computing `RIBBON_ROWS`, `ECONOMY_ROWS`, `HEARTBEAT_ROWS`, `TIMELINE_ROWS`, compute how many bottom bands actually fit. Replace the fixed band-row constants used in layout with fitted ones:

```ts
  // minimum rows the pipeline + HUD need; drop bottom bands until the rest fits.
  const MIN_PIPELINE = RAIL_ROWS + CARD_H + 2; // rail + cards + return channel
  const avail = hudTop - (TOP + RIBBON_ROWS) - sublaneRows;
  let econ = ECONOMY_ROWS, heart = HEARTBEAT_ROWS, time = TIMELINE_ROWS;
  while (avail - (econ + heart + time) < MIN_PIPELINE) {
    if (econ) econ = 0; else if (heart) heart = 0; else if (time) time = 0; else break;
  }
  const showEconomy = econ > 0, showHeartbeat = heart > 0, showTimeline = time > 0 && TIMELINE_ROWS > 0;
  const bottomBandRows = econ + heart + time;
```

Gate each band's render + row offset on its `show*` flag (the offsets stack from `hudTop` upward only for shown bands). Update the three `renderAfter` draws to use `showTimeline`/`showHeartbeat`/`showEconomy` and offsets computed from the shown set, e.g.:

```ts
        let by = hudTop;
        if (showEconomy) { by -= 1; drawEconomy(buffer, LEFT, by, tokens, width, height); }
        if (showHeartbeat) { by -= 1; drawHeartbeat(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
        if (showTimeline) { by -= 3; drawSkillTimeline(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
```

(Replace the per-task fixed-offset draws from Tasks 7–9 with this stacked-from-bottom block.)

- [ ] **Step 2: Typecheck + full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; all tests pass.

- [ ] **Step 3: Visual — tall, short, superpowers, non-superpowers**

```bash
# tall + wide (all bands)
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 170 -y 46 "bun run dev"; sleep 6
tmux capture-pane -t cl -p; tmux kill-session -t cl 2>/dev/null
# short (bands drop, pipeline + HUD survive)
tmux new-session -d -s cl -x 170 -y 22 "bun run dev"; sleep 6
tmux capture-pane -t cl -p; tmux kill-session -t cl 2>/dev/null
```
Expected: tall shows ribbon + pipeline + timeline + heartbeat + economy + HUD; short drops economy→heartbeat→timeline first, pipeline + HUD always present; no overlap; comet still animates (the pulse fix from `feat/lens-fullwidth-skill-expand`).

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): band drop-order for short terminals"
```

- [ ] **Step 5: Finish the branch**

Invoke `superpowers:finishing-a-development-branch`. This branch is stacked on `feat/lens-fullwidth-skill-expand` (PR #15); set the PR base to that branch (or merge #15 first, then base on main).

---

## Self-review notes

- **Spec coverage:** reveal-from-beats (Tasks 1–4 derive from `presented`/`cursor`); phase ribbon + hide-on-non-superpowers (Task 6); skill/agent timeline with playhead + milestones + custom skills (Tasks 2, 9); heartbeat time-bucketed + reveal-clipped (Tasks 3, 8); economy breakdown from full-session tokens (Tasks 4, 7); render split into `lens/` modules (Task 5); drop-order (Task 10). All spec sections map to a task.
- **Type consistency:** `Span{key,label,startTs,endTs}`, `TimeRange{startTs,endTs,cursorTs}`, `LensTimeline{range,skills,agents,milestones}`, `HeartBucket{count,kind}`, `EconomyView{inTok,outTok,cachePct,web}`, `detectLensFromBeats(beats)`, `tsToX(ts,range,width)`, `lensTimeline(beats,cursor)`, `heartbeatBuckets(beats,cursor,width)`, `economyView(tokens)` — used identically across tasks and renderers.
- **Deviation from spec:** economy band omits `$cost` (the header already counts cost up; avoids duplication) — only in/out/cache%/web. Noted in Task 4.
- **No placeholders:** every code step is complete; tmux commands concrete. The Task 10 offset block supersedes the interim fixed offsets in Tasks 7–9 (an explicit, intended replacement, not a placeholder).
