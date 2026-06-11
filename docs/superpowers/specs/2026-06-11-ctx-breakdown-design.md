# Context-Token Breakdown — Design

Date: 2026-06-11
Status: approved (issue #20 carries the validated scope; autonomous resume)

## Problem

The header shows ONE ctx number (`142k/200k · 71%`). "Why is my context at
90%" has no answer — which pool is eating it: system prompt, user messages,
tool results, reasoning, subagent results? Issue #20. Constraint: passive
JSONL fold, no hooks.

## Prior art — agent-flow

`session-watcher.ts` `contextBreakdown` + `protocol.ts`
`WatchedSession.contextBreakdown`.

## Design

### Estimation model (honest, labeled `~`)

Transcript `usage` gives exact context TOTALS per turn but no per-category
split. Split is estimated from content sizes: `estimateTokens(text) =
ceil(chars / 4)` (new pure fn in `src/core/tokens.ts`). Pools accumulate over
the whole transcript:

| Pool | Source |
|---|---|
| `user` | user-entry text blocks (string content or `text` blocks) |
| `tools` | `tool_result` content from non-Task tools |
| `subagents` | `tool_result` content whose pending tool name is `Task` |
| `reasoning` | assistant `thinking` + `text` blocks |
| *system* | residual: `max(0, tokens.contextTokens − Σ pools)` — derived at view time, never stored. Captures system prompt + tool defs + memory + skill loads. |

Known limits (documented in spec, accepted): chars/4 is rough; pools are
cumulative-ever while context can shrink (`/compact`) — the residual clamps at
0 and the band is labeled an estimate, same stance as cost.

### Reducer (`src/core/reducer.ts` + `types.ts`, pure)

New `SessionState.ctxPools: CtxPools` —
`{ user: number; tools: number; subagents: number; reasoning: number }`.

- `foldAssistant`: per `thinking`/`text` block → `reasoning`.
- `foldUser`: per text block → `user`; per `tool_result` → `tools` or
  `subagents` by `pendingTools[id].name === "Task"` (shape from the tool-timing
  spec — that feature lands first). `tool_result.content` may be a string or a
  block array → pure `resultText(content): string` helper flattens it.

Aggregate → consumed via the existing `fullSession()` fold; no new App gate.

### Surface: new 1-row lens band `ctxBand`

View model `ctxBreakdownView(tokens, ctxPools)` in `src/core/lens-bands.ts`
(pure): returns ordered segments `{ key, label, tokens, frac }` (sys, usr,
tool, sub, think) with `frac` against `contextTokens` (the bar shows
composition of what's IN context, not the limit).

`src/ui/panels/lens/ctxBand.ts` draws one row, economy-style:

```
ctx~  ▓▓▓▓▓▓▒▒▒▒▒▒▒▒░░░  sys 41k · usr 8k · tool 95k · sub 30k · think 12k
```

Segment bar color-coded per pool (theme accents, distinct from status colors);
legend in dim with pool-colored values. Joins the Lens height-pressure ladder
adjacent to economy (drops under the same pressure step). Transparent bg.

## Testing

- `tests/tokens.test.ts`: `estimateTokens` (empty, exact /4, remainder).
- `tests/reducer.test.ts`: user text → user pool; tool_result → tools;
  Task result → subagents; thinking/text → reasoning; string-vs-array
  tool_result content; pools survive entry folding immutably.
- `tests/lens-bands.test.ts`: `ctxBreakdownView` residual clamp at 0,
  fractions sum ≤ 1, ordering stable.
- Visual tmux pass: band renders, drops under height pressure, no bg fill.

## Out of scope

Replay-sync of the band with the player cursor (pools are full-session
aggregates like Files/Tasks); per-turn breakdown history; exact tokenizer.
