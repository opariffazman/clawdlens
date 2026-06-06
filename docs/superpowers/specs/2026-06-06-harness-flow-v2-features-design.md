# harness-flow v2 Features — Design Spec

- **Date:** 2026-06-06
- **Status:** Approved (design); pending implementation plan
- **Builds on:** `docs/superpowers/specs/2026-06-06-harness-flow-design.md` (v1, shipped)

## 1. Summary

Three additive features for the shipped harness-flow TUI, built and verified in
three phases that share infrastructure:

1. **Nerd-font icon set** — richer glyphs via Nerd Fonts, with a plain-Unicode
   fallback, decoupled from the data layer. (Shared infra — build first.)
2. **Replay mode** — gitlogue-style cinematic playback of a session's *full*
   transcript from event #1, with adjustable speed and an optional loop. (Reuses
   the player + metro Flow.)
3. **Git commit-graph panel** — a `git log --graph`-style branch-flow view of the
   selected session's repo, rendered with the existing vertical-metro renderer,
   commits-only (no diffs), inspired by `~/repo/gitverse`. (Biggest; new data
   source, reuses the renderer.)

## 2. Locked decisions

| Decision | Choice |
| --- | --- |
| Git view placement | New `git` panel for the **selected session's `cwd` repo** |
| Git graph orientation | **Vertical metro**, reusing the existing Flow renderer |
| Replay scope | Selected-session full replay + **loop/screensaver** |
| Build scope/order | All three, phased: **icons → replay → git-graph** |
| Icon set selection | Nerd default; `HF_ICONS=unicode` fallback (no reliable font auto-detect) |

## 3. Non-goals

- Diffs in the git view (commits/branches only).
- A standalone full-screen git mode (panel only this round).
- Editing git state / running git mutations (read-only).
- Auto-detecting whether a Nerd Font is installed.

---

## 4. Phase 1 — Nerd-font icon set

### 4.1 Decouple glyphs from data
Today `reducer.ts` bakes a literal glyph into each `Beat.icon` (via `TOOL_ICONS`).
Replace with a semantic key so the glyph is chosen at render time and the icon
set is switchable.

- **Types:** add `iconKey: IconKey` to `Beat`; keep `icon` removed from the data
  path (UI resolves it). `IconKey =
  "bash" | "edit" | "read" | "search" | "web" | "task" | "skill" | "thinking"
  | "text" | "todo" | "result" | "tool"`.
- **Reducer:** set `iconKey` per content block / tool name (e.g. `Bash→bash`,
  `Edit|Write|NotebookEdit→edit`, `Read→read`, `Grep|Glob→search`,
  `WebSearch|WebFetch→web`, `Task→task`, `Skill→skill`, `TodoWrite→todo`,
  thinking block→`thinking`, text block→`text`, unknown tool→`tool`). This stays
  pure. `TOOL_ICONS` is removed from `reducer.ts`.

### 4.2 `src/ui/icons.ts`
```ts
export type IconSet = "nerd" | "unicode";
export const ICONS_UNICODE: Record<IconKey, string> = {
  bash: "⚙", edit: "✎", read: "▤", search: "⌕", web: "◍", task: "◆",
  skill: "✦", thinking: "◇", text: "○", todo: "☑", result: "✓", tool: "◈",
}; // all single-width BMP glyphs (no double-width emoji)
export const ICONS_NERD: Record<IconKey, string> = { /* Nerd Font PUA glyphs */ };
export function activeIconSet(): IconSet { return process.env.HF_ICONS === "unicode" ? "unicode" : "nerd"; }
export function iconFor(key: IconKey): string { /* active set, fall back to ICONS_UNICODE[key] ?? "·" */ }
```
- Nerd glyphs use well-known Nerd Fonts codepoints (confirm against the Nerd
  Fonts cheat sheet during implementation): terminal/bash, file/edit, git,
  magnify/search, globe/web, robot/task, star/skill, brain/thinking,
  check-square/todo.
- **Powerline flair (nerd set only):** powerline separators (`` U+E0B0 /
  `` U+E0B2) between panel tabs and around the active phase-ribbon pill. A
  `powerline: boolean` derived from `activeIconSet() === "nerd"`.

### 4.3 UI wiring
- `Flow.tsx`, `Log.tsx` (and anywhere using `b.icon`) call `iconFor(b.iconKey)`.
- `Showcase` tabs + `PhaseRibbon` use powerline separators when enabled.

### 4.4 README
Add a **Fonts** section: install a Nerd Font (e.g. *JetBrainsMono Nerd Font*,
*FiraCode Nerd Font*) and set it as the terminal font for the full icon set;
or run `HF_ICONS=unicode harness-flow` for the plain-Unicode set.

### 4.5 Tests
- `iconFor` returns nerd glyph under nerd set, unicode under unicode set, and a
  safe fallback (`·`) for an unknown key.
- Reducer assigns the correct `iconKey` for each tool/block type (extend
  `reducer.test.ts`).

---

## 5. Phase 2 — Replay mode

### 5.1 Full-transcript loader
- **`src/store/sessionStore.ts`** gains `fullBeats(id: string): Beat[]` (or a
  standalone `src/core/loadTranscript.ts` with `loadBeats(file): Beat[]`): reads
  the *entire* transcript file (not tail-from-EOF), folds with the existing
  `parseLine` + `applyEntry`, returns the complete `Beat[]`. One-shot read,
  separate from the incremental tailer.

### 5.2 Replay player
Extend `createPlayer` (`src/core/player.ts`) with replay semantics:
- A `replay` flag/mode: the beat list is fixed (`setBeats` once), head starts at
  0, and `tick` drains at the **base interval** — no adaptive catch-up (there is
  no live head to chase).
- **Loop:** `setLoop(on)`; when `head` reaches the end and loop is on, reset
  `head = 0` (and `lastAdvanceAt`) to replay endlessly (screensaver).
- Existing `setSpeed`, `pause/play`, `stepBack/stepForward/toStart` still apply.
- `toLive()` is a no-op in replay; `cursor`/`presented()` unchanged.

### 5.3 App wiring
- State: `replay: { active: boolean; player: Player | null; loop: boolean }`.
- `R`: toggle replay for the **selected** session — on enter, call
  `store.fullBeats(selected.id)`, build a replay player (`createPlayer` with
  replay+loop flags), `setBeats(all)`; on exit, drop it and return to the live
  player.
- `L`: toggle loop on the replay player.
- The Showcase renders the **replay** player's `presented()` when
  `replay.active`, else the live player's (existing path).
- Marker: `⏮ replay {cursor}/{len}`; append `· ⟳` when looping.
- The pacing tick in `usePlayers` ticks the active player (live or replay).

### 5.4 Keybindings (additions)
`R` enter/exit replay · `L` toggle loop. (Existing `+/- space h l g G` apply to
whichever player is active.)

### 5.5 Tests
- Replay player: from a fixed beat list, `presented().length` grows from 0 with
  ticks; reaching the end with loop resets to 0; without loop it stops at the
  end; `setSpeed` changes the rate (time injected).
- `loadBeats` folds a fixture file fully (more than the backfill window) → full
  beat count.

---

## 6. Phase 3 — Git commit-graph panel

### 6.1 Data — `src/core/git-log.ts` (pure parse)
- The store/panel runs (I/O): `git -C <cwd> log --all --date-order
  --pretty=format:%H%x1f%P%x1f%D%x1f%s -n 120` (field sep = US `\x1f`, record sep
  = newline). Commits only — **no diffs**.
- `parseGitLog(stdout: string): Commit[]` where
  `Commit = { hash: string; shortHash: string; parents: string[];
  refs: string[]; subject: string }`. `refs` parsed from `%D` (e.g.
  `HEAD -> main`, `origin/main`, `tag: v1`).
- Errors (not a repo, git missing, empty) → `[]`; the panel shows a friendly
  empty state.

### 6.2 Lane layout — `src/core/git-graph.ts` (pure)
- `layoutGitGraph(commits: Commit[]): FlowGraph` — a `git log --graph`-style lane
  assignment producing the **same `FlowGraph` shape** (`lanes`, `nodes`,
  `segments`, `rows`, `columns`) the metro renderer consumes:
  - Walk commits in given (date) order; maintain a set of active lanes, each
    holding the hash it currently expects next.
  - Each commit takes the lane expecting its hash (or a new lane); after placing
    it, its first parent continues that lane; additional parents (merge) open
    lanes (branch labels); a lane whose expected hash is already placed elsewhere
    closes (branch point).
  - Emit spine `│`, branch `├─┐`, and merge/rejoin connector cells between rows
    using the existing `ROW_STRIDE` so wires + (optional) pulse render.
- Highest-complexity module; thorough unit tests (§6.5). Fallback if it proves
  too gnarly: render `git log --graph --oneline --color` output as colored text
  in the panel (documented).

### 6.3 Panel — `src/ui/panels/Git.tsx`
- Renders the `FlowGraph` from `layoutGitGraph` via the **same drawing approach**
  as `Flow.tsx` (factor shared cell-drawing into a helper if convenient), with:
  - commit nodes (`●`, HEAD commit highlighted), short hash, ref labels inline
    (`(HEAD → main)`, `(feature)`, `tag: …`) colored by ref type, subject
    (truncated).
  - vertical scroll/window to the panel height; HEAD near top (commits are
    date-desc).
- Non-repo / empty → `<text dim>not a git repo</text>` (or "no commits").

### 6.4 Integration
- `PanelId` gains `"git"`; `PANELS = [flow, files, todos, log, git]`.
- The store/panel fetches commits for the selected session's `cwd` on panel open
  and on `r` (rescan); cache per cwd to avoid re-running git every render.
- Reads `session.cwd`; if empty, empty state.

### 6.5 Tests
- `parseGitLog`: a sample multiline stdout → correct `Commit[]` incl. parents,
  refs (HEAD/branch/tag), subject; malformed/empty → `[]`.
- `layoutGitGraph`: linear history → single lane, stacked rows; one branch+merge
  → a second lane with branch + rejoin segments; two parallel branches →
  distinct lanes; HEAD commit identified.

---

## 7. File structure (additions)

```
src/core/
  loadTranscript.ts   # loadBeats(file) — full read for replay
  git-log.ts          # parseGitLog(stdout) -> Commit[]
  git-graph.ts        # layoutGitGraph(commits) -> FlowGraph
  player.ts           # + replay/loop mode (modified)
  types.ts            # + iconKey on Beat; Commit type (modified)
  reducer.ts          # set iconKey; drop baked glyphs (modified)
src/ui/
  icons.ts            # IconKey maps (nerd/unicode) + iconFor + powerline
  panels/Git.tsx      # commit-graph panel
  App.tsx Showcase.tsx Flow.tsx Log.tsx PhaseRibbon.tsx  # wiring (modified)
tests/
  icons.test.ts git-log.test.ts git-graph.test.ts loadTranscript.test.ts
  player.test.ts reducer.test.ts  # extended
README.md             # Fonts section (modified)
```

## 8. Testing & verification strategy

- **Pure core (TDD, `bun test`):** `iconFor`, reducer `iconKey`, replay player +
  `loadBeats`, `parseGitLog`, `layoutGitGraph`.
- **Visual (tmux capture loop):** replay builds from event #1 with pulse; git
  panel shows lanes/wires/ref labels; tabs/ribbon powerline separators. Nerd
  glyphs require the user's font to confirm — verify emitted codepoints + the
  `HF_ICONS=unicode` fallback; user confirms the nerd glyphs render.

## 9. Scope: in vs later

**In (this spec):** the three phases above.
**Later:** standalone full-screen git mode (any repo); git view diffs; screensaver
auto-cycling across sessions; nerd-font auto-detection.

## 10. Known limitations / risks

- Nerd glyphs render only with a Nerd Font installed (documented; `HF_ICONS=unicode`
  fallback always works).
- The git-DAG lane algorithm is non-trivial; `git log --graph` text is the
  documented fallback.
- `git` must be on PATH and the cwd a repo; otherwise the panel degrades to an
  empty state.
- Replay reads the whole transcript into memory (fine for normal sessions; very
  large transcripts could be capped if needed).
