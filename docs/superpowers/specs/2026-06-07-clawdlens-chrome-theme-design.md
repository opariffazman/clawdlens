# ClawdLens — Chrome & Theme · Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm complete)
**Repo:** https://github.com/opariffazman/clawdlens

## Goal

Overhaul the ClawdLens shell ("chrome") into a k9s-inspired, fully-transparent
terminal UI: an everything-on-top header, a boxy tab bar whose active tab merges
into the panel frame, a **fuzzy command palette** (`:`) as the primary action/nav
surface (vi-style `:q`, autocomplete), and one standardized transparent theme used
by every component. This is **spec 1 of 4** in the larger UI/UX overhaul and the
foundation the other three render inside.

The four-spec decomposition (build order): **Chrome & Theme** (this) → Energy/Pulse
→ Lens (CI/CD pipeline hawk-eye) → Navigation & Lifecycle.

## Non-goals (deferred to sibling specs)

- **Pulse/energy rework** (cursor-driven, point-to-point, prominent) — Energy/Pulse spec.
- **Lens panel** (CI/CD pipeline of reusable looping nodes, holistic overview) — Lens spec.
  This spec adds the **Lens tab slot** + a placeholder body. **Default selected panel is
  `log`** until the real Lens body lands (Lens is leftmost in the tab order but not the
  landing view yet).
- **Fuzzy search of projects/sessions in the picker** — Navigation & Lifecycle spec. The
  reusable **fuzzy matcher itself ships here** (the command palette needs it); Nav reuses
  it for the picker.
- **Keymap binding overhaul** (direct-letter panel keys, ergonomics pass) and **clean quit /
  terminal restore** — Navigation & Lifecycle spec. Chrome wires `:q` to the *existing*
  quit path (`renderer.destroy()`); the actual terminal-restore fix is Nav's. Frequent
  single keys (`h/l` scrub, `[ ]` chunk, `space` pause, `Tab` cycle, `g/G`, `+/-`) stay as
  fast-paths.
- No change to `core/` data pipeline (parse/reducer/status/player) or panel data.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Screen skeleton | k9s-pure: context info **+** status **+** key-hints in a top header block; **no permanent bottom bar**; body maximized |
| Backgrounds | **100% transparent** everywhere — no bg fills, including the palette, overlays, selection (see [[transparent-no-bg-fills]]) |
| Border line | **Single accent line** — dim at rest, accent on the active frame; status shown only by the header glyph (no status-colored frame, no bg) |
| Tabs | Boxy: active tab `╭─Lens─╮` **merges into the panel's top border**; inactive tabs plain text; phase ribbon rides the same border line, right-aligned (always on; old `w` toggle retired) |
| Tab order | **Lens · Files · Tasks · Git · Log**; **default selected = `log`** (until Lens body exists) |
| Primary action surface | **Fuzzy command palette** opened with `:` — its own transparent bordered container overlay, autocomplete, vi-style commands incl. `:q` |
| Per-tab actions | Context-aware **commands in the palette** (e.g. `scope branch`, `sort edits`, `hide-done`) — the separate `m` menu is dropped |
| Picker / help | **Fullscreen focused** bordered + titled view, opened by commands (`:sessions`/`:projects`, `:help`) |
| Selection | `▸` marker + accent foreground — **never** a bg highlight (palette + picker) |
| Palette matching | **Fuzzy** (subsequence) over command `title`+`aliases`; `Tab` autocompletes to top match; best match pre-highlighted; no-match → dim row |
| Palette behaviour | `Enter` runs highlighted command · `↑/↓` move · `Esc` close; context commands shown only when their panel is active |
| Palette host | Its own top-anchored `CommandPalette` container overlay (`: query▏` input + ranked results + footer hint), separate from the fullscreen `Menu`; shares `menuModel`/`fuzzyScore` from core |

(Detailed palette behaviour lives in component §6 + the command-vocabulary table below.)

## Architecture / approach

Keep OpenTUI React `<box>` flexbox for all chrome structure (header, tab bar, frame) —
cheap, declarative, already in use. Buffered `setCell` canvas stays **only inside the
graph panels** (Log/Git), unchanged by this spec.

Per the repo's pure-core-first / TDD rule, all view-independent logic moves to pure
core modules with `bun:test` coverage: `core/chrome.ts` (hint list, tab model, menu
windowing model, **fuzzy matcher**) and `core/commands.ts` (command registry +
`filterCommands`). Rendering correctness (transparency, merged tab border, palette
overlay, fullscreen picker) is verified visually via tmux capture (agent has no TTY).

**Rejected approaches:** (b) hand-draw the entire chrome in one buffer — loses React
layout, fragile; (c) status-colored frame / bg accents — vetoed (transparent-only);
(d) `:`-as-session-picker + separate `m` menu — superseded by the unified palette.

## Components / Changes

### 1. `src/ui/theme.ts` — standardized transparent tokens

- Remove `bg`, `panel`, `sel` (no bg fills anywhere). Export a shared
  `TRANSPARENT = RGBA.fromValues(0,0,0,0)` (currently re-declared per file).
- Token set: `accent` (active frame/tab, selection marker, `#00E5FF`), `fg`
  (`#C8D0DA`), `dim` (inactive tabs, border at rest, secondary text, `#5A6472`),
  `ok`/`warn`/`err` (status **glyphs/text only**), `laneColors` (unchanged),
  `wireDim`/`wireHot` (unchanged, used by Pulse spec).
- Every component imports the shared `TRANSPARENT` for all `backgroundColor`.

### 2. `src/core/chrome.ts` — pure helpers (new, TDD)

- `fuzzyScore(query, target): number | null` — subsequence match with a ranking score
  (consecutive/word-start boosts); `null` = no match. Reused by the palette **and** the
  Nav picker.
- `hintsFor(panel, ctx): Hint[]` (`Hint = {key,label}`) — context-sensitive header hint grid.
- `tabModel(panels, active): TabSeg[]` — ordered render segments `{id,label,active}`.
- `menuModel(items, index, filter?)` — windowing/selection model shared by the fullscreen
  `Menu` and the `CommandPalette`.
- Tests: fuzzy ranking + ordering + no-match; hint composition per panel; tab order/active;
  menu windowing/clamping/`more`.

### 3. `src/core/commands.ts` — command registry (new, TDD)

- `type Command = { id; title; aliases?: string[]; hint?: string; icon?: IconKey;
  context?: (panel: PanelId) => boolean }` (pure data — no handlers).
- `COMMANDS: Command[]` — the vocabulary (see table below).
- `filterCommands(query, panel): Command[]` — applies `context` predicate for the active
  panel, fuzzy-ranks by `fuzzyScore` over `title`+`aliases`, returns sorted matches.
- Tests: context filtering (Git-only commands hidden on Files), fuzzy ordering, alias hits,
  empty-query returns the full applicable set.

### 4. `src/ui/Header.tsx` — top block (new)

Replaces the old header lines in `Showcase` **and** the bottom `StatusBar`.
- Left (2 lines): `● project · branch · model · <status glyph> status` and
  `ctx <gauge> NN%  $cost  elapsed  <marker>` (folded up from `StatusBar`; `parseErrors`
  warning kept).
- Right: key-hint grid from `hintsFor(panel, ctx)`, right-aligned, wrapping to 2–3 lines.
- `StatusBar.tsx` deleted (logic absorbed); `format.ts` helpers reused.

### 5. `src/ui/TabBar.tsx` — merged-border tab row (new)

Custom-drawn top-border row so segments can be individually colored (a single-color box
`title` can't express active/inactive/phase colors):
- Active tab as a raised notch `╭─Lens─╮` opening into the frame; inactive tabs `dim` text;
  border rule + right-aligned phase ribbon (the old `PhaseRibbon`) on the same line.
- The panel frame below renders left/right/bottom borders only (TabBar supplies the top).
- **Open question (resolve in planning via the `opentui` skill):** exact OpenTUI technique
  for a colored, partially-merged top border — candidate: a thin buffered strip drawing
  the border line + notch + ribbon via `setCell`. **Fallback:** un-merged tab strip above a
  fully bordered frame if merging proves impractical.

### 6. `src/ui/CommandPalette.tsx` — fuzzy command palette (new)

- Top-anchored bordered container box, transparent inside. Top line is the `: query▏`
  input; ranked results (icon + title + dim hint) below via `menuModel`; footer hint line.
- Reads `filterCommands(query, activePanel)`; `Tab` autocompletes the input to the top
  match; `↑/↓` move; `Enter` dispatches the selected command's id; `Esc` closes; empty/no
  match shows a dim "no match" row.
- Dispatch map (`id → effect`) lives in `App.tsx`, calling the same handlers the keymap
  uses (panel switch, toggles, picker/help open, rescan, quit, context actions).

### 7. `src/ui/Menu.tsx` — fullscreen picker/help (new)

- One component, **fullscreen mode only** now: bordered + titled box filling the frame,
  transparent inside, selection `▸`+accent, footer hint, optional `/` in-list filter.
- Hosts the session picker (two-step projects→sessions, `projectsOf`/`sessionsOf` data
  helpers retained from `SessionPicker`) and the help view. `SessionPicker.tsx` render
  collapses into `Menu`; `PhaseRibbon.tsx` is removed (ribbon → TabBar). The `m`
  contextual dropdown is **not** built (palette replaces it).

### 8. `src/ui/Showcase.tsx` — recompose

`Header` → `TabBar` → bordered frame (active panel body). Remove bottom `StatusBar`.
Body height budget recomputed (header ~3 + tab/border row 1 + frame, min 1). `PanelId`
renames `flow`→`log`; `PANELS = ["lens","files","tasks","git","log"]`; **default
`panel = "log"`**. A placeholder `Lens` panel ("holistic overview — coming soon") makes
the tab live; real body in the Lens spec.

## Command vocabulary (`core/commands.ts`)

| id | title | aliases | context | effect |
|---|---|---|---|---|
| `panel.lens` | Show Lens | `lens` | — | switch panel |
| `panel.files` | Show Files | `files` | — | switch panel |
| `panel.tasks` | Show Tasks | `tasks` | — | switch panel |
| `panel.git` | Show Git | `git` | — | switch panel |
| `panel.log` | Show Log | `log` | — | switch panel |
| `nav.sessions` | Sessions… | `sessions`, `proj` | — | open fullscreen picker |
| `view.help` | Help | `help`, `?` | — | open help menu |
| `view.rescan` | Rescan | `rescan`, `refresh` | — | `store.pollOnce` |
| `play.pause` | Pause/Play | `pause`, `play` | — | toggle player |
| `play.replay` | Replay | `replay` | — | toggle replay |
| `play.loop` | Loop | `loop` | — | toggle loop |
| `view.pulse` | Toggle Pulse | `pulse` | — | toggle pulse |
| `git.scope` | Scope: all/branch | `scope` | `git` | toggle git scope |
| `files.sort` | Sort: edits/reads/recent | `sort` | `files` | cycle files sort |
| `tasks.hideDone` | Hide completed | `hide-done` | `tasks` | toggle |
| `app.quit` | Quit | `q`, `quit` | — | quit (Nav owns restore) |

## Data flow / state (App.tsx)

- `panel` default `"log"`; `PanelId` includes `"lens"`, `flow`→`log`.
- New UI state: `palette: { open: boolean; query: string; index: number }`;
  `overlay: "none" | "picker" | "help"` (fullscreen `Menu`); `menuFilter: string`;
  panel option state (`filesSort`, `gitScope`, `tasksHideDone`).
- `:` opens the palette; typing updates `query`; dispatch routes command ids to existing
  handlers. `/` filters within an open fullscreen `Menu`.
- `forceRepaint` triggers extended to palette/overlay/query changes (ghosting fix).

## Testing & verification

- `bun test`: `core/chrome.ts` (fuzzy, hints, tab, menu models), `core/commands.ts`
  (filter/context/aliases), theme token shape. Update `SessionPicker`/`format`/`keymap`
  tests as touched.
- `bunx tsc --noEmit` (strict + noUncheckedIndexedAccess).
- tmux capture (`tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; capture-pane -p`):
  top header + hint grid, merged active-tab border, `:` palette open with fuzzy results +
  autocomplete, `:q` quitting, fullscreen picker/help, full transparency (no bg patches),
  `CL_ICONS=unicode` fallback.

## Risks / open questions

- **Merged colored tab border in OpenTUI** (component 5) — main rendering risk; resolve via
  `opentui` skill in the plan, with the un-merged fallback noted above.
- **Fuzzy ranking quality** — keep the scorer simple (subsequence + consecutive/word-start
  boosts); tune against the command list in tests.
- Header height vs small terminals — hint grid + palette must clip/wrap gracefully; body
  height budget must not underflow (min 1).
- Removing `StatusBar`/`PhaseRibbon` and the `:`-picker: update imports + tests in one pass.
