# harness-flow

Terminal glass box for Claude Code sessions. Passive observer — tails `~/.claude/projects/**/*.jsonl`, no hooks, no setup. Shows what each session doing: animated metro **Flow** + energy-pulse, file heatmap, agnostic tasks, git commit-graph, superpowers phase lens. OpenTUI + React on Bun.

## Run

```bash
bun install
bun run dev          # the TUI
bun run dump         # headless debug: print live sessions
bun test             # full suite (bun:test)
bunx tsc --noEmit    # typecheck (strict + noUncheckedIndexedAccess)
HF_ICONS=unicode bun run dev   # plain-glyph fallback (no Nerd Font)
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
  git-log.ts       parseGitLog(stdout)→Commit[]; GIT_LOG_ARGS (--all --no-patch, %H%P%D%s)
  git-graph.ts     layoutGitGraph(commits)→FlowGraph (git log --graph lane algo: 1st parent continues, extra parents branch, converging lanes rejoin)
  player.ts        paced coalescing player: cursor, modes live/paused/history, replay+loop, ONE adaptive interval
  loadTranscript.ts  loadSession(file)/loadBeats(file): whole-file fold (replay + aggregate panels)
src/store/
  sessionStore.ts  wire discover/tail/parse/reduce/status/lens; subscribe; pollOnce(now); fullSession(id)/fullBeats(id)
  gitFetch.ts      gitLog(cwd): Bun.spawnSync git + parseGitLog
src/ui/
  App.tsx          layout, keyboard, selection (by id), shared progress, replay state
  Showcase.tsx     full-width: PhaseRibbon + header + active panel + StatusBar. PanelId = flow|files|tasks|git
  panels/Flow.tsx  buffered metro graph + energy pulse (setCell + RGBA, live)
  panels/Files.tsx file heatmap (full-session fileHeat)
  panels/Tasks.tsx agnostic: TodoWrite + reconstructed TaskCreate/TaskUpdate + superpowers phase fallback
  panels/Git.tsx   buffered commit-graph; lanes coloured per branch; build-up reveal + pulse
  SessionPicker.tsx  on-demand two-step picker (projects → sessions)
  icons.ts         IconKey→glyph; nerd default + HF_ICONS=unicode fallback; powerline separators
  format.ts keymap.ts usePlayers.ts anim.ts theme.ts
bin/hf-dump.ts     debug CLI (proves engine headless)
docs/superpowers/{specs,plans}/  design specs + impl plans
```

## Key concepts

- **Beat** = one narrative event (thinking/text/tool/skill/result). `iconKey` semantic; glyph resolved in UI (icons.ts).
- **Player cursor = ONE shared timeline.** `progress = activePlayer.cursor()/all().length` drives ALL panels (Flow/Files/Tasks/Git) — reveal in sync, finish together. Not per-panel timers.
- **Adaptive cadence** (live AND replay): `interval = max(min, base*factor)/speed`; factor eases as it catches up; `+`/`-` scale whole interval via `/speed`.
- **Backfill vs full-fold.** Live store tails from EOF + ~64KB backfill (recent only). Aggregate panels (Files/Tasks/git cwd) use `store.fullSession()` = whole transcript.
- **Lens** = superpowers phases from skill attribution + spec/plan file writes.
- **Agnostic tasks**: reducer reconstructs from harness TaskCreate(subject)/TaskUpdate(taskId,status) sequentially, plus TodoWrite.

## Keys

`:` session picker · `Tab`/`Shift-Tab` panels · `h/l`/`←→` scrub · `[ ]` chunk · `g`/`G` start/live · `space` pause · `+`/`-` speed · `p` pulse · `w` lens · `R` replay · `L` loop · `r` rescan · `?` help · `q` quit.

## Conventions

- **TDD pure core** — failing test first. Workflow: brainstorm → spec → plan → subagent-driven build. specs/plans in `docs/superpowers/`.
- **Verify TUI visually via tmux** (agent has no TTY): `tmux new-session -d -s hf -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t hf -p`. Use `-e` + diff two frames to see colour/pulse animation. `tmux send-keys` to drive keys.
- **Transparent canvas** — inherit terminal bg (OLED). Don't paint bg except selection/overlay accents.
- Conventional commits, per task. Solo local repo, no remote → commit direct to main.

## Gotchas

- OpenTUI buffered panels (Flow/Git): draw via `buffer.setCell(x,y,ch,fg,bg)` + `RGBA.fromHex`/`fromValues`. Set box `live={animating}` for the continuous pulse — `renderer.targetFps` alone does NOT run the loop. `drawStr` = setCell loop, assumes 1 cell/char → wide/emoji glyphs misalign.
- tsconfig needs `"jsxImportSource": "@opentui/react"`.
- Write tool sometimes strips PUA glyphs — verify Nerd Font codepoints by hex.
- ctx% can read >100% for 1M-context models (transcript `message.model` omits `[1m]`); effectiveContextLimit infers from observed ctx.
- Permission-prompt blocking NOT distinguishable from `running` via JSONL alone (no hooks). Cost = estimate.
