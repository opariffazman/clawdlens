# Session-Done Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New `done` status (✓) for sessions quiet ≥30 s after `end_turn`, surfaced in header + sessions picker; focus policy auto-replays them. Closes #23.

**Architecture:** Pure refinement of `deriveStatus` (status.ts) — the `end_turn` branch splits on a new `DONE_MS` threshold. UI is one `statusGlyph` case. The App focus seek policy already treats anything outside {running, working, waiting} as replay → `done` needs NO App change.

**Tech Stack:** Bun, TypeScript strict, bun:test.

**Branch:** `feat/session-done` off `main`.

---

### Task 1: `done` status in core

**Files:**
- Modify: `src/core/types.ts:49` (Status union)
- Modify: `src/core/status.ts`
- Test: `tests/status.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/status.test.ts`:

```ts
test("done after 30s quiet following end_turn", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 31_000 })).toBe("done");
});
test("still waiting just after end_turn", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 29_000 })).toBe("waiting");
});
test("mid-run stall without end_turn never reads done", () => {
  expect(deriveStatus({ ...base, ageMs: 31_000 })).toBe("working"); // existing fallthrough path
});
test("done yields to dormant when very stale", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 31 * 60_000 })).toBe("dormant");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/status.test.ts`
Expected: FAIL — `"done"` not returned (and TS may flag the literal until the union gains it).

- [ ] **Step 3: Implement** — in `src/core/types.ts` change:

```ts
export type Status = "running" | "working" | "waiting" | "done" | "idle" | "dormant" | "error";
```

In `src/core/status.ts` add the constant and split the end_turn branch:

```ts
export const DONE_MS = 30_000;
```

```ts
export function deriveStatus(i: StatusInput): Status {
  if (i.lastErrored) return "error";
  if (i.ageMs > DORMANT_MS) return "dormant";
  if (i.lastEntryType === "assistant" && i.lastStopReason === "end_turn") {
    return i.ageMs > DONE_MS ? "done" : "waiting";
  }
  if (i.pendingToolResult && i.ageMs <= IDLE_MS) return "running";
  if (i.ageMs <= WORKING_MS) return "working";
  if (i.ageMs > IDLE_MS) return "idle";
  return "working";
}
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/status.test.ts && bunx tsc --noEmit`
Expected: PASS, clean typecheck (statusGlyph default + Lens statusHex else-arm absorb the new member — no exhaustive switches on Status exist).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/status.ts tests/status.test.ts
git commit -m "feat(status): done status — end_turn + 30s quiet"
```

### Task 2: ✓ badge in the UI

**Files:**
- Modify: `src/ui/format.ts:4-13` (statusGlyph)
- Test: `tests/format.test.ts`

- [ ] **Step 1: Failing test** — append to `tests/format.test.ts`:

```ts
test("done gets a calm green check", () => {
  expect(statusGlyph("done")).toEqual({ glyph: "✓", color: "#5AF78E", pulse: false });
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/format.test.ts`
Expected: FAIL — falls to default `○`.

- [ ] **Step 3: Implement** — in `src/ui/format.ts` insert before the `dormant` case:

```ts
    case "done":    return { glyph: "✓", color: theme.ok, pulse: false };
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/format.test.ts`
Expected: PASS. Header badge + `:`→sessions picker rows + Lens HUD dot (statusHex else-arm → ok green) all inherit.

- [ ] **Step 5: Commit**

```bash
git add src/ui/format.ts tests/format.test.ts
git commit -m "feat(ui): ✓ badge for done sessions"
```

### Task 3: Verify behavior + docs + ship

**Files:**
- Modify: `CLAUDE.md` (status list line)

- [ ] **Step 1: Confirm no-change sites** — read, do not edit:
  - `src/ui/App.tsx:85`: `active` checks running/working/waiting explicitly → `done` lands in the `replay()` branch. Exactly the spec.
  - `src/ui/Menu.tsx:14` `projectsOf` live count: running/working only → done not "live". Correct.

- [ ] **Step 2: Full gates**

Run: `bunx tsc --noEmit && bun test`
Expected: all green.

- [ ] **Step 3: Visual tmux check** (no TTY for the agent):

```bash
tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 5; tmux capture-pane -t cl -p | head -3
```

Expected: header shows `✓ done` for a finished session (this very session's previous transcripts qualify). Then `tmux kill-session -t cl`.

- [ ] **Step 4: Update CLAUDE.md** — in the Architecture block, `status.ts` line: change `(running/working/waiting/idle/dormant/error)` to `(running/working/waiting/done/idle/dormant/error)`.

- [ ] **Step 5: Commit + PR**

```bash
git add CLAUDE.md
git commit -m "docs: status list gains done"
git push -u origin feat/session-done
gh pr create --title "feat: session-done detection (✓ after 30s quiet end_turn)" --body "Closes #23. Spec: docs/superpowers/specs/2026-06-11-session-done-detection-design.md"
```

Merge after CI green: `gh pr merge --squash --delete-branch`.
