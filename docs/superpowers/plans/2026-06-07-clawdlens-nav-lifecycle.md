# Navigation & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim ClawdLens's keymap to a predictable set, make the session picker fuzzy-searchable, remove the dead-feeling pulse/ribbon/rescan controls, and make `q` exit cleanly without Ctrl+C.

**Architecture:** Pure-core-first. Additive pure helpers (`shouldAnimate`, `rankRows`) and pure edits (`mapKey`, `hintsFor`, `commands`) land first with unit tests — none break their consumers. Then atomic UI commits rewire `App`/`Showcase`/`TabBar`/panels (each commit must `tsc` clean). Clean-quit last, via systematic-debugging + tmux. The repo has **no `noUnusedLocals`**, so orphaning a setter mid-refactor is fine; only `tsc --noEmit` must pass per commit.

**Tech Stack:** Bun · TypeScript (strict, `noUncheckedIndexedAccess`) · React 19 · `@opentui/react` + `@opentui/core`. Tests: `bun:test`. Spec: `docs/superpowers/specs/2026-06-07-clawdlens-nav-lifecycle-design.md`.

---

## File map

| File | Change |
|---|---|
| `src/ui/anim.ts` | **add** `shouldAnimate()` (pure) |
| `src/core/chrome.ts` | **add** `rankRows()` (pure); rewrite `GLOBAL_HINTS`/`PANEL_HINTS` |
| `src/core/commands.ts` | remove `view.pulse`, `play.loop`, `view.rescan` |
| `src/ui/keymap.ts` | slim `Action` union + `mapKey` |
| `src/ui/Menu.tsx` | `MenuRow.search`; `pickerRows` sets `search`; rewrite `helpRows`; `Menu` renders `filter` |
| `src/ui/TabBar.tsx` | remove phase ribbon + `lens` prop |
| `src/ui/Showcase.tsx` | drop `pulse`/`lensOn`; add `animate`; un-gate Tasks lens |
| `src/ui/panels/{Flow,Lens,Git}.tsx` | `pulse` prop → `animate` |
| `src/ui/App.tsx` | keymap wiring, picker filter, `animate` derive, remove pulse/lensOn/session-nav, runCommand trim |
| `src/index.tsx` | `onDestroy` teardown |
| Tests | `keymap.test.ts` (rewrite), `chrome.test.ts` (+rankRows, hints), `commands.test.ts` (rescan→replay), `anim.test.ts` (+shouldAnimate) |

---

## Task 1: `shouldAnimate` (pure)

Animation auto-runs only while the timeline is live AND recently advanced. Paused/history/quiet → false (the buffered panel loop stops; the comet was parked anyway).

**Files:**
- Modify: `src/ui/anim.ts`
- Test: `tests/anim.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/anim.test.ts`:

```typescript
import { shouldAnimate } from "../src/ui/anim";

test("shouldAnimate: only live + recently advanced", () => {
  // mode not live → never animate
  expect(shouldAnimate("paused", 1000, 200, 1100)).toBe(false);
  expect(shouldAnimate("history", 1000, 200, 1100)).toBe(false);
  // live, never advanced (lastAdvanceMs < 0) → false
  expect(shouldAnimate("live", -1, 200, 5000)).toBe(false);
  // live, bad interval → false
  expect(shouldAnimate("live", 1000, 0, 1100)).toBe(false);
  // live, just advanced → true
  expect(shouldAnimate("live", 1000, 200, 1100)).toBe(true);
  // live, within ~2 intervals → true
  expect(shouldAnimate("live", 1000, 200, 1390)).toBe(true);
  // live, gone quiet (> 2 intervals) → false
  expect(shouldAnimate("live", 1000, 200, 1500)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/anim.test.ts`
Expected: FAIL — `shouldAnimate` is not exported.

- [ ] **Step 3: Add the implementation** — append to `src/ui/anim.ts`:

```typescript
import type { PlayMode } from "../core/player";

// Whether the buffered panels should run their continuous animation loop.
// True only while the player is live AND advanced within the last ~2 intervals;
// paused/history or a quiet live tail park the comet, so the loop can stop.
export function shouldAnimate(mode: PlayMode, lastAdvanceMs: number, intervalMs: number, now: number): boolean {
  if (mode !== "live") return false;
  if (lastAdvanceMs < 0 || intervalMs <= 0) return false;
  return now - lastAdvanceMs < intervalMs * 2;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/anim.test.ts`
Expected: PASS (all anim tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/anim.ts tests/anim.test.ts
git commit -m "feat(anim): shouldAnimate — live + recently-advanced gate"
```

---

## Task 2: `rankRows` (pure fuzzy filter)

Generic fuzzy filter+rank over menu rows, reusing `fuzzyScore`. Generic (structural) so it needs no `MenuRow` import (avoids a chrome↔Menu cycle).

**Files:**
- Modify: `src/core/chrome.ts`
- Test: `tests/chrome.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/chrome.test.ts` (and add `rankRows` to the existing import from `../src/core/chrome`):

```typescript
test("rankRows: empty query returns rows unchanged", () => {
  const rows = [{ left: "a", search: "alpha" }, { left: "b", search: "beta" }];
  expect(rankRows(rows, "")).toEqual(rows);
});

test("rankRows: filters to fuzzy matches and ranks by score", () => {
  const rows = [
    { left: "1", search: "harness-flow" },
    { left: "2", search: "kedatangan" },
    { left: "3", search: "harness-x" },
  ];
  const out = rankRows(rows, "hx");
  expect(out.map((r) => r.search)).toEqual(["harness-x"]); // only "harness-x" contains h..x
});

test("rankRows: falls back to left when search absent, stable on ties", () => {
  const rows = [{ left: "git" }, { left: "grep" }];
  const out = rankRows(rows, "g");
  expect(out.map((r) => r.left)).toEqual(["git", "grep"]); // both match; original order kept
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chrome.test.ts`
Expected: FAIL — `rankRows` is not exported.

- [ ] **Step 3: Add the implementation** — in `src/core/chrome.ts`, immediately after the `fuzzyScore` function:

```typescript
// Filter + rank rows by fuzzy match on `search` (fallback `left`). Empty query
// returns rows unchanged. Sorted by score desc; ties keep original order.
export function rankRows<T extends { search?: string; left: string }>(rows: T[], query: string): T[] {
  if (!query) return rows;
  const scored: { r: T; s: number; i: number }[] = [];
  rows.forEach((r, i) => {
    const s = fuzzyScore(query, r.search ?? r.left);
    if (s !== null) scored.push({ r, s, i });
  });
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return scored.map((x) => x.r);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/chrome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/chrome.ts tests/chrome.test.ts
git commit -m "feat(chrome): rankRows fuzzy row filter"
```

---

## Task 3: Rewrite hints for the new keymap (pure)

**Files:**
- Modify: `src/core/chrome.ts:37-56` (the `GLOBAL_HINTS` / `PANEL_HINTS` / `hintsFor` block)
- Test: `tests/chrome.test.ts`

- [ ] **Step 1: Update the implementation** — replace `GLOBAL_HINTS` and `PANEL_HINTS` in `src/core/chrome.ts` with:

```typescript
const GLOBAL_HINTS: Hint[] = [
  { key: ":", label: "cmd" },
  { key: "Tab", label: "panel" },
  { key: "↑↓", label: "scrub" },
  { key: "←→", label: "speed" },
  { key: "space", label: "pause" },
  { key: "r", label: "replay" },
  { key: "?", label: "help" },
  { key: "q", label: "quit" },
];

const PANEL_HINTS: Record<PanelId, Hint[]> = {
  lens: [{ key: "i", label: "detail" }],
  log: [],
  files: [{ key: ":sort", label: "sort" }],
  git: [{ key: ":scope", label: "scope" }],
  tasks: [{ key: ":hide-done", label: "hide done" }],
};
```

- [ ] **Step 2: Add a guard test** — append to `tests/chrome.test.ts`:

```typescript
test("hintsFor: dropped controls are gone, new globals present", () => {
  const log = hintsFor("log");
  expect(log.map((h) => h.label)).not.toContain("pulse");
  expect(log.map((h) => h.label)).not.toContain("chunk");
  const lens = hintsFor("lens").map((h) => h.key);
  expect(hintsFor("git").map((h) => h.key)).toContain(":");   // global still there
  expect(lens).toContain("i");                                 // lens detail hint
  const labels = hintsFor("files").map((h) => h.label);
  expect(labels).toContain("speed");                          // new global
});
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/chrome.test.ts`
Expected: PASS (existing hint tests + new guard; the existing `: / q` and panel-specific tests still hold).

- [ ] **Step 4: Commit**

```bash
git add src/core/chrome.ts tests/chrome.test.ts
git commit -m "refactor(chrome): hints for the lean keymap"
```

---

## Task 4: Trim commands (pure)

**Files:**
- Modify: `src/core/commands.ts:13-31` (the `COMMANDS` array)
- Test: `tests/commands.test.ts`

- [ ] **Step 1: Update the failing test first** — in `tests/commands.test.ts`, replace the `"alias matches and fuzzy ranking orders results"` test with:

```typescript
test("alias matches and fuzzy ranking orders results", () => {
  expect(filterCommands("replay", "log").map((c) => c.id)).toContain("play.replay");
  const q = filterCommands("git", "log");
  expect(q[0]!.id).toBe("panel.git");          // exact/leading match ranks first
});

test("removed controls are not in the registry", () => {
  const ids = COMMANDS.map((c) => c.id);
  for (const gone of ["view.pulse", "play.loop", "view.rescan"]) {
    expect(ids).not.toContain(gone);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands.test.ts`
Expected: FAIL — `view.pulse`/`play.loop`/`view.rescan` still present.

- [ ] **Step 3: Remove the three commands** — delete these lines from the `COMMANDS` array in `src/core/commands.ts`:

```typescript
  { id: "view.rescan", title: "Rescan", aliases: ["rescan", "refresh", "reload"] },
  { id: "play.loop", title: "Loop", aliases: ["loop"] },
  { id: "view.pulse", title: "Toggle Pulse", aliases: ["pulse"] },
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/commands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/commands.ts tests/commands.test.ts
git commit -m "refactor(commands): drop pulse/loop/rescan commands"
```

---

## Task 5: Slim `keymap.ts` + rewire App's keyboard switch (atomic)

`Action` shrinks and `App`'s switch references the removed members, so both change in one commit.

**Files:**
- Modify: `src/ui/keymap.ts` (full rewrite of `Action` + `mapKey`)
- Modify: `src/ui/App.tsx` (the `useKeyboard` switch + `runCommand` + remove `stepSel`)
- Test: `tests/keymap.test.ts` (rewrite)

- [ ] **Step 1: Rewrite the test** — replace the body of `tests/keymap.test.ts` (keep the `a()` helper) with:

```typescript
test("timeline keys: arrows scrub + speed, space, replay", () => {
  expect(a("up")).toEqual({ type: "beat-back" });
  expect(a("down")).toEqual({ type: "beat-fwd" });
  expect(a("left")).toEqual({ type: "speed-down" });
  expect(a("right")).toEqual({ type: "speed-up" });
  expect(a("space")).toEqual({ type: "pause" });
  expect(a("r")).toEqual({ type: "replay" });
});

test("panels + misc", () => {
  expect(a("tab")).toEqual({ type: "panel-next" });
  expect(a("tab", { shift: true })).toEqual({ type: "panel-prev" });
  expect(a("i")).toEqual({ type: "info" });
  expect(a("?")).toEqual({ type: "help" });
  expect(a("q")).toEqual({ type: "quit" });
});

test("dropped keys are unmapped", () => {
  for (const k of ["j", "k", "h", "l", "g", "G", "p", "w", "L", "R", "1", "5", "[", "]", "+", "-", "z", "home", "end"]) {
    expect(a(k)).toBeNull();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/keymap.test.ts`
Expected: FAIL — old bindings still present.

- [ ] **Step 3: Rewrite `src/ui/keymap.ts`** — replace the whole file with:

```typescript
export type Action =
  | { type: "panel-next" } | { type: "panel-prev" }
  | { type: "beat-back" } | { type: "beat-fwd" }
  | { type: "speed-up" } | { type: "speed-down" }
  | { type: "pause" } | { type: "replay" }
  | { type: "info" } | { type: "help" } | { type: "quit" };

export interface KeyEvent { name: string; shift?: boolean; ctrl?: boolean }

export function mapKey(key: KeyEvent): Action | null {
  const n = key.name;
  if (n === "tab") return key.shift ? { type: "panel-prev" } : { type: "panel-next" };
  if (n === "up") return { type: "beat-back" };
  if (n === "down") return { type: "beat-fwd" };
  if (n === "left") return { type: "speed-down" };
  if (n === "right") return { type: "speed-up" };
  if (n === "space") return { type: "pause" };
  if (n === "r") return { type: "replay" };
  if (n === "i") return { type: "info" };
  if (n === "?") return { type: "help" };
  if (n === "q") return { type: "quit" };
  return null;
}
```

- [ ] **Step 4: Rewrite App's keyboard switch** — in `src/ui/App.tsx`, replace the `switch (action.type)` block (currently `case "quit"` … through `case "loop"`) with exactly these cases:

```typescript
    switch (action.type) {
      case "quit": renderer.destroy(); break;
      case "panel-next": setPanel((p) => PANELS[(PANELS.indexOf(p) + 1) % PANELS.length]!); break;
      case "panel-prev": setPanel((p) => PANELS[(PANELS.indexOf(p) + PANELS.length - 1) % PANELS.length]!); break;
      case "beat-back": activePlayer?.stepBack(); break;
      case "beat-fwd": activePlayer?.stepForward(); break; // stepForward snaps to live at head (player.ts:76)
      case "pause": activePlayer && (activePlayer.mode() === "paused" ? activePlayer.play() : activePlayer.pause()); break;
      case "speed-up": activePlayer?.setSpeed((activePlayer.speed() || 1) * 1.5); break;
      case "speed-down": activePlayer?.setSpeed((activePlayer.speed() || 1) / 1.5); break;
      case "info": setInfoOn((v) => !v); break;
      case "help": setShowHelp((h) => !h); break;
      case "replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
    }
```

- [ ] **Step 5: Trim `runCommand`** — in `src/ui/App.tsx` `runCommand`, delete the `case "view.rescan":`, `case "play.loop":`, and `case "view.pulse":` blocks (their commands no longer exist). Leave `play.replay`, `play.pause`, `lens.info`, `app.quit`, etc.

- [ ] **Step 6: Remove dead session-nav helper** — in `src/ui/App.tsx`, delete the `stepSel` function (lines around 96-99). `switchTo` stays (the picker uses it). (No `noUnusedLocals`, but keep it clean.)

- [ ] **Step 7: Typecheck + test**

Run: `bunx tsc --noEmit && bun test tests/keymap.test.ts`
Expected: tsc clean; keymap tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/keymap.ts src/ui/App.tsx tests/keymap.test.ts
git commit -m "feat(keys): lean keymap — arrows scrub/speed, r replay, drop session/chunk/loop keys"
```

---

## Task 6: Remove the phase ribbon (atomic)

`TabBar` no longer takes `lens`; `Showcase` stops computing `tasksLens`; `App` drops `lensOn`. All three in one commit (shared prop).

**Files:**
- Modify: `src/ui/TabBar.tsx`
- Modify: `src/ui/Showcase.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Strip the ribbon from `TabBar.tsx`** — replace the file with:

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { tabBarCells, tabModel, type TabRole } from "../core/chrome";
import type { PanelId } from "../core/types";
import { theme, TRANSPARENT } from "./theme";

function roleColor(role: TabRole): RGBA {
  return RGBA.fromHex(role === "inactive" ? theme.dim : theme.accent);
}

export function TabBar({ panels, active, width }: { panels: PanelId[]; active: PanelId; width: number }) {
  return (
    <box
      style={{ width, height: 2, flexShrink: 0, backgroundColor: TRANSPARENT }}
      buffered
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const cells = tabBarCells(tabModel(panels, active), width);
        for (const c of cells) {
          buffer.setCell(c.x, c.row, c.ch, roleColor(c.role), TRANSPARENT);
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Un-gate Tasks lens + drop `lensOn` in `Showcase.tsx`**:
  - Remove `lensOn` from the `Props` interface and from the destructured params.
  - Delete the line `const tasksLens = lensOn ? agg.lens : { ...agg.lens, lensId: null };`.
  - Change the TabBar usage to: `<TabBar panels={PANELS} active={panel} width={width} />`.
  - Change the Tasks usage `lens={tasksLens}` → `lens={agg.lens}`.

- [ ] **Step 3: Drop `lensOn` state in `App.tsx`**:
  - Delete `const [lensOn, setLensOn] = useState(true);`.
  - Remove `lensOn` from the `<Showcase ... />` props.
  - Remove `lensOn` from the `forceRepaint` dep-array `useEffect` (line ~93).

- [ ] **Step 4: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean (no remaining references to `lensOn`/`SUPERPOWERS_PHASES` ribbon).

- [ ] **Step 5: Commit**

```bash
git add src/ui/TabBar.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "refactor(tabbar): remove the phase ribbon + lensOn toggle"
```

---

## Task 7: Pulse → automatic animation (atomic)

Replace the manual `pulse` flag with an `animate` boolean derived from `shouldAnimate`. Touches App (derive), Showcase (forward), and the three buffered panels (consume).

**Files:**
- Modify: `src/ui/panels/Flow.tsx`, `src/ui/panels/Lens.tsx`, `src/ui/panels/Git.tsx`
- Modify: `src/ui/Showcase.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: `Flow.tsx`** — rename the prop and its uses:
  - `Props`: `pulse: boolean;` → `animate: boolean;`
  - param `({ beats, cursor, pulse, ... })` → `({ beats, cursor, animate, ... })`
  - `live={pulse}` → `live={animate}`
  - `if (pulse && cursor > 0)` → `if (animate && cursor > 0)`
  - `pulse && focused ?` → `animate && focused ?`

- [ ] **Step 2: `Lens.tsx`**:
  - `Props`: `pulse: boolean;` → `animate: boolean;`
  - param `pulse` → `animate`
  - `const animating = pulse && !idle;` → `const animating = animate && !idle;`
  - `live={pulse}` → `live={animate}`

- [ ] **Step 3: `Git.tsx`** (inline param signature):
  - `pulse: boolean` → `animate: boolean` in both the destructure and the type literal
  - `live={animating && pulse}` → `live={animating && animate}`
  - both `animating && pulse` → `animating && animate`

- [ ] **Step 4: `Showcase.tsx`**:
  - `Props`: remove `pulse: boolean;`, add `animate: boolean;`
  - destructure: `pulse` → `animate`
  - panel usages: `<Lens ... pulse={pulse} .../>` → `animate={animate}`; `<Flow ... pulse={pulse} .../>` → `animate={animate}`; `<Git ... pulse={pulse} .../>` → `animate={animate}`

- [ ] **Step 5: `App.tsx`**:
  - Add the import: `import { shouldAnimate } from "./anim";` (alongside other `./` imports). *(anim.ts has no other named export App needs; if a combined import is cleaner, group it.)*
  - Delete `const [pulse, setPulse] = useState(true);`.
  - After `intervalMs` is computed (line ~84), add:
    ```typescript
    const animate = activePlayer ? shouldAnimate(activePlayer.mode(), lastAdvanceMs, intervalMs, Date.now()) : false;
    ```
  - In `<Showcase .../>`, replace `pulse={pulse}` with `animate={animate}`.
  - In the `forceRepaint` dep-array `useEffect` (line ~93), replace `pulse` with `animate`.

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: clean (no remaining `pulse` identifiers).

Verify: `grep -rn "pulse" src/ui` should only match `pulsePhase`/`pulseHot`/`pulseIntensity` (the anim primitives + theme color), never a `pulse` prop/state.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/Flow.tsx src/ui/panels/Lens.tsx src/ui/panels/Git.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(anim): drive panel animation from player activity, drop the pulse toggle"
```

---

## Task 8: Fuzzy session picker (atomic)

Add a `/` filter to the picker: `MenuRow.search`, `pickerRows` sets it, `Menu` renders the live query, `App` holds `query`/`filtering` state and ranks rows with `rankRows`.

**Files:**
- Modify: `src/ui/Menu.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: `Menu.tsx` — add `search` to `MenuRow` + set it in `pickerRows`:**
  - In the `MenuRow` interface add `search?: string;`.
  - In `pickerRows`, projects branch: add `search: p.project,` to the returned object.
  - In `pickerRows`, sessions branch: add `search: s.title || s.id,` to the returned object.

- [ ] **Step 2: `Menu.tsx` — render the live filter query.** Add an optional `filter?: string` to the `Menu` props and render it. Replace the `Menu` signature line and add the filter line just above the footer:
  - Signature: `export function Menu({ title, footer, rows, index, width, height, filter }: { title: string; footer: string; rows: MenuRow[]; index: number; width: number; height: number; filter?: string }) {`
  - Just before `<box style={{ flexGrow: 1 }} />`, insert:
    ```tsx
    {filter !== undefined && <text fg={theme.accent}>{`/${filter}▎`}</text>}
    ```

- [ ] **Step 3: `Menu.tsx` — rewrite `helpRows()`** to the lean keymap:

```typescript
export function helpRows(): MenuRow[] {
  return [
    { id: "h1", left: "command palette (fuzzy)", right: ":" },
    { id: "h2", left: "cycle panels", right: "Tab / Shift-Tab" },
    { id: "h3", left: "scrub timeline", right: "↑ / ↓" },
    { id: "h4", left: "speed down / up", right: "← / →" },
    { id: "h5", left: "pause / play", right: "space" },
    { id: "h6", left: "replay", right: "r" },
    { id: "h7", left: "lens detail", right: "i" },
    { id: "h8", left: "sessions (with / filter)", right: ": sessions" },
    { id: "h9", left: "help", right: "?" },
    { id: "h10", left: "quit", right: "q" },
  ];
}
```

- [ ] **Step 4: `App.tsx` — extend picker state.**
  - Update the type: `type PickerState = { open: boolean; stage: "projects" | "sessions"; project: string | null; index: number; query: string; filtering: boolean };`
  - Update `CLOSED`: `const CLOSED: PickerState = { open: false, stage: "projects", project: null, index: 0, query: "", filtering: false };`
  - Both `setPicker({ open: true, stage: "projects", project: null, index: 0 })` call sites (the `nav.sessions` runCommand case and any reset) gain `query: "", filtering: false`.

- [ ] **Step 5: `App.tsx` — import `rankRows`** from `../core/chrome` and replace the picker key-handling block (the whole `if (picker.open) { ... return; }`) with:

```typescript
    if (picker.open) {
      const baseRows = pickerRows(sessions, picker.stage === "projects" ? null : picker.project);
      const rows = rankRows(baseRows, picker.query);
      const len = rows.length;
      const printable = key.sequence && key.sequence.length === 1 && key.sequence >= " " && key.sequence !== "/" && kn !== "return" && kn !== "space";
      if (kn === "/" ) { setPicker((p) => ({ ...p, filtering: true })); return; }
      if (picker.filtering && kn === "escape") { setPicker((p) => ({ ...p, filtering: false, query: "", index: 0 })); return; }
      if (picker.filtering && kn === "backspace") { setPicker((p) => ({ ...p, query: p.query.slice(0, -1), index: 0 })); return; }
      if (picker.filtering && printable) { setPicker((p) => ({ ...p, query: p.query + key.sequence, index: 0 })); return; }
      if (kn === "escape" || kn === ":") {
        setPicker(kn === "escape" && picker.stage === "sessions"
          ? { open: true, stage: "projects", project: null, index: 0, query: "", filtering: false }
          : CLOSED);
      } else if (kn === "down") {
        setPicker((p) => ({ ...p, index: Math.min(Math.max(0, len - 1), p.index + 1) }));
      } else if (kn === "up") {
        setPicker((p) => ({ ...p, index: Math.max(0, p.index - 1) }));
      } else if (kn === "return" || kn === "enter") {
        if (picker.stage === "projects") {
          const proj = (rows[Math.min(picker.index, len - 1)] as { id: string } | undefined)?.id ?? null;
          if (proj) setPicker({ open: true, stage: "sessions", project: proj, index: 0, query: "", filtering: false });
        } else {
          const id = (rows[Math.min(picker.index, len - 1)] as { id: string } | undefined)?.id;
          if (id) switchTo(id);
          setPicker(CLOSED);
        }
      }
      return;
    }
```

  Note: `pickerRows` rows carry `id` = project name (projects stage) or session id (sessions stage), so selecting from the *filtered* `rows` works directly — no second lookup needed. Remove the now-unused `projectsOf`/`sessionsOf` length math (and their imports if nothing else uses them — `pickerRows` is the row source; check the import line `import { Menu, pickerRows, helpRows, projectsOf, sessionsOf } from "./Menu";` and drop `projectsOf, sessionsOf` if unused after this edit).

- [ ] **Step 6: `App.tsx` — pass `filter` to the picker `Menu`.** In the `picker.open && (<Menu .../>)` block, change `rows={pickerRows(...)}` to `rows={rankRows(pickerRows(sessions, picker.stage === "projects" ? null : picker.project), picker.query)}` and add `filter={picker.filtering ? picker.query : undefined}`. Add `picker.query`/`picker.filtering` to the `forceRepaint` dep-array effect.

- [ ] **Step 7: Typecheck + tests**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc clean; full suite green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/Menu.tsx src/ui/App.tsx
git commit -m "feat(picker): / fuzzy filter for the session picker + lean help"
```

---

## Task 9: Clean quit — systematic-debugging then fix

**REQUIRED SUB-SKILL:** Use `superpowers:systematic-debugging`. Reproduce and confirm the root cause before editing.

**Files:**
- Modify: `src/index.tsx`

- [ ] **Step 1: Reproduce.** Run the TUI in tmux and quit:

```bash
tmux kill-session -t clq 2>/dev/null; tmux new-session -d -s clq -x 150 -y 36 "bun run dev"; sleep 4
tmux send-keys -t clq "q"; sleep 2
tmux capture-pane -t clq -p | tail -5
tmux list-panes -t clq -F "#{pane_dead} #{pane_pid}" 2>/dev/null || echo "session gone"
```

Expected (bug present): after `q`, the pane is **not** dead / the session lingers (process still alive) — the shell prompt has not returned. Record the observation.

- [ ] **Step 2: Confirm the root cause.** The hypothesis: `renderer.destroy()` restores the TTY but the `store.start()` poll `setInterval` (`sessionStore.ts:89`) keeps Bun's event loop alive, so the process never exits. Confirm by noting that the store timer is never cleared on quit (App's `quit` calls only `renderer.destroy()`), and OpenTUI docs state it does not exit the process on destroy. If the live evidence contradicts this (e.g. TTY genuinely garbled), follow the evidence instead.

- [ ] **Step 3: Apply the fix** — replace `src/index.tsx` with:

```tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App";
import { createStore } from "./store/sessionStore";

const store = createStore();
store.start();
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  onDestroy: () => { store.stop(); process.exit(0); },
});
createRoot(renderer).render(<App store={store} />);
```

- [ ] **Step 4: Verify the fix** — quit returns to the shell with no Ctrl+C:

```bash
tmux kill-session -t clq 2>/dev/null; tmux new-session -d -s clq -x 150 -y 36 "bun run dev; echo EXITED_CLEAN"; sleep 4
tmux send-keys -t clq "q"; sleep 2
tmux capture-pane -t clq -p | tail -3
```

Expected: the captured pane shows `EXITED_CLEAN` (the shell returned and ran the next command) — proving `q` exited the process without Ctrl+C. Also confirm Ctrl+C still exits cleanly:

```bash
tmux kill-session -t clq 2>/dev/null; tmux new-session -d -s clq -x 150 -y 36 "bun run dev; echo EXITED_CLEAN"; sleep 4
tmux send-keys -t clq C-c; sleep 2
tmux capture-pane -t clq -p | tail -3
tmux kill-session -t clq 2>/dev/null
```

Expected: `EXITED_CLEAN` present.

- [ ] **Step 5: Commit**

```bash
git add src/index.tsx
git commit -m "fix(lifecycle): exit the process on quit (onDestroy → store.stop + process.exit)"
```

---

## Task 10: Full verification

- [ ] **Step 1: Typecheck + full test suite**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc clean; all suites green (incl. new `shouldAnimate`, `rankRows`, rewritten `mapKey`, trimmed `commands`).

- [ ] **Step 2: tmux smoke of the full keymap.** Drive each surviving key and capture a frame after each to confirm no crash + expected effect:

```bash
tmux kill-session -t clv 2>/dev/null; tmux new-session -d -s clv -x 150 -y 36 "bun run dev"; sleep 4
tmux send-keys -t clv "R"; sleep 1   # NOTE: replay is now lowercase 'r'
tmux send-keys -t clv "r"; sleep 1; tmux capture-pane -t clv -p | tail -4   # replay marker
tmux send-keys -t clv "Down"; tmux send-keys -t clv "Down"; sleep 1         # ↓ scrub fwd
tmux send-keys -t clv "Up"; sleep 1; tmux capture-pane -t clv -p | tail -4  # ↑ scrub back
tmux send-keys -t clv "Right"; sleep 1; tmux capture-pane -t clv -p | tail -2  # → speed up (marker ×)
tmux send-keys -t clv "Left"; sleep 1
tmux send-keys -t clv "Space"; sleep 1                                       # pause
tmux send-keys -t clv "Tab"; sleep 1; tmux capture-pane -t clv -p | head -2  # panel switch
tmux send-keys -t clv "i"; sleep 1                                          # lens detail (on lens panel)
tmux send-keys -t clv ":"; sleep 1; tmux send-keys -t clv "sessions"; sleep 1; tmux send-keys -t clv "Enter"; sleep 1
tmux send-keys -t clv "/"; sleep 1; tmux send-keys -t clv "a"; sleep 1; tmux capture-pane -t clv -p   # picker fuzzy filter line `/a▎`
tmux kill-session -t clv 2>/dev/null
```

Expected: speed marker (`×`) changes on `←/→`; replay marker appears on `r`; panel header changes on `Tab`; picker shows the `/a▎` filter line and a filtered list; **no** visible effect for the removed keys (`p`, `w`, `g`, `G`, `[`, `]`) — they are inert. Confirm the comet animation runs during replay and stops when paused/idle.

- [ ] **Step 3: Confirm removed-key inertness + no ribbon.** With a session selected on the Lens tab, press `p` and `w` and capture — the frame must be unchanged (no pulse toggle, no ribbon strip on the tab seam).

- [ ] **Step 4: Final commit (if any verification tweaks were needed).** Otherwise the branch is ready for PR.

```bash
bunx tsc --noEmit && bun test && echo "VERIFIED"
```

---

## Self-review notes (author)

- **Spec coverage:** §1 keymap → Tasks 3,5,8(help). §2 fuzzy picker → Tasks 2,8. §3 pulse→auto → Tasks 1,7. §4 ribbon → Task 6. §5 clean quit → Task 9. Commands trim → Task 4. ✔ all sections mapped.
- **Return-to-live:** spec called for `↓`-past-end → live; `player.stepForward()` already does this (player.ts:76), so Task 5 needs no extra logic — documented inline.
- **Per-commit green:** pure tasks (1-4) are additive/internal; UI atomic tasks (5-8) each bundle the prop/union change with all its consumers; no `noUnusedLocals` so transient orphan setters are fine. Each task ends in `tsc --noEmit`.
- **Type consistency:** `animate` (not `pulse`) across Flow/Lens/Git/Showcase/App; `shouldAnimate(mode, lastAdvanceMs, intervalMs, now)` signature matches App's call; `rankRows<T extends {search?;left}>` matches `MenuRow`; picker rows' `id` reused for selection (no `projectsOf/sessionsOf` index lookup).
