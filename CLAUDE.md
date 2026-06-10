# ClawdLens

Terminal glass box for Claude Code sessions. Passive observer — tails `~/.claude/projects/**/*.jsonl`, no hooks, no setup. Shows each session activity: live **Lens** pipeline (default), animated metro **Flow** + energy-pulse, file heatmap, agnostic tasks, git commit-graph, superpowers phase detection. OpenTUI + React on Bun. Public repo + npm package: `clawdlens` (brand: ClawdLens).

## Run

```bash
bun install
bun run dev          # the TUI
bun run dump         # headless debug: print live sessions
bun test             # full suite (bun:test)
bunx tsc --noEmit    # typecheck (strict + noUncheckedIndexedAccess)
CL_ICONS=unicode bun run dev   # plain-glyph fallback (no Nerd Font)
bun run gen:art      # regenerate lens icon/label art (devDeps: resvg, figlet)
```

## Stack

Bun · TypeScript (strict) · React 19 · `@opentui/react` + `@opentui/core` (native Zig renderer). No web. Tests `bun:test`.

## Architecture

Pure-core-first. Pipeline: `discover → tailer → parse → reducer → store`; then `status`/`lens`/`flow-layout`/`player` derive views. UI = thin render of store. Pure modules = no I/O → unit-tested. I/O (file read, git exec) in store only.

```
src/core/   (pure, TDD)
  types.ts         all shared types (Entry, SessionState, Beat, Commit, IconKey, TodoItem…)
  parse.ts         JSONL line → Entry|null
  tokens.ts        context limit + cost estimate; effectiveContextLimit infers 1M when ctx>200k
  status.ts        deriveStatus heuristic (running/working/waiting/idle/dormant/error)
  reducer.ts       applyEntry folds entry → SessionState (beats, fileHeat, todos, tasks, subagent lanes, iconKey). returns shallow copy — replace collections immutably
  lens.ts          superpowers phase detector (Brainstorm→Spec→Plan→Execute→Review→Ship)
  flow-layout.ts   beats → FlowGraph (lanes/nodes/segments, ROW_STRIDE). git-graph reuses shape
  pipeline-geometry.ts  n8n node-row layout: width ladder, border/port/badge cells, straight+rounded wires, sub-row tree fan
  git-log.ts       parseGitLog(stdout)→Commit[]; GIT_LOG_ARGS (--all --no-patch, %H%P%D%s)
  git-graph.ts     layoutGitGraph(commits)→FlowGraph (git log --graph lane algo: 1st parent continues, extra parents branch, converging lanes rejoin)
  player.ts        paced coalescing player: cursor, modes live/paused/history, replay+loop, ONE adaptive interval
  loadTranscript.ts  loadSession(file)/loadBeats(file): whole-file fold (replay + aggregate panels)
src/store/
  sessionStore.ts  wire discover/tail/parse/reduce/status/lens; subscribe; pollOnce(now); fullSession(id)/fullBeats(id)
  gitFetch.ts      gitLog(cwd): Bun.spawnSync git + parseGitLog
src/ui/
  App.tsx          layout, keyboard, selection (by id), shared progress, replay state
  Showcase.tsx     full-width: Header + TabBar + active panel (+ CommandBox overlay on `:`). PanelId = lens|files|tasks|git|log; default = lens
  panels/Lens.tsx  default: n8n-style canvas — trigger half-pill + stage boxes (braille lucide icons, names below), skills/agents as dashed sub-nodes, persistent green trail wires, orbiting coral ring on the active node; `i` flips sub-row to tool breakdown; CLAWDLENS splash when empty; think-box breathe during long thinks
  panels/lens/     Lens helpers: iconArt.gen.ts (braille lucide icons + miniwi labels — bun run gen:art, never hand-edit), draw.ts, phaseRibbon/economy/heartbeat/skillTimeline bands
  panels/Flow.tsx  Log panel: buffered metro graph + energy pulse (setCell + RGBA, live)
  panels/Files.tsx file heatmap (full-session fileHeat)
  panels/Tasks.tsx agnostic: TodoWrite + reconstructed TaskCreate/TaskUpdate + superpowers phase fallback
  panels/Git.tsx   buffered commit-graph; lanes coloured per branch; build-up reveal + pulse
  Menu.tsx         fullscreen picker/help (rankRows fuzzy filter); CommandBox.tsx fuzzy palette; TabBar.tsx tabs; Header.tsx header
  icons.ts         IconKey→glyph; nerd default + CL_ICONS=unicode fallback; powerline separators
  format.ts keymap.ts usePlayers.ts anim.ts theme.ts
bin/clawdlens.ts       npm entry: shebang wrapper → src/index.tsx (bunx clawdlens)
bin/clawdlens-dump.ts  debug CLI (proves engine headless)
docs/superpowers/{specs,plans}/  design specs + impl plans
```

## Key concepts

- **Beat** = one narrative event (thinking/text/tool/skill/result). `iconKey` semantic; glyph resolved in UI (icons.ts).
- **Player cursor = ONE shared timeline.** `progress = activePlayer.cursor()/all().length` drives ALL panels (Flow/Files/Tasks/Git) — reveal in sync, finish together. Not per-panel timers.
- **Adaptive cadence** (live AND replay): `interval = max(min, base*factor)/speed`; factor eases as catches up; `←`/`→` scale whole interval via `/speed`.
- **Backfill vs full-fold.** Live store tails from EOF + ~64KB backfill (recent only). Aggregate panels (Files/Tasks/git cwd) use `store.fullSession()` = whole transcript.
- **Lens** = superpowers phases from skill attribution + spec/plan file writes.
- **Agnostic tasks**: reducer reconstructs from harness TaskCreate(subject)/TaskUpdate(taskId,status) sequentially, plus TodoWrite.

## Keys

`:` command palette (fuzzy; sessions via `:`→sessions, then `/` to filter) · `Tab`/`Shift-Tab` panels · `↑`/`↓` scrub · `←`/`→` speed · `space` pause · `r` replay · `i` lens detail · `?` help · `q` quit. Energy-pulse auto-runs while the timeline moves; `q` restores the terminal cleanly (no Ctrl+C).

## Conventions

- **Use superpowers skills whenever relevant** (not optional): `brainstorming` before any new feature/behaviour; `systematic-debugging` for ANY bug/test-failure/unexpected behaviour (root cause before fix — no guess-and-check); `test-driven-development` before impl; `writing-plans`/`executing-plans` for multi-step work; `verification-before-completion` before claiming done. Invoke via the `Skill` tool.
- **Use the `opentui` skill for ANY OpenTUI work** (rendering, buffers, layout, keymaps, capabilities) — its `docs/**/*.mdx` are source of truth; don't guess the API.
- **TDD pure core** — failing test first. Workflow: brainstorm → spec → plan → subagent-driven build. specs/plans in `docs/superpowers/`.
- **Verify TUI visually via tmux** (agent has no TTY): `tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p`. Use `-e` + diff two frames for colour/pulse animation. `tmux send-keys` to drive keys.
- **Transparent canvas** — inherit terminal bg (OLED). Don't paint bg except selection/overlay accents.
- Conventional commits, per task. Public repo `origin` = `github.com:opariffazman/clawdlens`. Branch → PR (CI gates: typecheck + test) → merge to main. See Release.

## Release

Public repo `opariffazman/clawdlens`. `main` gated by CI.

- **CI** (`.github/workflows/ci.yml`): push-main + all PRs → `bun install --frozen-lockfile` · `bunx tsc --noEmit` · `bun test`. PRs must be green.
- **Release** (`.github/workflows/release.yml`): push tag `v*` → typecheck + test → `npm publish --provenance --access public` → GitHub Release (auto notes). Needs the `NPM_TOKEN` repo secret (set).
- **Cut a release:** bump `package.json` `version` → `git commit -am "chore(release): vX.Y.Z"` → `git tag vX.Y.Z` → `git push --follow-tags`. Token also kept in gitignored `.env` for manual `npm publish` if ever needed.
- **Users install** via `bunx clawdlens` or `bun install -g clawdlens`. The package ships TS source + `tsconfig.json`; Bun transpiles (and resolves `jsxImportSource`) on the user's machine — no build step.
- Action versions pinned to current stable majors (`checkout@v6`, `setup-node@v6`+node24, `setup-bun@v2`) to avoid deprecated-runtime warnings.

## Gotchas

- OpenTUI buffered panels (Flow/Git): draw via `buffer.setCell(x,y,ch,fg,bg)` + `RGBA.fromHex`/`fromValues`. Set box `live={animating}` for continuous pulse — `renderer.targetFps` alone does NOT run loop. `drawStr` = setCell loop, assumes 1 cell/char → wide/emoji glyphs misalign.
- **tmux ghosting (stale cells when scrolling).** Symptom: scrubbing leaves leftover text fragments at fixed columns; `tmux detach`/reattach or resize clears them; never reproduces outside tmux. Root cause: OpenTUI auto-detects width method (`caps.unicode` → `"unicode"` inside tmux) that DISAGREES with how tmux advances cursor for some glyphs (emoji/CJK/ambiguous, e.g. `⏪`=2 but `⏮`=1). Incremental render diff then mis-tracks cursor, skips re-emitting drifted cells. NOT transparency (opaque bg doesn't fix), NOT one glyph (even ASCII-only content ghosts). Width method native-only — can't force `wcwidth` from JS. **Fix:** force full repaint (`renderer.forceFullRepaintRequested = true; renderer.requestRender()`) whenever content moves (cursor/panel/session/picker change) — re-emits every cell, overwrites drift. See `App.tsx` `forceRepaint`.
- tsconfig needs `"jsxImportSource": "@opentui/react"`.
- Write tool sometimes strips PUA glyphs — verify Nerd Font codepoints by hex.
- ctx% can read >100% for 1M-context models (transcript `message.model` omits `[1m]`); effectiveContextLimit infers from observed ctx.
- Permission-prompt blocking NOT distinguishable from `running` via JSONL alone (no hooks). Cost = estimate.