# harness-flow — Design Spec

- **Date:** 2026-06-06
- **Status:** Approved (design); pending implementation plan
- **Author:** opariffazman (with Claude Code)

## 1. Summary

`harness-flow` is a terminal UI that turns running Claude Code sessions from a
blackbox into a glass box. It passively watches every session you launch
(anywhere, in any terminal), and shows — at a high level, at a calm human pace —
what each one is *doing*: thinking, running tools, editing files, spawning
subagents, burning context. You switch focus between sessions instantly, and
watch the flow of actions assemble itself as a live node graph, without ever
leaving the terminal.

The defining feel is **slow burn**, not realtime firehose. Ingestion is fast and
authoritative (status and gauges are always current); the *narrative* is replayed
at reading pace so you can actually understand what happened, step by step.

## 2. Goals

- Answer "what is this session doing right now?" in one glance, for many
  concurrent sessions.
- Make long, subagent-heavy, multi-phase sessions (especially superpowers
  workflows) legible.
- Zero setup: no hooks to install, no config injection, no change to how you
  launch Claude Code.
- A genuinely pleasant, animated, terminal-native showcase — "statusline on
  steroids" — that you'd want to leave open on a second screen.

## 3. Non-goals (v1)

- Owning, launching, killing, or attaching to sessions (passive observer only).
- Replacing the conversation/transcript viewer.
- Web, mobile, or desktop UI.
- Multi-machine / remote monitoring.
- Perfect realtime — we explicitly trade latency for legibility.

## 4. Prior art and the gap

| Tool | Form | What it shows | Gap |
| --- | --- | --- | --- |
| agent-flow (patoles) | Web (Next.js) | Node graph of agent thinking/tools/subagents | Leaves the terminal for a browser |
| seunggabi/claude-dashboard | TUI (Go/tmux) | Session table: CPU/mem/uptime/status, attach | Process metrics — tells you it's *busy*, not *what it's doing* |
| schmoli, Tpain166 dashboards | TUI | Collapsible session cards | Monitoring, not a high-level activity narrative |
| onikan27/claude-code-monitor | CLI + mobile web | Focus switching, sessions | macOS, web UI |
| simple10/agents-observe | Web | Realtime replay, token stats | Web, not terminal |
| SigNoz / OTel | Web dashboards | Enterprise metrics | Not per-session storytelling |

**Unclaimed niche:** a full-screen, animated, terminal-native, high-level *live
narrative* of what each session is doing, with instant switching and an
n8n-style flow graph — paced for understanding, not realtime overwhelm.
`harness-flow` fills exactly that spot.

## 5. Key decisions (locked)

| Decision | Choice | Rationale |
| --- | --- | --- |
| Role | Passive observer | Zero workflow change; safest; "switch sessions" = switch which session's activity you view |
| Data source | Transcript JSONL tailing | Zero setup; richest passive source; full history + near-realtime |
| Surfaces | Activity narrative · status badges + alerts · token/cost/context gauge · depth panels | All four requested |
| Layout | Mission Control (master-detail) | Serves triage AND deep-dive; trivial switching; scales to many sessions |
| Pacing | Slow burn, coalesce + adaptive catch-up | Understand slowly; high-level beats; smooth, never thrashy |
| Flagship view | Vertical metro / git-graph Flow | Terminal-native; subagents fork to lanes and rejoin; builds bottom-up with pacing |
| Workflow awareness | Pluggable Workflow Lens, baked into v1 | Lights up superpowers pipelines; core stays universal |
| Stack | Bun + @opentui/react + @opentui/core + TS | Familiar, animated, good skill coverage |

## 6. Architecture

Layered, each layer with one job. Data ingestion is decoupled from
presentation pacing.

```
discover ─▶ tailer ─▶ parse ─▶ reducer ─▶ store ──▶ UI (OpenTUI + React)
                                  │         │ ▲
                               status ──────┘ │
                                 lens ────────┘
                                              │
                          player (paced, coalescing) ─▶ Flow panel
```

- **Authoritative path** (`tailer → reducer → store`) updates fast. Status
  badges and the context/token/cost gauge read straight from the store and
  reflect reality immediately — this is what you triage on.
- **Presentation path** (`store → player → Flow`) is paced. The player drains a
  queue of narrative beats at human reading speed, so the story unfolds slowly.

### Layer responsibilities

- **discover** — Enumerate session transcripts: scan `~/.claude/projects/*/` for
  `*.jsonl`. Derive project/cwd from the directory name and from entry fields.
  Re-scan on an interval to pick up newly created sessions.
- **tailer** — Poll-based incremental tail (~750 ms). Per file, track a byte
  offset; on size/mtime change, read appended bytes, split into lines, emit raw
  lines. Handle truncation/rotation (size shrinks → reset offset). On first
  sight of a large existing file, **start at EOF** — do not replay 100k lines;
  history is lazy-loaded only if the user scrolls back.
- **parse** — One JSONL line → a typed `Entry`. Malformed line → skip and
  increment a counter; never throw.
- **reducer** — Pure `applyEntry(session, entry) → session`. Folds an entry into
  `SessionState`. Pairs `tool_use` ↔ `tool_result` by id (duration, success).
  Folds sidechain entries into the subagent structure via `parentUuid` /
  `sourceToolUseID`.
- **status** — Pure `deriveStatus(session, now) → Status`. Best-effort state
  machine (§11).
- **lens** — Pure workflow detector (§13). Folds skill signals into
  `{ activePhase, phaseHistory, skillGroups }`.
- **store** — `Map<sessionId, SessionState>`, subscribable from React; emits on
  change.
- **player** — Paced presentation engine (§10). Consumes new narrative beats,
  coalesces bursts, drains at a calm cadence with adaptive catch-up.
- **UI** — Thin render of store + player output. A separate ~12 fps animation
  tick drives spinners, gauge tweens, and node build-in, independent of the
  data poll.

## 7. Data source: transcript JSONL

Transcripts live at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`. Each
line is a JSON object. Verified fields used by harness-flow:

- **Identity / context:** `sessionId`, `uuid`, `parentUuid`, `cwd`, `gitBranch`,
  `timestamp`, `version`, `isSidechain`, `userType`, `entrypoint`.
- **Title:** `type:"ai-title"` lines carry `aiTitle` — a human-readable session
  title generated by Claude (e.g. "Build TUI dashboard for Claude Code session
  visibility"). Used as the session label; fall back to first prompt, then cwd.
- **Prompt:** `type:"last-prompt"` lines carry `lastPrompt` (the user's latest
  request).
- **Assistant turns:** `type:"assistant"`, with `message.model`,
  `message.stop_reason`, `message.usage`, and `message.content[]` blocks of type
  `text` | `thinking` | `tool_use`.
- **Tool calls:** `tool_use` blocks carry `name` and `input` (e.g. `Bash` →
  `{command, description}`, `Edit` → `{file_path, ...}`, `Task` → subagent,
  `Skill` → `{skill}`).
- **Tool results:** `type:"user"` lines with `toolUseResult` and a
  `tool_result` content block (`tool_use_id`, `is_error`).
- **Usage / tokens:** `message.usage` = `input_tokens`,
  `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`,
  `server_tool_use.{web_search_requests, web_fetch_requests}`, `service_tier`.
  Context size ≈ `input_tokens + cache_read_input_tokens +
  cache_creation_input_tokens` of the latest turn.
- **Skill attribution:** `attributionSkill`, `attributionPlugin` on entries;
  plus `Skill` tool_use blocks. Drives the Workflow Lens (§13).
- **Misc:** `permissionMode` / `type:"mode"`, `type:"file-history-snapshot"`,
  compaction `summary` entries.

## 8. Data model

```ts
type Status = 'running' | 'working' | 'waiting' | 'idle' | 'dormant' | 'error';

interface SessionState {
  id: string;
  title: string;            // aiTitle | first prompt | cwd basename
  cwd: string;
  project: string;
  gitBranch: string;
  model: string;
  status: Status;
  startedTs: number;
  lastActivityTs: number;
  tokens: {
    input: number; output: number;
    cacheRead: number; cacheCreate: number;
    contextTokens: number;  // latest-turn context size estimate
    contextPct: number;     // contextTokens / modelLimit
    webCalls: number;
  };
  cost: { estimatedUSD: number };
  narrative: NarrativeEvent[];   // ring buffer, ~200
  flow: FlowGraph;               // nodes + lanes (subagents) + edges
  toolStats: Map<string, number>;
  fileHeat: Map<string, { reads: number; edits: number; lastTs: number }>;
  todos: TodoItem[] | null;
  lens: LensState;               // active phase, history, skill groups
  lastPrompt: string;
  parseErrors: number;
}

interface NarrativeEvent {
  ts: number;
  icon: string;
  kind: 'thinking' | 'text' | 'tool' | 'skill' | 'result' | 'wait' | 'phase';
  label: string;        // e.g. "Bash", "Edit", "Task · code-reviewer"
  detail?: string;      // e.g. "pytest -q", "auth.ts +12 −3"
  count?: number;       // coalesced burst count
  lane?: string;        // owning agent/subagent lane id
}

interface FlowNode {
  id: string;
  event: NarrativeEvent;
  lane: string;         // 'main' or subagent id
  parentId?: string;    // spine predecessor
  branchFrom?: string;  // node that spawned this lane (Task)
  rejoinTo?: string;    // node where lane rejoins main
  state: 'building' | 'done';
}

interface LensState {
  lensId: string | null;          // e.g. 'superpowers'
  activePhase: string | null;     // e.g. 'Brainstorm'
  phaseHistory: { phase: string; ts: number }[];
  skillGroups: { skill: string; nodeIds: string[]; ts: number }[];
}
```

## 9. Core modules (pure, testable, no I/O)

- `core/types.ts` — `Entry`, `SessionState`, `NarrativeEvent`, `FlowNode`,
  `FlowGraph`, `LensState`, `Status`.
- `core/discover.ts` — list project dirs and session files; `(re)scan()`.
- `core/tailer.ts` — incremental offset tracking and appended-bytes reads (the
  only file-I/O module besides discover).
- `core/parse.ts` — `parseLine(raw) → Entry | null`.
- `core/reducer.ts` — `applyEntry(state, entry) → state`; builds narrative +
  flow + heat + todos.
- `core/status.ts` — `deriveStatus(state, now)`.
- `core/tokens.ts` — model context-limit table, price table (configurable),
  `contextPct()` and `estimatedCost()`. Limits: 200k default; `[1m]` variants =
  1,000,000. Prices labeled approximate.
- `core/lens.ts` — pluggable workflow detectors; `superpowers` lens first.
- `core/flow-layout.ts` — assign nodes to lanes (main + subagent lanes) and
  compute spine/branch/rejoin edges, git-graph style. Highest-complexity pure
  module; unit-tested heavily.
- `core/player.ts` — paced queue: enqueue beats, coalesce, drain with adaptive
  catch-up (§10). Emits "presented" beats to the UI.

## 10. Pacing / player engine

The player decouples how fast events arrive from how fast they're shown.

- **Cadence:** drain ~1 beat per 0.8–1.5 s (default ~1.0 s). Each presented beat
  gets a slide-in + dwell so it's readable.
- **Coalescing:** consecutive same-kind beats merge into one with a `count`
  (e.g. `✎ Edit ×6`, expandable). Reduces flicker and serves the high-level goal.
- **Adaptive catch-up:** as the backlog grows, ease the drain interval down (and
  coalesce more aggressively) so it stays near-live while remaining smooth. When
  caught up, return to the calm default.
- **Reconcile indicator:** the status badge and gauges are always real-now; the
  Flow head may trail. A header marker shows `▸ live` or `▸ +N catching up`.
- **Controls:** `+`/`-` adjust playback speed; `space` pauses one session for
  study (badge/gauge keep updating; the narrative freezes).

## 11. Status heuristics (JSONL-only, honest)

| Status | Rule |
| --- | --- |
| `running` | last assistant `stop_reason = tool_use`, no matching `tool_result` yet, mtime fresh |
| `working` | last block is `thinking`/`text`, mtime < ~5 s |
| `waiting` | last assistant `stop_reason = end_turn` (your turn) |
| `idle` | mtime age > ~90 s and not `end_turn` |
| `dormant` | mtime age > ~30 min (collapsed / hidden from "live") |
| `error` | last `tool_result.is_error` true, or error stop |

**Stated limitation:** a session blocked on a permission prompt cannot be
distinguished from `running` via JSONL alone; it shows as `running`. Hooks would
resolve this (future). Optional v1 stretch: cross-check live `claude` PIDs via
`ps` to separate "truly live" from "recent file."

## 12. UI — Mission Control

```
┌ harness-flow ───────────────────────────────────────────┐
│ SESSIONS (4 live)   │ ⟢ Brainstorm ▸ Spec ─ Plan ─ … live │
│ ▸●▓ harness-flow ▆▇ │  ● harness-flow · main · opus-4.8   │
│  ◐  attendance  ▁▂  │  "Build TUI dashboard…"             │
│  ○  duelyst         │ ─────────────────────────────────── │
│  ●▓ factor      ▅▇▅ │  🎯 Skill · brainstorming  ⠋        │
│                     │  │                                  │
│                     │  🔍 WebSearch ×2                    │
│ ───────────────     │  │                                  │
│ ↑↓ move · ⏎ pin     │  🌐 WebFetch ×2                     │
│ 1-9 jump · w lens   │  │                                  │
│ +- speed · / filter │  ❓ AskUserQuestion ×5 (waiting)    │
│                     │ ─────────────────────────────────── │
│                     │  ctx ▓▓▓▓▓▓░░░ 62% 38k/200k  $0.42  │
│                     │  [flow] files  todos  log    ▸ live │
└─────────────────────┴──────────────────────────────────────┘
```

- **SessionList** (left, ~28 cols): per row = status glyph + title +
  token-rate sparkline. Sorted by activity (`running`/`waiting` on top).
  Selected row highlighted; `waiting` and `error` pulse to draw the eye.
  Footer = counts + key hints.
- **Showcase** (right):
  - **Phase ribbon** (top, when a lens matches): `⟢ Brainstorm ▸ Spec ─ Plan ─
    Execute ─ Review ─ Ship`, active phase highlighted.
  - **Header:** project · branch · model + title/prompt.
  - **Active panel:** Flow (default) | Files | Todos | Log.
  - **Footer gauge line:** context gauge (animated tween), token k/k, est. $,
    elapsed, and the `▸ live` / `▸ +N` marker.
- **Flow panel (flagship):** vertical metro / git-graph. Each agent action is a
  node along a spine; `Task` spawns fork to a parallel lane and rejoin on return.
  With the lens on, nodes group under skill super-nodes. New nodes build in
  bottom-up at the player's pace.
- **Files panel:** heatmap of touched files, hottest first (edits weighted over
  reads), with last-touch recency.
- **Todos panel:** TodoWrite list as a progress bar + items with state.
- **Log panel:** plain chronological narrative stream. Guaranteed-simple
  fallback that always works even while the Flow graph is iterated.

## 13. Workflow Lens

Pure, pluggable detector that overlays workflow structure on the generic flow.

- **Input signals:** `attributionSkill` / `attributionPlugin`, `Skill` tool_use
  inputs, and notable file writes (e.g. `docs/superpowers/specs/*-design.md`).
- **Output:** `LensState` — active phase, phase history, and skill groups
  (which nodes belong to which skill invocation).
- **superpowers lens phase map:**
  - `brainstorming` → **Brainstorm**
  - spec file write → **Spec**
  - `writing-plans` → **Plan**
  - `executing-plans` / `subagent-driven-development` /
    `dispatching-parallel-agents` → **Execute**
  - `requesting-code-review` / `code-review` / `receiving-code-review` →
    **Review**
  - `pr` / `pr-merge` / `finishing-a-development-branch` → **Ship**
- **Registry:** lenses register by id; the active lens is auto-detected from
  observed skills. `w` toggles the lens overlay off (back to generic flow).
- **Universality:** core flow works for any session; the lens is additive.

## 14. Animations

- Spinner frames on `running`/`working` (active thinking or tool).
- Node build-in: new Flow node slides/fades in with its connector drawing to the
  predecessor, at the player's pace.
- Gauge bar eases toward new context %.
- Active row's sparkline scrolls with token rate.
- Subtle pulse on `waiting` / `error` rows.
- Calm by default — "cool," not seizure-inducing. ~12 fps tick, decoupled from
  data poll.

## 15. Keybindings

`↑↓` / `j k` move · `1-9` jump · `⏎` pin/follow · `Tab` / `h l` cycle panels ·
`+` / `-` playback speed · `space` pause-and-study · `w` toggle Workflow Lens ·
`/` filter · `r` rescan · `?` help overlay · `q` / `Ctrl-C` quit.

## 16. Error handling and edge cases

- Malformed JSON line → skip + increment `parseErrors` (surfaced in footer);
  never crash.
- File rotation/truncation (size shrinks) → reset offset.
- Huge files → tail from EOF on first load; lazy history on scrollback.
- No / zero sessions → friendly empty state with a hint.
- Terminal resize → reflow; session list scrolls.
- Compaction `summary` entries → folded as a single narrative marker.
- Unknown tool names → generic "running <Tool>" node.
- Cost is an **estimate** from a configurable price map, labeled as approximate.
- Subagent entries whose parent isn't seen yet → buffered until the parent
  arrives, then attached.

## 17. Tech stack and project structure

- **Runtime:** Bun. **UI:** `@opentui/react` + `@opentui/core` + React.
  **Language:** TypeScript. **Tests:** `bun test`.

```
harness-flow/
  package.json
  tsconfig.json
  src/
    index.tsx                 # render(<App/>)
    core/
      types.ts discover.ts tailer.ts parse.ts reducer.ts
      status.ts tokens.ts lens.ts flow-layout.ts player.ts
    store/
      sessionStore.ts useSessions.ts
    ui/
      App.tsx SessionList.tsx Showcase.tsx StatusBar.tsx PhaseRibbon.tsx
      panels/ Flow.tsx Files.tsx Todos.tsx Log.tsx
      theme.ts anim.ts keymap.ts
  tests/
    fixtures/*.jsonl          # redacted real transcript lines
    *.test.ts
  docs/superpowers/specs/2026-06-06-harness-flow-design.md
```

Pure core (parse, reducer, status, tokens, lens, flow-layout, player) has no
I/O and is fully unit-testable. The UI is a thin render of the store.

## 18. Testing strategy (TDD)

- **parse:** real (redacted) lines → expected typed `Entry`; malformed → null.
- **reducer:** fold an ordered sequence of entries → snapshot `SessionState`
  (narrative, flow, heat, todos, tokens).
- **status:** truth-table of (last entry, stop_reason, mtime age) → `Status`.
- **tokens:** context % and cost math against known usage payloads.
- **flow-layout:** sequences with `Task` spawns → correct lanes, branch, and
  rejoin edges (including nested and parallel fan-out).
- **player:** burst input → coalesced, paced output; adaptive catch-up under
  backlog; pause behavior.
- **lens:** a superpowers session fixture → correct phase transitions and skill
  grouping.
- **UI smoke:** render `App` against a seeded store; assert key strings present
  (OpenTUI test util).

## 19. Scope

**v1 (this spec):** discovery + incremental tail; Mission Control screen; live
session list with badges, title, sparkline; the vertical-metro Flow (absorbing
the subagent tree); paced coalescing player with adaptive catch-up and
speed/pause controls; Files / Todos / Log panels; context/token/cost gauge;
pluggable Workflow Lens with the superpowers detector + phase ribbon;
keybindings; animations; theme; full pure-core test suite.

**Later (out of scope for v1):** hooks integration for true permission-wait +
zero-latency; PID liveness cross-check; history scrollback / replay; grid
"wall" mode toggle; desktop notifications; attach / manage (would require a
manager mode); additional workflow lenses.

## 20. Known limitations

- Permission-prompt blocking is indistinguishable from `running` via JSONL
  alone (shown as `running`).
- Cost figures are estimates from a configurable price map.
- Near-realtime, not realtime: ~0.75 s poll latency plus deliberate slow-burn
  pacing of the narrative.
- Node-flow auto-layout + edge routing + progressive animation is the
  highest-complexity component; the Log panel is the always-works fallback.

## 21. Open questions

None blocking. Cadence defaults, idle/dormant thresholds, and the price map are
tunable constants chosen during implementation and exposed as config.
