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

## Known limitations

- context % can read above 100% for sessions using a 1M-context model, because the transcript's model field does not encode the `[1m]` variant (the gauge bar itself clamps).
