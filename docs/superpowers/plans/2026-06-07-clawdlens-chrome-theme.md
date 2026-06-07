# ClawdLens Chrome & Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ClawdLens shell into a k9s-inspired, fully-transparent TUI — top-only header, merged-border boxy tabs (Lens·Files·Tasks·Git·Log), a fuzzy `:` command palette as the primary action surface, and one standardized transparent theme.

**Architecture:** Pure-core-first. All view-independent logic (fuzzy matcher, hint list, tab-cell layout, menu windowing, command registry) lives in new pure modules `src/core/chrome.ts` + `src/core/commands.ts` with `bun:test` coverage. UI is a thin render: React `<box>` flexbox for structure, buffered `setCell` only inside graph panels and the TabBar seam. Every task keeps `bun test` + `bunx tsc --noEmit` green; UI tasks are additionally verified via tmux capture.

**Tech Stack:** Bun · TypeScript (strict, noUncheckedIndexedAccess) · React 19 · `@opentui/react` + `@opentui/core` · `bun:test`.

**Spec:** `docs/superpowers/specs/2026-06-07-clawdlens-chrome-theme-design.md`

**Key OpenTUI facts used (verified against the `opentui` skill):**
- `<box>` `border` accepts `BorderSides[]` → `border={["left","right","bottom"]}` renders a frame with **no top border** (TabBar draws the top). Also `borderColor`, `borderStyle: "single"|"rounded"|"double"`, `title`, `titleAlignment`.
- Buffered panels draw via `buffer.setCell(x,y,ch,fgRGBA,bgRGBA)`; `RGBA.fromValues(0,0,0,0)` = transparent (inherits terminal bg). Set box `live` only for continuous animation.
- `useKeyboard((key)=>…)` `KeyEvent` has `name`, `shift`, `ctrl`, and `sequence` (the decoded printable text, e.g. `"a"`, `" "`). The palette reads `key.sequence` for typed chars — no focus routing.

---

## File map

**Create:**
- `src/core/chrome.ts` — pure: `fuzzyScore`, `hintsFor`, `tabModel`, `tabBarCells`, `menuWindow` (+ types `Hint`, `TabSeg`, `TabRole`, `TabCell`, `MenuWindow`).
- `src/core/commands.ts` — pure: `Command` type, `COMMANDS` registry, `filterCommands`.
- `src/ui/Header.tsx` — top context/status + hint-grid block (absorbs `StatusBar`).
- `src/ui/TabBar.tsx` — buffered merged-border tab row + phase ribbon.
- `src/ui/Menu.tsx` — shared fullscreen bordered menu (picker + help).
- `src/ui/CommandPalette.tsx` — fuzzy `:` palette overlay.
- `tests/chrome.test.ts`, `tests/commands.test.ts`.

**Modify:**
- `src/core/types.ts` — add `PanelId`, `PANELS`, `DEFAULT_PANEL`.
- `src/ui/theme.ts` — add `TRANSPARENT`; (later) drop `bg`/`panel`/`sel`.
- `src/ui/Showcase.tsx` — recompose Header→TabBar→frame; rename `flow`→`log`; add `lens` placeholder.
- `src/ui/App.tsx` — palette state + manual input + command dispatch; overlays via `Menu`; option state (`filesSort`/`gitScope`/`tasksHideDone`); default panel `log`.
- `src/ui/panels/Files.tsx` — `sort` prop. `src/ui/panels/Tasks.tsx` — `hideDone` prop.
- `src/store/gitFetch.ts` + `src/core/git-log.ts` — `gitLog(cwd, allBranches)` for `:scope`.

**Delete:** `src/ui/StatusBar.tsx`, `src/ui/PhaseRibbon.tsx`, `src/ui/SessionPicker.tsx` render (data helpers move/stay). `src/core/lens.ts` `SUPERPOWERS_PHASES` stays (used by TabBar ribbon + Tasks).

---

## Task 1: PanelId in core types + Lens placeholder + flow→log rename

Establishes the new panel set first so every later module can import it. Keeps the app working (Lens tab appears as a placeholder; `flow`→`log`).

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/ui/panels/Lens.tsx`
- Modify: `src/ui/Showcase.tsx`, `src/ui/App.tsx`
- Test: `tests/chrome.test.ts` (created here, asserts `PANELS`/`DEFAULT_PANEL`)

- [ ] **Step 1: Write the failing test**

Create `tests/chrome.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { PANELS, DEFAULT_PANEL } from "../src/core/types";

test("PANELS order: lens first, log last", () => {
  expect(PANELS).toEqual(["lens", "files", "tasks", "git", "log"]);
});

test("default panel is log until Lens body exists", () => {
  expect(DEFAULT_PANEL).toBe("log");
  expect(PANELS).toContain(DEFAULT_PANEL);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chrome.test.ts`
Expected: FAIL — `PANELS`/`DEFAULT_PANEL` not exported from `types`.

- [ ] **Step 3: Add the types**

Append to `src/core/types.ts`:

```typescript
// UI panel identity (kept in core so pure chrome helpers can reference it)
export type PanelId = "lens" | "files" | "tasks" | "git" | "log";
export const PANELS: PanelId[] = ["lens", "files", "tasks", "git", "log"];
export const DEFAULT_PANEL: PanelId = "log";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/chrome.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the Lens placeholder panel**

Create `src/ui/panels/Lens.tsx`:

```tsx
import { theme } from "../theme";

// Placeholder until the Lens spec (spec 3) builds the CI/CD pipeline hawk-eye view.
export function Lens() {
  return <text fg={theme.dim}>Lens · holistic pipeline overview — coming soon</text>;
}
```

- [ ] **Step 6: Rename flow→log and wire the Lens tab in Showcase**

In `src/ui/Showcase.tsx`: change the `PanelId`/`PANELS` definitions to import from core, add the Lens panel, rename the `flow` branch to `log`. Replace lines 14-15 and the panel-render block:

Replace:
```tsx
export type PanelId = "flow" | "files" | "tasks" | "git";
export const PANELS: PanelId[] = ["flow", "files", "tasks", "git"];
```
with:
```tsx
import { type PanelId, PANELS } from "../core/types";
export type { PanelId };
export { PANELS };
import { Lens } from "./panels/Lens";
```

Replace the body render block (currently the `panel === "flow" …` line):
```tsx
        {panel === "flow" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
```
with:
```tsx
        {panel === "lens" && <Lens />}
        {panel === "log" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 7: Update App default panel + cycle**

In `src/ui/App.tsx`: change the panel state initializer from `useState<PanelId>("flow")` to:
```tsx
import { DEFAULT_PANEL } from "../core/types";
// …
const [panel, setPanel] = useState<PanelId>(DEFAULT_PANEL);
```
(`PANELS` is already imported from `Showcase`; panel-cycle logic is unchanged and now includes lens/log automatically.)

- [ ] **Step 8: Typecheck + full test suite**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS (no type errors; all tests green).

- [ ] **Step 9: tmux smoke — Lens default-skipped, Log shows, tabs include Lens**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p; tmux send-keys -t cl q
```
Expected: tab strip shows `lens files tasks git log`; opens on `log`; pressing Tab cycles to `lens` showing the placeholder.

- [ ] **Step 10: Commit**

```bash
git add src/core/types.ts src/ui/panels/Lens.tsx src/ui/Showcase.tsx src/ui/App.tsx tests/chrome.test.ts
git commit -m "feat(chrome): PanelId in core, Lens placeholder tab, flow→log rename"
```

---

## Task 2: `fuzzyScore` (pure, TDD)

The subsequence matcher that ranks command/session matches.

**Files:**
- Create: `src/core/chrome.ts`
- Test: `tests/chrome.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/chrome.test.ts`:

```typescript
import { fuzzyScore } from "../src/core/chrome";

test("fuzzyScore: empty query scores 0 (matches anything)", () => {
  expect(fuzzyScore("", "git")).toBe(0);
});

test("fuzzyScore: non-subsequence returns null", () => {
  expect(fuzzyScore("xyz", "git")).toBeNull();
});

test("fuzzyScore: subsequence matches case-insensitively", () => {
  expect(fuzzyScore("GT", "git")).not.toBeNull();
  expect(fuzzyScore("git", "git")).not.toBeNull();
});

test("fuzzyScore: consecutive run beats scattered match", () => {
  const consec = fuzzyScore("ab", "abx")!;
  const gap = fuzzyScore("ab", "axb")!;
  expect(consec).toBeGreaterThan(gap);
});

test("fuzzyScore: word-start match scores higher than mid-word", () => {
  const start = fuzzyScore("s", "scope")!;     // s at index 0
  const mid = fuzzyScore("s", "discope")!;     // s at index 3, mid-word
  expect(start).toBeGreaterThan(mid);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chrome.test.ts`
Expected: FAIL — cannot import `fuzzyScore` from `../src/core/chrome` (module missing).

- [ ] **Step 3: Implement `fuzzyScore`**

Create `src/core/chrome.ts`:

```typescript
// Pure chrome helpers: fuzzy matcher, hint list, tab-cell layout, menu windowing.
// View-independent so they are unit-tested; the UI is a thin render of these.

// Subsequence fuzzy match. Returns a ranking score (higher = better) or null if
// `query` is not a subsequence of `target`. Boosts consecutive runs and matches
// at word starts (index 0 or after a non-alphanumeric char). Case-insensitive.
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  let score = 0;
  let ti = 0;
  let prev = -2;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === c) { found = j; break; }
    }
    if (found === -1) return null;
    let pts = 1;
    if (found === prev + 1) { streak += 1; pts += streak; } else { streak = 0; }
    const before = found > 0 ? t[found - 1]! : " ";
    if (found === 0 || /[^a-z0-9]/.test(before)) pts += 2; // word-start boost
    score += pts;
    prev = found;
    ti = found + 1;
  }
  return score;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/chrome.test.ts`
Expected: PASS (all fuzzy tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/chrome.ts tests/chrome.test.ts
git commit -m "feat(chrome): fuzzyScore subsequence matcher (pure, TDD)"
```

---

## Task 3: `hintsFor` + `tabModel` (pure, TDD)

Header hint grid + tab render model.

**Files:**
- Modify: `src/core/chrome.ts`, `tests/chrome.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/chrome.test.ts`:

```typescript
import { hintsFor, tabModel } from "../src/core/chrome";

test("hintsFor: every panel includes the command + quit globals", () => {
  for (const p of ["lens", "files", "tasks", "git", "log"] as const) {
    const keys = hintsFor(p).map((h) => h.key);
    expect(keys).toContain(":");
    expect(keys).toContain("q");
  }
});

test("hintsFor: panel-specific hints appear", () => {
  expect(hintsFor("files").map((h) => h.label)).toContain("sort");
  expect(hintsFor("tasks").map((h) => h.label)).toContain("hide done");
  expect(hintsFor("git").map((h) => h.label)).toContain("scope");
});

test("tabModel: preserves order and marks the active tab", () => {
  const segs = tabModel(["lens", "files", "tasks", "git", "log"], "git");
  expect(segs.map((s) => s.id)).toEqual(["lens", "files", "tasks", "git", "log"]);
  expect(segs.map((s) => s.label)).toEqual(["Lens", "Files", "Tasks", "Git", "Log"]);
  expect(segs.find((s) => s.active)!.id).toBe("git");
  expect(segs.filter((s) => s.active)).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chrome.test.ts`
Expected: FAIL — `hintsFor`/`tabModel` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/chrome.ts`:

```typescript
import type { PanelId } from "./types";

export interface Hint { key: string; label: string }

const GLOBAL_HINTS: Hint[] = [
  { key: ":", label: "cmd" },
  { key: "Tab", label: "cycle" },
  { key: "h/l", label: "scrub" },
  { key: "space", label: "pause" },
  { key: "?", label: "help" },
  { key: "q", label: "quit" },
];

const PANEL_HINTS: Record<PanelId, Hint[]> = {
  lens: [],
  log: [{ key: "[ ]", label: "chunk" }, { key: "p", label: "pulse" }],
  files: [{ key: ":sort", label: "sort" }],
  git: [{ key: ":scope", label: "scope" }],
  tasks: [{ key: ":hide-done", label: "hide done" }],
};

export function hintsFor(panel: PanelId): Hint[] {
  return [...GLOBAL_HINTS, ...PANEL_HINTS[panel]];
}

export interface TabSeg { id: PanelId; label: string; active: boolean }

const TAB_LABELS: Record<PanelId, string> = {
  lens: "Lens", files: "Files", tasks: "Tasks", git: "Git", log: "Log",
};

export function tabModel(panels: PanelId[], active: PanelId): TabSeg[] {
  return panels.map((id) => ({ id, label: TAB_LABELS[id], active: id === active }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/chrome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/chrome.ts tests/chrome.test.ts
git commit -m "feat(chrome): hintsFor + tabModel (pure, TDD)"
```

---

## Task 4: `tabBarCells` — merged-border tab layout (pure, TDD)

The deterministic 2-row cell layout for the merged tab border. Row 0 = tab tops/labels; row 1 = the frame's top border with an opening punched under the active tab.

**Files:**
- Modify: `src/core/chrome.ts`, `tests/chrome.test.ts`

Visual produced (active = Lens, leftmost):
```
 ╭─Lens─╮ Files  Tasks  Git  Log      (row 0)
╭┘      └──────────────────────────╮  (row 1: frame top border, opening under tab)
```
- Row 1 col 0 = `╭` (frame top-left), col width-1 = `╮` (frame top-right), else `─`.
- Under the active tab: `┘` at its left edge, `└` at its right edge, spaces between (the opening).
- Active tab row 0: `╭─<label>─╮`. Inactive tabs row 0: ` <label> ` plain.

- [ ] **Step 1: Write the failing tests**

Append to `tests/chrome.test.ts`:

```typescript
import { tabBarCells } from "../src/core/chrome";

function at(cells: { x: number; row: number; ch: string }[], x: number, row: number) {
  return cells.find((c) => c.x === x && c.row === row)?.ch;
}

test("tabBarCells: row 1 is a bordered rule with frame corners", () => {
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "log"), 40);
  expect(at(cells, 0, 1)).toBe("╭");
  expect(at(cells, 39, 1)).toBe("╮");
  // a mid column with no active-tab opening is a horizontal rule
  expect(at(cells, 20, 1)).toBe("─");
});

test("tabBarCells: active tab punches an opening into row 1", () => {
  // active = Lens at far left; its notch starts at x=1
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "lens"), 40);
  expect(at(cells, 1, 0)).toBe("╭");          // notch top-left on row 0
  expect(at(cells, 1, 1)).toBe("┘");          // left junction on row 1
  // somewhere inside the Lens notch on row 1 is an opening (space)
  const openings = cells.filter((c) => c.row === 1 && c.ch === " ");
  expect(openings.length).toBeGreaterThan(0);
  // the active tab carries its label on row 0
  const row0 = cells.filter((c) => c.row === 0).sort((a, b) => a.x - b.x).map((c) => c.ch).join("");
  expect(row0).toContain("Lens");
});

test("tabBarCells: inactive labels render in order on row 0", () => {
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "lens"), 60);
  const row0 = cells.filter((c) => c.row === 0).sort((a, b) => a.x - b.x).map((c) => c.ch).join("");
  expect(row0.indexOf("Files")).toBeLessThan(row0.indexOf("Tasks"));
  expect(row0.indexOf("Tasks")).toBeLessThan(row0.indexOf("Git"));
  expect(row0.indexOf("Git")).toBeLessThan(row0.indexOf("Log"));
});

test("tabBarCells: every cell is within width", () => {
  const cells = tabBarCells(tabModel(["lens", "files", "tasks", "git", "log"], "git"), 30);
  for (const c of cells) { expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThan(30); }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chrome.test.ts`
Expected: FAIL — `tabBarCells` not exported.

- [ ] **Step 3: Implement `tabBarCells`**

Append to `src/core/chrome.ts`:

```typescript
export type TabRole = "active" | "inactive" | "border";
export interface TabCell { x: number; row: number; ch: string; role: TabRole }

// Lay out the 2-row merged tab border. Row 0 holds tab tops/labels, row 1 holds
// the frame's top border with an opening punched under the active tab. Colors are
// expressed as roles; the renderer maps role -> RGBA (keeps hex out of core).
export function tabBarCells(tabs: TabSeg[], width: number): TabCell[] {
  const cells: TabCell[] = [];
  // Row 1: continuous rule with frame corners.
  const rule: string[] = new Array(width).fill("─");
  if (width > 0) rule[0] = "╭";
  if (width > 1) rule[width - 1] = "╮";

  // Row 0: place tabs left-to-right starting at x=1 (x=0 is the frame corner).
  let x = 1;
  const push = (cx: number, row: number, ch: string, role: TabRole) => {
    if (cx >= 0 && cx < width) cells.push({ x: cx, row, ch, role });
  };

  for (const tab of tabs) {
    const L = tab.label.length;
    if (tab.active) {
      const left = x;                 // `╭` / `┘`
      const right = x + L + 3;        // `╮` / `└`
      if (right >= width - 1) break;  // no room — clip remaining tabs
      push(left, 0, "╭", "active");
      push(left + 1, 0, "─", "active");
      for (let i = 0; i < L; i++) push(left + 2 + i, 0, tab.label[i]!, "active");
      push(left + 2 + L, 0, "─", "active");
      push(right, 0, "╮", "active");
      // row 1 opening under the notch
      rule[left] = "┘";
      for (let i = left + 1; i < right; i++) rule[i] = " ";
      rule[right] = "└";
      x = right + 2;                  // gap after tab
    } else {
      const start = x + 1;            // 1-space lead
      if (start + L >= width - 1) break;
      for (let i = 0; i < L; i++) push(start + i, 0, tab.label[i]!, "inactive");
      x = start + L + 2;              // trailing space + gap
    }
  }

  for (let i = 0; i < width; i++) push(i, 1, rule[i]!, "border");
  return cells;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/chrome.test.ts`
Expected: PASS (all tabBarCells tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/chrome.ts tests/chrome.test.ts
git commit -m "feat(chrome): tabBarCells merged-border tab layout (pure, TDD)"
```

---

## Task 5: `menuWindow` — scroll/selection windowing (pure, TDD)

Generalizes the windowing math currently inline in `SessionPicker`, shared by `Menu` and `CommandPalette`.

**Files:**
- Modify: `src/core/chrome.ts`, `tests/chrome.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/chrome.test.ts`:

```typescript
import { menuWindow } from "../src/core/chrome";

test("menuWindow: short list fits, no overflow", () => {
  const w = menuWindow(3, 0, 10);
  expect(w).toEqual({ start: 0, count: 3, selected: 0, more: 0 });
});

test("menuWindow: long list centers around index and reports more", () => {
  const w = menuWindow(100, 50, 10);
  expect(w.count).toBe(10);
  expect(w.start).toBeLessThanOrEqual(50);
  expect(w.start + w.count).toBeGreaterThan(50);
  expect(w.selected).toBe(50 - w.start);
  expect(w.more).toBe(100 - (w.start + w.count));
});

test("menuWindow: clamps at the end", () => {
  const w = menuWindow(100, 99, 10);
  expect(w.start).toBe(90);
  expect(w.count).toBe(10);
  expect(w.more).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/chrome.test.ts`
Expected: FAIL — `menuWindow` not exported.

- [ ] **Step 3: Implement**

Append to `src/core/chrome.ts`:

```typescript
export interface MenuWindow { start: number; count: number; selected: number; more: number }

export function menuWindow(total: number, index: number, rows: number): MenuWindow {
  const r = Math.max(1, rows);
  const start = Math.max(0, Math.min(index - Math.floor(r / 2), Math.max(0, total - r)));
  const count = Math.min(r, total - start);
  return { start, count, selected: index - start, more: Math.max(0, total - (start + count)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/chrome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/chrome.ts tests/chrome.test.ts
git commit -m "feat(chrome): menuWindow scroll/selection model (pure, TDD)"
```

---

## Task 6: Command registry + `filterCommands` (pure, TDD)

**Files:**
- Create: `src/core/commands.ts`, `tests/commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/commands.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { COMMANDS, filterCommands } from "../src/core/commands";

test("registry has stable ids and panel switches", () => {
  const ids = COMMANDS.map((c) => c.id);
  for (const id of ["panel.lens", "panel.log", "nav.sessions", "app.quit"]) {
    expect(ids).toContain(id);
  }
});

test("empty query returns all context-applicable commands", () => {
  const onLog = filterCommands("", "log").map((c) => c.id);
  expect(onLog).toContain("panel.git");
  expect(onLog).not.toContain("git.scope");   // git-only, hidden off the git panel
});

test("context commands appear only on their panel", () => {
  expect(filterCommands("scope", "git").map((c) => c.id)).toContain("git.scope");
  expect(filterCommands("scope", "files").map((c) => c.id)).not.toContain("git.scope");
});

test("alias matches and fuzzy ranking orders results", () => {
  expect(filterCommands("refresh", "log").map((c) => c.id)).toContain("view.rescan");
  const q = filterCommands("git", "log");
  expect(q[0]!.id).toBe("panel.git");          // exact/leading match ranks first
});

test("no match yields empty list", () => {
  expect(filterCommands("zzzzz", "log")).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/commands.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `src/core/commands.ts`:

```typescript
import type { PanelId, IconKey } from "./types";
import { fuzzyScore } from "./chrome";

export interface Command {
  id: string;
  title: string;
  aliases?: string[];
  hint?: string;
  icon?: IconKey;
  context?: (panel: PanelId) => boolean; // shown only when true (default: always)
}

export const COMMANDS: Command[] = [
  { id: "panel.lens", title: "Show Lens", aliases: ["lens"], icon: "skill" },
  { id: "panel.files", title: "Show Files", aliases: ["files"], icon: "read" },
  { id: "panel.tasks", title: "Show Tasks", aliases: ["tasks"], icon: "todo" },
  { id: "panel.git", title: "Show Git", aliases: ["git"], icon: "tool" },
  { id: "panel.log", title: "Show Log", aliases: ["log"], icon: "text" },
  { id: "nav.sessions", title: "Sessions…", aliases: ["sessions", "proj", "projects"], icon: "task" },
  { id: "view.help", title: "Help", aliases: ["help"], hint: "?" },
  { id: "view.rescan", title: "Rescan", aliases: ["rescan", "refresh", "reload"] },
  { id: "play.pause", title: "Pause / Play", aliases: ["pause", "play"] },
  { id: "play.replay", title: "Replay", aliases: ["replay"] },
  { id: "play.loop", title: "Loop", aliases: ["loop"] },
  { id: "view.pulse", title: "Toggle Pulse", aliases: ["pulse"] },
  { id: "files.sort", title: "Sort: edits / reads / recent", aliases: ["sort"], context: (p) => p === "files" },
  { id: "git.scope", title: "Scope: all / branch", aliases: ["scope"], context: (p) => p === "git" },
  { id: "tasks.hideDone", title: "Toggle hide-completed", aliases: ["hide-done", "hide"], context: (p) => p === "tasks" },
  { id: "app.quit", title: "Quit", aliases: ["q", "quit", "exit"] },
];

// Context-filter for the active panel, then fuzzy-rank by best score over
// title + aliases. Empty query keeps registry order; ties keep registry order.
export function filterCommands(query: string, panel: PanelId): Command[] {
  const scored: { c: Command; score: number; i: number }[] = [];
  COMMANDS.forEach((c, i) => {
    if (c.context && !c.context(panel)) return;
    const targets = [c.title, ...(c.aliases ?? [])];
    let best: number | null = null;
    for (const t of targets) {
      const s = fuzzyScore(query, t);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) scored.push({ c, score: best, i });
  });
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return scored.map((x) => x.c);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/commands.test.ts`
Expected: PASS. If `q[0].id` for `"git"` is not `panel.git`, confirm `fuzzyScore` ranks the exact-prefix alias `git` highest (it does: 3 consecutive word-start-boosted chars).

- [ ] **Step 5: Typecheck + commit**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS.

```bash
git add src/core/commands.ts tests/commands.test.ts
git commit -m "feat(commands): registry + filterCommands (pure, TDD)"
```

---

## Task 7: Theme — add shared `TRANSPARENT`

Add the shared transparent constant now (old `bg`/`panel`/`sel` removed in the final cleanup task once no consumer references them — keeps every commit green).

**Files:**
- Modify: `src/ui/theme.ts`

- [ ] **Step 1: Add the constant**

In `src/ui/theme.ts`, add the import + export (keep existing tokens for now):

```typescript
import { RGBA } from "@opentui/core";

export const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);
```

(Place the `import` at the top and the `export const TRANSPARENT` after the `theme` object.)

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/theme.ts
git commit -m "feat(theme): export shared TRANSPARENT constant"
```

---

## Task 8: Header component (absorbs StatusBar)

Top block: context/status (left) + hint grid (right). Replaces the header lines in `Showcase` and the bottom `StatusBar`.

**Files:**
- Create: `src/ui/Header.tsx`
- Modify: `src/ui/Showcase.tsx`
- Delete: `src/ui/StatusBar.tsx`

- [ ] **Step 1: Create the Header**

Create `src/ui/Header.tsx`:

```tsx
import type { SessionState, PanelId } from "../core/types";
import { effectiveContextLimit } from "../core/tokens";
import { hintsFor } from "../core/chrome";
import { theme, TRANSPARENT } from "./theme";
import { statusGlyph, gaugeBar, fmtCost, fmtTokens } from "./format";

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function Header({ session, panel, marker }: { session: SessionState; panel: PanelId; marker: string }) {
  const g = statusGlyph(session.status);
  const pct = session.tokens.contextPct;
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  const elapsed = fmtElapsed(Math.max(0, session.lastActivityTs - session.startedTs));
  const limit = effectiveContextLimit(session.model, session.tokens.contextTokens);
  const rows = chunk(hintsFor(panel), 3);

  return (
    <box style={{ flexShrink: 0, flexDirection: "row", justifyContent: "space-between", backgroundColor: TRANSPARENT }}>
      <box style={{ flexDirection: "column", backgroundColor: TRANSPARENT }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={g.color}>{g.glyph}</text>
          <text fg={theme.fg}>{`${session.project} · ${session.gitBranch || "?"} · ${session.model} · ${session.status}`}</text>
        </box>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.dim}>ctx</text>
          <text fg={pctColor}>{gaugeBar(pct, 10)}</text>
          <text fg={pctColor}>{Math.round(pct * 100) + "%"}</text>
          <text fg={theme.dim}>{fmtTokens(session.tokens.contextTokens, limit)}</text>
          <text fg={theme.ok}>{fmtCost(session.costUSD)}</text>
          <text fg={theme.dim}>{elapsed}</text>
          <text fg={theme.accent}>{marker}</text>
          {session.parseErrors > 0 && <text fg={theme.err}>{`⚠ ${session.parseErrors}`}</text>}
        </box>
      </box>
      <box style={{ flexDirection: "column", alignItems: "flex-end", backgroundColor: TRANSPARENT }}>
        {rows.map((row, i) => (
          <box key={i} style={{ flexDirection: "row" }}>
            {row.map((h) => (
              <box key={h.key} style={{ flexDirection: "row" }}>
                <text fg={theme.accent}>{h.key}</text>
                <text fg={theme.dim}>{` ${h.label}  `}</text>
              </box>
            ))}
          </box>
        ))}
      </box>
    </box>
  );
}
```

- [ ] **Step 2: Wire Header into Showcase, drop the old header lines + StatusBar**

In `src/ui/Showcase.tsx`:
- Remove the imports of `PhaseRibbon` and `StatusBar`; add `import { Header } from "./Header";`.
- Replace the entire header cluster `<box style={{ flexShrink: 0, flexDirection: "column" }}>…</box>` (the PhaseRibbon + project line + title + tab strip block) with:
```tsx
      <Header session={session} panel={panel} marker={marker} />
```
- Remove the footer `<box style={{ flexShrink: 0 }}><StatusBar … /></box>` block entirely.
- Keep the body `<box>` and the panel renders. (TabBar is added in Task 9; for now the body keeps `marginTop: 1`.)
- `Showcase` already receives `marker` as a prop — keep it.

- [ ] **Step 3: Delete StatusBar**

Run: `git rm src/ui/StatusBar.tsx`

- [ ] **Step 4: Typecheck + test**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS. (If `Showcase` still imports `truncate`/`usePowerline` only for removed code, drop those imports.)

- [ ] **Step 5: tmux verify — header on top, no bottom bar**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p; tmux send-keys -t cl q
```
Expected: top shows `● project · branch · model · status` + ctx/cost line on the left and a right-aligned hint grid (`: cmd  Tab cycle  …`); no status bar at the bottom; body fills down.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Header.tsx src/ui/Showcase.tsx
git commit -m "feat(chrome): top Header block, remove bottom StatusBar"
```

---

## Task 9: TabBar — merged-border boxy tabs + phase ribbon

Buffered 2-row tab bar from `tabBarCells`, with the phase ribbon right-aligned on the seam. Frame loses its top border (TabBar supplies it).

**Files:**
- Create: `src/ui/TabBar.tsx`
- Modify: `src/ui/Showcase.tsx`
- Delete: `src/ui/PhaseRibbon.tsx`

- [ ] **Step 1: Create TabBar**

Create `src/ui/TabBar.tsx`:

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { tabBarCells, tabModel, type TabRole } from "../core/chrome";
import type { PanelId, LensState } from "../core/types";
import { SUPERPOWERS_PHASES } from "../core/lens";
import { theme, TRANSPARENT } from "./theme";

function roleColor(role: TabRole): RGBA {
  // active label + frame border = accent; inactive labels = dim
  return RGBA.fromHex(role === "inactive" ? theme.dim : theme.accent);
}

export function TabBar({ panels, active, lens, width }: { panels: PanelId[]; active: PanelId; lens: LensState; width: number }) {
  return (
    <box
      style={{ width, height: 2, flexShrink: 0, backgroundColor: TRANSPARENT }}
      buffered
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        for (const c of tabBarCells(tabModel(panels, active), width)) {
          buffer.setCell(c.x, c.row, c.ch, roleColor(c.role), TRANSPARENT);
        }
        // phase ribbon on the seam (row 1), right-aligned, never overwriting the corner
        if (lens.lensId) {
          const text = SUPERPOWERS_PHASES.join(" ");
          let x = width - 2 - text.length;
          for (const p of SUPERPOWERS_PHASES) {
            const isActive = p === lens.activePhase;
            const isDone = lens.phaseHistory.some((h) => h.phase === p) && !isActive;
            const color = RGBA.fromHex(isActive ? theme.accent : isDone ? theme.ok : theme.dim);
            if (x > 0 && x < width - 1) buffer.setCell(x, 1, " ", RGBA.fromHex(theme.dim), TRANSPARENT);
            x += 1;
            for (const ch of p) {
              if (x > 0 && x < width - 1) buffer.setCell(x, 1, ch, color, TRANSPARENT);
              x += 1;
            }
          }
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Wire TabBar + per-side frame border in Showcase**

In `src/ui/Showcase.tsx`:
- Add `import { TabBar } from "./TabBar";` and `import { PANELS } from "../core/types";` (or reuse the existing `PANELS`).
- The outer container becomes a transparent column with no border; the body becomes the bordered frame with **no top border**. Replace the outer `<box style={{ flexGrow: 1, border: true, flexDirection: "column", padding: 1 }}>` wrapper structure with:

```tsx
  return (
    <box style={{ flexGrow: 1, flexDirection: "column", backgroundColor: TRANSPARENT }}>
      <Header session={session} panel={panel} marker={marker} />
      <TabBar panels={PANELS} active={panel} lens={lensOn ? session.lens : { ...session.lens, lensId: null }} width={width} />
      <box
        style={{
          flexGrow: 1, flexShrink: 1,
          border: ["left", "right", "bottom"], borderStyle: "rounded", borderColor: theme.accent,
          paddingLeft: 1, paddingRight: 1, backgroundColor: TRANSPARENT,
        }}
      >
        {panel === "lens" && <Lens />}
        {panel === "log" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
        {panel === "files" && <Files heat={agg.fileHeat} height={bodyHeight} progress={progress} />}
        {panel === "tasks" && <Tasks todos={agg.todos} lens={tasksLens} height={bodyHeight} progress={progress} />}
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} progress={progress} />}
      </box>
    </box>
  );
```
- Recompute the body height budget near the top of the component: `const bodyHeight = Math.max(1, height - 6);` (header 2 + tabbar 2 + bottom border 1 + slack).
- Import `TRANSPARENT` from `./theme`.

- [ ] **Step 3: Delete PhaseRibbon**

Run: `git rm src/ui/PhaseRibbon.tsx`

- [ ] **Step 4: Typecheck + test**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS.

- [ ] **Step 5: tmux verify — merged tabs, ribbon, transparency**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p; tmux send-keys -t cl Tab; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl q
```
Expected: the active tab renders as a raised notch `╭─Log─╮` opening into the frame; inactive tabs are dim labels on the same border line; pressing Tab moves the notch to the next tab; phase ribbon (if a superpowers session) appears right-aligned on the border; no background fill anywhere. If glyphs misalign in tmux, this is the known ghosting issue — confirm `App.tsx` `forceRepaint` fires on panel change (it does).

- [ ] **Step 6: Commit**

```bash
git add src/ui/TabBar.tsx src/ui/Showcase.tsx
git commit -m "feat(chrome): merged-border boxy TabBar + phase ribbon, per-side frame"
```

---

## Task 10: Menu component + fullscreen picker/help

Shared fullscreen bordered menu. The session picker (two-step) and help both render through it. `SessionPicker.tsx`'s data helpers (`projectsOf`/`sessionsOf`/`ProjectRow`) move into `Menu.tsx` or stay importable.

**Files:**
- Create: `src/ui/Menu.tsx`
- Modify: `src/ui/App.tsx`
- Delete: `src/ui/SessionPicker.tsx` (move `projectsOf`/`sessionsOf` into `Menu.tsx`)

- [ ] **Step 1: Create Menu (with the picker data helpers)**

Create `src/ui/Menu.tsx`:

```tsx
import type { SessionState } from "../core/types";
import { theme, TRANSPARENT } from "./theme";
import { statusGlyph, truncate } from "./format";
import { menuWindow } from "../core/chrome";

export interface ProjectRow { project: string; count: number; live: number; lastTs: number }

export function projectsOf(sessions: SessionState[]): ProjectRow[] {
  const map = new Map<string, ProjectRow>();
  for (const s of sessions) {
    const p = s.project || "(unknown)";
    const cur = map.get(p) ?? { project: p, count: 0, live: 0, lastTs: 0 };
    cur.count += 1;
    if (s.status === "running" || s.status === "working") cur.live += 1;
    cur.lastTs = Math.max(cur.lastTs, s.lastActivityTs);
    map.set(p, cur);
  }
  return [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
}

export function sessionsOf(sessions: SessionState[], project: string): SessionState[] {
  return sessions
    .filter((s) => (s.project || "(unknown)") === project)
    .sort((a, b) => b.lastActivityTs - a.lastActivityTs);
}

export interface MenuRow { id: string; left: string; leftColor?: string; right?: string; rightColor?: string }

// Fullscreen bordered menu — transparent inside, selection = ▸ + accent fg.
export function Menu({ title, footer, rows, index, width, height }:
  { title: string; footer: string; rows: MenuRow[]; index: number; width: number; height: number }) {
  const inner = Math.max(1, height - 4);
  const win = menuWindow(rows.length, index, inner);
  const slice = rows.slice(win.start, win.start + win.count);
  return (
    <box
      style={{
        position: "absolute", left: 0, top: 0, width, height,
        border: true, borderStyle: "rounded", borderColor: theme.accent,
        padding: 1, backgroundColor: TRANSPARENT, flexDirection: "column",
      }}
      title={title}
    >
      {rows.length === 0 && <text fg={theme.dim}>nothing here</text>}
      {slice.map((r, i) => {
        const sel = win.start + i === index;
        return (
          <box key={r.id} style={{ flexShrink: 0, flexDirection: "row", backgroundColor: TRANSPARENT }}>
            <text fg={sel ? theme.accent : theme.dim}>{sel ? "▸ " : "  "}</text>
            <text fg={r.leftColor ?? (sel ? theme.fg : theme.dim)}>{r.left}</text>
            {r.right && <text fg={r.rightColor ?? theme.dim}>{`  ${r.right}`}</text>}
          </box>
        );
      })}
      {win.more > 0 && <text fg={theme.dim}>{`  +${win.more} more`}</text>}
      <box style={{ flexGrow: 1 }} />
      <text fg={theme.dim}>{footer}</text>
    </box>
  );
}

// Build picker rows (project stage or session stage).
export function pickerRows(sessions: SessionState[], project: string | null): MenuRow[] {
  if (!project) {
    return projectsOf(sessions).map((p) => ({
      id: p.project,
      left: truncate(p.project, 40),
      right: `${p.count}·${p.live}▲`,
      rightColor: p.live ? theme.ok : theme.dim,
    }));
  }
  return sessionsOf(sessions, project).map((s) => {
    const g = statusGlyph(s.status);
    return { id: s.id, left: `${g.glyph} ${truncate(s.title || s.id, 44)}`, leftColor: g.color };
  });
}

// Static help rows.
export function helpRows(): MenuRow[] {
  return [
    { id: "h1", left: ": command palette (fuzzy)", right: ":" },
    { id: "h2", left: "cycle panels", right: "Tab / Shift-Tab" },
    { id: "h3", left: "scrub beats", right: "h / l  ← →" },
    { id: "h4", left: "chunk scrub", right: "[ ]" },
    { id: "h5", left: "start / live", right: "g / G" },
    { id: "h6", left: "pause", right: "space" },
    { id: "h7", left: "speed", right: "+ / -" },
    { id: "h8", left: "pulse", right: "p" },
    { id: "h9", left: "lens ribbon", right: "w" },
    { id: "h10", left: "replay / loop", right: "R / L" },
    { id: "h11", left: "rescan", right: "r" },
    { id: "h12", left: "sessions", right: ": sessions" },
    { id: "h13", left: "quit", right: "q  ( :q )" },
  ];
}
```

- [ ] **Step 2: Replace SessionPicker usage in App with Menu**

In `src/ui/App.tsx`:
- Replace `import { SessionPicker, projectsOf, sessionsOf, type PickerState } from "./SessionPicker";` with:
```tsx
import { Menu, pickerRows, helpRows, projectsOf, sessionsOf } from "./Menu";
```
- Keep the `PickerState` type locally (it was defined in SessionPicker). Add near the top of `App.tsx`:
```tsx
type PickerState = { open: boolean; stage: "projects" | "sessions"; project: string | null; index: number };
```
- Replace the picker render at the bottom:
```tsx
      {picker.open && <SessionPicker sessions={sessions} picker={picker} width={Math.min(54, w - 4)} height={h - 2} />}
```
with:
```tsx
      {picker.open && (
        <Menu
          title={picker.stage === "projects" ? " PROJECTS · ⏎ open · esc close " : ` ${picker.project ?? ""} · ⏎ open · esc back `}
          footer="⏎ open · j/k move · esc back"
          rows={pickerRows(sessions, picker.stage === "projects" ? null : picker.project)}
          index={picker.index}
          width={w}
          height={h}
        />
      )}
```
- Replace the help overlay block:
```tsx
      {showHelp && ( … )}
```
with:
```tsx
      {showHelp && (
        <Menu title=" KEYS · esc close " footer="esc close" rows={helpRows()} index={-1} width={w} height={h} />
      )}
```
(`index={-1}` → no row highlighted; help is read-only.)

- [ ] **Step 3: Delete SessionPicker**

Run: `git rm src/ui/SessionPicker.tsx`

- [ ] **Step 4: Typecheck + test**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS. The picker keyboard handling in `App.tsx` still uses `projectsOf`/`sessionsOf` (now imported from `Menu`) — verify those references resolve.

- [ ] **Step 5: tmux verify — fullscreen picker + help**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux send-keys -t cl ":"; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl Escape; tmux send-keys -t cl "?"; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl q
```
Expected: `:` currently still opens the picker (palette comes in Task 11) as a fullscreen transparent bordered list; `?` opens a fullscreen help list; both fill the frame, transparent inside, `▸` selection on the picker.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Menu.tsx src/ui/App.tsx
git commit -m "feat(chrome): shared fullscreen Menu for picker + help"
```

---

## Task 11: Command palette + dispatch (`:`)

Replace `:`-as-picker with the fuzzy command palette. Manual text input via `key.sequence`; dispatch maps command ids to existing handlers; `:sessions`/`:help`/`:q` reach the picker/help/quit.

**Files:**
- Create: `src/ui/CommandPalette.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Create CommandPalette**

Create `src/ui/CommandPalette.tsx`:

```tsx
import { theme, TRANSPARENT } from "./theme";
import { filterCommands } from "../core/commands";
import { menuWindow } from "../core/chrome";
import type { PanelId } from "../core/types";
import { iconFor } from "./icons";

const ROWS = 8;

export function CommandPalette({ query, index, panel, width }:
  { query: string; index: number; panel: PanelId; width: number }) {
  const matches = filterCommands(query, panel);
  const win = menuWindow(matches.length, Math.max(0, index), ROWS);
  const slice = matches.slice(win.start, win.start + win.count);
  const w = Math.min(60, Math.max(20, width - 4));
  return (
    <box
      style={{
        position: "absolute", left: 1, top: 1, width: w,
        border: true, borderStyle: "rounded", borderColor: theme.accent,
        paddingLeft: 1, paddingRight: 1, backgroundColor: TRANSPARENT, flexDirection: "column",
      }}
      title=" command "
    >
      <box style={{ flexDirection: "row" }}>
        <text fg={theme.accent}>{": "}</text>
        <text fg={theme.fg}>{query}</text>
        <text fg={theme.accent}>▏</text>
      </box>
      {matches.length === 0 && <text fg={theme.dim}>no match</text>}
      {slice.map((c, i) => {
        const sel = win.start + i === index;
        return (
          <box key={c.id} style={{ flexShrink: 0, flexDirection: "row" }}>
            <text fg={sel ? theme.accent : theme.dim}>{sel ? "▸ " : "  "}</text>
            {c.icon && <text fg={theme.dim}>{iconFor(c.icon) + " "}</text>}
            <text fg={sel ? theme.fg : theme.dim}>{c.title}</text>
            {c.hint && <text fg={theme.dim}>{`  ${c.hint}`}</text>}
          </box>
        );
      })}
      <text fg={theme.dim}>{"⏎ run · Tab complete · esc close"}</text>
    </box>
  );
}
```

- [ ] **Step 2: Add palette state + a `runCommand` dispatcher in App**

In `src/ui/App.tsx`, add state (near the other `useState`s):

```tsx
const [palette, setPalette] = useState<{ open: boolean; query: string; index: number }>({ open: false, query: "", index: 0 });
const [filesSort, setFilesSort] = useState<"edits" | "reads" | "recent">("edits");
const [gitScope, setGitScope] = useState<"all" | "branch">("all");
const [tasksHideDone, setTasksHideDone] = useState(false);
```

Add imports:
```tsx
import { CommandPalette } from "./CommandPalette";
import { filterCommands } from "../core/commands";
```

Add the dispatcher (after `stepSel`):
```tsx
const runCommand = (id: string) => {
  switch (id) {
    case "panel.lens": setPanel("lens"); break;
    case "panel.files": setPanel("files"); break;
    case "panel.tasks": setPanel("tasks"); break;
    case "panel.git": setPanel("git"); break;
    case "panel.log": setPanel("log"); break;
    case "nav.sessions": setPicker({ open: true, stage: "projects", project: null, index: 0 }); break;
    case "view.help": setShowHelp(true); break;
    case "view.rescan":
      store.pollOnce(Date.now());
      if (selected && (panel === "files" || panel === "tasks" || panel === "git")) {
        const fs = store.fullSession(selected.id); setFull(fs);
        if (panel === "git") setCommits(fs?.cwd ? gitLog(fs.cwd, gitScope === "all") : []);
      }
      break;
    case "play.pause": activePlayer && (activePlayer.mode() === "paused" ? activePlayer.play() : activePlayer.pause()); break;
    case "play.replay": {
      if (replay.player) { setReplay({ player: null }); break; }
      if (!selected) break;
      const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
      rp.setBeats(store.fullBeats(selected.id));
      setReplay({ player: rp });
      break;
    }
    case "play.loop": if (replay.player) { replay.player.setLoop(!replay.player.isLoop()); setReplay({ player: replay.player }); } break;
    case "view.pulse": setPulse((p) => !p); break;
    case "files.sort": setFilesSort((s) => (s === "edits" ? "reads" : s === "reads" ? "recent" : "edits")); break;
    case "git.scope": setGitScope((s) => (s === "all" ? "branch" : "all")); break;
    case "tasks.hideDone": setTasksHideDone((v) => !v); break;
    case "app.quit": renderer.destroy(); break;
  }
};
```

- [ ] **Step 3: Handle palette keys + open with `:`**

In the `useKeyboard` handler in `App.tsx`:
- Add a palette branch at the very top (before the `picker.open` branch):
```tsx
if (palette.open) {
  const matches = filterCommands(palette.query, panel);
  if (kn === "escape") { setPalette({ open: false, query: "", index: 0 }); return; }
  if (kn === "return" || kn === "enter") {
    const cmd = matches[palette.index] ?? matches[0];
    setPalette({ open: false, query: "", index: 0 });
    if (cmd) runCommand(cmd.id);
    return;
  }
  if (kn === "tab") { const top = matches[0]; if (top) setPalette((p) => ({ ...p, query: top.title, index: 0 })); return; }
  if (kn === "up") { setPalette((p) => ({ ...p, index: Math.max(0, p.index - 1) })); return; }
  if (kn === "down") { setPalette((p) => ({ ...p, index: Math.min(Math.max(0, matches.length - 1), p.index + 1) })); return; }
  if (kn === "backspace") { setPalette((p) => ({ ...p, query: p.query.slice(0, -1), index: 0 })); return; }
  if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
    setPalette((p) => ({ ...p, query: p.query + key.sequence, index: 0 }));
  }
  return;
}
```
- Change the `:` opener (currently `if (kn === ":") { setPicker(...) }`) to open the palette:
```tsx
if (kn === ":") { setPalette({ open: true, query: "", index: 0 }); return; }
```

- [ ] **Step 4: Render the palette + extend forceRepaint deps**

Add to the JSX (alongside the picker/help overlays):
```tsx
      {palette.open && <CommandPalette query={palette.query} index={palette.index} panel={panel} width={w} />}
```
Extend the repaint effect deps list to include palette fields:
```tsx
  useEffect(() => { forceRepaint(); }, [panel, selected?.id, replay.player, picker.open, picker.stage, full, lensOn, showHelp, pulse, palette.open, palette.query, forceRepaint]);
```

- [ ] **Step 5: Typecheck + test**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS. (`key.sequence` exists on `KeyEvent`; if the local key type in `App`'s `useKeyboard` callback is too narrow, read it as `(key)` untyped from the hook — `useKeyboard` provides the full `KeyEvent`.)

- [ ] **Step 6: tmux verify — palette fuzzy + run + :q**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux send-keys -t cl ":"; tmux send-keys -t cl "git"; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl Enter; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl ":" ; tmux send-keys -t cl "q"; tmux send-keys -t cl Enter; sleep 1; tmux capture-pane -t cl -p
```
Expected: typing `:git` shows ranked matches with `Show Git` selected; Enter switches to the Git panel; `:q`+Enter exits the app (pane shows the shell prompt). Also verify `:` then `sc` on the Git panel surfaces `Scope: all / branch`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/CommandPalette.tsx src/ui/App.tsx
git commit -m "feat(chrome): fuzzy command palette (:) + dispatch, replaces :-picker"
```

---

## Task 12: Per-tab actions wired into panels (sort / scope / hide-done)

Make the context commands actually affect the panels.

**Files:**
- Modify: `src/ui/panels/Files.tsx`, `src/ui/panels/Tasks.tsx`, `src/store/gitFetch.ts`, `src/core/git-log.ts`, `src/ui/Showcase.tsx`, `src/ui/App.tsx`

- [ ] **Step 1: Files sort prop**

In `src/ui/panels/Files.tsx`, change the signature + sort:
```tsx
export function Files({ heat, height, progress, sort }: { heat: Record<string, FileHeat>; height: number; progress: number; sort: "edits" | "reads" | "recent" }) {
  const entries = Object.entries(heat)
    .map(([file, h]) => ({ file, score: h.edits * 2 + h.reads, h }))
    .sort((a, b) =>
      sort === "recent" ? b.h.lastTs - a.h.lastTs
      : sort === "reads" ? b.h.reads - a.h.reads
      : b.score - a.score)
    .slice(0, height);
  // …rest unchanged…
```

- [ ] **Step 2: Tasks hideDone prop**

In `src/ui/panels/Tasks.tsx`, add `hideDone` and filter the todo list:
```tsx
export function Tasks({ todos, lens, height, progress, hideDone }: { todos: TodoItem[] | null; lens: LensState; height: number; progress: number; hideDone: boolean }) {
  const list = todos && hideDone ? todos.filter((t) => t.status !== "completed") : todos;
  if (list && list.length > 0) {
    const done = list.filter((t) => t.status === "completed").length;
    // …replace remaining `todos` references in this branch with `list`…
```
(Keep the `done/list.length` gauge and the `list.slice(...)` mapping; the phase-fallback branch is unchanged.)

- [ ] **Step 3: gitLog scope param**

In `src/core/git-log.ts`, export a branch-only arg set alongside the existing all-branches one. If `GIT_LOG_ARGS` is `["log", "--all", "--no-patch", "--pretty=…"]`, add:
```typescript
export const GIT_LOG_ARGS_BRANCH = GIT_LOG_ARGS.filter((a) => a !== "--all");
```
In `src/store/gitFetch.ts`, change `gitLog` to accept the flag:
```typescript
import { parseGitLog, GIT_LOG_ARGS, GIT_LOG_ARGS_BRANCH } from "../core/git-log";

export function gitLog(cwd: string, allBranches = true): import("../core/types").Commit[] {
  const args = allBranches ? GIT_LOG_ARGS : GIT_LOG_ARGS_BRANCH;
  // …spawn git with `args` (was GIT_LOG_ARGS), parse stdout via parseGitLog…
}
```

- [ ] **Step 4: Thread option props through Showcase + App**

In `src/ui/Showcase.tsx`, extend `Props` with `filesSort`, `tasksHideDone` and pass them:
```tsx
        {panel === "files" && <Files heat={agg.fileHeat} height={bodyHeight} progress={progress} sort={filesSort} />}
        {panel === "tasks" && <Tasks todos={agg.todos} lens={tasksLens} height={bodyHeight} progress={progress} hideDone={tasksHideDone} />}
```
In `src/ui/App.tsx`:
- Pass `filesSort={filesSort}` and `tasksHideDone={tasksHideDone}` to `<Showcase … />`.
- In the commits-loading `useEffect`, use the scope: `setCommits(panel === "git" && fs?.cwd ? gitLog(fs.cwd, gitScope === "all") : []);` and add `gitScope` to that effect's dependency array.

- [ ] **Step 5: Typecheck + test**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS.

- [ ] **Step 6: tmux verify — actions take effect**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux send-keys -t cl ":"; tmux send-keys -t cl "files"; tmux send-keys -t cl Enter; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl ":"; tmux send-keys -t cl "sort"; tmux send-keys -t cl Enter; sleep 1; tmux capture-pane -t cl -p; tmux send-keys -t cl q
```
Expected: the Files panel ordering changes after running `sort`. (Repeat the pattern for `:scope` on Git and `:hide-done` on Tasks.)

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/Files.tsx src/ui/panels/Tasks.tsx src/core/git-log.ts src/store/gitFetch.ts src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(chrome): wire per-tab commands (files sort, git scope, tasks hide-done)"
```

---

## Task 13: Theme cleanup + final verification

Remove now-unused tokens and dead references; full green + visual pass.

**Files:**
- Modify: `src/ui/theme.ts`, any remaining `theme.bg`/`theme.panel`/`theme.sel` users.

- [ ] **Step 1: Find remaining bg-token users**

Run: `grep -rn "theme.bg\|theme.panel\|theme.sel" src`
Expected: ideally no matches (App's `TRANSPARENT` const and overlays now use `theme`/`TRANSPARENT`). If `App.tsx` still defines a local `TRANSPARENT` and references nothing from removed tokens, fine. Replace any lingering `theme.panel`/`theme.sel` with `TRANSPARENT` (overlays) or appropriate fg tokens.

- [ ] **Step 2: Remove the dead tokens**

In `src/ui/theme.ts`, delete the `bg`, `panel`, and `sel` keys from the `theme` object.

- [ ] **Step 3: Replace App's local TRANSPARENT with the shared one**

In `src/ui/App.tsx`, remove the local `const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);` and import it: `import { theme, TRANSPARENT } from "./theme";` (drop the now-unused `RGBA` import if nothing else uses it).

- [ ] **Step 4: Typecheck + full suite**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS — all tests, no type errors, no references to removed tokens.

- [ ] **Step 5: Full visual sweep (nerd + unicode)**

Run:
```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"; sleep 4; tmux capture-pane -t cl -p
# cycle every panel
for k in Tab Tab Tab Tab; do tmux send-keys -t cl $k; sleep 0.6; tmux capture-pane -t cl -p; done
# palette, picker, help, quit
tmux send-keys -t cl ":"; tmux send-keys -t cl "lens"; tmux send-keys -t cl Enter; sleep 0.6; tmux capture-pane -t cl -p
tmux send-keys -t cl ":"; tmux send-keys -t cl "q"; tmux send-keys -t cl Enter; sleep 1; tmux capture-pane -t cl -p
tmux kill-session -t cl 2>/dev/null
CL_ICONS=unicode tmux new-session -d -s cl2 -x 150 -y 40 "CL_ICONS=unicode bun run dev"; sleep 4; tmux capture-pane -t cl2 -p; tmux send-keys -t cl2 q; tmux kill-session -t cl2 2>/dev/null
```
Expected: every panel renders inside the merged-tab frame; header + hints on top; no bottom bar; palette/picker/help fully transparent; `:q` exits cleanly; unicode fallback renders without missing glyphs.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.ts src/ui/App.tsx
git commit -m "refactor(theme): drop bg/panel/sel, shared TRANSPARENT everywhere"
```

---

## Self-review (completed by plan author)

**Spec coverage:**
- k9s-pure top header, no bottom bar → Task 8 (Header absorbs StatusBar). ✓
- 100% transparent, selection via ▸+accent → Tasks 7, 10, 11, 13. ✓
- Single accent border line → Task 9 (`borderColor: theme.accent`). ✓
- Merged-border boxy tabs, order Lens·Files·Tasks·Git·Log → Tasks 1, 4, 9. ✓
- Default `log` → Task 1. ✓
- Fuzzy command palette `:` (vi `:q`, autocomplete), replaces `:`-picker + `m` → Tasks 2, 6, 11. ✓
- Fuzzy matcher shipped here → Task 2 (`fuzzyScore`). ✓
- Picker/help fullscreen via shared Menu → Task 10. ✓
- Per-tab actions (files sort, git scope, tasks hide-done) → Task 12. ✓
- Phase ribbon → TabBar; PhaseRibbon/StatusBar/SessionPicker removed → Tasks 8, 9, 10. ✓
- Pure-core helpers + tests → Tasks 1–6. ✓
- **Deferred (explicit):** keymap binding overhaul + quit terminal-restore stay in the Nav/Lifecycle spec; `app.quit` here calls the existing `renderer.destroy()` path. `:q` may still require Ctrl+C until Nav fixes restore — verify in Task 11 Step 6 and note if so.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — every code step shows complete code. The `Lens` panel is an intentional placeholder body (spec-mandated, labeled).

**Type consistency:** `PanelId`/`PANELS`/`DEFAULT_PANEL` (core/types) used uniformly; `fuzzyScore`/`menuWindow`/`tabBarCells`/`tabModel`/`hintsFor` signatures match across chrome.ts + commands.ts + components; `gitLog(cwd, allBranches)` updated at definition (git-log/gitFetch) and both call sites (rescan dispatch + commits effect); `Files`/`Tasks` prop additions threaded through `Showcase` Props and `App`.
