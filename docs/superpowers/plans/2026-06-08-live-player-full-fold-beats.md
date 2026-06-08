# Live Player Full-Fold Beats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live Lens/Flow player source its beats from the full transcript fold (like replay and the aggregate panels already do) so sessions whose 64 KB tail is all metadata no longer show 0 beats.

**Architecture:** Keep the byte-bounded backfill ONLY as cheap list metadata (status/title/ctx). For the *selected* session, fold the whole transcript (`store.fullBeats`) memoized on `(id, lastActivityTs)` and seed the live player from that. Unselected sessions are untouched (their players never tick or render). Optionally route the header's token/cost display through the full-fold state so the watched session's cumulative cost is correct too.

**Tech Stack:** Bun · TypeScript (strict) · React 19 · `@opentui/react` · `bun:test`. Spec: `docs/superpowers/specs/2026-06-08-live-player-full-fold-beats-design.md`.

---

### Task 1: Regression test — full fold beats survive a metadata-crowded tail

Proves the root cause and the fix path in pure core: a transcript whose last 64 KB is one large metadata entry yields beats under the full fold but **zero** beats under the byte-backfill window (the exact path `sessionStore` uses on first read).

**Files:**
- Create: `tests/backfill-crowding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/backfill-crowding.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBeats } from "../src/core/loadTranscript";
import { createTailer } from "../src/core/tailer";
import { parseLine } from "../src/core/parse";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Beat } from "../src/core/types";

// A transcript with two real assistant turns followed by one ~70 KB metadata
// entry. The store's first read only folds the last 64 KB (tailer tailBytes),
// which lands inside the metadata blob — so the byte window sees no assistant
// entries and produces 0 beats. The full fold must still recover both beats.
function writeCrowdedTranscript(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "hf-crowd-"));
  const file = join(dir, "s.jsonl");
  const big = "x".repeat(70000);
  const lines = [
    JSON.stringify({ type: "assistant", cwd: "/r", message: { model: "claude-opus-4-8", content: [{ type: "thinking", thinking: "plan" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
    JSON.stringify({ type: "file-history-snapshot", snapshot: big }),
  ];
  writeFileSync(file, lines.join("\n") + "\n");
  return { dir, file };
}

function foldLines(lines: string[]): Beat[] {
  let s = newSession("w", "f");
  for (const raw of lines) {
    const e = parseLine(raw);
    if (e) s = applyEntry(s, e, 0);
  }
  return s.beats;
}

test("full fold recovers beats that the 64 KB backfill window crowds out", () => {
  const { dir, file } = writeCrowdedTranscript();

  // Full fold: both assistant turns become beats.
  const full = loadBeats(file);
  expect(full.length).toBe(2);
  expect(full[0]!.kind).toBe("thinking");
  expect(full[1]!.label).toBe("says");

  // Byte-backfill window (the store's first-read path): metadata crowds out
  // every assistant entry -> 0 beats. This is the bug the fix routes around.
  const backfillLines = createTailer().read(file, { tailBytes: 65536 });
  const backfillBeats = foldLines(backfillLines);
  expect(backfillBeats.length).toBe(0);

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it passes against the existing full-fold path**

Run: `bun test tests/backfill-crowding.test.ts`
Expected: PASS. `loadBeats` already folds the whole file (full=2); the tailer window already yields 0. This test does not require a code change — it locks in the behavioral contract the UI fix depends on (full fold ≠ backfill window) so a future regression in either path is caught.

- [ ] **Step 3: Commit**

```bash
git add tests/backfill-crowding.test.ts
git commit -m "test(core): full fold recovers beats a metadata-crowded backfill window drops"
```

---

### Task 2: Seed the selected player from full beats (`usePlayers`)

Extract the player-seeding loop into a pure, testable helper and route the selected session's beats through an explicit `selectedFullBeats` argument.

**Files:**
- Modify: `src/ui/usePlayers.ts`
- Create: `tests/usePlayers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/usePlayers.test.ts`:

```ts
import { test, expect } from "bun:test";
import { seedPlayers } from "../src/ui/usePlayers";
import { createPlayer } from "../src/core/player";
import { newSession } from "../src/core/reducer";
import type { Beat, SessionState } from "../src/core/types";

function beat(kind: Beat["kind"], label: string): Beat {
  return { id: `${label}`, kind, iconKey: "text", label, lane: "main", ts: 0, count: 1 };
}

function session(id: string, beats: Beat[]): SessionState {
  return { ...newSession(id, `${id}.jsonl`), beats };
}

test("seedPlayers seeds the SELECTED player from full beats, not its backfill beats", () => {
  const players = new Map<string, ReturnType<typeof createPlayer>>();
  const sessions = [session("a", []), session("b", [beat("text", "b-backfill")])];
  const fullBeats = [beat("thinking", "t1"), beat("tool", "t2"), beat("text", "t3")];

  // "a" is selected but its backfill beats are empty (the crowded-tail case).
  seedPlayers(players, sessions, "a", fullBeats);

  expect(players.get("a")!.all().length).toBe(3); // used fullBeats, not []
  expect(players.get("b")!.all().length).toBe(1); // unselected -> its own backfill
});

test("seedPlayers reuses existing players across calls (stable identity)", () => {
  const players = new Map<string, ReturnType<typeof createPlayer>>();
  const sessions = [session("a", [])];
  seedPlayers(players, sessions, "a", [beat("text", "x")]);
  const first = players.get("a");
  seedPlayers(players, sessions, "a", [beat("text", "x"), beat("text", "y")]);
  expect(players.get("a")).toBe(first); // same player instance, re-seeded
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/usePlayers.test.ts`
Expected: FAIL with `seedPlayers` is not exported / not a function.

- [ ] **Step 3: Implement `seedPlayers` and rewire `usePlayers`**

Replace the entire contents of `src/ui/usePlayers.ts` with:

```ts
import { useEffect, useRef, useState } from "react";
import { createPlayer } from "../core/player";
import type { Beat, SessionState } from "../core/types";

type Player = ReturnType<typeof createPlayer>;

// Seed one player per session. The SELECTED session is seeded from the full
// transcript fold (selectedFullBeats) — the live store's per-session beats are
// only a 64 KB backfill window and can be empty when large metadata entries
// crowd the tail (see tests/backfill-crowding.test.ts). Unselected sessions
// keep their backfill beats; their players never tick or render.
export function seedPlayers(
  players: Map<string, Player>,
  sessions: SessionState[],
  selectedId: string | null,
  selectedFullBeats: Beat[],
): void {
  for (const s of sessions) {
    let p = players.get(s.id);
    if (!p) { p = createPlayer(); players.set(s.id, p); }
    p.setBeats(s.id === selectedId ? selectedFullBeats : s.beats);
  }
}

export function usePlayers(sessions: SessionState[], selectedId: string | null, selectedFullBeats: Beat[]) {
  const players = useRef(new Map<string, Player>());
  const [, force] = useState(0);

  seedPlayers(players.current, sessions, selectedId, selectedFullBeats);

  // animation/pacing tick (~10/s) — advances the live head, triggers re-render
  useEffect(() => {
    const id = setInterval(() => {
      const p = selectedId ? players.current.get(selectedId) : null;
      if (p) p.tick(Date.now());
      force((v) => (v + 1) & 0xffff);
    }, 100);
    return () => clearInterval(id);
  }, [selectedId]);

  return players.current;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/usePlayers.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck (App still calls the old 2-arg signature — expect an error here, fixed in Task 3)**

Run: `bunx tsc --noEmit`
Expected: ONE error in `src/ui/App.tsx` — `Expected 3 arguments, but got 2` at the `usePlayers(...)` call. This is expected and resolved in Task 3. (If any OTHER error appears, stop and investigate.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/usePlayers.ts tests/usePlayers.test.ts
git commit -m "feat(ui): seed selected live player from full beats via seedPlayers"
```

---

### Task 3: Compute `selectedFullBeats` in App and pass it to `usePlayers`

Fold the selected session's full transcript, memoized so it re-folds only on session-switch or new activity, and feed it to the player.

**Files:**
- Modify: `src/ui/App.tsx:1` (add `useMemo` import)
- Modify: `src/ui/App.tsx:62-63` (compute memo, update call)

- [ ] **Step 1: Add `useMemo` to the React import**

In `src/ui/App.tsx` line 1, change:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
```

to:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Compute `selectedFullBeats` and pass it to `usePlayers`**

In `src/ui/App.tsx`, find (lines 62-63):

```ts
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
  const players = usePlayers(sessions, selected?.id ?? null);
```

Replace with:

```ts
  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
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

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS (no errors). The Task 2 signature error is now resolved.

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: PASS (all tests green).

- [ ] **Step 5: Visual verification via tmux (agent has no TTY)**

The bug only shows against a real metadata-crowded transcript. Verify the selected session now renders beats:

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 5
tmux send-keys -t cl ":" && sleep 1 && tmux send-keys -t cl "sessions" Enter && sleep 1
tmux capture-pane -t cl -p
```

Expected: the Lens pipeline shows think→tool→result→chat activity and the HUD shows `beats N/M` with N/M > 0 for an active session (previously 0/0 on a crowded-tail session). Drive `↑`/`↓` to scrub and confirm beats advance. Quit with `tmux send-keys -t cl q`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.tsx
git commit -m "fix(ui): fold full transcript for selected session's live player

Sessions whose last 64 KB are all metadata (file-history-snapshot,
attachment, worktree-state) showed 0 beats because the live player read
the byte-bounded backfill window. Source the selected session's beats
from the full fold instead, memoized on (id, lastActivityTs) so only the
watched session re-folds and only on new activity."
```

---

### Task 4 (OPTIONAL — same root cause): correct header token/cost for the watched session

The header reads cumulative `costUSD` from the backfill `session`, so the watched session's cost is undercounted to the tail. Route the header through the full-fold state Showcase already computes (`agg = full ?? session`). Skippable: it does not affect beats and only improves cost accuracy on panels where `full` is populated (lens/files/tasks/git).

**Files:**
- Modify: `src/ui/Showcase.tsx:55`

- [ ] **Step 1: Route the header through `agg`**

In `src/ui/Showcase.tsx`, `agg` is already defined (line 49: `const agg = full ?? session;`). Find line 55:

```tsx
      <Header session={session} panel={panel} marker={marker} />
```

Change to:

```tsx
      <Header session={agg} panel={panel} marker={marker} />
```

- [ ] **Step 2: Typecheck and test**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS. `agg` is a `SessionState` (same type as `session`), so Header's props are unchanged.

- [ ] **Step 3: Visual verification via tmux**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 5
tmux send-keys -t cl ":" && sleep 1 && tmux send-keys -t cl "sessions" Enter && sleep 1
tmux capture-pane -t cl -p
```

Expected: on the Lens/Files/Tasks/Git panel the header `$cost` reflects the whole session (higher than the backfill-only value), and ctx% is unchanged. Quit with `tmux send-keys -t cl q`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Showcase.tsx
git commit -m "fix(ui): header tokens/cost from full-fold state for selected session"
```

---

## Self-Review

**Spec coverage:**
- Root cause (byte window crowds out beats) → Task 1 locks the contract; Task 3 fixes the live player.
- "Source selected player's beats from full fold, refreshed on (id, lastActivityTs)" → Task 3 memo.
- "Keep byte backfill only as list metadata" → no store/tailer change; verified by leaving `sessionStore.ts`/`tailer.ts` untouched.
- "Unselected sessions keep cheap reads / bounded startup" → Task 2 `seedPlayers` seeds unselected from `s.beats`; only the selected id folds.
- Token/cost undercount (same root cause, marked optional in spec) → Task 4.
- Testing plan items 1 (regression fixture) and 3 (wiring seam) → Tasks 1 and 2. Spec test item 2 (token correctness core test) is covered behaviorally by Task 1's full-vs-backfill contract and Task 4's visual check; a dedicated cumulative-token unit test is omitted to avoid a redundant fixture.
- Out-of-scope items (semantic backfill rewrite, panel live-refresh, discovery/status/pacing changes) → not touched.

**Placeholder scan:** none — every code step shows complete code; every run step shows the exact command and expected result.

**Type consistency:** `seedPlayers(players: Map<string, Player>, sessions: SessionState[], selectedId: string | null, selectedFullBeats: Beat[])` is defined in Task 2 and called identically by `usePlayers`; `usePlayers(sessions, selectedId, selectedFullBeats)` (3 args) defined in Task 2 and called with 3 args in Task 3. `Beat`/`SessionState` imported from `../core/types` consistently. `store.fullBeats(id): Beat[]` matches the memo's declared `Beat[]`. `agg` (Task 4) is `SessionState`, matching `Header`'s existing `session` prop type.
