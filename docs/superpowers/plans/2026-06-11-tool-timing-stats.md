# Per-Tool Timing Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-tool duration stats (count, avg/min/max, total) from tool_use→tool_result entry timestamps, shown in the Lens `i` detail flip. Closes #21.

**Architecture:** Widen the reducer's `pendingTools` accumulator to carry `{beatId, name, ts}`; fold durations into a new `SessionState.toolTimings` on result pairing. Pure view model `toolTimingView` in lens-bands sorts bottleneck-first; Lens `i` flip renders those rows (full-session aggregate via the existing `full` prop — no new App gate).

**Tech Stack:** Bun, TypeScript strict, bun:test.

**Branch:** `feat/tool-timing` off `main` (after session-done merges).

---

### Task 1: Reducer timing accumulators

**Files:**
- Modify: `src/core/types.ts` (ToolTiming, SessionState.toolTimings, pendingTools type)
- Modify: `src/core/reducer.ts` (newSession, foldAssistant pendingTools writes ×2, foldUser pairing)
- Test: `tests/reducer.test.ts`

- [ ] **Step 1: Failing tests** — append to `tests/reducer.test.ts` (note: `feed` uses a fixed `now`; timestamps must come from explicit `timestamp` fields):

```ts
test("tool_use→tool_result pairs fold per-tool durations", () => {
  const s = feed([
    { type: "assistant", timestamp: "2026-06-06T00:00:00Z", message: { content: [
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
    ] } },
    { type: "user", timestamp: "2026-06-06T00:00:02Z", message: { content: [
      { type: "tool_result", tool_use_id: "t1" },
    ] } },
    { type: "assistant", timestamp: "2026-06-06T00:00:03Z", message: { content: [
      { type: "tool_use", id: "t2", name: "Bash", input: { command: "pwd" } },
    ] } },
    { type: "user", timestamp: "2026-06-06T00:00:09Z", message: { content: [
      { type: "tool_result", tool_use_id: "t2", is_error: true }, // errors still time
    ] } },
  ]);
  expect(s.toolTimings["Bash"]).toEqual({ count: 2, totalMs: 8000, minMs: 2000, maxMs: 6000 });
});

test("unresolved tool_use contributes no timing", () => {
  const s = feed([
    { type: "assistant", timestamp: "2026-06-06T00:00:00Z", message: { content: [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/a" } },
    ] } },
  ]);
  expect(s.toolTimings["Read"]).toBeUndefined();
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/reducer.test.ts`
Expected: FAIL — `toolTimings` does not exist.

- [ ] **Step 3: Implement types** — in `src/core/types.ts` add above `SessionState`:

```ts
export interface ToolTiming { count: number; totalMs: number; minMs: number; maxMs: number }
```

In `SessionState`: after `toolStats: Record<string, number>;` add

```ts
  toolTimings: Record<string, ToolTiming>; // resolved tool_use→tool_result durations per tool name
```

and change the accumulator line to

```ts
  pendingTools: Record<string, { beatId: string; name: string; ts: number }>; // tool_use id -> beat + start, awaiting result
```

- [ ] **Step 4: Implement reducer** — `src/core/reducer.ts`:

`newSession`: add `toolTimings: {},` after `toolStats: {},`.

`foldAssistant` Task branch (`if (b.id) { s.openLanes = ...` line):

```ts
        if (b.id) { s.openLanes = [...s.openLanes, b.id]; s.pendingTools = { ...s.pendingTools, [b.id]: { beatId: s.beats[s.beats.length - 1]!.id, name, ts } }; }
```

`foldAssistant` generic tool branch:

```ts
        if (b.id) s.pendingTools = { ...s.pendingTools, [b.id]: { beatId: s.beats[s.beats.length - 1]!.id, name, ts } };
```

`foldUser` pairing block — replace the `const beatId = ...` block and drop the trailing `void ts;`:

```ts
    const p = s.pendingTools[id];
    if (p) {
      s.beats = s.beats.map(bt => bt.id === p.beatId ? { ...bt, ok: !b.is_error } : bt);
      const durMs = Math.max(0, ts - p.ts);
      const cur = s.toolTimings[p.name];
      s.toolTimings = {
        ...s.toolTimings,
        [p.name]: cur
          ? { count: cur.count + 1, totalMs: cur.totalMs + durMs, minMs: Math.min(cur.minMs, durMs), maxMs: Math.max(cur.maxMs, durMs) }
          : { count: 1, totalMs: durMs, minMs: durMs, maxMs: durMs },
      };
      const np = { ...s.pendingTools }; delete np[id]; s.pendingTools = np;
    }
```

- [ ] **Step 5: Verify pass**

Run: `bun test tests/reducer.test.ts && bunx tsc --noEmit`
Expected: PASS + clean (the status derivation reads `pendingToolResult` as a boolean from `Object.keys(...).length` in the store — value shape change is internal; typecheck confirms).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/reducer.ts tests/reducer.test.ts
git commit -m "feat(reducer): per-tool duration accumulators from result pairing"
```

### Task 2: View model + duration formatter

**Files:**
- Modify: `src/core/lens-bands.ts` (toolTimingView)
- Modify: `src/ui/format.ts` (fmtDur)
- Test: `tests/lens-bands.test.ts`, `tests/format.test.ts`

- [ ] **Step 1: Failing tests** — append to `tests/lens-bands.test.ts`:

```ts
test("toolTimingView sorts bottleneck-first and derives avg", () => {
  const rows = toolTimingView({
    Read: { count: 4, totalMs: 2000, minMs: 200, maxMs: 900 },
    Bash: { count: 2, totalMs: 9000, minMs: 1000, maxMs: 8000 },
  });
  expect(rows.map((r) => r.name)).toEqual(["Bash", "Read"]);
  expect(rows[0]).toEqual({ name: "Bash", count: 2, avgMs: 4500, minMs: 1000, maxMs: 8000, totalMs: 9000 });
});
```

(import `toolTimingView` in the header import line). Append to `tests/format.test.ts`:

```ts
test("fmtDur scales ms→s→m", () => {
  expect(fmtDur(400)).toBe("0.4s");
  expect(fmtDur(2300)).toBe("2s");
  expect(fmtDur(59_400)).toBe("59s");
  expect(fmtDur(95_000)).toBe("1m35s");
});
```

(import `fmtDur`).

- [ ] **Step 2: Verify failure**

Run: `bun test tests/lens-bands.test.ts tests/format.test.ts`
Expected: FAIL — neither function exists.

- [ ] **Step 3: Implement** — `src/core/lens-bands.ts` (import `ToolTiming` type from `./types`):

```ts
export interface ToolTimingRow { name: string; count: number; avgMs: number; minMs: number; maxMs: number; totalMs: number }

// bottleneck-first: total time spent waiting on each tool
export function toolTimingView(timings: Record<string, ToolTiming>): ToolTimingRow[] {
  return Object.entries(timings)
    .map(([name, t]) => ({ name, count: t.count, avgMs: Math.round(t.totalMs / t.count), minMs: t.minMs, maxMs: t.maxMs, totalMs: t.totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs);
}
```

`src/ui/format.ts`:

```ts
export function fmtDur(ms: number): string {
  if (ms < 1000) return (ms / 1000).toFixed(1) + "s";
  const s = ms / 1000;
  if (s < 60) return Math.floor(s) + "s";
  const m = Math.floor(s / 60);
  return `${m}m${String(Math.floor(s % 60)).padStart(2, "0")}s`;
}
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/lens-bands.test.ts tests/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens-bands.ts src/ui/format.ts tests/lens-bands.test.ts tests/format.test.ts
git commit -m "feat(lens): toolTimingView + fmtDur"
```

### Task 3: Lens `i` flip renders timing rows

**Files:**
- Modify: `src/core/reducer.ts` (export iconKeyFor)
- Modify: `src/ui/panels/Lens.tsx` (Props + infoOn branch)
- Modify: `src/ui/Showcase.tsx:68` (pass toolTimings)

- [ ] **Step 1: Export the icon mapping** — `src/core/reducer.ts`: change `function iconKeyFor` to `export function iconKeyFor`.

- [ ] **Step 2: Lens props** — `src/ui/panels/Lens.tsx` Props gains:

```ts
  toolTimings: Record<string, import("../../core/types").ToolTiming>;
```

destructure `toolTimings` in the component signature. Add imports:

```ts
import { toolTimingView } from "../../core/lens-bands";
import { iconKeyFor } from "../../core/reducer";
import { fmtDur } from "../format";
```

- [ ] **Step 3: infoOn branch** — replace the body of `if (infoOn) { ... }` (the `flow.main.toolBreakdown` loop) with:

```ts
  if (infoOn) {
    const rows = toolTimingView(toolTimings);
    if (rows.length > 0) {
      for (const r of rows) {
        items.push({ glyph: iconFor(iconKeyFor(r.name)), label: `${r.name} ×${r.count} ${fmtDur(r.avgMs)}`, live: false, hex: laneHexOf("tool") });
      }
    } else {
      for (const k of Object.keys(flow.main.toolBreakdown).sort((a, b) => rankOf(a) - rankOf(b))) {
        items.push({ glyph: iconFor(k as IconKey), label: `${k} ×${flow.main.toolBreakdown[k]}`, live: false, hex: laneHexOf("tool") });
      }
    }
  } else {
```

(`drawSubNode` clips labels to 14 cells — count always survives, avg truncates gracefully. The fallback keeps the flip useful for sessions with zero resolved results.)

- [ ] **Step 4: Wire the prop** — `src/ui/Showcase.tsx:68` add to the `<Lens …>` element:

```tsx
toolTimings={agg.toolTimings}
```

(`agg = full ?? session` — full-session aggregate, the existing lens gate in App already re-folds it.)

- [ ] **Step 5: Full gates**

Run: `bunx tsc --noEmit && bun test`
Expected: all green.

- [ ] **Step 6: Visual tmux check**

```bash
tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 5; tmux send-keys -t cl i; sleep 1; tmux capture-pane -t cl -p | grep -A2 "×"
```

Expected: sub-row circles labeled like `Bash ×12 2.3s`. Then `tmux kill-session -t cl`.

- [ ] **Step 7: Commit + PR**

```bash
git add src/core/reducer.ts src/ui/panels/Lens.tsx src/ui/Showcase.tsx
git commit -m "feat(lens): i-flip shows per-tool timing (count + avg), bottleneck-first"
git push -u origin feat/tool-timing
gh pr create --title "feat: per-tool timing stats in lens detail" --body "Closes #21. Spec: docs/superpowers/specs/2026-06-11-tool-timing-stats-design.md"
```

Merge after CI green: `gh pr merge --squash --delete-branch`.
