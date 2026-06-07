# ClawdLens Public Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `harness-flow` → **ClawdLens** and ship it as a public, npm-installable GitHub release with CI + automated tagged-release workflows.

**Architecture:** Pure config/docs/automation changes plus one code rename (`HF_ICONS`→`CL_ICONS`). The TUI ships as TypeScript source run by Bun (no build step); a `bin/clawdlens.ts` shebang wrapper makes `bunx clawdlens` work. CI runs typecheck+test on PRs; a tag-triggered Release workflow publishes to npm with provenance and creates a GitHub Release.

**Tech Stack:** Bun, TypeScript (strict), OpenTUI/React, GitHub Actions, npm.

**Spec:** `docs/superpowers/specs/2026-06-07-clawdlens-public-release-design.md`

**Branch:** `feat/public-release-clawdlens` (already created; repo `opariffazman/clawdlens` exists, `main` pushed, `NPM_TOKEN` secret set, `.env` gitignored).

**Conventions:** Conventional commits, one per task. Run from repo root `/home/debian/repo/harness-flow`.

---

## Task 1: Rename env var `HF_ICONS` → `CL_ICONS` (TDD)

**Files:**
- Test: `tests/icons.test.ts` (create)
- Modify: `src/ui/icons.ts:26`

- [ ] **Step 1: Write the failing test**

Create `tests/icons.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import { activeIconSet } from "../src/ui/icons";

describe("activeIconSet", () => {
  const orig = process.env.CL_ICONS;
  afterEach(() => {
    if (orig === undefined) delete process.env.CL_ICONS;
    else process.env.CL_ICONS = orig;
  });

  test("defaults to nerd when CL_ICONS is unset", () => {
    delete process.env.CL_ICONS;
    expect(activeIconSet()).toBe("nerd");
  });

  test("returns unicode when CL_ICONS=unicode", () => {
    process.env.CL_ICONS = "unicode";
    expect(activeIconSet()).toBe("unicode");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/icons.test.ts`
Expected: the `CL_ICONS=unicode` test FAILS (`activeIconSet()` still reads `HF_ICONS`, returns `"nerd"`); the default test passes.

- [ ] **Step 3: Make the change**

In `src/ui/icons.ts`, line 26, change the env var name:

```ts
export function activeIconSet(): IconSet {
  return process.env.CL_ICONS === "unicode" ? "unicode" : "nerd";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/icons.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Confirm no other `HF_ICONS` references remain in code**

Run: `grep -rn "HF_ICONS" src bin tests`
Expected: no matches (docs are updated in later tasks).

- [ ] **Step 6: Commit**

```bash
git add src/ui/icons.ts tests/icons.test.ts
git commit -m "refactor: rename HF_ICONS env var to CL_ICONS

Project rename harness-flow -> ClawdLens. Adds a regression test for
activeIconSet().

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Make the package npm-publishable (metadata, bin, dump rename, LICENSE)

**Files:**
- Modify: `package.json`
- Create: `bin/clawdlens.ts`
- Rename: `bin/hf-dump.ts` → `bin/clawdlens-dump.ts` (and fix one string)
- Create: `LICENSE`

- [ ] **Step 1: Create the npm CLI entrypoint `bin/clawdlens.ts`**

```ts
#!/usr/bin/env bun
import "../src/index.tsx";
```

Then make it executable:

```bash
chmod +x bin/clawdlens.ts
```

- [ ] **Step 2: Rename the dump CLI and fix its banner string**

```bash
git mv bin/hf-dump.ts bin/clawdlens-dump.ts
```

In `bin/clawdlens-dump.ts`, change the banner line (was line 14):

```ts
  console.log("ClawdLens — live sessions\n");
```

(Leave the rest of the file unchanged.)

- [ ] **Step 3: Replace `package.json` with the publishable manifest**

Full new contents of `package.json`:

```json
{
  "name": "clawdlens",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "Terminal glass box for Claude Code sessions — live flow, status, files, tasks, git, and a superpowers phase lens. Passive observer, zero setup.",
  "keywords": [
    "claude-code",
    "claude",
    "tui",
    "terminal",
    "opentui",
    "bun",
    "observability",
    "monitor",
    "devtools"
  ],
  "license": "MIT",
  "author": "opariffazman",
  "homepage": "https://github.com/opariffazman/clawdlens#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/opariffazman/clawdlens.git"
  },
  "bugs": {
    "url": "https://github.com/opariffazman/clawdlens/issues"
  },
  "engines": {
    "bun": ">=1.3"
  },
  "module": "src/index.tsx",
  "bin": {
    "clawdlens": "bin/clawdlens.ts"
  },
  "files": [
    "src",
    "bin",
    "tsconfig.json",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "dev": "bun run src/index.tsx",
    "dump": "bun run bin/clawdlens-dump.ts",
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.2.3",
    "bun-types": "^1.3.14",
    "typescript": "^5.6.0"
  },
  "dependencies": {
    "@opentui/core": "^0.3.2",
    "@opentui/react": "^0.3.2",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  }
}
```

- [ ] **Step 4: Create `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 opariffazman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Verify it still runs and typechecks**

Run: `bun run dump` then immediately Ctrl-C (or `timeout 2 bun run dump`).
Expected: prints `ClawdLens — live sessions` then session lines or `(no sessions yet)`.

Run: `bunx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 6: Verify the package packs the right files**

Run: `npm publish --dry-run 2>&1 | tail -30`
Expected: tarball name `clawdlens-0.1.0.tgz`; the file list includes `bin/clawdlens.ts`, `bin/clawdlens-dump.ts`, `src/...`, `tsconfig.json`, `README.md`, `LICENSE`; and does NOT include `.env`, `node_modules`, `docs`, or `tests`.

- [ ] **Step 7: Commit**

```bash
git add package.json bin/clawdlens.ts bin/clawdlens-dump.ts LICENSE
git commit -m "feat: make package publishable as clawdlens

Rename package harness-flow -> clawdlens, add npm metadata, MIT license,
bin entry (bunx clawdlens), and ship tsconfig.json so Bun resolves
jsxImportSource at the consumer. Rename bin/hf-dump.ts -> clawdlens-dump.ts.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: CI workflow (PR + push-main checks)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bun test
```

- [ ] **Step 2: Validate YAML syntax**

Run: `bunx --bun js-yaml .github/workflows/ci.yml > /dev/null && echo "valid yaml"`
Expected: `valid yaml` (or, if `js-yaml` is unavailable, `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo valid`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow (typecheck + test on PR and main)

Pinned to current stable action majors: actions/checkout@v6,
oven-sh/setup-bun@v2 (node24 runtime, no deprecation warnings).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Release workflow (tag → npm publish + GitHub Release)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # create the GitHub Release
      id-token: write   # npm provenance (OIDC)
    steps:
      - uses: actions/checkout@v6
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          registry-url: 'https://registry.npmjs.org'
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bun test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - run: gh release create "${GITHUB_REF_NAME}" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo valid`
Expected: `valid`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add Release workflow (tag v* -> npm publish + GitHub Release)

Bun runs install/typecheck/test; npm publish --provenance handles the
publish + OIDC. setup-node@v6 + node-version 24 (current Active LTS).
Requires NPM_TOKEN secret (already set).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Rewrite README (concise, normal prose)

**Files:**
- Modify: `README.md` (full replace)

- [ ] **Step 1: Replace `README.md` with the new contents**

````markdown
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
````

- [ ] **Step 2: Sanity-check no stale references**

Run: `grep -n "harness-flow\|HF_ICONS\|j/k sessions" README.md`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for ClawdLens public release

Concise install/usage runbook, badges, corrected keymap, CL_ICONS.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the heading (line 1)**

Change:
```
# harness-flow
```
to:
```
# ClawdLens
```

- [ ] **Step 2: Add the repo/package identity to the intro (line 3)**

Append this sentence to the end of the line-3 paragraph (after "OpenTUI + React on Bun."):
```
 Public repo + npm package: `clawdlens` (brand: ClawdLens).
```

- [ ] **Step 3: Update the Run block env var (line 13)**

Change:
```
HF_ICONS=unicode bun run dev   # plain-glyph fallback (no Nerd Font)
```
to:
```
CL_ICONS=unicode bun run dev   # plain-glyph fallback (no Nerd Font)
```

- [ ] **Step 4: Update the icons.ts description (line 48)**

Change:
```
  icons.ts         IconKey→glyph; nerd default + HF_ICONS=unicode fallback; powerline separators
```
to:
```
  icons.ts         IconKey→glyph; nerd default + CL_ICONS=unicode fallback; powerline separators
```

- [ ] **Step 5: Update the bin listing (line 50)**

Change:
```
bin/hf-dump.ts     debug CLI (proves engine headless)
```
to:
```
bin/clawdlens.ts       npm entry: shebang wrapper → src/index.tsx (bunx clawdlens)
bin/clawdlens-dump.ts  debug CLI (proves engine headless)
```

- [ ] **Step 6: Update the tmux example session name (line 72)**

In the "Verify TUI visually via tmux" bullet, change `-s hf` → `-s cl` and `-t hf` → `-t cl`:
```
- **Verify TUI visually via tmux** (agent has no TTY): `tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p`. Use `-e` + diff two frames for colour/pulse animation. `tmux send-keys` to drive keys.
```

- [ ] **Step 7: Update the commit-flow convention (line 74)**

Change:
```
- Conventional commits, per task. Solo local repo, no remote → commit direct to main.
```
to:
```
- Conventional commits, per task. Public repo `origin` = `github.com:opariffazman/clawdlens`. Branch → PR (CI gates: typecheck + test) → merge to main. See Release.
```

- [ ] **Step 8: Add a Release section (after the Conventions section, before `## Gotchas`)**

Insert:
```markdown
## Release

Public repo `opariffazman/clawdlens`. `main` gated by CI.

- **CI** (`.github/workflows/ci.yml`): push-main + all PRs → `bun install --frozen-lockfile` · `bunx tsc --noEmit` · `bun test`. PRs must be green.
- **Release** (`.github/workflows/release.yml`): push tag `v*` → typecheck + test → `npm publish --provenance --access public` → GitHub Release (auto notes). Needs the `NPM_TOKEN` repo secret (set).
- **Cut a release:** bump `package.json` `version` → `git commit -am "chore(release): vX.Y.Z"` → `git tag vX.Y.Z` → `git push --follow-tags`. Token also kept in gitignored `.env` for manual `npm publish` if ever needed.
- **Users install** via `bunx clawdlens` or `bun install -g clawdlens`. The package ships TS source + `tsconfig.json`; Bun transpiles (and resolves `jsxImportSource`) on the user's machine — no build step.
- Action versions pinned to current stable majors (`checkout@v6`, `setup-node@v6`+node24, `setup-bun@v2`) to avoid deprecated-runtime warnings.
```

- [ ] **Step 9: Verify no stale references remain in CLAUDE.md**

Run: `grep -n "harness-flow\|HF_ICONS\|hf-dump\|-s hf\|no remote" CLAUDE.md`
Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for ClawdLens rename + release flow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + full test suite**

Run: `bunx tsc --noEmit && bun test`
Expected: tsc clean; all tests pass (including `tests/icons.test.ts`).

- [ ] **Step 2: Zero stale references in shipped files**

Run: `grep -rn "harness-flow\|HF_ICONS\|hf-dump" src bin README.md CLAUDE.md package.json`
Expected: no matches. (Historical `docs/` specs may still contain the old name — that is acceptable; they are not shipped.)

- [ ] **Step 3: Source TUI smoke via tmux (default + unicode icons)**

Run:
```bash
tmux kill-session -t clsmoke 2>/dev/null; tmux new-session -d -s clsmoke -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t clsmoke -p | head -20; tmux kill-session -t clsmoke
```
Expected: the TUI renders (header, panels) without a crash/stack trace.

Run (fallback glyphs):
```bash
tmux kill-session -t clsmoke 2>/dev/null; tmux new-session -d -s clsmoke -x 150 -y 36 "CL_ICONS=unicode bun run dev"; sleep 4; tmux capture-pane -t clsmoke -p | head -20; tmux kill-session -t clsmoke
```
Expected: renders with plain-Unicode glyphs, no crash.

- [ ] **Step 4: Tarball-install smoke (validates the real `bunx` UX)**

This proves the published package actually runs at a consumer — including JSX/tsconfig
and native-dep resolution that `npm publish --dry-run` does NOT cover.

```bash
bun pm pack                       # creates clawdlens-0.1.0.tgz in repo root
rm -rf /tmp/cl-smoke && mkdir -p /tmp/cl-smoke
cd /tmp/cl-smoke && echo '{"name":"smoke","private":true}' > package.json
bun add /home/debian/repo/harness-flow/clawdlens-0.1.0.tgz
tmux kill-session -t cltar 2>/dev/null; tmux new-session -d -s cltar -x 150 -y 36 "cd /tmp/cl-smoke && bunx clawdlens"; sleep 5; tmux capture-pane -t cltar -p | head -20; tmux kill-session -t cltar
cd /home/debian/repo/harness-flow && rm -f clawdlens-0.1.0.tgz && rm -rf /tmp/cl-smoke
```
Expected: the TUI renders from the installed package (no `Cannot find module`, no JSX
transpile error, no missing-native error).

**If JSX fails here** (Bun did not apply the shipped `tsconfig.json` for files under
`node_modules/`): fallback is to add `bunfig.toml` with a `[run]`/jsx config, or a
`/** @jsxImportSource @opentui/react */` pragma to the entry — STOP and report; do not
guess. (Expected to pass: Bun resolves the nearest tsconfig walking up from the run
file, which is `node_modules/clawdlens/tsconfig.json`.)

- [ ] **Step 5: No commit** (verification only). If any step failed, fix in the owning task and re-run.

---

## Task 8: Open the PR to main

**Files:** none

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/public-release-clawdlens
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --head feat/public-release-clawdlens \
  --title "feat: public release as ClawdLens (rename + CI/CD + npm)" \
  --body "$(cat <<'EOF'
## What

Prepare the project for public release on github.com/opariffazman as **ClawdLens**.

- Rename `harness-flow` → `clawdlens` (package, bin, env var `HF_ICONS`→`CL_ICONS`).
- MIT `LICENSE`.
- `bin/clawdlens.ts` shebang entry → `bunx clawdlens` / `bun install -g clawdlens`.
- **CI** (`ci.yml`): typecheck + test on every PR and push to main.
- **Release** (`release.yml`): tag `v*` → `npm publish --provenance` + GitHub Release.
- Action versions pinned to current stable majors (`checkout@v6`, `setup-node@v6`+node24, `setup-bun@v2`).
- Concise README rewrite; CLAUDE.md updated with the release runbook.

## Verification

- `bunx tsc --noEmit` clean, `bun test` green (incl. new `tests/icons.test.ts`).
- TUI smoke via tmux (default + `CL_ICONS=unicode`).
- Tarball-install smoke: `bunx clawdlens` runs from the packed artifact.
- `npm publish --dry-run` packs the right files; `.env` excluded.

Spec: `docs/superpowers/specs/2026-06-07-clawdlens-public-release-design.md`
Plan: `docs/superpowers/plans/2026-06-07-clawdlens-public-release.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirm CI is running on the PR**

Run: `gh pr checks --watch` (or `gh run list --branch feat/public-release-clawdlens --limit 3`)
Expected: the `CI` workflow runs against the PR head and goes green.

---

## Notes for the executor

- The order matters only loosely: Task 1 (icons) and Task 2 (package.json) are the
  foundation; Tasks 3–6 are independent of each other and may run in any order after
  Task 2. Task 7 must run last (after all changes). Task 8 opens the PR.
- Do NOT publish to npm or push tags from this plan — the first real publish happens
  when the user pushes a `v*` tag after merge. This plan only opens the PR.
- Do NOT print or commit `.env` / the npm token anywhere.
