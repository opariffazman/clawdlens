# Error Markers + Jump-to-Error Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Error beats (`ok === false`) render as red ✗ nodes in Flow and ✖ ticks on the Lens timeline axis; `e`/`E` jump the cursor to next/prev error. Closes #22.

**Architecture:** Player coalescing learns to never merge error beats (they stay singular nodes = stable jump targets); new `jumpError(dir)` on the player; keymap actions `error-next`/`error-prev`; render touches are one glyph branch in Flow and an `errors` array on `lensTimeline`.

**Tech Stack:** Bun, TypeScript strict, bun:test.

**Branch:** `feat/error-markers` off `main` (after ctx-breakdown merges).

---

### Task 1: Player — error-preserving coalescing + jumpError

**Files:**
- Modify: `src/core/player.ts` (rebuild merge condition, jumpError)
- Test: `tests/player.test.ts`

- [ ] **Step 1: Failing tests** — append to `tests/player.test.ts` (the local `beat` helper takes `(id, label, kind)`; spread `ok` manually):

```ts
test("an error beat breaks coalescing — stays a singular node", () => {
  const p = createPlayer();
  p.setBeats([beat("1"), { ...beat("2"), ok: false }, beat("3")]);
  drain(p, 0, 10_000, 200);
  expect(p.all().length).toBe(3); // would be 1 without the error split
  expect(p.all()[1]!.ok).toBe(false);
});

test("jumpError lands the cursor on the next/prev error and pauses", () => {
  const p = createPlayer();
  p.setBeats([beat("0", "L0"), { ...beat("1", "L1"), ok: false }, beat("2", "L2"), { ...beat("3", "L3"), ok: false }, beat("4", "L4")]);
  p.replay(); p.tick(0); // cursor 0
  expect(p.jumpError(1)).toBe(true);
  expect(p.cursor()).toBe(2); // error at index 1 revealed at head
  expect(p.mode()).toBe("paused");
  expect(p.jumpError(1)).toBe(true);
  expect(p.cursor()).toBe(4);
  expect(p.jumpError(1)).toBe(false); // no wrap
  expect(p.cursor()).toBe(4);
  expect(p.jumpError(-1)).toBe(true);
  expect(p.cursor()).toBe(2);
  expect(p.jumpError(-1)).toBe(false); // none before
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/player.test.ts`
Expected: FAIL — 3-beat run coalesces to fewer nodes / `jumpError` missing. (Note: the first test's beats share label only if built identically — the default `beat(id)` label is `"Bash"`, so all three merge today.)

- [ ] **Step 3: Implement** — `src/core/player.ts` `rebuild()` merge condition becomes:

```ts
      if (last && last.kind === b.kind && last.label === b.label && last.lane === b.lane && last.ok !== false && b.ok !== false) {
```

Add to the returned object (after `stepForward`):

```ts
    jumpError(dir: 1 | -1): boolean {
      const head = cursor - 1;
      if (dir > 0) {
        for (let i = head + 1; i < coalesced.length; i++) {
          if (coalesced[i]!.ok === false) { cursor = i + 1; pause(); return true; }
        }
      } else {
        for (let i = head - 1; i >= 0; i--) {
          if (coalesced[i]!.ok === false) { cursor = i + 1; pause(); return true; }
        }
      }
      return false;
    },
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/player.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/player.ts tests/player.test.ts
git commit -m "feat(player): error beats stay singular; jumpError(dir) seeks them"
```

### Task 2: lensTimeline error ticks (core)

**Files:**
- Modify: `src/core/lens-bands.ts` (LensTimeline.errors)
- Test: `tests/lens-bands.test.ts`

- [ ] **Step 1: Failing test** — append:

```ts
test("lensTimeline surfaces error beat timestamps", () => {
  const beats = [beat({ id: "a", ts: 100 }), beat({ id: "b", ts: 200, ok: false }), beat({ id: "c", ts: 300 })];
  expect(lensTimeline(beats, 3).errors).toEqual([{ ts: 200 }]);
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/lens-bands.test.ts`
Expected: FAIL — `errors` undefined.

- [ ] **Step 3: Implement** — `src/core/lens-bands.ts`: `LensTimeline` interface gains:

```ts
  errors: { ts: number }[];
```

In `lensTimeline` before the return:

```ts
  const errors = beats.filter((b) => b.ok === false).map((b) => ({ ts: b.ts }));
```

and return `{ range, skills, agents, milestones, errors }`.

- [ ] **Step 4: Verify pass**

Run: `bun test tests/lens-bands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens-bands.ts tests/lens-bands.test.ts
git commit -m "feat(lens): lensTimeline exposes error ticks"
```

### Task 3: Keys — `e`/`E` + palette + dispatcher

**Files:**
- Modify: `src/ui/keymap.ts`
- Modify: `src/core/commands.ts` (registry)
- Modify: `src/ui/App.tsx` (runCommand + dispatcher)
- Modify: `src/ui/Menu.tsx` (helpRows)
- Test: `tests/keymap.test.ts`

- [ ] **Step 1: Failing test** — append to `tests/keymap.test.ts`:

```ts
test("error jump keys", () => {
  expect(a("e")).toEqual({ type: "error-next" });
  expect(a("e", { shift: true })).toEqual({ type: "error-prev" });
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/keymap.test.ts`
Expected: FAIL — `e` maps to null.

- [ ] **Step 3: Implement** — `src/ui/keymap.ts`: `Action` union adds

```ts
  | { type: "error-next" } | { type: "error-prev" }
```

`mapKey` adds (before the `return null`):

```ts
  if (n === "e") return key.shift ? { type: "error-prev" } : { type: "error-next" };
```

`src/core/commands.ts` registry — insert after `play.live`:

```ts
  { id: "errors.next", title: "Next Error", aliases: ["error", "errors"] },
  { id: "errors.prev", title: "Prev Error", aliases: ["error-prev"] },
```

`src/ui/App.tsx` `runCommand` — after the `play.live` case:

```ts
      case "errors.next": player?.jumpError(1); break;
      case "errors.prev": player?.jumpError(-1); break;
```

keyboard dispatcher switch — after `case "live"`:

```ts
      case "error-next": player?.jumpError(1); break;
      case "error-prev": player?.jumpError(-1); break;
```

`src/ui/Menu.tsx` `helpRows` — after the `h6b` (jump to live) row:

```ts
    { id: "h6c", left: "jump to next / prev error", right: "e / E" },
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/keymap.test.ts && bunx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/keymap.ts src/core/commands.ts src/ui/App.tsx src/ui/Menu.tsx tests/keymap.test.ts
git commit -m "feat(keys): e/E jump to next/prev error (+palette commands)"
```

### Task 4: Render — Flow ✗ node + Lens axis ✖ ticks

**Files:**
- Modify: `src/ui/panels/Flow.tsx` (node glyph + label color order)
- Modify: `src/ui/panels/lens/skillTimeline.ts` (axis ticks)

- [ ] **Step 1: Flow node** — `src/ui/panels/Flow.tsx`: the labelColor ternary currently checks `focused` before `ok === false`, so a focused error reads white; reorder error first:

```ts
          const labelColor = RGBA.fromHex(
            b.ok === false ? theme.err : b.kind === "skill" ? theme.accent : theme.fg,
          );
```

(non-focused, non-error labels were `theme.fg` in both arms — the `focused` distinction was dead for color; dim grey comes from the wire/icon, not the label.) Node glyph line becomes:

```ts
          buffer.setCell(x, y, b.ok === false ? "✗" : focused ? "◉" : "○", b.ok === false ? RGBA.fromHex(theme.err) : iconColor, bg);
```

- [ ] **Step 2: Lens axis ticks** — `src/ui/panels/lens/skillTimeline.ts`: in `drawSkillTimeline`, after the axis `─` loop and BEFORE the milestone loop (milestones overwrite on collision — rarer signal wins the cell):

```ts
  for (const er of tl.errors) {
    if (er.ts > tl.range.cursorTs) continue;
    put(buf, trackX + tsToX(er.ts, tl.range, trackW), ay, "✖", RGBA.fromHex(theme.err), w, h);
  }
```

- [ ] **Step 3: Full gates**

Run: `bunx tsc --noEmit && bun test`
Expected: all green.

- [ ] **Step 4: Visual tmux check**

```bash
tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 5
tmux send-keys -t cl Tab Tab Tab Tab   # Log panel
sleep 1; tmux capture-pane -t cl -p | grep "✗"
tmux send-keys -t cl e; sleep 1; tmux capture-pane -t cl -p | head -3
```

Expected: red ✗ node(s) on a session with a failed tool call; `e` moves the marker (`⏸ n/N`). Then `tmux kill-session -t cl`.

- [ ] **Step 5: CLAUDE.md keys line** — in `## Keys` add after the `l` entry: `` `e`/`E` jump next/prev error ``.

- [ ] **Step 6: Commit + PR**

```bash
git add src/ui/panels/Flow.tsx src/ui/panels/lens/skillTimeline.ts CLAUDE.md
git commit -m "feat(ui): red error markers in Flow + lens timeline"
git push -u origin feat/error-markers
gh pr create --title "feat: error markers + e/E jump-to-error" --body "Closes #22. Spec: docs/superpowers/specs/2026-06-11-error-markers-design.md"
```

Merge after CI green: `gh pr merge --squash --delete-branch`.
