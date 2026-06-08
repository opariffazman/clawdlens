# ClawdLens — Navigation & Lifecycle

**UI overhaul spec 4/4.** Closes #5. Depends on Chrome & Theme (#2, shipped: `fuzzyScore`, `Menu`, command palette).

Three concerns plus a decluttering pass:

1. **Lean keymap.** The current keymap accreted toggles whose effect is invisible on a plain/idle session (`p` pulse, `w` ribbon) and redundant keys (`r` rescan duplicates the auto-poll, `[ ]` chunk, `L` loop, `g/G/Home/End` start-live jumps, `1-9`/`j/k` session shortcuts). Cut to a minimal, predictable set.
2. **Fuzzy session picker.** Sessions become palette-only; the picker gains a `/` fuzzy filter (reusing `fuzzyScore`) so it scales past a handful of sessions.
3. **Clean quit.** `q` must return the user to a shell prompt without needing Ctrl+C.

Plus feature removals that fall out of (1): the **phase ribbon**, the **pulse toggle** (animation stays, runs automatically), and **rescan**.

Transparent canvas throughout; no behavioural change to the Lens/Files/Tasks/Git panels themselves.

## Final keymap

| Group | Key | Action |
|---|---|---|
| Timeline | `↑` / `↓` | step beat back / forward |
| | `←` / `→` | speed down / up |
| | `space` | pause / play |
| | `r` | replay |
| Panels | `Tab` / `Shift-Tab` | switch panel |
| Misc | `i` | toggle Lens detail |
| | `:` | command palette (incl. fuzzy session picker) |
| | `?` | help |
| | `q` | quit |

- **Sessions:** no direct shortcuts. Switch via `:` → *Sessions…* (or `:sessions`), then the two-stage picker with `/` fuzzy filter.
- **Return to live:** with start/live keys gone, pressing `↓` while already at the newest beat snaps the live player back to live-follow (`toLive`). Replay players just stop at the end.
- **Removed keys:** `p w g G Home End + - h l [ ] L R j k 1 2 3 4 5 6 7 8 9`. `r` is repurposed from rescan to replay.

## 1. Lean keymap

### Pure (`src/ui/keymap.ts`)
Rewrite `Action` to the surviving set only:

```
type Action =
  | { type: "panel-next" } | { type: "panel-prev" }
  | { type: "beat-back" } | { type: "beat-fwd" }
  | { type: "speed-up" } | { type: "speed-down" }
  | { type: "pause" } | { type: "replay" }
  | { type: "info" } | { type: "help" } | { type: "quit" };
```

`mapKey` bindings:

| key.name | Action |
|---|---|
| `up` | beat-back |
| `down` | beat-fwd |
| `left` | speed-down |
| `right` | speed-up |
| `space` | pause |
| `r` | replay |
| `tab` (`+shift` → prev) | panel-next / panel-prev |
| `i` | info |
| `?` | help |
| `q` | quit |

Everything else returns `null`. Removed action variants: `sess-up`, `sess-down`, `jump`, `pin`, `chunk-back`, `chunk-fwd`, `to-start`, `to-live`, `pulse`, `lens`, `filter`, `rescan`, `loop`. (`/` is no longer a global action — it is handled inside the picker only; see §2.)

### UI (`src/ui/App.tsx`)
- Drop state: `pulse`, `lensOn`. Drop helpers `stepSel`; drop the `jump`/`pin`/`sess-*` handling. Keep `switchTo` (the picker still calls it), `infoOn`, `replay`, `showHelp`, `picker`, `palette`.
- The keyboard switch handles only the surviving actions:
  - `beat-back` → `activePlayer?.stepBack()`
  - `beat-fwd` → **return-to-live**: if the active player is the live player and its cursor is at the end, `player.toLive()`, else `activePlayer?.stepForward()`
  - `speed-up`/`speed-down` → existing `setSpeed(× / ÷ 1.5)`
  - `pause`, `replay`, `info`, `help`, `quit` → as today (minus loop)
- `replay` keeps its current toggle-on/off behaviour but **without** a loop key; the replay player is created with `loop: false` and there is no longer a way to toggle loop. (Loop survives only if later re-added; out of scope.)
- `runCommand` in `App.tsx`: remove the `view.pulse`, `play.loop`, and `view.rescan` cases (their commands are deleted in `commands.ts`).

### Help + hints
- `helpRows()` (`src/ui/Menu.tsx`) rewritten to the final keymap table above.
- `hintsFor()` (`src/core/chrome.ts`) updated to the surviving keys (whatever subset the status hints surface).

### Commands (`src/core/commands.ts`)
Remove `view.pulse`, `play.loop`, `view.rescan`. Keep the rest (`panel.*`, `nav.sessions`, `view.help`, `play.pause`, `play.replay`, `files.sort`, `git.scope`, `tasks.hideDone`, `lens.info`, `app.quit`). The palette remains the discoverability surface for everything not on a key.

## 2. Fuzzy session picker

### Pure (`src/core/chrome.ts` + `src/ui/Menu.tsx`)
- `MenuRow` gains `search?: string` — the plain matchable text (project name / session title), so the leading status glyph in `left` does not pollute matching.
- `pickerRows()` sets `search` on every row (`p.project` for projects; `s.title || s.id` for sessions).
- New pure `rankRows(rows: MenuRow[], query: string): MenuRow[]` in `chrome.ts`:
  - empty query → return `rows` unchanged (registry order).
  - else keep only rows where `fuzzyScore(query, row.search ?? row.left) !== null`, sorted by score descending, ties keep original order (stable).
- `Menu` gains an optional `filter?: string` prop. When set (even empty string while in filter mode), it renders the live query — e.g. a `/<query>▎` line in the footer region — so the user sees what they are typing.

### UI (`src/ui/App.tsx`)
`PickerState` gains `query: string` and `filtering: boolean` (`CLOSED` initialises both to `""`/`false`). Rows shown = `rankRows(pickerRows(sessions, stageProject), query)`; `index` is clamped to the filtered length.

Picker key handling:

| State | Key | Behaviour |
|---|---|---|
| any | `/` | enter filter mode (`filtering = true`) |
| filtering | printable char | `query += ch`, `index = 0` |
| filtering | `backspace` | `query = query.slice(0,-1)`, `index = 0` |
| filtering | `escape` | clear filter (`filtering=false`, `query=""`); list returns to full |
| not filtering | `escape` | sessions-stage → back to projects; projects-stage → close |
| any | `up` / `down` | move `index` within the filtered list |
| any | `return` | open the selected filtered row (project → sessions stage; session → `switchTo` + close) |

`j/k` are no longer picker navigation (removed everywhere); the picker navigates with `↑/↓` only, leaving letters free to type into the filter.

## 3. Pulse → automatic animation

The comet / energy-pulse / breathing animation is **kept** — only the manual `p` toggle is removed. Animation should run whenever the timeline is actually moving and stop (no wasted render loop) when it is not.

### Pure (`src/core/anim.ts`)
Add `shouldAnimate(mode: PlayerMode, lastAdvanceMs: number, intervalMs: number, now: number): boolean` — true when the player is not paused **and** the timeline advanced within roughly the last interval (`now - lastAdvanceMs < intervalMs * k`), so a live session that has gone quiet, or a paused one, drops the loop. Unit-tested against the player modes.

### UI
- `App.tsx` computes `const animate = activePlayer ? shouldAnimate(activePlayer.mode(), lastAdvanceMs, intervalMs, Date.now()) : false` and passes it to `Showcase` **in place of** the `pulse` prop. `animate` is re-derived on each App render — which fires on cursor change (the existing force-repaint effect) and on store updates (status transitions to `idle`/`dormant`). The buffered panels' own `live` loop self-rests the comet between renders (`pulsePhase` saturates once `lastAdvanceMs` is stale), so a frame-exact "gone quiet" flip is unnecessary; the durable stop is the status gate (`animating = animate && !idle`).
- `Showcase.tsx` drops the `pulse`/`lensOn` props; forwards `animate` to the buffered panels.
- `Flow.tsx`, `Lens.tsx`, `panels/Git.tsx`: replace the `pulse` prop with `animate`. `live={animate}`; internal `animating = animate && !idle` (Lens) or `animate` (Flow/Git). The comet/breathe code paths that read `pulse` now read `animate`. No glyph/layout change.

## 4. Remove the phase ribbon

The phase ribbon is the strip rendered on the tab-bar seam (`TabBar.tsx`, gated on `lens.lensId`). Remove it entirely — it is invisible on any session that never invoked superpowers skills, which is the common case.

- `TabBar.tsx`: drop the `lens` prop and the `SUPERPOWERS_PHASES` ribbon block; the tab bar renders tabs only.
- `Showcase.tsx`: drop `lensOn` and the `tasksLens` gating; pass `agg.lens` straight to `<Tasks>` (the Tasks panel keeps its own phase fallback — that is *not* the ribbon).
- `App.tsx`: drop `lensOn` state and the `lens` (`w`) action wiring.
- `src/core/lens.ts` is unchanged — the detector still feeds the Lens panel and the Tasks fallback.

## 5. Clean quit

**Investigate with `systematic-debugging` before changing code** — reproduce, confirm root cause, then fix.

**Hypothesis (to confirm):** `renderer.destroy()` *does* restore the terminal (per OpenTUI docs), but `store.start()` registers a `setInterval` poll timer (and `App` an interval for replay ticks) that keeps Bun's event loop alive, so the process never exits after `destroy()` and the shell prompt never returns — the user reaches for Ctrl+C to kill the lingering process. OpenTUI explicitly does **not** exit the process on `destroy()`.

**Fix (single teardown chokepoint, `src/index.tsx`):**

```ts
const store = createStore();
store.start();
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  onDestroy: () => { store.stop(); process.exit(0); },
});
createRoot(renderer).render(<App store={store} />);
```

`q` → `renderer.destroy()` (already in `App.tsx`) fires `onDestroy` → `store.stop()` clears the timer → `process.exit(0)`. The same path covers Ctrl+C (`exitOnCtrlC`) and `exitSignals` (SIGTERM). Quit stays immediate — no confirmation prompt (glass-box observer).

If the live reproduction shows a *different* root cause (e.g. raw mode genuinely not restored), follow the evidence rather than this hypothesis.

## Architecture summary

### Pure (TDD)
- `src/ui/keymap.ts` — slimmed `Action` + `mapKey`. Tests rewritten.
- `src/core/chrome.ts` — `rankRows()`; `hintsFor()` updated. Tests added/updated.
- `src/core/anim.ts` — `shouldAnimate()`. Tests added.
- `src/core/commands.ts` — three commands removed. `commands.test.ts` updated.
- `src/ui/Menu.tsx` — `MenuRow.search`, `pickerRows` search, `helpRows` rewrite, `Menu` `filter` render. (Pure-ish row builders are testable; render verified visually.)

### UI / I/O
- `src/ui/App.tsx` — keymap wiring, picker filter state, `animate` derive, removed state, return-to-live.
- `src/ui/Showcase.tsx` — drop `pulse`/`lensOn`, forward `animate`, un-gate Tasks lens.
- `src/ui/TabBar.tsx` — remove ribbon.
- `src/ui/panels/{Flow,Lens,Git}.tsx` — `pulse` → `animate`.
- `src/index.tsx` — `onDestroy` teardown.

## Test plan
- [ ] `bunx tsc --noEmit` clean (strict + noUncheckedIndexedAccess).
- [ ] `bun test` green, including new pure suites: `mapKey` (final bindings + everything-else-null), `rankRows` (empty query passthrough, subsequence filter, score ordering, no-match excluded, stable ties), `shouldAnimate` (paused → false, recent advance → true, gone-quiet → false), `commands` (removed ids gone, survivors present).
- [ ] tmux visual: `q` returns to the shell prompt with **no** Ctrl+C (and Ctrl+C also exits cleanly); `↑/↓` scrub beats; `←/→` change speed; `space` pauses; `r` replays; `:` palette opens and `/` fuzzy-filters the session picker; `Tab` cycles panels; no pulse/ribbon artifacts; animation runs while live/replaying and stops when idle/paused.

## Build order
1. Pure helpers first (TDD): `mapKey` rewrite, `rankRows`, `shouldAnimate`, `commands` trim.
2. Ribbon + pulse removals (wiring through Showcase/TabBar/panels).
3. App keymap + picker-filter wiring; help/hints text.
4. Clean quit (systematic-debugging → fix → tmux verify).
5. Full typecheck + test + tmux verification.
