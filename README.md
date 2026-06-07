# ClawdLens

[![CI](https://github.com/opariffazman/clawdlens/actions/workflows/ci.yml/badge.svg)](https://github.com/opariffazman/clawdlens/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/clawdlens.svg)](https://www.npmjs.com/package/clawdlens)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Terminal glass box for your Claude Code sessions. A passive observer that tails
`~/.claude/projects/**/*.jsonl` and shows — at a calm, slow-burn pace — what every
running session is doing: an animated metro **Flow** of its actions, live status, a
token/cost/context gauge, a file heatmap, an agnostic task list, a git commit-graph,
and a superpowers workflow **phase lens**. Zero setup. No hooks. Never leave the
terminal.

## Install

Requires [Bun](https://bun.sh) ≥ 1.3.

```bash
bunx clawdlens                          # run without installing
# or install the command globally:
bun install -g clawdlens && clawdlens
```

Run from source instead:

```bash
git clone https://github.com/opariffazman/clawdlens
cd clawdlens && bun install
bun run dev
```

## Fonts

ClawdLens uses [Nerd Font](https://www.nerdfonts.com/) glyphs and powerline
separators by default. Install one and set it as your terminal font:

- macOS: `brew install --cask font-jetbrains-mono-nerd-font`
- Linux: download from <https://www.nerdfonts.com/font-downloads> and select it in
  your terminal

No Nerd Font? Use the plain-Unicode icon set:

```bash
CL_ICONS=unicode clawdlens
```

## Keys

`:` session picker · `Tab`/`Shift-Tab` panels · `h`/`l` or `←`/`→` scrub ·
`[` `]` chunk · `g`/`G` start/live · `space` pause · `+`/`-` speed · `p` energy-pulse ·
`w` lens · `R` replay · `L` loop · `r` rescan · `?` help · `q` quit.

## How it works

ClawdLens is a passive reader. It tails the JSONL transcripts Claude Code writes to
`~/.claude/projects/**/*.jsonl`, folds them through a pure core
(`discover → tailer → parse → reducer → store`), and renders the result with
[OpenTUI](https://github.com/sst/opentui). It never writes to your sessions and
installs no hooks. See
[`docs/superpowers/specs/2026-06-06-harness-flow-design.md`](docs/superpowers/specs/2026-06-06-harness-flow-design.md)
for the original design.

## Limitations

- A permission prompt that blocks a session is indistinguishable from `running` via
  the transcript alone (no hooks), so it shows as `running`.
- Cost is an estimate.
- Context % can read above 100% for sessions on a 1M-context model — the transcript's
  model field omits the `[1m]` variant — though the gauge bar itself clamps.

## License

[MIT](LICENSE) © 2026 opariffazman
