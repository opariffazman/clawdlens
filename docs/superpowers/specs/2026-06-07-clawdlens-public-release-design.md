# ClawdLens — Public Release Prep · Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm complete)
**Branch:** `feat/public-release-clawdlens`
**Repo:** https://github.com/opariffazman/clawdlens (public, created; `main` baseline pushed)

## Goal

Take the project currently named `harness-flow` to a clean public GitHub release
under `opariffazman`. Rename to **ClawdLens**, add MIT license, CI + Release
automation matching the user's existing conventions (`~/repo/slidev-addon-dynamic-code`,
adapted pnpm/node → Bun), rewrite the README concise/normal, and update CLAUDE.md.

Brand display name: **ClawdLens**. Repo + npm package name: `clawdlens` (lowercase).

## Non-goals

- No compiled standalone binaries (`bun build --compile`) — OpenTUI's native Zig
  renderer does not cross-compile reliably. Distribution is npm + source.
- No release-please / changesets automation — tag-driven release, matching reference.
- No feature/behavior changes to the TUI itself beyond the env-var rename.
- Local working-directory name stays `harness-flow`; only the GitHub repo and npm
  package are `clawdlens`.

## Decisions (from brainstorm)

| Decision | Choice |
|---|---|
| Name | ClawdLens (repo/pkg `clawdlens`) |
| License | MIT, `Copyright (c) 2026 opariffazman` |
| Install UX | npm publish → `bunx clawdlens` / `bun install -g clawdlens`; clone-dev fallback |
| Release artifact | npm package (TS source, run by Bun) + GitHub Release w/ generated notes |
| Release trigger | push tag `v*` (manual: bump → tag → push --follow-tags) |
| README style | normal-concise |
| CI gates | `bunx tsc --noEmit` + `bun test` (no linter in project) |

## Components / Changes

### 1. Rename surface

- **`package.json`**
  - `name`: `harness-flow` → `clawdlens`
  - `private`: `true` → `false`
  - `version`: stays `0.1.0`
  - add: `description`, `license: "MIT"`, `author: "opariffazman"`,
    `repository: { type: "git", url: "git+https://github.com/opariffazman/clawdlens.git" }`,
    `homepage: "https://github.com/opariffazman/clawdlens#readme"`,
    `bugs: "https://github.com/opariffazman/clawdlens/issues"`,
    `keywords: ["claude-code","tui","terminal","opentui","bun","observability","monitor"]`,
    `engines: { "bun": ">=1.3" }`
  - `bin`: `{ "clawdlens": "bin/clawdlens.ts" }`
  - `files`: `["src","bin","tsconfig.json","README.md","LICENSE"]`
    — **`tsconfig.json` MUST ship**: Bun transpiles the `.tsx` at the consumer's
    machine and needs `jsxImportSource: "@opentui/react"` from the package's own
    tsconfig (Bun searches upward from the run file → finds
    `node_modules/clawdlens/tsconfig.json`). Without it, JSX breaks on install.
  - `scripts.dump`: point at renamed dump file (see below)
- **`bin/clawdlens.ts`** (new) — npm CLI entrypoint:
  ```ts
  #!/usr/bin/env bun
  import "../src/index.tsx";
  ```
  Thin wrapper, no duplication. Makes `bunx clawdlens` and global `clawdlens` work.
  Must be `chmod +x` (and listed in `files`).
- **`HF_ICONS` → `CL_ICONS`** — `src/ui/icons.ts:26` reads `process.env.HF_ICONS`.
  Rename to `CL_ICONS`. Update all doc references (README, CLAUDE.md). No backward
  alias (clean rename; project is pre-1.0 and solo).
- **`bin/hf-dump.ts` → `bin/clawdlens-dump.ts`** — rename file; fix log string
  `"harness-flow — live sessions"` → `"ClawdLens — live sessions"`; update
  `package.json` `dump` script to `bun run bin/clawdlens-dump.ts`. Update CLAUDE.md
  reference (`bin/hf-dump.ts`).
- **Doc strings** — replace `harness-flow` brand text in README/CLAUDE.md with
  ClawdLens; update tmux session-name examples (`-s hf` → `-s cl`) in CLAUDE.md
  gotchas for consistency (cosmetic).

### 2. LICENSE (new, repo root)

Standard MIT text, `Copyright (c) 2026 opariffazman`.

### 3. CI — `.github/workflows/ci.yml` (new)

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

Mirrors reference CI (push-main + all PRs), Bun-adapted. Provides the **PR automated
checks for tests** the user asked for. CI added in this PR runs on the PR itself
(GitHub uses the PR head branch's workflow for `pull_request` events).

**Action versions pinned to latest stable majors (verified 2026-06-07):**
`actions/checkout@v6` (v6.0.3) and `actions/setup-node@v6` (v6.4.0) run on the
**node24** action runtime — the reference repo's `@v4` run on the deprecated
**node20** runtime and emit deprecation warnings. `oven-sh/setup-bun@v2` (v2.2.0)
is current. Pin to major tags (`@v6`/`@v2`) so patch updates flow automatically.

### 4. Release — `.github/workflows/release.yml` (new)

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write      # create GitHub Release
      id-token: write      # npm provenance (OIDC)
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

Notes:
- Bun runs install/typecheck/test. `npm publish` (not `bun publish`) is used so we
  get **provenance + OIDC**, matching the reference repo's `NPM_CONFIG_PROVENANCE`
  intent. `setup-node@v6` with `registry-url` writes the `.npmrc` that `npm publish`
  reads for `NODE_AUTH_TOKEN`; `node-version: 24` is the current Active LTS (Node 20
  reached EOL 2026-04-30). Same v6/node24 pinning rationale as CI above.
- `--access public` is explicit/harmless for the unscoped public package.
- `gh release create --generate-notes` builds release notes from commits/PRs.
- **Prereq:** `NPM_TOKEN` repo secret — **already set** on `opariffazman/clawdlens`
  (2026-06-07). Token also kept in a local gitignored `.env` (`export NPM_TOKEN=…`)
  for manual publish if ever needed. Workflow is inert until a `v*` tag is pushed.

### 5. README rewrite (normal-concise)

Sections, in order:
1. `# ClawdLens` + one-line tagline + badges (CI status, npm version, license).
2. **What it is** — 2–3 sentences: passive observer of `~/.claude/projects/**/*.jsonl`;
   live metro Flow, status, token/cost/context gauge, file heatmap, agnostic tasks,
   git commit-graph, superpowers phase lens; zero setup, no hooks.
3. **Install** —
   ```
   bunx clawdlens                     # run, no install
   bun install -g clawdlens && clawdlens
   ```
   plus clone-dev:
   ```
   git clone https://github.com/opariffazman/clawdlens
   cd clawdlens && bun install && bun run dev
   ```
4. **Requires** — Bun ≥1.3; a Nerd Font for icons (install hint), or `CL_ICONS=unicode`
   plain-glyph fallback.
5. **Keys** — corrected to current keymap: `:` picker · `Tab`/`Shift-Tab` panels ·
   `h/l`/`←→` scrub · `[ ]` chunk · `g`/`G` start/live · `space` pause · `+`/`-` speed ·
   `p` pulse · `w` lens · `R` replay · `L` loop · `r` rescan · `?` help · `q` quit.
   (Current README lists stale `j/k sessions` — must fix.)
6. **How it works** — tails transcripts, pure-core pipeline; link to design spec;
   honest limitations (permission-prompt blocking shows as `running`; cost is estimate).
7. **Limitations** — ctx% >100% caveat for 1M models.
8. **License** — MIT.

### 6. CLAUDE.md updates

- Title `# harness-flow` → `# ClawdLens` (note repo/pkg `clawdlens`).
- `HF_ICONS` → `CL_ICONS` (3 spots: Run block, icons.ts description line).
- `bin/hf-dump.ts` reference → `bin/clawdlens-dump.ts`; mention `bin/clawdlens.ts` entry.
- tmux `-s hf` → `-s cl` in gotchas.
- New **Release** section: how to cut a release (bump `package.json` version →
  conventional commit → `git tag vX.Y.Z` → `git push --follow-tags`), `NPM_TOKEN`
  secret prereq, what CI/Release workflows gate.
- Add a **Remote** note: `origin` = github.com:opariffazman/clawdlens (public).

## Build sequence (subagent-driven development)

Tasks are mostly independent but share `package.json`; sequence to avoid edit conflicts:

1. **Foundation rename** — `package.json`, `bin/clawdlens.ts` (+chmod), `CL_ICONS` in
   icons.ts, rename `bin/hf-dump.ts`→`bin/clawdlens-dump.ts` + fix string, `LICENSE`.
2. **Workflows** — `.github/workflows/ci.yml`, `.github/workflows/release.yml`.
3. **README** rewrite.
4. **CLAUDE.md** updates.
5. **Verify** (see below) and commit per logical unit (conventional commits).

Steps 2–4 are independent of each other and can be parallel subagents after step 1.

## Verification

- `bun test` — full suite green.
- `bunx tsc --noEmit` — clean (strict + noUncheckedIndexedAccess).
- `bun run dev` smoke via tmux (per CLAUDE.md tmux protocol) — TUI launches.
- `CL_ICONS=unicode bun run dev` smoke — fallback glyphs.
- `npm publish --dry-run` — confirms `files`/`bin` pack correctly, no secrets leaked.
- **Tarball-install smoke** (validates the real `bunx`/global install UX, incl. JSX
  + tsconfig + native-dep resolution that `--dry-run` does NOT cover): `bun pm pack`,
  then in a temp dir `bun add ./clawdlens-0.1.0.tgz` and run `bunx clawdlens` — TUI
  must launch from the packed artifact, not just from the source tree.
- Workflow YAML syntax — `actionlint` if available, else manual review. Full runs
  only possible post-push (CI on PR, Release on tag).
- `grep -rn "harness-flow\|HF_ICONS\|hf-dump"` — zero stale references in shipped files.

## Release runbook (post-merge, documented in CLAUDE.md)

One-time: create npm **Automation** access token → add as `NPM_TOKEN` repo secret
(`gh secret set NPM_TOKEN`). **Done 2026-06-07.** Then per release:

```bash
# bump version in package.json (e.g. 0.1.0 -> 0.1.1)
git commit -am "chore(release): v0.1.1"
git tag v0.1.1
git push --follow-tags          # triggers Release workflow → npm + GitHub Release
```

## Open risks

- **npm name** `clawdlens` confirmed free (404 on `npm view`) as of 2026-06-07.
- **`NPM_TOKEN` secret** — **resolved**: set on the repo 2026-06-07; local `.env`
  gitignored. No longer a blocker.
- **Provenance** requires the publish to run from the GitHub-hosted workflow with
  `id-token: write` — satisfied by release.yml.
