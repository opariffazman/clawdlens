# ClawdLens — Lens dynamic n8n-style pipeline

**Follow-up to the Lens panel** (`2026-06-07-clawdlens-lens-panel-design.md`, shipped in PR #8). That panel is an aggregate *static* board with a cursor flare. This spec makes the Lens a **dynamic, live showcase of the whole harness's thought processes & actions** — an n8n-style pipeline where the current process is the star.

## Purpose

The Lens is the holistic view of what the harness is *doing right now*, flowing through a fixed pipeline of stages in real log order. **Log** = raw chronological stream (source of truth for full detail). **Lens** = high-level live pipeline — concise, icon-driven, cadence-animated. Structure is fixed and dim; the active process is highlighted and animated.

## Principles

- **Current process is the star.** The active stage + the transition into it are the bright focus; everything else is a dim backdrop.
- **KISS / high-level.** Labels are short and icon-driven; full detail lives in the Log panel. The Lens shows *roughly* what's happening, not everything.
- **Cadence-driven, like Flow/Git.** Reuse the merged pulse model: `pulsePhase(now, lastAdvanceMs, intervalMs)` + `cometColor`. Live tail, scrub, replay (`R`), and loop (`L`) all trace the real sequence.
- **Pure-core-first.** Dynamic-state derivation and geometry are pure, unit-tested modules; `Lens.tsx` is a thin render.

## Stage model (unchanged from the static Lens)

Five fixed `PipeKind` stages in fixed slots, left→right:

```
 think(0,0)  →  tool(1,0) / skill(1,1)  →  result(2,0)  →  chat(3,0)
```

`result` is synthetic (after a completed tool beat). `BeatKind→PipeKind`: thinking→think, text→chat, skill→skill, tool→tool; `result` synthesized; wait/phase ignored. `buildPipeline` (existing `src/core/pipeline.ts`) still provides the aggregate backdrop (nodes, `×counts`, slot positions).

## Feature 1 — Live n8n flow

- The **revealed window** is `presented[0 .. cursor)` (beats from `cursor` onward aren't revealed yet, matching Flow where the head is `cursor-1`). The **active stage** = the `PipeKind` of the head (last revealed beat). It breathes (`breathe()`, lane→hot).
- The **current transition** = previous distinct stage → active stage. A comet rides that edge's routed path, gliding in via `pulsePhase`. When parked (phase=1) the comet sits on the active node breathing. With `<2` beats of history, just highlight the single active node.
- All other edges/nodes are a **dim backdrop** (the pipeline structure stays legible). `×counts` stay but dim/secondary.
- Honors the `p` pulse toggle (pulse off → static dim board, no comet).

## Feature 2 — Icons everywhere

Via `iconFor()` (nerd default, `CL_ICONS=unicode` fallback — every `IconKey` has both glyphs):

- **Idle stage node:** stage icon + short name. Stage→IconKey: think→`thinking`, tool→`tool`, skill→`skill`, result→`result`, chat→`text`.
- **Active stage node:** swaps in the **specific action icon** from the live beat's `iconKey` (`bash`/`edit`/`read`/`search`/`web`/`task`/…), so you see exactly what it's doing without text.

## Feature 3 — Info toggle (key `i`)

- New keymap action `info` bound to `i`. App holds `infoOn` state (default **on**), passed to `<Lens>`.
- **Info on:** the active node appends a short, high-level target after the icon — e.g. `✎ Lens.tsx`, `⚙ npm test`, `✦ brainstorming`. Derived from the beat's `detail`/`label`, clipped to a small budget (≈ COL_GAP-aware, ≤ ~20 chars). High-level only.
- **Info off:** icon-only, ultra-clean.
- Add a help-row entry: `i lens info`.

## Feature 4 — Git bloom / spark on milestones

- **`Beat.milestone?: "commit" | "branch"`** added to `types.ts`.
- **Reducer detection** (pure, in `reducer.ts`): when a Bash `tool_use` is folded, inspect `input.command`:
  - `commit` if it matches `/\bgit\b[^\n]*\bcommit\b/` and not `--dry-run`.
  - `branch` if it matches branch-creation: `/\bgit\s+(checkout\s+-b|switch\s+-c|branch)\b/` — but NOT deletion/listing (`-d`, `-D`, `--list`, `-a`, `-r`, or `git branch` with no further arg). Concretely: `checkout -b`, `switch -c`, or `git branch <name>` (a non-flag arg follows). Commit takes precedence if both somehow match.
  - Otherwise unset. Set `milestone` on the tool beat.
- **Render:** when the active beat (comet head) carries a milestone and (for commit) did not fail (`ok !== false`), play a transient burst at its node, radius ∝ `pulsePhase` (expands then fades; self-plays on live + replay; gone when parked):
  - **commit → bloom:** expanding ring of `✦ ✧ · *`, lane→hot.
  - **branch → spark:** quick asymmetric burst of `* +`.

## Feature 5 — Parallel subagent lanes

- Beats carry `lane` (`"main"` or a subagent lane id = the Task `tool_use` id); the reducer tracks `openLanes`.
- **Derivation:** group revealed beats (`presented[0 .. cursor)`) by lane. The **main** lane renders as the full pipeline (top). Each **open subagent lane** (`isOpen` — a `Task` beat for that lane has been revealed but its result hasn't) renders as a **compact icon-only row below**, with its own active-stage highlight + comet for that lane's current transition. The subagent's label comes from the originating `Task` beat (the main-lane beat whose `toolUseId === lane`).
- A branch connector drops from the `tool` (task) node to the sub-lane rows. Header cue: `▸ N agents live`. Cap visible sub-lanes (e.g. 3) with `+N more`.
- When no subagents are active, nothing extra renders (no wasted rows).

## Feature 6 — Failure flash + sputter

- On the active beat / its result with `ok === false`: the **result node flashes** (`breathe` in `theme.err`) and the **incoming comet sputters** — rendered with a broken/dashed glyph (`┉`) and intermittent intensity instead of a smooth comet.
- Applies per lane (a subagent failure flashes that lane's row).

## Feature 7 — Session vitality

- **Tempo:** shorter `intervalMs` (cranking) → faster comet glide + hotter base tint; longer (deep thinking) → slower/cooler. Derived from the cadence already passed in.
- **Idle/waiting:** from the live session `status`. When `idle`/`dormant`/`waiting`: the whole board drops to a slow standby breath (no comet motion) and a cue renders at the `chat` node — `waiting…` (waiting) or a dim resting state (idle/dormant).
- `status` is passed from the **live** session (not the full fold).

## Architecture

### Pure modules (TDD)

- **`src/core/pipeline.ts`** (existing): export `slotOf(kind): {col,row}` (currently private `SLOT`) so geometry/flow can reuse it. Keep `buildPipeline` for the backdrop.
- **NEW `src/core/pipeline-geometry.ts`:**
  - `Cell { x, y, ch }`.
  - `nodePos(kind: PipeKind, laneRow = 0): { x, y }` — screen cell of a stage (laneRow shifts sub-lane rows down).
  - `edgePath(from: PipeKind, to: PipeKind, laneRow = 0): Cell[]` — ordered routed cells from `from` to `to` (forward spine, back-arc below, or skill branch), used by both backdrop and comet.
  - Layout constants live here (LEFT, COL_GAP, stage-row Y, sub-lane row height), the way `flow-layout.ts` owns `ROW_STRIDE`.
- **NEW `src/core/pipeline-flow.ts`:** derive the dynamic state from beats + cursor (no rendering):
  - `LaneFlow { lane, label, activeKind, trail: PipeKind[], actionIcon: IconKey|null, detail: string|null, errored: boolean, milestone: "commit"|"branch"|null, isOpen: boolean }`.
  - `FlowState { main: LaneFlow, subLanes: LaneFlow[], agentsLive: number }`.
  - `deriveFlow(beats: Beat[], cursor: number, trailLen: number): FlowState`. Considers the revealed window `beats[0 .. cursor)`. Groups by lane; per lane computes `activeKind` (stage of the lane's head = its last revealed beat), `trail` (last `trailLen` *distinct* stages, oldest→newest), `actionIcon`/`detail` from the head beat, `errored`, `milestone`, `isOpen` (a `Task` beat for the lane was revealed with no matching result yet). Subagent `label` resolved from the Task beat whose `toolUseId === lane`.

### UI

- **`src/ui/panels/Lens.tsx`:** rewrite. Inputs: `full` (backdrop counts), `presented`, `cursor`, `pulse`, `lastAdvanceMs`, `intervalMs`, `status`, `infoOn`, `width`, `height`. Render order: dim backdrop (nodes/edges/counts via `buildPipeline`+`edgePath`) → main lane trail+comet+active node (icons, vitality) → sub-lane rows → bloom/spark overlay → failure flash. Uses `pulsePhase`/`cometColor`/`breathe`. Drops the old per-gap `energyRun`. Bounds-clipped like Flow/Git.
- **`src/ui/keymap.ts`:** add `{ type: "info" }`, map `i`.
- **`src/ui/App.tsx`:** `infoOn` state (default true), toggle on `info`; pass `lastAdvanceMs`/`intervalMs`/`status`/`infoOn` to Showcase→Lens. Add help-row entry. (Lens already wired into the full-fold gates.)
- **`src/ui/Showcase.tsx`:** thread the new props to `<Lens>`.
- **Command palette:** add a `lens.info` command (toggle info) for the lens panel, consistent with per-tab commands.

## Testing

**Pure (`bun:test`):**
- `pipeline-geometry`: `nodePos` slots; `edgePath` cell paths for forward (think→tool, multi-col think→chat), back (result→think), skill (skill→tool), and a `laneRow>0` offset.
- `pipeline-flow`: `deriveFlow` — active stage = latest beat's kind; trail = last K distinct stages (consecutive dups collapsed); `errored` from `ok===false`; `milestone` surfaced; lane grouping (main vs subagent), `agentsLive` = open lanes, sub-lane `label` from the Task beat; cursor partway through.
- `reducer`: git-milestone detection — `git commit -m…`→commit; `git checkout -b x`/`git switch -c x`/`git branch x`→branch; negatives (`git status`, `git branch -d x`, `git branch`, `git log`)→unset; `--dry-run`→unset.

**Visual (tmux, per CLAUDE.md):** replay (`R`) a session — watch the highlight hop stage→stage in order, action icons swap, the trail fade, `i` toggle info, subagent lanes appear with `▸ N agents live`, a failed tool flash red, a `git commit` beat bloom / branch spark, and idle sessions drop to standby. `-e` + frame-diff for the comet/bloom animation.

## Out of scope (YAGNI)

- No per-tool sub-breakdown inside `tool` (BeatKind grain holds).
- No audio. No new milestone types beyond commit/branch (PR/Ship celebration deferred).
- No dwell-time node swelling, no phase tinting (deferred extras).
- No repo polling for git state — milestones come from the session's own Bash git actions only.

## Files

| File | Change |
|------|--------|
| `src/core/types.ts` | add `Beat.milestone?: "commit" \| "branch"` |
| `src/core/reducer.ts` | pure git-milestone detection on Bash beats |
| `src/core/pipeline.ts` | export `slotOf(kind)` |
| `src/core/pipeline-geometry.ts` | **new** — `nodePos`, `edgePath`, layout constants |
| `src/core/pipeline-flow.ts` | **new** — `deriveFlow`, `LaneFlow`, `FlowState` |
| `src/ui/panels/Lens.tsx` | rewrite: dynamic flow, icons, info, lanes, bloom/spark, vitality |
| `src/ui/keymap.ts` | add `info` action → `i` |
| `src/ui/App.tsx` | `infoOn` state; pass cadence/status/infoOn; help row |
| `src/ui/Showcase.tsx` | thread new props to `<Lens>` |
| `src/core/commands.ts` | `lens.info` palette command |
| `tests/pipeline-geometry.test.ts` · `tests/pipeline-flow.test.ts` · `tests/reducer.test.ts` | new + extended suites |
