# Dynamic Lens (n8n-style pipeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Lens from a static aggregate board into a live, cadence-driven n8n-style pipeline that highlights the current stage, animates the real transition path in log order, swaps in action icons, toggles high-level detail with `i`, blooms/sparks on git milestones, shows parallel subagent lanes, flashes failures, and idles with the session.

**Architecture:** Two new pure modules — `pipeline-geometry.ts` (node positions + routed edge cell-paths) and `pipeline-flow.ts` (derive the live per-lane state from beats+cursor) — plus a `Beat.milestone` flag set by a pure reducer detector. `Lens.tsx` becomes a thin render over those, reusing the merged pulse model (`pulsePhase`/`cometColor`/`breathe`). Static `buildPipeline` stays as the dim backdrop.

**Tech Stack:** Bun, TypeScript (strict, `noUncheckedIndexedAccess`), React 19, `@opentui/core` buffered render, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-07-clawdlens-lens-dynamic-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/core/types.ts` | add `Beat.milestone?: "commit" \| "branch"` |
| `src/core/pipeline.ts` | export `slotOf(kind)` (reuse the private SLOT) |
| `src/core/reducer.ts` | pure `gitMilestone(command)` + set it on Bash beats |
| `src/core/pipeline-geometry.ts` | **new** — `nodePos`, `edgePath`, layout constants |
| `src/core/pipeline-flow.ts` | **new** — `deriveFlow`, `LaneFlow`, `FlowState` |
| `src/ui/keymap.ts` | add `info` action → `i` |
| `src/ui/App.tsx` | `infoOn` state + toggle; pass cadence/status/infoOn |
| `src/ui/Showcase.tsx` | thread new props to `<Lens>` |
| `src/core/commands.ts` | `lens.info` palette command |
| `src/ui/Menu.tsx` | help row for `i` |
| `src/ui/panels/Lens.tsx` | rewrite: dynamic render |
| `tests/pipeline.test.ts` · `tests/reducer.test.ts` · `tests/pipeline-geometry.test.ts` · `tests/pipeline-flow.test.ts` | new + extended |

---

## Task 1: Core data — `Beat.milestone`, `slotOf`, git-milestone detection

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/pipeline.ts`
- Modify: `src/core/reducer.ts`
- Test: `tests/reducer.test.ts`, `tests/pipeline.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/pipeline.test.ts`:

```ts
import { slotOf } from "../src/core/pipeline";

test("slotOf returns the fixed stage slots", () => {
  expect(slotOf("think")).toEqual({ col: 0, row: 0 });
  expect(slotOf("tool")).toEqual({ col: 1, row: 0 });
  expect(slotOf("skill")).toEqual({ col: 1, row: 1 });
  expect(slotOf("result")).toEqual({ col: 2, row: 0 });
  expect(slotOf("chat")).toEqual({ col: 3, row: 0 });
});
```

Append to `tests/reducer.test.ts`:

```ts
import { gitMilestone } from "../src/core/reducer";

test("gitMilestone flags commit and branch creation, ignores the rest", () => {
  expect(gitMilestone('git commit -m "x"')).toBe("commit");
  expect(gitMilestone("git add -A && git commit -m 'y'")).toBe("commit");
  expect(gitMilestone("git commit --dry-run")).toBeUndefined();
  expect(gitMilestone("git checkout -b feat/x")).toBe("branch");
  expect(gitMilestone("git switch -c feat/x")).toBe("branch");
  expect(gitMilestone("git branch feat/x")).toBe("branch");
  expect(gitMilestone("git branch -d feat/x")).toBeUndefined();
  expect(gitMilestone("git branch")).toBeUndefined();
  expect(gitMilestone("git status")).toBeUndefined();
  expect(gitMilestone(undefined)).toBeUndefined();
});

test("a Bash git commit beat carries milestone='commit'", () => {
  let s = newSession("sid", "f");
  s = applyEntry(s, { type: "assistant", message: { content: [
    { type: "tool_use", id: "1", name: "Bash", input: { command: 'git commit -m "x"' } },
  ] } }, 0);
  const beat = s.beats.find((b) => b.label === "Bash")!;
  expect(beat.milestone).toBe("commit");
});
```

(`newSession`/`applyEntry` are already imported in `tests/reducer.test.ts`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline.test.ts tests/reducer.test.ts`
Expected: FAIL — `slotOf` / `gitMilestone` not exported; `beat.milestone` undefined.

- [ ] **Step 3: Add the `milestone` field to `Beat`**

In `src/core/types.ts`, inside `interface Beat`, after the `skill?: string;` line add:

```ts
  milestone?: "commit" | "branch"; // Bash git commit/branch-create, for Lens bloom/spark
```

- [ ] **Step 4: Export `slotOf` from `pipeline.ts`**

In `src/core/pipeline.ts`, immediately after the `const SLOT … ` declaration add:

```ts
export function slotOf(kind: PipeKind): { col: number; row: number } {
  return SLOT[kind];
}
```

- [ ] **Step 5: Add `gitMilestone` + set it on Bash beats in `reducer.ts`**

In `src/core/reducer.ts`, add this exported helper near the top (after the imports):

```ts
export function gitMilestone(command: string | undefined): "commit" | "branch" | undefined {
  if (!command) return undefined;
  if (/\bgit\b[^\n]*\bcommit\b/.test(command) && !/--dry-run/.test(command)) return "commit";
  if (/\bgit\s+(?:checkout\s+-b|switch\s+-c)\b/.test(command)) return "branch";
  if (/\bgit\s+branch\s+[^-\s]\S*/.test(command)) return "branch"; // `git branch <name>` (not -d/-D/--list)
  return undefined;
}
```

Then in `foldAssistant`, in the final `else` branch of the tool_use loop (the non-Skill/non-Task tool branch), replace:

```ts
      } else {
        const detail = name === "Bash"
          ? (typeof b.input?.description === "string" ? b.input.description as string : (typeof b.input?.command === "string" ? (b.input.command as string).slice(0, 60) : undefined))
          : fileOf(b.input) ?? (typeof b.input?.query === "string" ? (b.input.query as string).slice(0, 60) : undefined);
        pushBeat(s, { ts, kind: "tool", iconKey: iconKeyFor(name), label: name, detail, lane, toolUseId: b.id, skill: e.attributionSkill });
        if (b.id) s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id };
        bumpHeat(s, name, b.input, ts);
      }
```

with:

```ts
      } else {
        const cmd = typeof b.input?.command === "string" ? (b.input.command as string) : undefined;
        const detail = name === "Bash"
          ? (typeof b.input?.description === "string" ? b.input.description as string : (cmd ? cmd.slice(0, 60) : undefined))
          : fileOf(b.input) ?? (typeof b.input?.query === "string" ? (b.input.query as string).slice(0, 60) : undefined);
        const milestone = name === "Bash" ? gitMilestone(cmd) : undefined;
        pushBeat(s, { ts, kind: "tool", iconKey: iconKeyFor(name), label: name, detail, lane, toolUseId: b.id, skill: e.attributionSkill, milestone });
        if (b.id) s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id };
        bumpHeat(s, name, b.input, ts);
      }
```

- [ ] **Step 6: Run tests + typecheck**

Run: `bun test tests/pipeline.test.ts tests/reducer.test.ts && bunx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/pipeline.ts src/core/reducer.ts tests/pipeline.test.ts tests/reducer.test.ts
git commit -m "feat(lens): Beat.milestone + git detection, export slotOf"
```

---

## Task 2: Pure geometry — `pipeline-geometry.ts`

**Files:**
- Create: `src/core/pipeline-geometry.ts`
- Test: `tests/pipeline-geometry.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/pipeline-geometry.test.ts`:

```ts
import { test, expect } from "bun:test";
import { nodePos, edgePath, LEFT, TOP, COL_GAP } from "../src/core/pipeline-geometry";

test("nodePos places stages on fixed slots", () => {
  expect(nodePos("think")).toEqual({ x: LEFT, y: TOP });
  expect(nodePos("tool")).toEqual({ x: LEFT + COL_GAP, y: TOP });
  expect(nodePos("result")).toEqual({ x: LEFT + 2 * COL_GAP, y: TOP });
  expect(nodePos("chat")).toEqual({ x: LEFT + 3 * COL_GAP, y: TOP });
  expect(nodePos("skill").x).toBe(LEFT + COL_GAP);
  expect(nodePos("skill").y).toBeGreaterThan(TOP);
});

test("forward edge is a horizontal run on the spine row", () => {
  const cells = edgePath("think", "tool");
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.y === TOP)).toBe(true);
  expect(cells.every((c) => c.ch === "─")).toBe(true);
  expect(cells.every((c) => c.x > nodePos("think").x && c.x < nodePos("tool").x)).toBe(true);
});

test("backward edge dips below the spine (arc)", () => {
  const cells = edgePath("result", "think");
  expect(cells.some((c) => c.y > TOP)).toBe(true);
});

test("skill edge uses a vertical feeder at the skill column", () => {
  const cells = edgePath("skill", "tool");
  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every((c) => c.x === nodePos("skill").x)).toBe(true);
  expect(cells.some((c) => c.ch === "│")).toBe(true);
});

test("self edge is empty", () => {
  expect(edgePath("tool", "tool")).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test tests/pipeline-geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/core/pipeline-geometry.ts`:

```ts
import type { PipeKind } from "./pipeline";
import { slotOf } from "./pipeline";

export interface Cell { x: number; y: number; ch: string }

export const LEFT = 2;
export const TOP = 1;
export const COL_GAP = 14;     // cells between stage columns
export const STAGE_ROW_H = 4;  // vertical block between spine row 0 and skill row 1

export function nodePos(kind: PipeKind): { x: number; y: number } {
  const { col, row } = slotOf(kind);
  return { x: LEFT + col * COL_GAP, y: TOP + row * STAGE_ROW_H };
}

// Ordered routed cells from the `from` node to the `to` node (excludes the node
// glyphs). Skill (row 1) is reached via a vertical feeder to/from the spine; the
// spine is traversed straight (forward) or via an arc one row below (backward).
export function edgePath(from: PipeKind, to: PipeKind): Cell[] {
  if (from === to) return [];
  const a = slotOf(from);
  const b = slotOf(to);
  const cells: Cell[] = [];
  const xOf = (col: number) => LEFT + col * COL_GAP;
  const fromX = xOf(a.col);
  const toX = xOf(b.col);

  // 1. feeder UP from a skill source to the spine row
  if (a.row === 1) {
    for (let y = TOP + STAGE_ROW_H - 1; y > TOP; y--) cells.push({ x: fromX, y, ch: "│" });
  }
  // 2. spine traversal
  if (b.col > a.col) {
    for (let x = fromX + 1; x < toX; x++) cells.push({ x, y: TOP, ch: "─" });
  } else if (b.col < a.col) {
    const yArc = TOP + 2;
    cells.push({ x: fromX, y: TOP + 1, ch: "│" });
    cells.push({ x: fromX, y: yArc, ch: "╯" });
    for (let x = fromX - 1; x > toX; x--) cells.push({ x, y: yArc, ch: "─" });
    cells.push({ x: toX, y: yArc, ch: "╰" });
    cells.push({ x: toX, y: TOP + 1, ch: "│" });
  }
  // 3. feeder DOWN to a skill target
  if (b.row === 1) {
    for (let y = TOP + 1; y < TOP + STAGE_ROW_H; y++) cells.push({ x: toX, y, ch: "│" });
  }
  return cells;
}
```

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline-geometry.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit` → clean.
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-geometry.ts tests/pipeline-geometry.test.ts
git commit -m "feat(lens): pure pipeline geometry (node positions + edge paths)"
```

---

## Task 3: Pure live state — `pipeline-flow.ts`

**Files:**
- Create: `src/core/pipeline-flow.ts`
- Test: `tests/pipeline-flow.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/pipeline-flow.test.ts`:

```ts
import { test, expect } from "bun:test";
import { deriveFlow } from "../src/core/pipeline-flow";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: 0, kind: p.kind ?? "tool", iconKey: p.iconKey ?? "tool", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p };
}

test("active stage = head; a completed tool advances to result", () => {
  const f = deriveFlow([beat({ kind: "thinking" }), beat({ kind: "tool", ok: true })], 2, 3);
  expect(f.main.activeKind).toBe("result");
  expect(f.main.trail).toEqual(["think", "tool", "result"]);
  expect(f.main.errored).toBe(false);
});

test("a running tool (ok undefined) stays at tool", () => {
  const f = deriveFlow([beat({ kind: "tool" })], 1, 3);
  expect(f.main.activeKind).toBe("tool");
});

test("a failed tool flags errored at result", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: false })], 1, 3);
  expect(f.main.activeKind).toBe("result");
  expect(f.main.errored).toBe(true);
});

test("trail keeps the last K distinct stages", () => {
  const f = deriveFlow([
    beat({ kind: "thinking" }), beat({ kind: "thinking" }), beat({ kind: "text" }),
    beat({ kind: "thinking" }), beat({ kind: "tool" }),
  ], 5, 3);
  expect(f.main.trail).toEqual(["chat", "think", "tool"]);
});

test("revealed window respects cursor", () => {
  const f = deriveFlow([beat({ kind: "thinking" }), beat({ kind: "tool" })], 1, 3);
  expect(f.main.activeKind).toBe("think");
});

test("milestone is surfaced from the head beat", () => {
  const f = deriveFlow([beat({ kind: "tool", ok: true, milestone: "commit" })], 1, 3);
  expect(f.main.milestone).toBe("commit");
});

test("an open subagent lane appears with label + agentsLive", () => {
  const f = deriveFlow([
    beat({ id: "t", kind: "tool", label: "Task · code-reviewer", toolUseId: "T1" }), // ok undefined => open
    beat({ id: "s", kind: "thinking", lane: "T1" }),
  ], 2, 3);
  expect(f.agentsLive).toBe(1);
  expect(f.subLanes[0]!.lane).toBe("T1");
  expect(f.subLanes[0]!.label).toBe("code-reviewer");
  expect(f.subLanes[0]!.activeKind).toBe("think");
});

test("a closed subagent lane is omitted", () => {
  const f = deriveFlow([
    beat({ id: "t", kind: "tool", label: "Task · x", toolUseId: "T1", ok: true }), // closed
    beat({ id: "s", kind: "thinking", lane: "T1" }),
  ], 2, 3);
  expect(f.agentsLive).toBe(0);
  expect(f.subLanes).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails** — `bun test tests/pipeline-flow.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/core/pipeline-flow.ts`:

```ts
import type { Beat, BeatKind, IconKey } from "./types";
import type { PipeKind } from "./pipeline";

const KIND_OF: Partial<Record<BeatKind, PipeKind>> = {
  thinking: "think", text: "chat", skill: "skill", tool: "tool",
};

export interface LaneFlow {
  lane: string;
  label: string;
  activeKind: PipeKind | null;
  trail: PipeKind[];                 // last K distinct stages, oldest -> newest
  actionIcon: IconKey | null;        // glyph for the active node
  detail: string | null;            // short, high-level (Lens clips it)
  errored: boolean;
  milestone: "commit" | "branch" | null;
  isOpen: boolean;
}

export interface FlowState {
  main: LaneFlow;
  subLanes: LaneFlow[];
  agentsLive: number;
}

// expand a lane's beats into pipeline steps, synthesizing `result` after a
// completed tool (mirrors buildPipeline's expansion)
function expand(beats: Beat[]): PipeKind[] {
  const steps: PipeKind[] = [];
  for (const b of beats) {
    const k = KIND_OF[b.kind];
    if (!k) continue;
    steps.push(k);
    if (b.kind === "tool" && b.ok !== undefined) steps.push("result");
  }
  return steps;
}

function lastDistinct(steps: PipeKind[], n: number): PipeKind[] {
  const c: PipeKind[] = [];
  for (const s of steps) if (c.at(-1) !== s) c.push(s);
  return c.slice(Math.max(0, c.length - n));
}

function laneFlow(lane: string, label: string, beats: Beat[], isOpen: boolean, trailLen: number): LaneFlow {
  const trail = lastDistinct(expand(beats), trailLen);
  const activeKind = trail.at(-1) ?? null;
  const head = beats.at(-1) ?? null;
  const errored = head?.kind === "tool" && head.ok === false;
  return {
    lane, label, activeKind, trail,
    actionIcon: activeKind === "result" ? "result" : (head?.iconKey ?? null),
    detail: head?.detail ?? head?.label ?? null,
    errored,
    milestone: head?.milestone ?? null,
    isOpen,
  };
}

function subLabel(taskBeat: Beat | undefined): string {
  if (!taskBeat) return "agent";
  return taskBeat.label.replace(/^Task · /, "") || (taskBeat.detail ?? "agent");
}

export function deriveFlow(beats: Beat[], cursor: number, trailLen: number): FlowState {
  const revealed = beats.slice(0, Math.max(0, cursor));
  const mainBeats = revealed.filter((b) => b.lane === "main");
  const main = laneFlow("main", "main", mainBeats, false, trailLen);

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
    subLanes.push(laneFlow(lane, subLabel(task), byLane.get(lane)!, true, trailLen));
  }

  return { main, subLanes, agentsLive: subLanes.length };
}
```

- [ ] **Step 4: Run to verify it passes** — `bun test tests/pipeline-flow.test.ts` → PASS.
- [ ] **Step 5: Typecheck** — `bunx tsc --noEmit` → clean.
- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline-flow.ts tests/pipeline-flow.test.ts
git commit -m "feat(lens): derive live per-lane flow state from beats"
```

---

## Task 4: Wiring — `i` toggle, cadence/status props, palette + help

**Files:**
- Modify: `src/ui/keymap.ts`
- Modify: `src/core/commands.ts`
- Modify: `src/ui/Menu.tsx`
- Modify: `src/ui/panels/Lens.tsx` (Props only)
- Modify: `src/ui/Showcase.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Add the `info` action to the keymap**

In `src/ui/keymap.ts`: add `| { type: "info" }` to the `Action` union (after `{ type: "lens" }`), and add this mapping before the `q` line:

```ts
  if (n === "i") return { type: "info" };
```

- [ ] **Step 2: Add the palette command**

In `src/core/commands.ts`, add after the `tasks.hideDone` entry:

```ts
  { id: "lens.info", title: "Toggle info detail", aliases: ["info", "detail"], context: (p) => p === "lens" },
```

- [ ] **Step 3: Add the help row**

In `src/ui/Menu.tsx` `helpRows()`, add after the `h9` (lens ribbon) row:

```ts
    { id: "h9b", left: "lens info", right: "i" },
```

- [ ] **Step 4: Extend `Lens` Props (accept new props; render unchanged for now)**

In `src/ui/panels/Lens.tsx`, replace the `Props` interface with:

```ts
interface Props {
  full: SessionState | null;   // whole-session fold (aggregate backdrop)
  presented: Beat[];           // paced beats (live flow source)
  cursor: number;
  pulse: boolean;
  lastAdvanceMs: number;       // player cadence
  intervalMs: number;          // player cadence
  status: import("../../core/types").Status;
  infoOn: boolean;
  width: number;
  height: number;
}
```

Leave the function body and its current `{ full, presented, cursor, pulse, width, height }` destructure unchanged — the new props are consumed in Task 5. (Interface members aren't flagged as unused.)

- [ ] **Step 5: Thread props through Showcase**

In `src/ui/Showcase.tsx`: add to the `Props` interface (after `cursor: number;`):

```ts
  infoOn: boolean;
```

Add `infoOn` to the destructure in the `Showcase({ … })` signature (next to `cursor`). Then replace the lens render line with (the live `session` is non-null past the early return, so use `session.status` directly — no extra prop needed):

```tsx
        {panel === "lens" && <Lens full={agg} presented={presented} cursor={cursor} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} status={session.status} infoOn={infoOn} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 6: App state + wiring**

In `src/ui/App.tsx`:

(a) add state near the other `useState` calls:

```ts
  const [infoOn, setInfoOn] = useState(true);
```

(b) in `runCommand`, add a case (next to `tasks.hideDone`):

```ts
      case "lens.info": setInfoOn((v) => !v); break;
```

(c) in the `useKeyboard` action switch, add (next to `case "lens":`):

```ts
      case "info": setInfoOn((v) => !v); break;
```

(d) in the `<Showcase … />` JSX, add the prop (next to `cursor={cursor}`):

```tsx
          infoOn={infoOn}
```

(e) add `infoOn` to the `forceRepaint` effect deps array (the `useEffect(() => { forceRepaint(); }, [panel, …])` list).

- [ ] **Step 7: Typecheck + full tests**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; all tests pass (Lens still renders the old static board — that's fine; props are wired).

- [ ] **Step 8: Commit**

```bash
git add src/ui/keymap.ts src/core/commands.ts src/ui/Menu.tsx src/ui/panels/Lens.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(lens): wire info toggle (i) + cadence/status props"
```

---

## Task 5: Dynamic render — rewrite `Lens.tsx`

**Files:**
- Modify: `src/ui/panels/Lens.tsx` (full replace)

- [ ] **Step 1: Replace the entire contents of `src/ui/panels/Lens.tsx` with:**

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { buildPipeline, type PipeKind } from "../../core/pipeline";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { nodePos, edgePath, LEFT, TOP, COL_GAP, STAGE_ROW_H } from "../../core/pipeline-geometry";
import type { Beat, IconKey, SessionState, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  full: SessionState | null;
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
const SUBLANE_Y0 = TOP + STAGE_ROW_H + 3;
const SUBLANE_H = 2;
const MAX_SUBLANES = 3;

const STAGE_ICON: Record<PipeKind, IconKey> = {
  think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text",
};
const STAGE_COL: Record<PipeKind, number> = { think: 0, tool: 1, skill: 1, result: 2, chat: 3 };

function laneHexOf(kind: PipeKind) { return theme.laneColors[STAGE_COL[kind] % theme.laneColors.length]!; }
function clip(s: string, n: number) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }

function put(buf: OptimizedBuffer, x: number, y: number, ch: string, fg: RGBA, width: number, height: number) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  buf.setCell(x, y, ch, fg, TRANSPARENT);
}
function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, width: number, height: number) {
  for (let i = 0; i < str.length; i++) put(buf, x + i, y, str[i]!, fg, width, height);
}

// burst overlay for a git milestone landing on a node
function drawBurst(buf: OptimizedBuffer, cx: number, cy: number, kind: "commit" | "branch", phase: number, laneHex: string, width: number, height: number) {
  const r = Math.round(phase * 3);
  const fade = 1 - phase;
  if (r <= 0 || fade <= 0) return;
  const col = RGBA.fromHex(lerpHex(theme.wireDim, kind === "commit" ? laneHex : theme.warn, fade));
  if (kind === "commit") {
    const ring: [number, number][] = [[r, 0], [-r, 0], [0, 1], [0, -1], [r - 1, 1], [-(r - 1), -1]];
    const glyphs = "✦✧·*";
    ring.forEach(([dx, dy], i) => put(buf, cx + dx, cy + dy, glyphs[i % glyphs.length]!, col, width, height));
  } else {
    ([[r, 0], [r, -1], [r - 1, 1], [1, -1]] as [number, number][]).forEach(([dx, dy]) => put(buf, cx + dx, cy + dy, "*", col, width, height));
    put(buf, cx + 1, cy, "+", col, width, height);
  }
}

// main lane: fading trail + comet on the current transition + highlighted active node
function drawMain(buf: OptimizedBuffer, ln: LaneFlow, phase: number, now: number, animating: boolean, tempo: number, infoOn: boolean, width: number, height: number) {
  const trail = ln.trail;
  for (let i = 0; i + 1 < trail.length; i++) {
    const from = trail[i]!, to = trail[i + 1]!;
    const cells = edgePath(from, to);
    const laneHex = laneHexOf(to);
    const isCurrent = i === trail.length - 2;
    if (isCurrent && animating) {
      const head = phase * cells.length;
      cells.forEach((c, ci) => {
        const col = cometColor(head - ci, TAIL, ln.errored ? theme.err : laneHex, theme.pulseHot, theme.wireDim, 0.15 + tempo);
        put(buf, c.x, c.y, ln.errored ? "┉" : c.ch, RGBA.fromHex(col), width, height);
      });
    } else {
      const baseI = 0.18 + 0.32 * ((i + 1) / Math.max(1, trail.length - 1));
      cells.forEach((c) => put(buf, c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, baseI)), width, height));
    }
  }
  const active = ln.activeKind;
  if (!active) return;
  const p = nodePos(active);
  const laneHex = laneHexOf(active);
  const hot = ln.errored ? theme.err : theme.pulseHot;
  const glyphCol = animating ? lerpHex(laneHex, hot, breathe(now)) : laneHex;
  put(buf, p.x, p.y, "◉", RGBA.fromHex(glyphCol), width, height);
  const icon = iconFor(ln.actionIcon ?? STAGE_ICON[active]);
  const label = infoOn && ln.detail ? `${icon} ${clip(ln.detail, Math.max(6, COL_GAP - 3))}` : `${icon} ${active}`;
  drawStr(buf, p.x + 2, p.y, label, RGBA.fromHex(ln.errored ? theme.err : theme.fg), width, height);
}

// compact one-row view of an open subagent lane
function drawSubLane(buf: OptimizedBuffer, ln: LaneFlow, y: number, now: number, animating: boolean, infoOn: boolean, width: number, height: number) {
  const taskHex = theme.laneColors[5 % theme.laneColors.length]!;
  put(buf, LEFT + 2, y, iconFor("task"), RGBA.fromHex(taskHex), width, height);
  drawStr(buf, LEFT + 4, y, clip(ln.label, 12), RGBA.fromHex(theme.dim), width, height);
  if (!ln.activeKind) return;
  const x = LEFT + 18;
  const headi = animating ? Math.floor((now / 120) % 4) : 99;
  for (let i = 0; i < 3; i++) put(buf, x + i, y, "·", RGBA.fromHex(i === headi ? laneHexOf(ln.activeKind) : theme.wireDim), width, height);
  const laneHex = laneHexOf(ln.activeKind);
  const glyph = ln.errored ? "✗" : iconFor(ln.actionIcon ?? STAGE_ICON[ln.activeKind]);
  const col = ln.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
  put(buf, x + 4, y, glyph, RGBA.fromHex(col), width, height);
  if (infoOn && ln.detail) drawStr(buf, x + 6, y, clip(ln.detail, 18), RGBA.fromHex(theme.fg), width, height);
}

export function Lens({ full, presented, cursor, pulse, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS);
  const graph = buildPipeline(full?.beats ?? []);
  if (graph.nodes.length === 0 && flow.main.activeKind === null) {
    return <text fg={theme.dim}>no activity yet</text>;
  }

  const present = new Set<PipeKind>(graph.nodes.map((n) => n.kind));
  if (flow.main.activeKind) present.add(flow.main.activeKind);
  const countOf = new Map<PipeKind, number>(graph.nodes.map((n) => [n.kind, n.count]));
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(0.4, (600 / intervalMs) * 0.2)) : 0;

        // 1. dim backdrop: every present stage + its count
        for (const kind of present) {
          const p = nodePos(kind);
          put(buffer, p.x, p.y, "○", RGBA.fromHex(theme.wireDim), width, height);
          drawStr(buffer, p.x + 2, p.y, kind, RGBA.fromHex(theme.dim), width, height);
          const cnt = countOf.get(kind);
          if (cnt) drawStr(buffer, p.x + 2, p.y + 1, `×${cnt}`, RGBA.fromHex(theme.wireDim), width, height);
        }

        // 2. main lane flow (trail + comet + active node)
        drawMain(buffer, flow.main, phase, now, animating, tempo, infoOn, width, height);

        // 3. milestone bloom/spark (skip a failed commit)
        if (flow.main.milestone && flow.main.activeKind && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const p = nodePos(flow.main.activeKind);
          drawBurst(buffer, p.x, p.y, flow.main.milestone, phase, laneHexOf(flow.main.activeKind), width, height);
        }

        // 4. subagent lanes
        if (flow.agentsLive > 0) {
          drawStr(buffer, LEFT, SUBLANE_Y0 - 1, `▸ ${flow.agentsLive} agent${flow.agentsLive > 1 ? "s" : ""} live`, RGBA.fromHex(theme.accent), width, height);
        }
        flow.subLanes.slice(0, MAX_SUBLANES).forEach((ln, i) => {
          drawSubLane(buffer, ln, SUBLANE_Y0 + i * SUBLANE_H, now, animating, infoOn, width, height);
        });
        if (flow.subLanes.length > MAX_SUBLANES) {
          drawStr(buffer, LEFT, SUBLANE_Y0 + MAX_SUBLANES * SUBLANE_H, `+${flow.subLanes.length - MAX_SUBLANES} more`, RGBA.fromHex(theme.dim), width, height);
        }

        // 5. idle/waiting cue at the chat node
        if (idle && present.has("chat")) {
          const p = nodePos("chat");
          const cue = status === "waiting" ? "waiting…" : status;
          drawStr(buffer, p.x + 2, p.y, cue, RGBA.fromHex(lerpHex(theme.dim, theme.fg, breathe(now) - 0.6)), width, height);
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck** — `bunx tsc --noEmit` → clean.
- [ ] **Step 3: Full test suite** — `bun test` → all pass.

- [ ] **Step 4: Visual verification via tmux**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
```
Expected: Lens default tab; a dim pipeline backdrop with `×counts`; the **active node** bright with an **action icon** (`◉  npm test` style) and a comet on the current edge.

Drive a replay to see the flow hop in real order:
```bash
tmux send-keys -t cl R; sleep 1; tmux capture-pane -t cl -ep > /tmp/d1.txt; sleep 1; tmux capture-pane -t cl -ep > /tmp/d2.txt; diff /tmp/d1.txt /tmp/d2.txt | head
```
Expected: non-empty diff — the highlight/comet advancing stage→stage.

Toggle info + pulse:
```bash
tmux send-keys -t cl i; sleep 1; tmux capture-pane -t cl -p | sed -n '6,12p'   # detail hidden -> icon + stage name only
tmux send-keys -t cl i; tmux send-keys -t cl p; sleep 1; tmux capture-pane -t cl -p | sed -n '6,12p'
tmux kill-session -t cl
```
Expected: `i` removes/restores the detail text; `p` freezes the comet. If a session ran subagents you'll see `▸ N agents live` + sub-rows; a `git commit`/branch beat blooms/sparks during replay; a failed tool flashes red. (Pick an active session via `:` if the default has no beats.)

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): dynamic n8n-style pipeline — live flow, icons, lanes, bloom/spark (#4)"
```

---

## Self-Review

**Spec coverage:**
- Live n8n flow (active node + comet, cadence-driven) → Task 5 `drawMain` + `pulsePhase`/`cometColor`; cadence props wired Task 4.
- Icons (stage + action swap) → Task 5 `STAGE_ICON`/`actionIcon` + `iconFor`.
- Info toggle `i` (default on, high-level) → Task 4 keymap/command/state; Task 5 `infoOn` + `clip`.
- Git bloom/spark → `Beat.milestone` (Task 1) + `drawBurst` (Task 5).
- Subagent lanes → `deriveFlow` lanes (Task 3) + `drawSubLane`/`agentsLive` (Task 5).
- Failure flash + sputter → `errored` (Task 3) + red flash / `┉` comet (Task 5).
- Session vitality → `tempo` from `intervalMs` + `idle` standby/cue (Task 5), `status` wired (Task 4).
- Pure modules + TDD → Tasks 1–3 with tests; geometry/flow isolated.

**Placeholder scan:** none — all steps contain full code.

**Type consistency:** `PipeKind` shared from `pipeline.ts`; `slotOf` (Task 1) used by `pipeline-geometry` (Task 2); `LaneFlow`/`deriveFlow` (Task 3) consumed by `Lens` (Task 5); `Beat.milestone` (Task 1) read by `deriveFlow` + reducer writer; `Status`/`infoOn`/cadence props flow App→Showcase→Lens (Tasks 4–5) and match the `Lens` Props interface. `nodePos`/`edgePath`/`LEFT`/`TOP`/`COL_GAP`/`STAGE_ROW_H` names consistent between geometry and Lens.
