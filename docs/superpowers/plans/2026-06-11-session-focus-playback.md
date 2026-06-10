# Session Focus + Unified Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin session selection to the invocation cwd's Claude project (auto-live when active, auto-replay when idle) and replace the 3-mode player with a total 2-mode machine so space/↑/↓/r/l always work.

**Architecture:** Two pure-core changes (`player.ts` rewrite to `playing|paused` with derived liveness; new `focus.ts` resolver mapping cwd → project sessions) plus thin UI rewiring in `App.tsx` (drop the duplicate replay player, apply focus decisions + seek policy). Spec: `docs/superpowers/specs/2026-06-11-session-focus-playback-design.md`.

**Tech Stack:** Bun, TypeScript strict, bun:test, OpenTUI + React 19. Run from repo root `/home/debian/repo/harness-flow`. Branch: `feat/session-focus-playback`.

---

### Task 1: Unified 2-mode player (pure core, TDD)

**Files:**
- Modify: `src/core/player.ts` (full rewrite, ~80 lines)
- Modify: `tests/player.test.ts` (full rewrite)
- Modify: `src/ui/anim.ts:59-68` (`shouldAnimate`)
- Modify: `tests/anim.test.ts:63-73` (mode strings)

Background: old player had modes `live|paused|history` with partial `pause()`/`play()` and a separate `head`. New machine: ONE `cursor`, `mode: "playing"|"paused"`, every transition total. "Live" is derived (playing && backlog 0). The `replay` opt disappears (every player starts cursor 0 + playing — that IS replay); `loop` stays (screensaver wrap).

- [ ] **Step 1: Rewrite tests/player.test.ts with the new semantics (regression tests named after the bug traces)**

```ts
import { test, expect } from "bun:test";
import { createPlayer } from "../src/core/player";
import type { Beat } from "../src/core/types";

function beat(id: string, label = "Bash", kind: Beat["kind"] = "tool"): Beat {
  return { id, ts: 0, kind, iconKey: "tool", label, count: 1, lane: "main" };
}
function beats(n: number): Beat[] {
  return Array.from({ length: n }, (_, i) => beat(String(i), "L" + i));
}
function drain(p: ReturnType<typeof createPlayer>, from: number, to: number, step = 50) {
  for (let t = from; t <= to; t += step) p.tick(t);
}

test("coalesces consecutive same-kind same-label beats", () => {
  const p = createPlayer();
  p.setBeats([beat("1"), beat("2"), beat("3")]);
  drain(p, 0, 10_000, 200);
  const shown = p.presented();
  expect(shown.length).toBe(1);
  expect(shown[0]!.count).toBe(3);
});

test("paces: presents fewer beats early than after enough time", () => {
  const p = createPlayer({ baseIntervalMs: 1000 });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C"), beat("4", "D")]);
  p.tick(0);
  const early = p.presented().length;
  p.tick(1100);
  expect(p.presented().length).toBeGreaterThan(early);
});

test("starts playing from 0 (autoplay is the default) and live-follows appended beats", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(3));
  expect(p.mode()).toBe("playing");
  drain(p, 0, 500, 10);
  expect(p.cursor()).toBe(3); // caught up = live
  p.setBeats(beats(5)); // two more arrive
  drain(p, 600, 1200, 10);
  expect(p.cursor()).toBe(5); // followed the tail
});

test("trace A regression: scrub (stepBack) then toggle resumes playback", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(20));
  drain(p, 0, 1000, 10);
  p.stepBack();
  expect(p.mode()).toBe("paused"); // scrub auto-pauses
  const at = p.cursor();
  p.toggle(); // space
  expect(p.mode()).toBe("playing");
  drain(p, 2000, 3000, 10);
  expect(p.cursor()).toBeGreaterThan(at); // resumed from cursor — not dead
});

test("trace B regression: resume after a long pause advances paced, not in a burst", () => {
  const p = createPlayer({ baseIntervalMs: 100, minIntervalMs: 1 });
  p.setBeats(beats(100));
  drain(p, 0, 500);
  p.pause();
  const at = p.cursor();
  p.play(); // 60s later
  p.tick(61_000); // first tick after resume re-bases the clock
  expect(p.cursor() - at).toBeLessThanOrEqual(1); // no time-debt burst
});

test("trace C regression: stepForward works while paused", () => {
  const p = createPlayer({ baseIntervalMs: 100, minIntervalMs: 1 });
  p.setBeats(beats(100));
  drain(p, 0, 500);
  p.pause();
  const at = p.cursor();
  p.stepForward();
  expect(p.cursor()).toBe(at + 1);
});

test("trace D regression: scrub back then toggle plays forward from the scrub point", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(40));
  drain(p, 0, 2000, 10);
  for (let i = 0; i < 10; i++) p.stepBack();
  const at = p.cursor();
  p.toggle();
  drain(p, 3000, 3500, 10);
  expect(p.cursor()).toBeGreaterThan(at);
  expect(p.mode()).toBe("playing");
});

test("pause/play/toggle are total from every state", () => {
  const p = createPlayer();
  p.setBeats(beats(5));
  p.pause(); p.pause();
  expect(p.mode()).toBe("paused");
  p.play(); p.play();
  expect(p.mode()).toBe("playing");
  p.stepBack(); // paused again
  p.toggle();
  expect(p.mode()).toBe("playing");
});

test("replay() rewinds to 0 and plays; toLive() jumps to the tail and plays", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 1000, 10);
  p.replay();
  expect(p.cursor()).toBe(0);
  expect(p.mode()).toBe("playing");
  p.toLive();
  expect(p.cursor()).toBe(p.all().length);
  expect(p.mode()).toBe("playing");
});

test("toLive from a paused scrub returns to live follow", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 1000, 10);
  p.stepBack(); p.stepBack();
  p.toLive();
  expect(p.cursor()).toBe(p.all().length);
  p.setBeats(beats(12));
  drain(p, 2000, 3000, 10);
  expect(p.cursor()).toBe(p.all().length); // still following
});

test("loop wraps the cursor for screensaver replay", () => {
  const p = createPlayer({ baseIntervalMs: 100, minIntervalMs: 1, loop: true });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C")]);
  drain(p, 0, 1000, 100);
  expect(p.cursor()).toBeLessThanOrEqual(3); // wrapped rather than stuck
});

test("setBeats clamps the cursor when the transcript shrinks", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 1000, 10);
  p.setBeats(beats(4));
  expect(p.cursor()).toBeLessThanOrEqual(4);
});

test("setBeats preserves a paused cursor", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 300, 10);
  p.pause();
  const at = p.cursor();
  p.setBeats(beats(15));
  expect(p.cursor()).toBe(at);
  expect(p.mode()).toBe("paused");
});

test("intervalMs reflects speed (faster speed → smaller interval)", () => {
  const p = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B")]);
  const base = p.intervalMs();
  p.setSpeed(2);
  expect(p.intervalMs()).toBeLessThan(base);
  expect(p.intervalMs()).toBeCloseTo(base / 2, 5);
});

test("lastAdvanceMs is -1 before first tick, then set", () => {
  const p = createPlayer({ baseIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B")]);
  expect(p.lastAdvanceMs()).toBe(-1);
  p.tick(500);
  expect(p.lastAdvanceMs()).toBeGreaterThanOrEqual(0);
});

test("intervalMs shrinks as backlog grows (adaptive cadence)", () => {
  const few = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  few.setBeats([beat("1", "A")]);
  const many = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  many.setBeats(beats(5));
  expect(many.intervalMs()).toBeLessThan(few.intervalMs());
});
```

- [ ] **Step 2: Run to verify failures (old API has no toggle/replay/toLive; modes differ)**

Run: `bun test tests/player.test.ts`
Expected: FAIL — `p.toggle is not a function`, mode-string mismatches.

- [ ] **Step 3: Rewrite src/core/player.ts**

```ts
import type { Beat } from "./types";

export interface PlayerOpts { baseIntervalMs?: number; minIntervalMs?: number; loop?: boolean }
export type PlayMode = "playing" | "paused";

export function createPlayer(opts: PlayerOpts = {}) {
  const base = opts.baseIntervalMs ?? 1000;
  const min = opts.minIntervalMs ?? 120;
  let loop = opts.loop ?? false;

  let coalesced: Beat[] = [];
  let cursor = 0;                // the ONE position — view and playback head
  let mode: PlayMode = "playing"; // "live" is derived: playing && backlog 0
  let speed = 1;
  let lastAdvanceAt = -1;        // -1 → next tick re-bases (prevents time-debt bursts)
  let started = false;

  function rebuild(beats: Beat[]) {
    const out: Beat[] = [];
    for (const b of beats) {
      const last = out[out.length - 1];
      if (last && last.kind === b.kind && last.label === b.label && last.lane === b.lane) {
        out[out.length - 1] = { ...last, count: last.count + b.count, snap: b.snap ?? last.snap };
      } else {
        out.push({ ...b });
      }
    }
    coalesced = out;
    if (cursor > coalesced.length) cursor = coalesced.length;
  }

  function backlog(): number { return coalesced.length - cursor; }

  function interval(): number {
    // adaptive (eases toward base as it catches up / nears the end), but gentle
    // enough to stay a readable slow-burn. `speed` divides the WHOLE interval —
    // including the min floor — so +/- always change the pace.
    const factor = 1 / (1 + Math.min(backlog(), 20) * 0.1);
    return Math.max(min, base * factor) / speed;
  }

  function pause() { mode = "paused"; }
  function play() { mode = "playing"; lastAdvanceAt = -1; }

  return {
    setBeats(beats: Beat[]) { rebuild(beats); started = true; },
    tick(now: number) {
      if (!started || mode !== "playing") return;
      if (lastAdvanceAt < 0) lastAdvanceAt = now;
      while (cursor < coalesced.length && now - lastAdvanceAt >= interval()) {
        cursor += 1;
        lastAdvanceAt += interval();
      }
      if (loop && cursor >= coalesced.length && coalesced.length > 0) {
        cursor = 0; // screensaver wrap
        lastAdvanceAt = now;
      }
    },
    presented(): Beat[] { return coalesced.slice(0, cursor); },
    all(): Beat[] { return coalesced; },
    backlog,
    mode(): PlayMode { return mode; },
    cursor(): number { return cursor; },
    setSpeed(mult: number) { speed = Math.max(0.25, Math.min(8, mult)); },
    setLoop(on: boolean) { loop = on; },
    isLoop(): boolean { return loop; },
    speed(): number { return speed; },
    intervalMs(): number { return interval(); },
    lastAdvanceMs(): number { return lastAdvanceAt; },
    pause,
    play,
    toggle() { if (mode === "playing") pause(); else play(); },
    stepBack() { pause(); cursor = Math.max(0, cursor - 1); },
    stepForward() { pause(); cursor = Math.min(coalesced.length, cursor + 1); },
    replay() { cursor = 0; play(); },
    toLive() { cursor = coalesced.length; play(); },
  };
}
```

- [ ] **Step 4: Update shouldAnimate in src/ui/anim.ts (lines 59-68) — `live` mode is gone**

```ts
import type { PlayMode } from "../core/player";

// Whether the buffered panels should run their continuous animation loop.
// True only while playing AND advanced within the last ~2 intervals;
// paused or a quiet live tail park the comet, so the loop can stop.
export function shouldAnimate(mode: PlayMode, lastAdvanceMs: number, intervalMs: number, now: number): boolean {
  if (mode !== "playing") return false;
  if (lastAdvanceMs < 0 || intervalMs <= 0) return false;
  return now - lastAdvanceMs < intervalMs * 2;
}
```

- [ ] **Step 5: Update tests/anim.test.ts mode strings (lines 63-73)** — replace `"history"` with `"paused"` (still expects false) and every `"live"` with `"playing"` (same expectations otherwise).

- [ ] **Step 6: Run the pure-core suites**

Run: `bun test tests/player.test.ts tests/anim.test.ts`
Expected: PASS (all).

Note: `bun test` for the FULL suite will still fail to compile until Task 3 updates App.tsx (it calls the removed APIs). That is expected mid-plan; do not "fix" App.tsx in this task.

- [ ] **Step 7: Commit**

```bash
git add src/core/player.ts src/ui/anim.ts tests/player.test.ts tests/anim.test.ts
git commit -m "feat(player)!: unified 2-mode playback machine (playing/paused, derived live)"
```

---

### Task 2: Focus resolver (pure core, TDD)

> Post-review amendment (commit 9e743d2): matching uses a NEW
> `SessionState.projectDir` field (transcript parent dir name, derived in
> `newSession`) — `project` stays the display basename. Containment guards the
> root cwd (`"/"`), and newest-selection tie-breaks by id. The code below
> predates that amendment; the repo is the source of truth.

**Files:**
- Create: `src/core/focus.ts`
- Create: `tests/focus.test.ts`

- [ ] **Step 1: Write tests/focus.test.ts**

```ts
import { test, expect } from "bun:test";
import { projectKeyForCwd, projectSessionsFor, resolveFocus } from "../src/core/focus";

function s(id: string, project: string, cwd: string, lastActivityTs: number) {
  return { id, project, cwd, lastActivityTs };
}

test("projectKeyForCwd encodes every non-alphanumeric as dash, preserves case", () => {
  expect(projectKeyForCwd("/home/debian/repo/harness-flow")).toBe("-home-debian-repo-harness-flow");
  expect(projectKeyForCwd("/home/debian/repo/harness-flow/.claude/worktrees/x")).toBe("-home-debian-repo-harness-flow--claude-worktrees-x");
  expect(projectKeyForCwd("/home/u/_work/My.Repo")).toBe("-home-u--work-My-Repo");
});

test("projectSessionsFor: exact project-dir match wins", () => {
  const a = s("a", "-home-u-repo-x", "/home/u/repo/x", 1);
  const b = s("b", "-home-u-repo-y", "/home/u/repo/y", 2);
  expect(projectSessionsFor([a, b], "/home/u/repo/x")).toEqual([a]);
});

test("projectSessionsFor: containment fallback catches subdirectory sessions when no exact match", () => {
  const sub = s("sub", "-home-u-mono-packages-app", "/home/u/mono/packages/app", 1);
  const other = s("o", "-home-u-elsewhere", "/home/u/elsewhere", 2);
  expect(projectSessionsFor([sub, other], "/home/u/mono")).toEqual([sub]);
});

test("projectSessionsFor: exact match suppresses containment ($HOME guard)", () => {
  const home = s("h", "-home-u", "/home/u", 1);
  const deep = s("d", "-home-u-repo-x", "/home/u/repo/x", 2);
  // /home/u IS a project dir → only its own sessions, not everything beneath it
  expect(projectSessionsFor([home, deep], "/home/u")).toEqual([home]);
});

test("resolveFocus: user pin always wins while the session exists", () => {
  const a = s("a", "-p", "/p", 1);
  const b = s("b", "-p", "/p", 99);
  expect(resolveFocus({ sessions: [a, b], invocationCwd: "/p", selectedId: "a", userPinned: true }))
    .toEqual({ id: "a", reason: "keep" });
});

test("resolveFocus: pinned session gone → falls back to project resolution", () => {
  const b = s("b", "-p", "/p", 99);
  expect(resolveFocus({ sessions: [b], invocationCwd: "/p", selectedId: "gone", userPinned: true }))
    .toEqual({ id: "b", reason: "project-follow" });
});

test("resolveFocus: project mode follows the newest session in the project", () => {
  const old = s("old", "-p", "/p", 10);
  const fresh = s("fresh", "-p", "/p", 20);
  const other = s("other", "-q", "/q", 999); // foreign activity must NOT steal focus
  const d = resolveFocus({ sessions: [other, fresh, old], invocationCwd: "/p", selectedId: "old", userPinned: false });
  expect(d).toEqual({ id: "fresh", reason: "project-follow" });
});

test("resolveFocus: project mode keeps the newest once selected", () => {
  const fresh = s("fresh", "-p", "/p", 20);
  expect(resolveFocus({ sessions: [fresh], invocationCwd: "/p", selectedId: "fresh", userPinned: false }))
    .toEqual({ id: "fresh", reason: "keep" });
});

test("resolveFocus: outside any project — picks the globally newest ONCE, then keeps", () => {
  const a = s("a", "-x", "/x", 10);
  const b = s("b", "-y", "/y", 20);
  const initial = resolveFocus({ sessions: [a, b], invocationCwd: "/nowhere", selectedId: null, userPinned: false });
  expect(initial).toEqual({ id: "b", reason: "global-initial" });
  // later: a becomes more active — selection must NOT move
  const later = resolveFocus({ sessions: [{ ...a, lastActivityTs: 99 }, b], invocationCwd: "/nowhere", selectedId: "b", userPinned: false });
  expect(later).toEqual({ id: "b", reason: "keep" });
});

test("resolveFocus: no sessions → null", () => {
  expect(resolveFocus({ sessions: [], invocationCwd: "/p", selectedId: null, userPinned: false }))
    .toEqual({ id: null, reason: "global-initial" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/focus.test.ts`
Expected: FAIL — module `../src/core/focus` not found.

- [ ] **Step 3: Create src/core/focus.ts**

```ts
// cwd-scoped session focus: which session should ClawdLens show?
// Pure — the invocation cwd is resolved (realpath) by the caller.

export interface FocusSession { id: string; project: string; cwd: string; lastActivityTs: number }

export interface FocusInput {
  sessions: FocusSession[];
  invocationCwd: string;
  selectedId: string | null;
  userPinned: boolean;
}

export interface FocusDecision { id: string | null; reason: "keep" | "project-follow" | "global-initial" }

// Claude encodes a session's cwd into its project dir name: every
// non-alphanumeric → "-" (verified against ~/.claude/projects: /, ., _ all dash; case kept).
export function projectKeyForCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

// Exact project-dir match if any, else cwd-containment (sessions started in
// subdirectories — monorepo roots). Exact-first keeps broad cwds (e.g. $HOME,
// itself a project dir) from swallowing every session beneath them.
export function projectSessionsFor<S extends { project: string; cwd: string }>(
  sessions: S[],
  invocationCwd: string,
): S[] {
  const key = projectKeyForCwd(invocationCwd);
  const exact = sessions.filter((x) => x.project === key);
  if (exact.length > 0) return exact;
  return sessions.filter((x) => x.cwd.startsWith(invocationCwd + "/"));
}

export function resolveFocus(i: FocusInput): FocusDecision {
  const exists = i.selectedId != null && i.sessions.some((x) => x.id === i.selectedId);
  if (i.userPinned && exists) return { id: i.selectedId, reason: "keep" };
  const proj = projectSessionsFor(i.sessions, i.invocationCwd);
  if (proj.length > 0) {
    const newest = proj.reduce((a, b) => (b.lastActivityTs > a.lastActivityTs ? b : a));
    if (newest.id === i.selectedId) return { id: newest.id, reason: "keep" };
    return { id: newest.id, reason: "project-follow" };
  }
  if (exists) return { id: i.selectedId, reason: "keep" };
  const newest = i.sessions.length
    ? i.sessions.reduce((a, b) => (b.lastActivityTs > a.lastActivityTs ? b : a))
    : null;
  return { id: newest ? newest.id : null, reason: "global-initial" };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/focus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/focus.ts tests/focus.test.ts
git commit -m "feat(focus): cwd-scoped session resolver (project pin + global-initial)"
```

---

### Task 3: Keymap, commands, help — `l` Go Live

**Files:**
- Modify: `src/ui/keymap.ts`
- Modify: `src/core/commands.ts:13-28`
- Modify: `src/ui/Menu.tsx:80-93` (helpRows)
- Modify: `tests/keymap.test.ts`

- [ ] **Step 1: Add a failing keymap test** (append to `tests/keymap.test.ts`)

```ts
test("l maps to go-live", () => {
  expect(mapKey({ name: "l" })).toEqual({ type: "live" });
});
```

Run: `bun test tests/keymap.test.ts` — expected FAIL (`null` returned).

- [ ] **Step 2: Add the action to src/ui/keymap.ts** — extend the union and the mapper:

```ts
  | { type: "pause" } | { type: "replay" } | { type: "live" }
```

and after the `r` line:

```ts
  if (n === "l") return { type: "live" };
```

- [ ] **Step 3: Register the palette command in src/core/commands.ts** — after `play.replay` (line 22):

```ts
  { id: "play.live", title: "Go Live", aliases: ["live"] },
```

- [ ] **Step 4: Add the help row in src/ui/Menu.tsx helpRows()** — after the replay row (`h6`):

```ts
    { id: "h6b", left: "jump to live", right: "l" },
```

- [ ] **Step 5: Run + commit**

Run: `bun test tests/keymap.test.ts tests/commands.test.ts tests/chrome.test.ts`
Expected: PASS.

```bash
git add src/ui/keymap.ts src/core/commands.ts src/ui/Menu.tsx tests/keymap.test.ts
git commit -m "feat(keys): l = go live; palette Go Live command; help row"
```

---

### Task 4: App wiring — focus + seek policy, drop replay player, marker, ⌂

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/index.tsx`
- Modify: `src/ui/Showcase.tsx` (one prop pass-through)
- Modify: `src/ui/Header.tsx:19,34` (⌂ prefix)

No new unit tests here (thin render/wiring layer — covered by smoke + tmux); full suite must compile and pass after this task.

- [ ] **Step 1: index.tsx — pass the resolved invocation cwd**

```tsx
import { realpathSync } from "node:fs";
// ...
let cwd = process.cwd();
try { cwd = realpathSync(cwd); } catch {}
createRoot(renderer).render(<App store={store} cwd={cwd} />);
```

- [ ] **Step 2: App.tsx — remove the replay player entirely**

Delete:
- `const [replay, setReplay] = useState(...)` (line 32) and its tick `useEffect` (lines 58-62)
- `const activePlayer = replay.player ?? player;` → use `player` directly everywhere `activePlayer` appeared (lines 91-101, 123, 196-209, 218-220)
- the `⏮ replay …` marker branch (line 220)
- the `createPlayer` + `gitFetch`-adjacent replay imports if now unused (`createPlayer` import at line 16 goes away)
- `replay.player` from the forceRepaint dep array (line 110)

- [ ] **Step 3: App.tsx — focus state + resolution effect**

Component signature: `export function App({ store, cwd }: { store: Store; cwd: string })`.

Replace `const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;` (line 64) with:

```tsx
const selected = sessions.find((s) => s.id === selectedId) ?? null;
```

Add next to the selection state:

```tsx
const [userPinned, setUserPinned] = useState(false);
// project-locked when the invocation cwd maps to session(s) — drives ⌂ and auto-follow
const projectLocked = useMemo(() => projectSessionsFor(sessions, cwd).length > 0, [sessions, cwd]);
useEffect(() => {
  const d = resolveFocus({ sessions, invocationCwd: cwd, selectedId, userPinned });
  if (d.id !== selectedId && d.id !== null) setSelectedId(d.id);
}, [sessions, selectedId, userPinned, cwd]);
```

with `import { resolveFocus, projectSessionsFor } from "../core/focus";`.

- [ ] **Step 4: App.tsx — seek policy on selection change**

```tsx
// monitoring means NOW for active sessions; idle sessions tell their story from 0
const seekApplied = useRef<string | null>(null);
useEffect(() => {
  if (!selected) return;
  if (seekApplied.current === selected.id) return;
  seekApplied.current = selected.id;
  const p = players.get(selected.id);
  if (!p) return;
  const active = selected.status === "running" || selected.status === "working" || selected.status === "waiting";
  if (active) p.toLive(); else p.replay();
}, [selected?.id, players]);
```

- [ ] **Step 5: App.tsx — pin on manual pick + key/command rewiring**

```tsx
const switchTo = (id: string | null) => { if (id) setUserPinned(true); setSelectedId(id); };
```

Key handlers (lines 196-210) and palette commands (123-131) become:

```tsx
case "beat-back": player?.stepBack(); break;
case "beat-fwd": player?.stepForward(); break;
case "pause": player?.toggle(); break;
case "speed-up": player?.setSpeed((player.speed() || 1) * 1.5); break;
case "speed-down": player?.setSpeed((player.speed() || 1) / 1.5); break;
case "live": player?.toLive(); break;
case "replay": player?.replay(); break;
```

and in `runCommand`: `case "play.pause": player?.toggle(); break;` · `case "play.replay": player?.replay(); break;` · `case "play.live": player?.toLive(); break;`.

- [ ] **Step 6: App.tsx — marker for the 2-mode machine** (replaces lines 216-226)

```tsx
const marker = (() => {
  if (!player) return "";
  const spd = ` ${Number(player.speed().toFixed(2))}×`;
  const m = player.mode() === "paused"
    ? `⏸ ${player.cursor()}/${player.all().length}`
    : player.backlog() > 0
      ? `▸ ${player.cursor()}/${player.all().length}`
      : "▸ live";
  return m + spd;
})();
```

- [ ] **Step 7: Showcase + Header — ⌂ project-locked indicator**

`Showcase` gains `focusLocked?: boolean`, passed straight to `Header`. In `Header.tsx` (line 19 props + line 34):

```tsx
{`${locked ? "⌂ " : ""}${session.project} · ${session.gitBranch || "?"} · ${session.model} · ${session.status}`}
```

(prop named `locked`; App passes `focusLocked={projectLocked}`).

- [ ] **Step 8: Verify full suite + typecheck**

Run: `bunx tsc --noEmit && bun test`
Expected: PASS, 0 type errors. (smoke/usePlayers compile against the new API.)

- [ ] **Step 9: Commit**

```bash
git add src/ui/App.tsx src/index.tsx src/ui/Showcase.tsx src/ui/Header.tsx
git commit -m "feat(app): cwd-locked session focus, seek policy, single-player playback"
```

---

### Task 5: Visual verification (tmux) + PR

**Files:** none (verification only)

- [ ] **Step 1: Launch in the project folder (this repo has a live session — this one)**

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 36 "cd /home/debian/repo/harness-flow && bun run dev"; sleep 5; tmux capture-pane -t cl -p | head -8
```

Expected: header shows `⌂ -home-debian-repo-harness-flow …` and marker `▸ live …` (active session → jumped to tail, no long reveal).

- [ ] **Step 2: Scrub + space + resume (traces A/B/C/D live)**

```bash
tmux send-keys -t cl Up Up Up; sleep 1; tmux capture-pane -t cl -p | grep -o "⏸ [0-9]*/[0-9]*"   # paused at cursor
tmux send-keys -t cl Space; sleep 3; tmux capture-pane -t cl -p | grep -o "▸ [0-9]*/[0-9]*\|▸ live" # resumed, paced (n/N grows by ~1-3, NOT a jump to live)
tmux send-keys -t cl Down; sleep 1; tmux capture-pane -t cl -p | grep -o "⏸ [0-9]*/[0-9]*"  # down works (re-pauses)
```

- [ ] **Step 3: Replay + go-live**

```bash
tmux send-keys -t cl r; sleep 2; tmux capture-pane -t cl -p | grep -o "▸ [0-9]*/[0-9]*"   # cursor restarted near 0, climbing
tmux send-keys -t cl l; sleep 1; tmux capture-pane -t cl -p | grep -o "▸ live"
```

- [ ] **Step 4: Pin check from a non-project dir**

```bash
tmux kill-session -t cl; tmux new-session -d -s cl -x 150 -y 36 "cd /tmp && bun /home/debian/repo/harness-flow/src/index.tsx"; sleep 5; tmux capture-pane -t cl -p | head -6
```

Expected: NO `⌂` prefix; newest session shown; watch ~30 s while other sessions are active — header session must not change.

- [ ] **Step 5: Cleanup + invoke superpowers:verification-before-completion, then finishing-a-development-branch**

```bash
tmux kill-session -t cl
bunx tsc --noEmit && bun test
```

Then: push branch, open PR to main (CI: typecheck + test), conventional title `feat: cwd-scoped session focus + unified playback`.

---

### Task 6: Backlog issues (agent-flow ports, user-approved)

**Files:** none (gh CLI)

- [ ] **Step 1: File 4 issues on opariffazman/clawdlens**, each with superpowers-resume instructions (per user's workflow), titles:

1. `feat: context-token breakdown panel (system/user/tools/reasoning/subagents)`
2. `feat: per-tool timing stats (count, avg/min/max, total)`
3. `feat: error + permission markers on the timeline, jump-to-next-error`
4. `feat: session-done detection (30s inactivity → completed badge)`

Each body: what (one paragraph), agent-flow reference (patoles/agent-flow file), constraint (passive JSONL tailing only — no hooks), and resume instructions: "Resume with superpowers: brainstorm → spec (docs/superpowers/specs/) → plan → TDD."
