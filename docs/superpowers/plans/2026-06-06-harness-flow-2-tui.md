# harness-flow TUI Implementation Plan (Part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For the UI tasks, also invoke the `opentui` Skill to confirm current `@opentui/react` API details before writing components.

**Goal:** Build the Mission Control TUI (session list + animated showcase with the vertical-metro Flow graph, energy-pulse, gauges, phase ribbon, depth panels, and history scrubbing) on top of the Part 1 engine.

**Architecture:** OpenTUI React renders a thin view of `sessionStore`. Pure view-logic lives in tested helpers (`format.ts`, `keymap.ts`, `anim.ts`). Components are small and focused. The Flow panel draws itself into a buffered renderable (`buffer.setCell` + truecolor `RGBA`) so the energy-pulse can color connector cells per-frame from a time source, with zero React churn between beat changes. A per-session `Player` (Part 1) paces the narrative and owns the history cursor.

**Tech Stack:** Bun, TypeScript, React 19, `@opentui/react`, `@opentui/core`. `bun:test` for helper logic; manual `bun run dev` verification for visual components.

**Depends on:** Part 1 (`src/store/sessionStore.ts`, `src/core/player.ts`, `src/core/flow-layout.ts`, `src/core/types.ts`).

**Spec:** `docs/superpowers/specs/2026-06-06-harness-flow-design.md`

---

## File Structure

```
src/index.tsx          # createCliRenderer + createRoot().render(<App/>); store.start()
src/ui/
  App.tsx              # layout, selection, panel/playback state, keyboard dispatch, anim tick
  SessionList.tsx      # left column: glyph + title + sparkline
  Showcase.tsx         # right column: ribbon + header + active panel + statusbar
  PhaseRibbon.tsx      # Brainstorm ▸ Spec ▸ … (lens)
  StatusBar.tsx        # gauge + tokens + cost + scrubber + playback marker
  panels/Log.tsx       # plain beat stream (fallback)
  panels/Files.tsx     # file heatmap
  panels/Todos.tsx     # todo progress
  panels/Flow.tsx      # buffered metro graph + energy pulse
  theme.ts             # color constants
  format.ts            # glyphs, gauge, sparkline, truncate, fmt
  anim.ts              # spinner frames, pulse intensity + color lerp
  keymap.ts            # key event -> Action
  usePlayers.ts        # per-session Player registry + tick + sync
```

---

## Task 1: Install OpenTUI and render a minimal app

**Files:**
- Modify: `package.json`
- Create: `src/index.tsx`
- Create: `src/ui/App.tsx`

- [ ] **Step 1: Add dependencies**

Run:
```bash
bun add @opentui/core @opentui/react react react-dom
bun add -d @types/react @types/react-dom
```

- [ ] **Step 2: Write a minimal `src/ui/App.tsx`**

```tsx
import { useKeyboard, useRenderer } from "@opentui/react";

export function App() {
  const renderer = useRenderer();
  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) renderer.destroy();
  });
  return (
    <box style={{ border: true, padding: 1, flexDirection: "column" }}>
      <text fg="#00E5FF">harness-flow</text>
      <text fg="#888">press q to quit</text>
    </box>
  );
}
```

- [ ] **Step 3: Write `src/index.tsx`**

```tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App";

const renderer = await createCliRenderer({ exitOnCtrlC: true });
createRoot(renderer).render(<App />);
```

- [ ] **Step 4: Add the dev script and run it**

In `package.json` `scripts`, add: `"dev": "bun run src/index.tsx"`.

Run: `bun run dev`
Expected: a bordered panel showing "harness-flow" and the quit hint. Press `q` to exit cleanly.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock src/index.tsx src/ui/App.tsx
git commit -m "feat(ui): minimal OpenTUI app shell"
```

---

## Task 2: `format.ts` view helpers (TDD)

**Files:**
- Create: `src/ui/theme.ts`
- Create: `src/ui/format.ts`
- Test: `tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/format.test.ts`:
```ts
import { test, expect } from "bun:test";
import { statusGlyph, gaugeBar, sparkline, truncate, fmtCost, fmtTokens } from "../src/ui/format";

test("statusGlyph maps status to glyph + color", () => {
  expect(statusGlyph("running").glyph).toBe("●");
  expect(statusGlyph("error").color).toBe("#FF5370");
  expect(statusGlyph("waiting").pulse).toBe(true);
});

test("gaugeBar fills proportionally", () => {
  expect(gaugeBar(0.5, 10)).toBe("▓▓▓▓▓░░░░░");
  expect(gaugeBar(0, 4)).toBe("░░░░");
  expect(gaugeBar(2, 4)).toBe("▓▓▓▓"); // clamps
});

test("sparkline maps values to blocks", () => {
  expect(sparkline([0, 1], 2)).toBe("▁█");
  expect(sparkline([], 3)).toBe("   ");
});

test("truncate adds ellipsis", () => {
  expect(truncate("hello world", 5)).toBe("hell…");
  expect(truncate("hi", 5)).toBe("hi");
});

test("fmt helpers", () => {
  expect(fmtCost(0.4239)).toBe("$0.42");
  expect(fmtTokens(38000, 200000)).toBe("38k/200k");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/theme.ts` then `src/ui/format.ts`**

`src/ui/theme.ts`:
```ts
export const theme = {
  accent: "#00E5FF",
  dim: "#5A6472",
  fg: "#C8D0DA",
  ok: "#5AF78E",
  warn: "#FFCB6B",
  err: "#FF5370",
  wireDim: "#2E3440",
  wireHot: "#00E5FF",
  laneColors: ["#00E5FF", "#C792EA", "#FFCB6B", "#5AF78E", "#82AAFF", "#F78C6C"],
  bg: "#0B0E14",
  panel: "#11151C",
  sel: "#1C2230",
};
```

`src/ui/format.ts`:
```ts
import type { Status } from "../core/types";
import { theme } from "./theme";

export function statusGlyph(s: Status): { glyph: string; color: string; pulse: boolean } {
  switch (s) {
    case "running": return { glyph: "●", color: theme.ok, pulse: false };
    case "working": return { glyph: "◐", color: theme.accent, pulse: false };
    case "waiting": return { glyph: "◑", color: theme.warn, pulse: true };
    case "error":   return { glyph: "✖", color: theme.err, pulse: true };
    case "dormant": return { glyph: "·", color: theme.dim, pulse: false };
    default:        return { glyph: "○", color: theme.dim, pulse: false };
  }
}

const FILL = "▓", EMPTY = "░";
export function gaugeBar(pct: number, width: number): string {
  const p = Math.max(0, Math.min(1, pct));
  const n = Math.round(p * width);
  return FILL.repeat(n) + EMPTY.repeat(width - n);
}

const SPARK = "▁▂▃▄▅▆▇█";
export function sparkline(values: number[], width: number): string {
  if (values.length === 0) return " ".repeat(width);
  const vals = values.slice(-width);
  const max = Math.max(1, ...vals);
  const cells = vals.map((v) => SPARK[Math.min(SPARK.length - 1, Math.floor((v / max) * (SPARK.length - 1)))]);
  const s = cells.join("");
  return s.length < width ? " ".repeat(width - s.length) + s : s;
}

export function truncate(str: string, n: number): string {
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

export function fmtCost(usd: number): string { return "$" + usd.toFixed(2); }

function k(n: number): string { return n >= 1000 ? Math.round(n / 1000) + "k" : String(n); }
export function fmtTokens(ctx: number, limit: number): string { return `${k(ctx)}/${k(limit)}`; }
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/theme.ts src/ui/format.ts tests/format.test.ts
git commit -m "feat(ui): tested view helpers (glyphs, gauge, sparkline, fmt)"
```

---

## Task 3: `keymap.ts` (TDD)

**Files:**
- Create: `src/ui/keymap.ts`
- Test: `tests/keymap.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/keymap.test.ts`:
```ts
import { test, expect } from "bun:test";
import { mapKey, type Action } from "../src/ui/keymap";

function a(name: string, mods: Partial<{ shift: boolean; ctrl: boolean }> = {}): Action | null {
  return mapKey({ name, shift: !!mods.shift, ctrl: !!mods.ctrl });
}

test("navigation keys", () => {
  expect(a("j")).toEqual({ type: "sess-down" });
  expect(a("up")).toEqual({ type: "sess-up" });
  expect(a("3")).toEqual({ type: "jump", n: 3 });
  expect(a("tab")).toEqual({ type: "panel-next" });
  expect(a("tab", { shift: true })).toEqual({ type: "panel-prev" });
});

test("timeline + playback keys", () => {
  expect(a("h")).toEqual({ type: "beat-back" });
  expect(a("left")).toEqual({ type: "beat-back" });
  expect(a("G")).toEqual({ type: "to-live" });
  expect(a("g")).toEqual({ type: "to-start" });
  expect(a("space")).toEqual({ type: "pause" });
  expect(a("+")).toEqual({ type: "speed-up" });
  expect(a("p")).toEqual({ type: "pulse" });
});

test("unmapped returns null", () => {
  expect(a("z")).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/keymap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/keymap.ts`**

```ts
export type Action =
  | { type: "sess-up" } | { type: "sess-down" } | { type: "jump"; n: number } | { type: "pin" }
  | { type: "panel-next" } | { type: "panel-prev" }
  | { type: "beat-back" } | { type: "beat-fwd" } | { type: "chunk-back" } | { type: "chunk-fwd" }
  | { type: "to-start" } | { type: "to-live" } | { type: "pause" }
  | { type: "speed-up" } | { type: "speed-down" } | { type: "pulse" }
  | { type: "lens" } | { type: "filter" } | { type: "rescan" } | { type: "help" } | { type: "quit" };

export interface KeyEvent { name: string; shift?: boolean; ctrl?: boolean }

export function mapKey(key: KeyEvent): Action | null {
  const n = key.name;
  if (n === "j" || n === "down") return { type: "sess-down" };
  if (n === "k" || n === "up") return { type: "sess-up" };
  if (/^[1-9]$/.test(n)) return { type: "jump", n: parseInt(n, 10) };
  if (n === "return" || n === "enter") return { type: "pin" };
  if (n === "tab") return key.shift ? { type: "panel-prev" } : { type: "panel-next" };
  if (n === "h" || n === "left") return { type: "beat-back" };
  if (n === "l" || n === "right") return { type: "beat-fwd" };
  if (n === "[") return { type: "chunk-back" };
  if (n === "]") return { type: "chunk-fwd" };
  if (n === "g") return { type: "to-start" };
  if (n === "G" || n === "end") return { type: "to-live" };
  if (n === "space") return { type: "pause" };
  if (n === "+" || n === "=") return { type: "speed-up" };
  if (n === "-") return { type: "speed-down" };
  if (n === "p") return { type: "pulse" };
  if (n === "w") return { type: "lens" };
  if (n === "/") return { type: "filter" };
  if (n === "r") return { type: "rescan" };
  if (n === "?") return { type: "help" };
  if (n === "q") return { type: "quit" };
  return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/keymap.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/keymap.ts tests/keymap.test.ts
git commit -m "feat(ui): key event to action mapping"
```

---

## Task 4: `anim.ts` — spinner + pulse color math (TDD)

**Files:**
- Create: `src/ui/anim.ts`
- Test: `tests/anim.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/anim.test.ts`:
```ts
import { test, expect } from "bun:test";
import { spinnerFrame, pulseIntensity, lerpHex } from "../src/ui/anim";

test("spinnerFrame cycles", () => {
  const a = spinnerFrame(0);
  const b = spinnerFrame(1);
  expect(typeof a).toBe("string");
  expect(a).not.toBe(b);
  expect(spinnerFrame(0)).toBe(spinnerFrame(100 * 1)); // wraps by length
});

test("pulseIntensity is 1 at head, fades to 0 past the tail", () => {
  expect(pulseIntensity(0, 4)).toBeCloseTo(1, 5);
  expect(pulseIntensity(4, 4)).toBeCloseTo(0, 5);
  expect(pulseIntensity(10, 4)).toBe(0);
});

test("lerpHex blends endpoints", () => {
  expect(lerpHex("#000000", "#ffffff", 0)).toBe("#000000");
  expect(lerpHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  expect(lerpHex("#000000", "#ffffff", 0.5)).toBe("#808080");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/anim.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/ui/anim.ts`**

```ts
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function spinnerFrame(tick: number): string {
  return SPINNER[((tick % SPINNER.length) + SPINNER.length) % SPINNER.length]!;
}

// distance d (cells) from the pulse head; tailLen cells until fully dim
export function pulseIntensity(d: number, tailLen: number): number {
  if (d < 0 || d >= tailLen) return 0;
  return 1 - d / tailLen;
}

function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");
}
export function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/anim.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/anim.ts tests/anim.test.ts
git commit -m "feat(ui): spinner frames and pulse color math"
```

---

## Task 5: `usePlayers.ts` — per-session player registry + tick

**Files:**
- Create: `src/ui/usePlayers.ts`

- [ ] **Step 1: Implement the hook**

```ts
import { useEffect, useRef, useState } from "react";
import { createPlayer } from "../core/player";
import type { SessionState } from "../core/types";

type Player = ReturnType<typeof createPlayer>;

export function usePlayers(sessions: SessionState[], selectedId: string | null) {
  const players = useRef(new Map<string, Player>());
  const [, force] = useState(0);

  // ensure a player per session and keep its beats in sync
  for (const s of sessions) {
    let p = players.current.get(s.id);
    if (!p) { p = createPlayer(); players.current.set(s.id, p); }
    p.setBeats(s.beats);
  }

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

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors in `usePlayers.ts` (other UI files may still be missing — that is fine until later tasks; re-run after Task 13).

- [ ] **Step 3: Commit**

```bash
git add src/ui/usePlayers.ts
git commit -m "feat(ui): per-session player registry with pacing tick"
```

---

## Task 6: `SessionList.tsx`

**Files:**
- Create: `src/ui/SessionList.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { statusGlyph, sparkline, truncate } from "./format";

interface Props {
  sessions: SessionState[];
  selectedIndex: number;
  blink: boolean; // toggles each ~500ms for pulsing rows
  width: number;
}

function tokenRate(s: SessionState): number[] {
  // crude per-beat output proxy: last few beats' counts
  return s.beats.slice(-12).map((b) => b.count);
}

export function SessionList({ sessions, selectedIndex, blink, width }: Props) {
  const live = sessions.filter((s) => s.status === "running" || s.status === "working").length;
  const waiting = sessions.filter((s) => s.status === "waiting").length;
  return (
    <box style={{ width, border: true, flexDirection: "column", padding: 1 }} title="SESSIONS">
      {sessions.length === 0 && <text fg={theme.dim}>no sessions yet…</text>}
      {sessions.map((s, i) => {
        const g = statusGlyph(s.status);
        const selected = i === selectedIndex;
        const dim = g.pulse && blink;
        const color = dim ? theme.dim : g.color;
        const title = truncate(s.title || s.project || s.id, width - 8);
        return (
          <box key={s.id} style={{ flexDirection: "row", backgroundColor: selected ? theme.sel : undefined }}>
            <text fg={color}>{(selected ? "▸" : " ") + g.glyph + " "}</text>
            <text fg={selected ? theme.fg : theme.dim}>{title}</text>
          </box>
        );
      })}
      <box style={{ flexDirection: "row", marginTop: 1 }}>
        <text fg={theme.dim}>{`${live} live · ${waiting} wait`}</text>
      </box>
      {sessions[selectedIndex] && (
        <text fg={theme.accent}>{sparkline(tokenRate(sessions[selectedIndex]!), width - 4)}</text>
      )}
    </box>
  );
}
```

- [ ] **Step 2: Commit (verified in Task 13's run)**

```bash
git add src/ui/SessionList.tsx
git commit -m "feat(ui): session list with status glyphs and sparkline"
```

---

## Task 7: `PhaseRibbon.tsx`

**Files:**
- Create: `src/ui/PhaseRibbon.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { LensState } from "../core/types";
import { SUPERPOWERS_PHASES } from "../core/lens";
import { theme } from "./theme";

export function PhaseRibbon({ lens }: { lens: LensState }) {
  if (!lens.lensId) return null;
  const phases = SUPERPOWERS_PHASES;
  return (
    <box style={{ flexDirection: "row", gap: 1 }}>
      <text fg={theme.dim}>⟢</text>
      {phases.map((p, i) => {
        const active = p === lens.activePhase;
        const done = lens.phaseHistory.some((h) => h.phase === p) && !active;
        const color = active ? theme.accent : done ? theme.ok : theme.dim;
        return (
          <text key={p} fg={color}>{p}{i < phases.length - 1 ? (active ? " ▸" : " ─") : ""}</text>
        );
      })}
    </box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/PhaseRibbon.tsx
git commit -m "feat(ui): superpowers phase ribbon"
```

---

## Task 8: `StatusBar.tsx`

**Files:**
- Create: `src/ui/StatusBar.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { SessionState } from "../core/types";
import { contextLimit } from "../core/tokens";
import { theme } from "./theme";
import { gaugeBar, fmtCost, fmtTokens } from "./format";

interface Props {
  session: SessionState;
  marker: string;       // "▸ live" | "▸ +7 catching up" | "⏸ paused" | "⏪ 142/318"
  elapsedMs: number;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function StatusBar({ session, marker, elapsedMs }: Props) {
  const pct = session.tokens.contextPct;
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={theme.dim}>ctx </text>
      <text fg={pctColor}>{gaugeBar(pct, 10)}</text>
      <text fg={pctColor}>{Math.round(pct * 100) + "%"}</text>
      <text fg={theme.dim}>{fmtTokens(session.tokens.contextTokens, contextLimit(session.model))}</text>
      <text fg={theme.ok}>{fmtCost(session.costUSD)}</text>
      <text fg={theme.dim}>{fmtElapsed(elapsedMs)}</text>
      <text fg={theme.accent}>{marker}</text>
      {session.parseErrors > 0 && <text fg={theme.err}>{`⚠ ${session.parseErrors}`}</text>}
    </box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/StatusBar.tsx
git commit -m "feat(ui): status bar with context gauge, cost, playback marker"
```

---

## Task 9: `panels/Log.tsx` (fallback narrative)

**Files:**
- Create: `src/ui/panels/Log.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Beat } from "../../core/types";
import { theme } from "../theme";
import { truncate } from "../format";

export function Log({ beats, height }: { beats: Beat[]; height: number }) {
  const rows = beats.slice(-height);
  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((b) => (
        <box key={b.id} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={b.kind === "skill" ? theme.accent : theme.warn}>{b.icon || "·"}</text>
          <text fg={theme.fg}>{b.label}{b.count > 1 ? ` ×${b.count}` : ""}</text>
          {b.detail && <text fg={theme.dim}>· {truncate(b.detail, 50)}</text>}
          {b.ok === false && <text fg={theme.err}>✖</text>}
        </box>
      ))}
    </box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/panels/Log.tsx
git commit -m "feat(ui): Log panel (fallback narrative stream)"
```

---

## Task 10: `panels/Files.tsx`

**Files:**
- Create: `src/ui/panels/Files.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { FileHeat } from "../../core/types";
import { theme } from "../theme";
import { gaugeBar, truncate } from "../format";

export function Files({ heat, height }: { heat: Record<string, FileHeat>; height: number }) {
  const entries = Object.entries(heat)
    .map(([file, h]) => ({ file, score: h.edits * 2 + h.reads, h }))
    .sort((a, b) => b.score - a.score)
    .slice(0, height);
  const max = Math.max(1, ...entries.map((e) => e.score));
  if (entries.length === 0) return <text fg={theme.dim}>no files touched yet</text>;
  return (
    <box style={{ flexDirection: "column" }}>
      {entries.map((e) => (
        <box key={e.file} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.warn}>{gaugeBar(e.score / max, 8)}</text>
          <text fg={theme.fg}>{truncate(e.file, 28)}</text>
          <text fg={theme.dim}>{`✎${e.h.edits} ◇${e.h.reads}`}</text>
        </box>
      ))}
    </box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/panels/Files.tsx
git commit -m "feat(ui): Files heatmap panel"
```

---

## Task 11: `panels/Todos.tsx`

**Files:**
- Create: `src/ui/panels/Todos.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { TodoItem } from "../../core/types";
import { theme } from "../theme";
import { gaugeBar, truncate } from "../format";

const MARK = { completed: "✔", in_progress: "▸", pending: "○" } as const;
const COLOR = { completed: theme.ok, in_progress: theme.accent, pending: theme.dim } as const;

export function Todos({ todos, height }: { todos: TodoItem[] | null; height: number }) {
  if (!todos || todos.length === 0) return <text fg={theme.dim}>no todos</text>;
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <box style={{ flexDirection: "column" }}>
      <box style={{ flexDirection: "row", gap: 1 }}>
        <text fg={theme.ok}>{gaugeBar(done / todos.length, 12)}</text>
        <text fg={theme.dim}>{`${done}/${todos.length}`}</text>
      </box>
      {todos.slice(0, height - 1).map((t, i) => (
        <box key={i} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={COLOR[t.status]}>{MARK[t.status]}</text>
          <text fg={t.status === "completed" ? theme.dim : theme.fg}>{truncate(t.content, 40)}</text>
        </box>
      ))}
    </box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/panels/Todos.tsx
git commit -m "feat(ui): Todos progress panel"
```

---

## Task 12: `panels/Flow.tsx` — buffered metro graph + energy pulse

**Files:**
- Create: `src/ui/panels/Flow.tsx`

This is the flagship and highest-complexity component. It renders into a buffered box via `renderAfter`, drawing connector cells and node labels with `buffer.setCell`/`drawStr`. The energy pulse is computed from `performance.now()` each frame, so it animates continuously at the renderer's target FPS without React re-renders. `layoutFlow` (Part 1) supplies node rows/columns and connector cells.

- [ ] **Step 1: Implement**

```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutFlow } from "../../core/flow-layout";
import type { Beat } from "../../core/types";
import { theme } from "../theme";
import { pulseIntensity, lerpHex } from "../anim";

interface Props {
  beats: Beat[];       // presented (paced) beats from the player
  cursor: number;      // index of the focused/current beat (history or live head)
  pulse: boolean;
  width: number;
  height: number;
}

const ICON_COL = 6;    // x where node icon/label start (after the gutter)
const TAIL = 4;        // pulse tail length in cells

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Flow({ beats, cursor, pulse, width, height }: Props) {
  const graph = layoutFlow(beats);
  const bg = RGBA.fromHex(theme.bg);
  const dimWire = RGBA.fromHex(theme.wireDim);

  // viewport: show the last `height` rows, unless cursor is above the window
  const total = graph.rows;
  const top = Math.max(0, Math.min(total - height, cursor - Math.floor(height / 2)));

  return (
    <box
      style={{ width, height, backgroundColor: theme.bg }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.fillRect(0, 0, width, height, bg);
        const now = (globalThis.performance?.now?.() ?? 0) / 120; // pulse head speed
        const headRow = total > 0 ? now % (total + TAIL) : 0;

        // connectors (segments) with energy pulse coloring
        for (const seg of graph.segments) {
          const laneColor = theme.laneColors[(graph.lanes.find((l) => l.id === seg.lane)?.column ?? 0) % theme.laneColors.length]!;
          for (const c of seg.cells) {
            const y = c.y - top;
            if (y < 0 || y >= height) continue;
            let color = dimWire;
            if (pulse) {
              const d = ((headRow - c.y) % (total + TAIL) + (total + TAIL)) % (total + TAIL);
              const intensity = pulseIntensity(d, TAIL);
              if (intensity > 0) color = RGBA.fromHex(lerpHex(theme.wireDim, laneColor, intensity));
            }
            buffer.setCell(ICON_COL - 2 + c.x, y, c.ch, color, bg);
          }
        }

        // nodes (icon + label) — cursor row highlighted
        for (const node of graph.nodes) {
          const y = node.row - top;
          if (y < 0 || y >= height) continue;
          const b = beats[node.row]!;
          const focused = node.row === cursor;
          const labelColor = RGBA.fromHex(
            b.kind === "skill" ? theme.accent : focused ? theme.fg : b.ok === false ? theme.err : theme.fg,
          );
          const iconColor = RGBA.fromHex(theme.laneColors[node.column % theme.laneColors.length]!);
          const x = ICON_COL - 2 + node.column * 2;
          buffer.setCell(x, y, focused ? "◉" : "○", iconColor, bg);
          const text = ` ${b.icon ? b.icon + " " : ""}${b.label}${b.count > 1 ? ` ×${b.count}` : ""}${b.detail ? " · " + b.detail : ""}`;
          drawStr(buffer, x + 1, y, text.slice(0, width - x - 2), labelColor, bg);
        }
      }}
    />
  );
}
```

> If `@opentui/core` exposes `buffer.drawText(text, x, y, fg, bg)`, prefer it over `drawStr` for performance. Confirm the buffer API via the `opentui` Skill during this task; the `drawStr` loop is a safe fallback that uses only `setCell`.

- [ ] **Step 2: Commit**

```bash
git add src/ui/panels/Flow.tsx
git commit -m "feat(ui): buffered metro Flow graph with energy pulse"
```

---

## Task 13: `Showcase.tsx` + `App.tsx` wiring (keyboard, panels, playback, anim)

**Files:**
- Create: `src/ui/Showcase.tsx`
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Implement `src/ui/Showcase.tsx`**

```tsx
import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { truncate } from "./format";
import { PhaseRibbon } from "./PhaseRibbon";
import { StatusBar } from "./StatusBar";
import { Flow } from "./panels/Flow";
import { Log } from "./panels/Log";
import { Files } from "./panels/Files";
import { Todos } from "./panels/Todos";
import type { Beat } from "../core/types";

export type PanelId = "flow" | "files" | "todos" | "log";
export const PANELS: PanelId[] = ["flow", "files", "todos", "log"];

interface Props {
  session: SessionState | null;
  panel: PanelId;
  presented: Beat[];
  cursor: number;
  pulse: boolean;
  marker: string;
  width: number;
  height: number;
}

export function Showcase({ session, panel, presented, cursor, pulse, marker, width, height }: Props) {
  if (!session) {
    return (
      <box style={{ flexGrow: 1, border: true, padding: 1, justifyContent: "center", alignItems: "center" }}>
        <text fg={theme.dim}>No session selected. Launch Claude Code somewhere — it will appear on the left.</text>
      </box>
    );
  }
  const bodyHeight = height - 6;
  return (
    <box style={{ flexGrow: 1, border: true, flexDirection: "column", padding: 1 }}>
      <PhaseRibbon lens={session.lens} />
      <text fg={theme.fg}>{`● ${session.project} · ${session.gitBranch || "?"} · ${session.model}`}</text>
      <text fg={theme.dim}>{truncate(session.title || session.lastPrompt, width - 6)}</text>
      <box style={{ flexDirection: "row", gap: 1 }}>
        {PANELS.map((p) => (
          <text key={p} fg={p === panel ? theme.accent : theme.dim}>{p === panel ? `[${p}]` : ` ${p} `}</text>
        ))}
      </box>
      <box style={{ flexGrow: 1, marginTop: 1 }}>
        {panel === "flow" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
        {panel === "log" && <Log beats={presented} height={bodyHeight} />}
        {panel === "files" && <Files heat={session.fileHeat} height={bodyHeight} />}
        {panel === "todos" && <Todos todos={session.todos} height={bodyHeight} />}
      </box>
      <StatusBar session={session} marker={marker} elapsedMs={session.lastActivityTs - session.startedTs} />
    </box>
  );
}
```

- [ ] **Step 2: Rewrite `src/ui/App.tsx` with full wiring**

```tsx
import { useEffect, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { createStore } from "../store/sessionStore";
import { mapKey } from "./keymap";
import { usePlayers } from "./usePlayers";
import { SessionList } from "./SessionList";
import { Showcase, PANELS, type PanelId } from "./Showcase";
import { theme } from "./theme";

type Store = ReturnType<typeof createStore>;

export function App({ store }: { store: Store }) {
  const renderer = useRenderer();
  const [sessions, setSessions] = useState(store.sessions());
  const [sel, setSel] = useState(0);
  const [panel, setPanel] = useState<PanelId>("flow");
  const [pulse, setPulse] = useState(true);
  const [blink, setBlink] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => store.subscribe(() => setSessions(store.sessions())), [store]);
  useEffect(() => { renderer.targetFps = 16; }, [renderer]); // steady-state for pulse
  useEffect(() => { const id = setInterval(() => setBlink((b) => !b), 500); return () => clearInterval(id); }, []);

  const selected = sessions[Math.min(sel, Math.max(0, sessions.length - 1))] ?? null;
  const players = usePlayers(sessions, selected?.id ?? null);
  const player = selected ? players.get(selected.id) : null;

  useKeyboard((key) => {
    const action = mapKey({ name: key.name, shift: key.shift, ctrl: key.ctrl });
    if (!action) return;
    switch (action.type) {
      case "quit": renderer.destroy(); break;
      case "sess-down": setSel((i) => Math.min(sessions.length - 1, i + 1)); break;
      case "sess-up": setSel((i) => Math.max(0, i - 1)); break;
      case "jump": setSel(Math.min(sessions.length - 1, action.n - 1)); break;
      case "panel-next": setPanel((p) => PANELS[(PANELS.indexOf(p) + 1) % PANELS.length]!); break;
      case "panel-prev": setPanel((p) => PANELS[(PANELS.indexOf(p) + PANELS.length - 1) % PANELS.length]!); break;
      case "beat-back": player?.stepBack(); break;
      case "beat-fwd": player?.stepForward(); break;
      case "chunk-back": for (let i = 0; i < 10; i++) player?.stepBack(); break;
      case "chunk-fwd": for (let i = 0; i < 10; i++) player?.stepForward(); break;
      case "to-start": player?.toStart(); break;
      case "to-live": player?.toLive(); break;
      case "pause": player && (player.mode() === "paused" ? player.play() : player.pause()); break;
      case "speed-up": player?.setSpeed((player.speed() || 1) * 1.5); break;
      case "speed-down": player?.setSpeed((player.speed() || 1) / 1.5); break;
      case "pulse": setPulse((p) => !p); break;
      case "lens": /* lens toggle handled by hiding ribbon; toggle via state if desired */ break;
      case "help": setShowHelp((h) => !h); break;
      case "rescan": store.pollOnce(Date.now()); break;
    }
  });

  const w = renderer.terminalWidth ?? 120;
  const h = renderer.terminalHeight ?? 40;
  const listWidth = Math.min(30, Math.floor(w * 0.28));

  const marker = (() => {
    if (!player) return "";
    if (player.mode() === "history") return `⏪ ${player.cursor()}/${player.all().length}`;
    if (player.mode() === "paused") return "⏸ paused";
    const back = player.backlog();
    return back > 0 ? `▸ +${back} catching up` : "▸ live";
  })();

  return (
    <box style={{ flexDirection: "row", width: w, height: h, backgroundColor: theme.bg }}>
      <SessionList sessions={sessions} selectedIndex={sel} blink={blink} width={listWidth} />
      <Showcase
        session={selected}
        panel={panel}
        presented={player ? player.presented() : []}
        cursor={player ? player.cursor() : 0}
        pulse={pulse}
        marker={marker}
        width={w - listWidth}
        height={h}
      />
      {showHelp && (
        <box style={{ position: "absolute", border: true, padding: 1, backgroundColor: theme.panel }} title="keys">
          <text fg={theme.fg}>j/k sessions · Tab panels · h/l scrub · g/G start/live · space pause</text>
          <text fg={theme.fg}>+/- speed · p pulse · w lens · r rescan · q quit</text>
        </box>
      )}
    </box>
  );
}
```

- [ ] **Step 3: Update `src/index.tsx` to pass the store and start it**

```tsx
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./ui/App";
import { createStore } from "./store/sessionStore";

const store = createStore();
store.start();
const renderer = await createCliRenderer({ exitOnCtrlC: true });
createRoot(renderer).render(<App store={store} />);
```

- [ ] **Step 4: Typecheck and run**

Run: `bunx tsc --noEmit`
Expected: no type errors.

Run: `bun run dev`
Expected: Mission Control. Left = your real sessions with glyphs; right = the selected session's Flow graph building at a calm pace, phase ribbon when a superpowers session is detected, gauge/cost/marker at the bottom. Test: `j/k` switch sessions; `Tab` cycles flow/files/todos/log; `h` scrubs back (marker → `⏪ n/total`), `G` snaps to live; `+/-` change speed; `p` toggles the energy pulse; `?` shows help; `q` quits. Open/drive a real Claude Code session in another terminal and watch nodes appear.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Showcase.tsx src/ui/App.tsx src/index.tsx
git commit -m "feat(ui): Mission Control wiring — selection, panels, playback, keyboard"
```

---

## Task 14: Polish — lens toggle, resize, README

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/Showcase.tsx`
- Create: `README.md`

- [ ] **Step 1: Add a working lens toggle**

In `App.tsx`, add `const [lensOn, setLensOn] = useState(true);`, set the `lens` case to `setLensOn((v) => !v);`, and pass `lensOn` to `Showcase`. In `Showcase.tsx`, change the props to accept `lensOn: boolean` and render `<PhaseRibbon lens={lensOn ? session.lens : { ...session.lens, lensId: null }} />`.

- [ ] **Step 2: Handle terminal resize**

In `App.tsx`, replace the fixed `w`/`h` reads with state that updates on resize:
```tsx
const [size, setSize] = useState({ w: renderer.terminalWidth ?? 120, h: renderer.terminalHeight ?? 40 });
useEffect(() => {
  const onResize = (cols: number, rows: number) => setSize({ w: cols, h: rows });
  renderer.on("resize", onResize);
  return () => { renderer.off("resize", onResize); };
}, [renderer]);
const { w, h } = size;
```
(If `renderer.on("resize", …)` is unavailable in the installed version, confirm the event name via the `opentui` Skill; fall back to reading `renderer.terminalWidth/Height` inside the 100ms tick.)

- [ ] **Step 3: Write `README.md`**

```markdown
# harness-flow

Terminal glass box for Claude Code sessions. Passively watches every running
session's transcript and shows — at a calm, slow-burn pace — what each one is
doing: an animated vertical-metro Flow of its actions, status, token/cost/context
gauge, file heatmap, todos, and a superpowers workflow phase ribbon. Switch
sessions instantly; scrub history; never leave the terminal.

## Run

```bash
bun install
bun run dev      # the TUI
bun run dump     # headless debug view
bun test         # the engine test suite
```

## Keys

`j/k` sessions · `Tab` panels · `h/l` scrub timeline · `g/G` start/live ·
`space` pause · `+/-` speed · `p` energy-pulse · `w` lens · `r` rescan · `?` help · `q` quit.

## How it works

Zero setup, no hooks: it tails `~/.claude/projects/**/*.jsonl`. See
`docs/superpowers/specs/2026-06-06-harness-flow-design.md` for the design and
its honest limitations (e.g. permission-prompt blocking shows as `running`;
cost is an estimate).
```

- [ ] **Step 4: Typecheck, test, run**

Run: `bunx tsc --noEmit && bun test`
Expected: no type errors; all engine + helper tests pass.

Run: `bun run dev`
Expected: resize the terminal — layout reflows. `w` toggles the phase ribbon.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx src/ui/Showcase.tsx README.md
git commit -m "feat(ui): lens toggle, resize handling, README"
```

---

## Self-Review (TUI)

- **Spec coverage:** §12 Mission Control → SessionList + Showcase + App (Tasks 6/13); phase ribbon → Task 7; Flow flagship + energy pulse (§14) → Tasks 4/12; Files/Todos/Log panels → Tasks 9/10/11→ (Log 9, Files 10, Todos 11); gauge/cost/markers (§12 footer) → Task 8; history scrubbing + playback markers (§10) → player wiring in Task 13; keybindings (§15) → keymap Task 3 + dispatch Task 13; animations (§14) spinner/pulse → Task 4 + Flow; empty state + resize + parseErrors footer (§16) → Tasks 8/13/14.
- **Type consistency:** `PanelId`/`PANELS` defined in `Showcase.tsx`, imported by `App.tsx`; player API (`presented/cursor/mode/backlog/all/stepBack/stepForward/toStart/toLive/pause/play/setSpeed/speed`) matches Part 1 Task 11; `statusGlyph/gaugeBar/sparkline/truncate/fmtCost/fmtTokens` signatures match Task 2; `RGBA.fromHex` + `buffer.setCell/fillRect` per verified `@opentui/core` API.
- **No placeholders:** every step has runnable code + a concrete command/expected result. Two API-uncertainty notes (buffer `drawText`, resize event) include a `setCell`/tick fallback and a directive to confirm via the `opentui` Skill — not deferred work.
- **Honest UI-testing caveat:** visual components are verified by `bun run dev` against real sessions rather than snapshot tests; all pure logic (format, keymap, anim, and the entire engine) is unit-tested.

---

## Done

With both parts complete, `harness-flow` is a working TUI: zero-setup passive observer, Mission Control layout, slow-burn paced animated Flow with energy-pulse, history scrubbing, four depth panels, token/cost/context gauges, and a superpowers workflow lens.
