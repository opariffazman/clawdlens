# Header Reveal Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the header's `$cost` and `ctx%` count up in lockstep with the player cursor (during initial reveal, replay, and scrub), matching how the panels reveal — while resting on the whole-session totals at the head.

**Architecture:** Approach A (per-beat cumulative snapshot). The reducer stamps each beat with `snap: {cost, ctxTokens}` (cumulative as of that beat); coalescing keeps the later snap. Two pure helpers (`cursorSnapshot`, `headerValues`) resolve the value at the cursor — the ctx **limit denominator is derived from the session's final ctx (stable)** so a 1M gauge fills smoothly without resetting at the 200k inference boundary. The header renders those resolved values; absent a snapshot it shows the session totals (today's behavior). Built on PR #13 (`mergeHeaderSession` supplies the base session: stable limit, status, model, elapsed, fallback).

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · React 19 · `@opentui/react` · `bun:test`. Spec: `docs/superpowers/specs/2026-06-09-header-reveal-animation-design.md`.

## File Structure

- **`src/core/types.ts`** — new `BeatSnap` interface; optional `snap` field on `Beat`.
- **`src/core/reducer.ts`** — `pushBeat` stamps the snapshot (one line).
- **`src/core/player.ts`** — `rebuild` keeps the later snapshot when coalescing (one line).
- **New `src/ui/headerReveal.ts`** — `cursorSnapshot(beats, cursor)` + `headerValues(session, reveal)`, both pure.
- **`src/ui/Header.tsx`** — accept optional `reveal`; render via `headerValues`.
- **`src/ui/Showcase.tsx`** + **`src/ui/App.tsx`** — thread `reveal` (the cursor snapshot) to the header.

---

### Task 1: Beat snapshot — stamp cumulative cost/ctx at fold time

**Files:**
- Modify: `src/core/types.ts` (add `BeatSnap`, add `Beat.snap`)
- Modify: `src/core/reducer.ts:46-48` (`pushBeat`)
- Create: `tests/beat-snap.test.ts`

- [ ] **Step 1: Add the `BeatSnap` type and the optional `Beat.snap` field**

In `src/core/types.ts`, immediately BEFORE `export interface Beat {` (line 57), add:

```ts
export interface BeatSnap {
  cost: number;       // cumulative costUSD as of this beat
  ctxTokens: number;  // context-window occupancy as of this beat
}
```

Then inside `export interface Beat { ... }`, after the `milestone?: ...` line (line 69), add:

```ts
  snap?: BeatSnap;               // cumulative cost/ctx as of this beat (reveal animation)
```

- [ ] **Step 2: Write the failing test**

Create `tests/beat-snap.test.ts`:

```ts
import { test, expect } from "bun:test";
import { newSession, applyEntry } from "../src/core/reducer";
import { parseLine } from "../src/core/parse";
import type { SessionState } from "../src/core/types";

function fold(lines: string[]): SessionState {
  let s = newSession("x", "x.jsonl");
  for (const raw of lines) { const e = parseLine(raw); if (e) s = applyEntry(s, e, 0); }
  return s;
}

test("pushBeat stamps each beat with cumulative cost+ctx as of that beat", () => {
  const lines = [
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 100000, output_tokens: 1000 }, content: [{ type: "text", text: "first" }] } }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 200000, output_tokens: 2000 }, content: [{ type: "text", text: "second" }] } }),
  ];
  const s = fold(lines);
  expect(s.beats.length).toBe(2);
  const a = s.beats[0]!.snap!, b = s.beats[1]!.snap!;
  // cost is cumulative -> strictly grows across usage-bearing turns
  expect(a.cost).toBeGreaterThan(0);
  expect(b.cost).toBeGreaterThan(a.cost);
  // contextTokens is the per-turn occupancy -> second turn is larger here
  expect(a.ctxTokens).toBe(100000);
  expect(b.ctxTokens).toBe(200000);
  // the LAST beat's snapshot equals the session totals (head == totals)
  expect(b.cost).toBe(s.costUSD);
  expect(b.ctxTokens).toBe(s.tokens.contextTokens);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test tests/beat-snap.test.ts`
Expected: FAIL — `b` is `undefined` (`s.beats[1]!.snap!` is undefined → reading `.cost` throws, or the `toBe` assertions fail) because `pushBeat` does not yet stamp `snap`.

- [ ] **Step 4: Stamp the snapshot in `pushBeat`**

In `src/core/reducer.ts`, replace `pushBeat` (lines 46-48):

```ts
function pushBeat(s: SessionState, b: Omit<import("./types").Beat, "id" | "count">): void {
  s.beats = [...s.beats, { ...b, id: nextBeatId(s), count: 1 }];
}
```

with:

```ts
function pushBeat(s: SessionState, b: Omit<import("./types").Beat, "id" | "count">): void {
  // Stamp the running cumulative cost + context occupancy as of this beat. All
  // beats are pushed inside foldAssistant AFTER this entry's usage is folded, so
  // the snapshot reflects the totals at this point in the timeline. The header
  // reads the snapshot at the cursor to count up cost/ctx during the reveal.
  const snap = { cost: s.costUSD, ctxTokens: s.tokens.contextTokens };
  s.beats = [...s.beats, { ...b, id: nextBeatId(s), count: 1, snap }];
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/beat-snap.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and full suite (no regressions from the new field)**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS. `snap` is an additive optional field; no existing test deep-equals a folded beat.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/reducer.ts tests/beat-snap.test.ts
git commit -m "feat(core): stamp each beat with cumulative cost/ctx snapshot"
```

---

### Task 2: Coalescing keeps the later snapshot

`player.rebuild` merges adjacent same-kind/label/lane beats. The merged beat must keep the **later** beat's snapshot (the cumulative value at the later point), not the earlier one.

**Files:**
- Modify: `src/core/player.ts:24-25` (the merge branch in `rebuild`)
- Create: `tests/player-snap.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/player-snap.test.ts`:

```ts
import { test, expect } from "bun:test";
import { createPlayer } from "../src/core/player";
import type { Beat } from "../src/core/types";

function beat(id: string, cost: number, ctxTokens: number): Beat {
  return { id, ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1, snap: { cost, ctxTokens } };
}

test("rebuild keeps the LATER snapshot when coalescing adjacent beats", () => {
  const p = createPlayer();
  p.setBeats([beat("a", 1, 100), beat("b", 2, 200)]); // same kind/label/lane -> merge
  const all = p.all();
  expect(all.length).toBe(1);
  expect(all[0]!.count).toBe(2);
  expect(all[0]!.snap!.cost).toBe(2);        // later snap wins (cumulative at the later point)
  expect(all[0]!.snap!.ctxTokens).toBe(200);
});

test("rebuild preserves snapshots on beats that do not merge", () => {
  const p = createPlayer();
  const think: Beat = { ...beat("b", 2, 200), kind: "thinking", label: "thinking" };
  p.setBeats([beat("a", 1, 100), think]); // different kind/label -> no merge
  const all = p.all();
  expect(all.length).toBe(2);
  expect(all[0]!.snap!.cost).toBe(1);
  expect(all[1]!.snap!.cost).toBe(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/player-snap.test.ts`
Expected: FAIL — the first test gets `all[0].snap.cost === 1` (the merge keeps `last`'s snap, i.e. the earlier beat) instead of `2`.

- [ ] **Step 3: Keep the later snapshot on merge**

In `src/core/player.ts`, in `rebuild`, replace line 25:

```ts
        out[out.length - 1] = { ...last, count: last.count + b.count };
```

with:

```ts
        out[out.length - 1] = { ...last, count: last.count + b.count, snap: b.snap ?? last.snap };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/player-snap.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck and full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/player.ts tests/player-snap.test.ts
git commit -m "feat(core): keep the later beat snapshot when coalescing"
```

---

### Task 3: `cursorSnapshot` + `headerValues` helpers

Two pure functions: pick the snapshot at the cursor, and resolve the header's displayed cost/ctx with a **stable** context limit.

**Files:**
- Create: `src/ui/headerReveal.ts`
- Create: `tests/headerReveal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/headerReveal.test.ts`:

```ts
import { test, expect } from "bun:test";
import { cursorSnapshot, headerValues } from "../src/ui/headerReveal";
import { newSession } from "../src/core/reducer";
import type { Beat, SessionState } from "../src/core/types";

function beat(cost: number, ctxTokens: number): Beat {
  return { id: `${cost}`, ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1, snap: { cost, ctxTokens } };
}
function sess(over: Partial<SessionState>): SessionState {
  return { ...newSession("x", "x.jsonl"), ...over };
}

test("cursorSnapshot returns zeros at the start of the reveal", () => {
  expect(cursorSnapshot([beat(5, 50)], 0)).toEqual({ cost: 0, ctxTokens: 0 });
});
test("cursorSnapshot returns the snapshot at the cursor (beats[cursor-1])", () => {
  const beats = [beat(5, 50), beat(9, 90), beat(12, 120)];
  expect(cursorSnapshot(beats, 2)).toEqual({ cost: 9, ctxTokens: 90 });
});
test("cursorSnapshot at the head returns the final snapshot (totals)", () => {
  const beats = [beat(5, 50), beat(12, 120)];
  expect(cursorSnapshot(beats, 2)).toEqual({ cost: 12, ctxTokens: 120 });
});
test("cursorSnapshot returns null when there are no beats", () => {
  expect(cursorSnapshot([], 0)).toBe(null);
});
test("cursorSnapshot returns null for a snapshot-less beat", () => {
  const b: Beat = { id: "x", ts: 0, kind: "text", iconKey: "text", label: "says", lane: "main", count: 1 };
  expect(cursorSnapshot([b], 1)).toBe(null);
});

test("headerValues without reveal shows the session totals", () => {
  const s = sess({ model: "claude-opus-4-8", costUSD: 511, tokens: { ...newSession("x", "x.jsonl").tokens, contextTokens: 700000, contextPct: 0.7 } });
  const v = headerValues(s, null);
  expect(v.cost).toBe(511);
  expect(v.ctxTokens).toBe(700000);
  expect(v.pct).toBe(0.7);
});
test("headerValues with reveal animates cost+ctx against the STABLE final limit", () => {
  // final ctx 940k -> effectiveContextLimit infers a 1M window. A mid-reveal ctx of
  // 150k (below the 200k inference boundary) must still scale against 1M, not 200k.
  const s = sess({ model: "claude-opus-4-8", costUSD: 986, tokens: { ...newSession("x", "x.jsonl").tokens, contextTokens: 940000, contextPct: 0.94 } });
  const v = headerValues(s, { cost: 100, ctxTokens: 150000 });
  expect(v.limit).toBe(1_000_000);     // stable: derived from final 940k, not the reveal ctx
  expect(v.cost).toBe(100);            // animated
  expect(v.ctxTokens).toBe(150000);    // animated
  expect(v.pct).toBeCloseTo(0.15, 5);  // 150k / 1M, NOT 150k / 200k
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/headerReveal.test.ts`
Expected: FAIL — module `../src/ui/headerReveal` does not exist.

- [ ] **Step 3: Implement the helpers**

Create `src/ui/headerReveal.ts`:

```ts
import type { Beat, BeatSnap, SessionState } from "../core/types";
import { effectiveContextLimit } from "../core/tokens";

// The cumulative {cost, ctxTokens} to show for the current cursor position. Beats
// carry a snapshot as of each beat (see reducer.pushBeat); during the reveal /
// replay / scrub the header shows the snapshot AT the cursor so cost/ctx count up
// in lockstep with the panels, and at the head it is the whole-session total.
export function cursorSnapshot(beats: Beat[], cursor: number): BeatSnap | null {
  if (beats.length === 0) return null;                 // no timeline -> caller shows session totals
  if (cursor <= 0) return { cost: 0, ctxTokens: 0 };   // start of reveal
  const b = beats[Math.min(cursor, beats.length) - 1];
  return b?.snap ?? null;                               // snapshot-less beat -> caller shows totals
}

// Resolve the header's displayed cost / ctx tokens / ctx pct / limit. The context
// limit is derived from the session's FINAL ctx, so it stays constant across the
// whole reveal: a 1M session's gauge fills smoothly 0->final% instead of resetting
// when effectiveContextLimit flips from 200k to 1M at the 200k boundary.
export function headerValues(
  session: SessionState,
  reveal: BeatSnap | null,
): { cost: number; ctxTokens: number; pct: number; limit: number } {
  const limit = effectiveContextLimit(session.model, session.tokens.contextTokens);
  if (!reveal) {
    return { cost: session.costUSD, ctxTokens: session.tokens.contextTokens, pct: session.tokens.contextPct, limit };
  }
  return { cost: reveal.cost, ctxTokens: reveal.ctxTokens, pct: limit > 0 ? reveal.ctxTokens / limit : 0, limit };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/headerReveal.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/headerReveal.ts tests/headerReveal.test.ts
git commit -m "feat(ui): cursorSnapshot + headerValues for cursor-synced header values"
```

---

### Task 4: Wire the header — render the value at the cursor

Render the header from `headerValues(session, reveal)`, and feed it the cursor snapshot through Showcase from App.

**Files:**
- Modify: `src/ui/Header.tsx:1-39`
- Modify: `src/ui/Showcase.tsx:8,17-40,55`
- Modify: `src/ui/App.tsx:93` (compute `reveal`), `App.tsx` `<Showcase>` props

- [ ] **Step 1: Render the header via `headerValues`**

In `src/ui/Header.tsx`:

(a) Replace the import on line 2:
```ts
import { effectiveContextLimit } from "../core/tokens";
```
with:
```ts
import { headerValues } from "./headerReveal";
```

(b) Change the type import on line 1 from:
```ts
import type { SessionState, PanelId } from "../core/types";
```
to:
```ts
import type { SessionState, PanelId, BeatSnap } from "../core/types";
```

(c) Replace the function signature + the value lines (lines 19-24):
```ts
export function Header({ session, panel, marker }: { session: SessionState; panel: PanelId; marker: string }) {
  const g = statusGlyph(session.status);
  const pct = session.tokens.contextPct;
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  const elapsed = fmtElapsed(Math.max(0, session.lastActivityTs - session.startedTs));
  const limit = effectiveContextLimit(session.model, session.tokens.contextTokens);
```
with:
```ts
export function Header({ session, panel, marker, reveal }: { session: SessionState; panel: PanelId; marker: string; reveal?: BeatSnap | null }) {
  const g = statusGlyph(session.status);
  const { cost, ctxTokens, pct, limit } = headerValues(session, reveal ?? null);
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  const elapsed = fmtElapsed(Math.max(0, session.lastActivityTs - session.startedTs));
```

(d) Replace the `fmtTokens` render line (line 38):
```ts
          <text fg={theme.dim}>{fmtTokens(session.tokens.contextTokens, limit)}</text>
```
with:
```ts
          <text fg={theme.dim}>{fmtTokens(ctxTokens, limit)}</text>
```

(e) Replace the `fmtCost` render line (line 39):
```ts
          <text fg={theme.ok}>{fmtCost(session.costUSD)}</text>
```
with:
```ts
          <text fg={theme.ok}>{fmtCost(cost)}</text>
```

(Lines 36-37 already use the local `pct`, which now comes from `headerValues` — no change needed there.)

- [ ] **Step 2: Thread `reveal` through Showcase**

In `src/ui/Showcase.tsx`:

(a) Change the type import on line 8 from:
```ts
import type { Beat } from "../core/types";
```
to:
```ts
import type { Beat, BeatSnap } from "../core/types";
```

(b) In the `Props` interface, after the `paletteGhost: string;` line, add:
```ts
  reveal: BeatSnap | null;   // cursor snapshot for the header's count-up animation
```

(c) In the destructured params of `export function Showcase({ ... }: Props)`, add `reveal` (e.g. after `paletteGhost`):
```ts
export function Showcase({ session, panel, presented, cursor, playerTotal, infoOn, lastAdvanceMs, intervalMs, animate, marker, width, height, commits, full, progress, filesSort, tasksHideDone, paletteOpen, paletteQuery, paletteGhost, reveal }: Props) {
```

(d) Replace the `<Header>` render (line 55):
```tsx
      <Header session={session} panel={panel} marker={marker} />
```
with:
```tsx
      <Header session={session} panel={panel} marker={marker} reveal={reveal} />
```

- [ ] **Step 3: Compute `reveal` in App and pass it to Showcase**

In `src/ui/App.tsx`:

(a) Add the import after the existing `usePlayers` / `headerSession` imports (near line 5):
```ts
import { cursorSnapshot } from "./headerReveal";
```

(b) After the `cursor` line (line 93: `const cursor = activePlayer ? activePlayer.cursor() : 0;`), add:
```ts
  // Snapshot of cumulative cost/ctx at the cursor — drives the header's count-up
  // during reveal/replay/scrub. null (no beats) -> header shows session totals.
  const reveal = activePlayer ? cursorSnapshot(activePlayer.all(), cursor) : null;
```

(c) In the `<Showcase ... />` JSX, add the prop (e.g. right after `paletteGhost={paletteGhost}`):
```tsx
          reveal={reveal}
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS. `Showcase` now requires `reveal`; App passes it. `Header.reveal` is optional.

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS (all tests green).

- [ ] **Step 6: Visual verification via tmux (agent has no TTY)**

Replay a large session and watch the header count up:

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 160 -y 42 "bun run dev"; sleep 6
tmux send-keys -t cl ":" && sleep 1 && tmux send-keys -t cl "sessions" Enter && sleep 1
# pick a long session, then press r to replay from the start
tmux send-keys -t cl "/" && sleep 0.5 && tmux send-keys -t cl "harness-flow" Enter && sleep 1
tmux send-keys -t cl Enter && sleep 1
tmux send-keys -t cl r && sleep 2
tmux capture-pane -t cl -p | head -2     # early in replay: low $ / low ctx%
sleep 6
tmux capture-pane -t cl -p | head -2     # later: higher $ / higher ctx%
tmux send-keys -t cl q
```

Expected: the two captures show the header `$cost` and `ctx%` **increasing** between them (counting up toward the totals) in step with the panels; the ctx gauge fills smoothly (no reset). At the end of the replay the header rests on the whole-session totals.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Header.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(ui): header cost/ctx count up with the cursor during reveal/replay"
```

---

## Self-Review

**Spec coverage:**
- Per-beat cumulative snapshot → Task 1 (type + `pushBeat` stamp).
- Coalescing keeps the later snapshot → Task 2.
- `cursorSnapshot` (value-at-cursor; 0 at start; null fallbacks) → Task 3.
- Stable limit (no 200k→1M gauge reset) → Task 3 `headerValues` + its dedicated test.
- Header renders value-at-cursor; additive (totals at head/when no reveal) → Task 4 + the `cursorSnapshot`-at-head and `headerValues`-without-reveal tests.
- Works for finished sessions → covered behaviorally: snapshots are produced by the full fold (Task 1 test folds a transcript), and App reads `activePlayer.all()` which is seeded from the full fold for both live and replay players.
- Field scope (`$cost` + `ctx%` only; elapsed/status/model unchanged) → Task 4 leaves `elapsed`, `status`, `model` reading `session` directly.
- Out-of-scope items (elapsed animation, per-lane snapshots, pacing/coalescing-rule/effectiveContextLimit changes) → not touched.

**Placeholder scan:** none — every code step shows complete code; every run step shows the exact command and expected result.

**Type consistency:** `BeatSnap { cost: number; ctxTokens: number }` defined in Task 1 (`types.ts`), imported in Task 3 (`headerReveal.ts`), Task 4 (`Header.tsx`, `Showcase.tsx`). `cursorSnapshot(beats: Beat[], cursor: number): BeatSnap | null` and `headerValues(session: SessionState, reveal: BeatSnap | null): { cost; ctxTokens; pct; limit }` defined in Task 3 and called identically in Task 4. `Header`'s `reveal?: BeatSnap | null` (Task 4) matches Showcase's `reveal: BeatSnap | null` prop and App's `reveal` (`BeatSnap | null` from `cursorSnapshot`). `snap` field name consistent across reducer (write), player (merge), `cursorSnapshot` (read).
