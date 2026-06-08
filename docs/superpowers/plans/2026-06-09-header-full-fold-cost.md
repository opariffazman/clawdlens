# Header Full-Fold Cost/Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the header's cumulative `$cost` and elapsed timer reflect the **whole** watched session instead of the 64 KB backfill tail, while keeping `status` and `ctx%` live.

**Architecture:** Approach B (field-level merge), refined. `App.tsx` already folds the selected session's whole transcript every activity tick for the player (`selectedFullBeats` memo) and discards all but `beats`. Repurpose that memo to keep the whole `SessionState`, feed `.beats` to the player as before, and merge its cumulative `costUSD` + `startedTs` into the live `session` via a new pure `mergeHeaderSession` helper. Live fields (`status`, `contextPct`) stay sourced from the live `session`. No store/loadSession change, no new fold; same per-selected-session bound PR #11 established.

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · React 19 · `@opentui/react` · `bun:test`. Spec: `docs/superpowers/specs/2026-06-09-header-full-fold-cost-design.md`.

## File Structure

- **Create `src/ui/headerSession.ts`** — one pure function `mergeHeaderSession(live, full)`. Its only job: graft whole-session `costUSD`/`startedTs` onto a live session, null-safe. Pure → unit-tested directly.
- **Create `tests/header-cost.test.ts`** — core contract: full fold's cumulative cost exceeds the backfill window's (the undercount the UI fix routes around). Deferred PR #11 test item 2.
- **Create `tests/headerSession.test.ts`** — the merge seam: cost/startedTs from full, status/ctx from live; null handling.
- **Modify `src/ui/App.tsx`** — repurpose the `selectedFullBeats` memo into `selectedFull` (whole `SessionState`); pass `.beats` to `usePlayers`; pass `mergeHeaderSession(selected, selectedFull)` as Showcase's `session` prop.

No other files change. `Header.tsx`, `Showcase.tsx`, `usePlayers.ts`, the store, `loadTranscript.ts`, and the reducer are untouched.

---

### Task 1: Core contract — full fold's cumulative cost beats the backfill window

Locks the behavioral contract the UI fix depends on: the whole-transcript fold recovers
cumulative cost (and input tokens) that the 64 KB backfill window drops when a large
metadata entry crowds the tail. Passes against existing code (`loadSession` already folds
the whole file) — it is a regression guard, mirroring PR #11's `backfill-crowding` test.

**Files:**
- Create: `tests/header-cost.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/header-cost.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSession } from "../src/core/loadTranscript";
import { createTailer } from "../src/core/tailer";
import { parseLine } from "../src/core/parse";
import { newSession, applyEntry } from "../src/core/reducer";
import type { SessionState } from "../src/core/types";

// Two assistant turns carrying usage, separated by a ~70 KB metadata entry. The
// store's first read folds only the last 64 KB (tailer tailBytes), which lands
// inside the metadata blob — so the byte window sees only the SECOND (small)
// turn. The full fold sums BOTH turns -> higher cumulative cost. This is exactly
// the header cost undercount the UI fix routes around.
function writeCostTranscript(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "hf-cost-"));
  const file = join(dir, "s.jsonl");
  const big = "x".repeat(70000);
  const lines = [
    JSON.stringify({ type: "assistant", cwd: "/r", message: { model: "claude-opus-4-8", usage: { input_tokens: 100000, output_tokens: 50000 }, content: [{ type: "text", text: "early" }] } }),
    JSON.stringify({ type: "file-history-snapshot", snapshot: big }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: "text", text: "late" }] } }),
  ];
  writeFileSync(file, lines.join("\n") + "\n");
  return { dir, file };
}

function foldLines(file: string, lines: string[]): SessionState {
  let s = newSession("bf", file);
  for (const raw of lines) { const e = parseLine(raw); if (e) s = applyEntry(s, e, 0); }
  return s;
}

test("full fold recovers cumulative cost the 64 KB backfill window drops", () => {
  const { dir, file } = writeCostTranscript();

  const full = loadSession(file);
  const backfill = foldLines(file, createTailer().read(file, { tailBytes: 65536 }));

  // Full fold sums both turns; the backfill window sees only the late small turn.
  expect(full.tokens.input).toBe(101000);
  expect(backfill.tokens.input).toBe(1000);
  expect(full.costUSD).toBeGreaterThan(backfill.costUSD);
  expect(backfill.costUSD).toBeGreaterThan(0); // model present on the late turn -> cost computed

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run the test to verify it passes against the existing full-fold path**

Run: `bun test tests/header-cost.test.ts`
Expected: PASS. `loadSession` already folds the whole file (input 101000); the tailer
window drops the mid-line metadata fragment and sees only the late turn (input 1000). No
code change — this locks the full-fold-vs-backfill cost contract the UI fix relies on.

- [ ] **Step 3: Commit**

```bash
git add tests/header-cost.test.ts
git commit -m "test(core): full fold recovers cumulative cost the backfill window drops"
```

---

### Task 2: `mergeHeaderSession` — graft whole-session cost/elapsed onto the live session

The pure seam. Returns the live session's fields (status, ctx) but the full fold's
cumulative `costUSD` and true `startedTs`. Unit-tested directly, no React tree.

**Files:**
- Create: `tests/headerSession.test.ts`
- Create: `src/ui/headerSession.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/headerSession.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mergeHeaderSession } from "../src/ui/headerSession";
import { newSession } from "../src/core/reducer";
import type { SessionState } from "../src/core/types";

function sess(over: Partial<SessionState>): SessionState {
  return { ...newSession("x", "x.jsonl"), ...over };
}

test("mergeHeaderSession takes cost+startedTs from full, status+ctx from live", () => {
  const live = sess({
    status: "running", costUSD: 12, startedTs: 5000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.7, contextTokens: 700000 },
  });
  const full = sess({
    status: "idle", costUSD: 511, startedTs: 1000,
    tokens: { ...newSession("x", "x.jsonl").tokens, contextPct: 0.1, contextTokens: 100 },
  });

  const m = mergeHeaderSession(live, full)!;
  expect(m.costUSD).toBe(511);             // cumulative -> from full
  expect(m.startedTs).toBe(1000);          // whole-session start -> from full
  expect(m.status).toBe("running");        // live (full fold never derives status)
  expect(m.tokens.contextPct).toBe(0.7);   // live (absolute, already correct)
  expect(m.tokens.contextTokens).toBe(700000);
});

test("mergeHeaderSession passes the live session through when full is null", () => {
  const live = sess({ costUSD: 12 });
  expect(mergeHeaderSession(live, null)).toBe(live); // not yet folded -> live unchanged
});

test("mergeHeaderSession returns null when there is no live session", () => {
  expect(mergeHeaderSession(null, sess({ costUSD: 511 }))).toBe(null);
});

test("mergeHeaderSession keeps live.startedTs when full.startedTs is 0", () => {
  const live = sess({ startedTs: 5000 });
  const full = sess({ startedTs: 0, costUSD: 99 });
  const m = mergeHeaderSession(live, full)!;
  expect(m.startedTs).toBe(5000); // empty fold -> keep the live start
  expect(m.costUSD).toBe(99);     // cost still grafted from full
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/headerSession.test.ts`
Expected: FAIL — `mergeHeaderSession` is not exported / not a function.

- [ ] **Step 3: Implement `mergeHeaderSession`**

Create `src/ui/headerSession.ts`:

```ts
import type { SessionState } from "../core/types";

// The header's cumulative fields (costUSD, and startedTs -> elapsed) must reflect
// the WHOLE session, but the live store seeds only a 64 KB backfill window, so
// they undercount the tail (see docs/superpowers/specs/2026-06-09-header-full-fold-cost-design.md).
// Graft those two fields from the full-transcript fold (`full`) while keeping every
// LIVE field (status, contextPct/contextTokens) from the live session: the full fold
// never runs deriveStatus, so its status stays "idle" and must not drive the badge.
// The full fold is a superset of the backfill window, so full.costUSD >= live.costUSD
// always — the override never lowers the displayed cost.
export function mergeHeaderSession(
  live: SessionState | null,
  full: SessionState | null,
): SessionState | null {
  if (!live || !full) return live;
  return {
    ...live,
    costUSD: full.costUSD,
    startedTs: full.startedTs > 0 ? full.startedTs : live.startedTs,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/headerSession.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors). The helper is pure and self-contained; App is wired in Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/ui/headerSession.ts tests/headerSession.test.ts
git commit -m "feat(ui): mergeHeaderSession grafts whole-session cost/elapsed onto live session"
```

---

### Task 3: Wire `App.tsx` — full-fold cost into the header, beats unchanged

Repurpose the existing per-activity full-fold memo to keep the whole `SessionState`, feed
its `.beats` to the player (no behavior change), and route the header through
`mergeHeaderSession`.

**Files:**
- Modify: `src/ui/App.tsx:5` (import), `src/ui/App.tsx:63-71` (memo + players), `src/ui/App.tsx:233` (Showcase `session` prop)

- [ ] **Step 1: Import `mergeHeaderSession`**

In `src/ui/App.tsx`, after line 5 (`import { usePlayers } from "./usePlayers";`), add:

```ts
import { mergeHeaderSession } from "./headerSession";
```

- [ ] **Step 2: Repurpose the memo to keep the whole SessionState; seed the player from `.beats`**

In `src/ui/App.tsx`, find (lines 63-71):

```ts
  // The live store keeps only a 64 KB backfill window per session, which large
  // metadata entries can fill entirely (0 beats). Fold the FULL transcript for
  // the selected session — re-folding only on switch or new activity — and seed
  // the player from it, the same source replay and the aggregate panels use.
  const selectedFullBeats = useMemo(
    () => (selected ? store.fullBeats(selected.id) : []),
    [selected?.id, selected?.lastActivityTs, store],
  );
  const players = usePlayers(sessions, selected?.id ?? null, selectedFullBeats);
```

Replace with:

```ts
  // The live store keeps only a 64 KB backfill window per session, which large
  // metadata entries can fill entirely (0 beats) and which undercounts cumulative
  // cost. Fold the FULL transcript for the selected session — re-folding only on
  // switch or new activity — and use it for BOTH the player's beats and the
  // header's whole-session cost/elapsed. The same source replay + aggregate panels use.
  const selectedFull = useMemo(
    () => (selected ? store.fullSession(selected.id) : null),
    [selected?.id, selected?.lastActivityTs, store],
  );
  const players = usePlayers(sessions, selected?.id ?? null, selectedFull?.beats ?? []);
  // Header cumulative fields (cost, elapsed) from the full fold; status/ctx stay live.
  const headerSession = mergeHeaderSession(selected, selectedFull);
```

- [ ] **Step 3: Route the header through the merged session**

In `src/ui/App.tsx`, find the `<Showcase>` prop (line 233):

```tsx
          session={selected}
```

Change to:

```tsx
          session={headerSession}
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors). `selectedFull?.beats ?? []` is `Beat[]` (matches `usePlayers`'s
3rd arg); `mergeHeaderSession` returns `SessionState | null` (matches Showcase's
`session: SessionState | null` prop).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: PASS (all tests green, including the new `header-cost` and `headerSession` tests).

- [ ] **Step 6: Visual verification via tmux (agent has no TTY)**

The fix shows against a long session. Launch, open the session picker, select a large
session, and read the header:

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 5
tmux send-keys -t cl ":" && sleep 1 && tmux send-keys -t cl "sessions" Enter && sleep 1
tmux capture-pane -t cl -p
```

Expected: the header `$cost` reflects the **whole** session (much larger than the
backfill-only value — for a long session, dollars not cents), the status badge is correct
(running/working on an active session — never wrongly `idle`), and `ctx%` is unchanged.
Scrub with `↑`/`↓` to confirm beats still advance. Quit: `tmux send-keys -t cl q`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/App.tsx
git commit -m "fix(ui): header cost/elapsed from full-fold for the watched session

The header read cumulative costUSD and startedTs from the 64 KB backfill
window, undercounting a long session's cost (~40x on a 3.9 MB transcript)
and its elapsed timer. Reuse the per-activity full-fold memo (already folded
for the player's beats) to graft whole-session cost/elapsed via
mergeHeaderSession, keeping status and ctx% live. Closes #12."
```

---

## Self-Review

**Spec coverage:**
- Header `$cost` reflects the whole session → Task 3 (merged session) + Task 2 (merge takes
  `costUSD` from full) + Task 1 (full-fold cost > backfill contract).
- `status` stays live/correct, never wrongly idle → Task 2 keeps `status` from `live`;
  asserted (`m.status === "running"` while full is `idle`).
- `contextPct` stays live, infers 1M correctly → Task 2 keeps `tokens` from `live` (unchanged
  object, `effectiveContextLimit` untouched); asserted (`contextPct === 0.7`).
- No unbounded startup cost; unselected sessions don't full-fold → only `selectedFull` folds,
  keyed on `(id, lastActivityTs)` — same bound as PR #11's `selectedFullBeats`
  (`store.fullBeats`/`store.fullSession` are the same `loadSession` call).
- Elapsed undercount (approved addition) → Task 2 grafts `startedTs` (guarded `>0`); asserted.
- typecheck clean / tests green / tmux visual → Task 3 steps 4-6.
- 1M-context gotcha preserved → no `tokens`/`effectiveContextLimit` change (spec "Out of scope").

**Placeholder scan:** none — every code step shows complete code; every run step shows the
exact command and expected result.

**Type consistency:** `mergeHeaderSession(live: SessionState | null, full: SessionState | null): SessionState | null`
is defined in Task 2 and called with `(selected, selectedFull)` in Task 3. `selectedFull`
is `SessionState | null` (from `store.fullSession`); `selectedFull?.beats ?? []` is `Beat[]`,
matching `usePlayers`'s 3rd argument (`Beat[]`, unchanged from PR #11). Showcase's `session`
prop is `SessionState | null` (`Showcase.tsx:18`), matching `headerSession`. `SessionState`/`Beat`
imported from `../core/types` consistently across tests and source.
