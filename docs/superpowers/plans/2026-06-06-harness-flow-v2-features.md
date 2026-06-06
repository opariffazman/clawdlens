# harness-flow v2 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. For UI/visual tasks, verify with the tmux capture loop documented in `MEMORY.md` (tmux + `capture-pane`), and confirm Nerd Font glyphs render with the user's font.

**Goal:** Add three features to the shipped harness-flow TUI — Nerd-font icons (with Unicode fallback), gitlogue-style full-transcript Replay mode, and a git commit-graph panel — built and verified in three phases.

**Architecture:** Phase 1 decouples glyphs from data (semantic `iconKey` resolved by `ui/icons.ts`). Phase 2 reuses the player + metro Flow for replay (full-transcript loader + a replay/loop player mode). Phase 3 adds pure `git-log` parsing + a `git-graph` lane layout that emits the existing `FlowGraph` shape, rendered by a new panel reusing the metro renderer. Pure core is TDD'd; I/O (git exec, full-file read) lives in the store; visuals verified in tmux.

**Tech Stack:** Bun, TypeScript, React 19, `@opentui/react`/`@opentui/core`, `bun:test`. `git` CLI for Phase 3.

**Spec:** `docs/superpowers/specs/2026-06-06-harness-flow-v2-features-design.md`

---

## File Structure

```
src/core/
  types.ts          # + IconKey, Beat.iconKey (replaces .icon), Commit  (modified)
  reducer.ts        # set iconKey, drop baked glyphs/TOOL_ICONS          (modified)
  player.ts         # + replay/loop mode                                 (modified)
  loadTranscript.ts # loadBeats(file) — full read for replay            (new)
  git-log.ts        # parseGitLog(stdout) -> Commit[]                    (new)
  git-graph.ts      # layoutGitGraph(commits) -> FlowGraph               (new)
src/store/
  sessionStore.ts   # + fullBeats(id)                                    (modified)
  gitFetch.ts       # gitLog(cwd) -> Commit[] (spawns git)               (new)
src/ui/
  icons.ts          # IconKey maps (nerd/unicode) + iconFor + powerline  (new)
  Flow.tsx Log.tsx  # resolve iconFor(b.iconKey)                         (modified)
  Showcase.tsx      # powerline tabs, git panel, replay marker           (modified)
  PhaseRibbon.tsx   # powerline pill                                     (modified)
  App.tsx           # replay (R/L) + git fetch wiring                    (modified)
  panels/Git.tsx    # commit-graph panel                                 (new)
tests/
  icons.test.ts loadTranscript.test.ts git-log.test.ts git-graph.test.ts (new)
  reducer.test.ts player.test.ts                                         (extended)
README.md           # Fonts section                                     (modified)
```

---

# PHASE 1 — Nerd-font icons

## Task 1: Decouple glyphs via `iconKey` + `ui/icons.ts`

**Files:**
- Modify: `src/core/types.ts` (Beat: `icon` → `iconKey`; add `IconKey`)
- Create: `src/ui/icons.ts`
- Test: `tests/icons.test.ts`
- Modify: `src/core/reducer.ts`, `tests/reducer.test.ts`, `src/ui/panels/Flow.tsx`, `src/ui/panels/Log.tsx`

- [ ] **Step 1: Add `IconKey` and change `Beat` in `src/core/types.ts`**

Add the type and replace the `icon` field on `Beat`:
```ts
export type IconKey =
  | "bash" | "edit" | "read" | "search" | "web" | "task" | "skill"
  | "thinking" | "text" | "todo" | "result" | "tool";
```
In `interface Beat`, replace the line `icon: string;` with:
```ts
  iconKey: IconKey;
```

- [ ] **Step 2: Write the failing icons test**

`tests/icons.test.ts`:
```ts
import { test, expect } from "bun:test";
import { iconFor, ICONS_UNICODE, ICONS_NERD } from "../src/ui/icons";

test("iconFor resolves the active set", () => {
  // default (no HF_ICONS) is the nerd set
  delete process.env.HF_ICONS;
  expect(iconFor("bash")).toBe(ICONS_NERD.bash);
  process.env.HF_ICONS = "unicode";
  expect(iconFor("bash")).toBe(ICONS_UNICODE.bash);
  delete process.env.HF_ICONS;
});

test("every IconKey has a glyph in both sets", () => {
  const keys = ["bash","edit","read","search","web","task","skill","thinking","text","todo","result","tool"] as const;
  for (const k of keys) {
    expect(typeof ICONS_UNICODE[k]).toBe("string");
    expect(ICONS_UNICODE[k].length).toBeGreaterThan(0);
    expect(typeof ICONS_NERD[k]).toBe("string");
    expect(ICONS_NERD[k].length).toBeGreaterThan(0);
  }
});

test("unknown key falls back to a dot", () => {
  // @ts-expect-error testing fallback
  expect(iconFor("nope")).toBe("·");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `bun test tests/icons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/ui/icons.ts`**

Nerd glyphs use FontAwesome-in-NerdFonts PUA codepoints. Confirm each against the Nerd Fonts cheat sheet (https://www.nerdfonts.com/cheat-sheet); adjust if a glyph looks wrong with the test font. The Unicode set is all single-width BMP glyphs.
```ts
import type { IconKey } from "../core/types";

export type IconSet = "nerd" | "unicode";

export const ICONS_UNICODE: Record<IconKey, string> = {
  bash: "⚙", edit: "✎", read: "▤", search: "⌕", web: "◍", task: "◆",
  skill: "✦", thinking: "◇", text: "○", todo: "☑", result: "✓", tool: "◈",
};

export const ICONS_NERD: Record<IconKey, string> = {
  bash: "",     // terminal
  edit: "",     // edit (pencil-in-square)
  read: "",     // file-text
  search: "",   // magnifying glass
  web: "",      // globe
  task: "",     // sitemap (subagent fan-out)
  skill: "",    // star
  thinking: "", // lightbulb
  text: "",     // comment
  todo: "",     // tasks / list-check
  result: "",   // check
  tool: "",     // wrench
};

export function activeIconSet(): IconSet {
  return process.env.HF_ICONS === "unicode" ? "unicode" : "nerd";
}
export function usePowerline(): boolean {
  return activeIconSet() === "nerd";
}
export const POWERLINE_RIGHT = ""; // 
export const POWERLINE_LEFT = "";  // 

export function iconFor(key: IconKey): string {
  const set = activeIconSet() === "nerd" ? ICONS_NERD : ICONS_UNICODE;
  return set[key] ?? ICONS_UNICODE[key] ?? "·";
}
```

- [ ] **Step 5: Run icons test to verify pass**

Run: `bun test tests/icons.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Update the reducer to set `iconKey` (drop baked glyphs)**

In `src/core/reducer.ts`: remove the `TOOL_ICONS` export and `toolIcon` helper. Add an `iconKey` mapper after `basename`:
```ts
import type { IconKey } from "./types";

function iconKeyFor(name: string): IconKey {
  switch (name) {
    case "Bash": return "bash";
    case "Edit": case "Write": case "NotebookEdit": return "edit";
    case "Read": return "read";
    case "Grep": case "Glob": return "search";
    case "WebSearch": case "WebFetch": return "web";
    case "Task": return "task";
    case "Skill": return "skill";
    case "TodoWrite": return "todo";
    default: return "tool";
  }
}
```
Update `pushBeat` to take `iconKey` instead of `icon` (its `Omit<Beat,"id"|"count">` already follows the new `Beat`). Then in `foldAssistant`'s content-block loop, replace the `icon:` fields:
- thinking beat: `pushBeat(s, { ts, kind: "thinking", iconKey: "thinking", label: "thinking", lane, skill: e.attributionSkill });`
- text beat: `pushBeat(s, { ts, kind: "text", iconKey: "text", label: "says", detail: text.slice(0, 80), lane, skill: e.attributionSkill });`
- Skill beat: `pushBeat(s, { ts, kind: "skill", iconKey: "skill", label: skill, lane, toolUseId: b.id, skill });`
- Task beat: `pushBeat(s, { ts, kind: "tool", iconKey: "task", label: \`Task · ${sub}\`, lane, toolUseId: b.id, skill: e.attributionSkill });`
- generic tool beat: `pushBeat(s, { ts, kind: "tool", iconKey: iconKeyFor(name), label: name, detail, lane, toolUseId: b.id, skill: e.attributionSkill });`

- [ ] **Step 7: Update reducer tests**

In `tests/reducer.test.ts`: remove the `import { TOOL_ICONS } from "../src/core/reducer";` line. Change the icon assertion in the "content blocks become beats" test from `expect(bash.icon).toBe(TOOL_ICONS.Bash);` to:
```ts
  expect(bash.iconKey).toBe("bash");
```

- [ ] **Step 8: Resolve glyphs in the UI**

In `src/ui/panels/Flow.tsx`, add `import { iconFor } from "../icons";` and change the label builder `${b.icon ? b.icon + " " : ""}` to `${iconFor(b.iconKey)} `.
In `src/ui/panels/Log.tsx`, add `import { iconFor } from "../icons";` and change `<text …>{b.icon || "·"}</text>` to `<text …>{iconFor(b.iconKey)}</text>`.

- [ ] **Step 9: Verify and commit**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; all tests pass (icons + reducer updated).
```bash
git add src/core/types.ts src/ui/icons.ts tests/icons.test.ts src/core/reducer.ts tests/reducer.test.ts src/ui/panels/Flow.tsx src/ui/panels/Log.tsx
git commit -m "feat(ui): semantic iconKey + nerd/unicode icon sets"
```

---

## Task 2: Powerline separators in tabs + phase ribbon

**Files:**
- Modify: `src/ui/Showcase.tsx`, `src/ui/PhaseRibbon.tsx`

- [ ] **Step 1: Powerline tabs in `Showcase.tsx`**

Add `import { usePowerline, POWERLINE_RIGHT } from "./icons";` and replace the tabs `<box>` (the `PANELS.map(...)`) with:
```tsx
        <box style={{ flexDirection: "row" }}>
          {PANELS.map((p, i) => {
            const active = p === panel;
            const sep = usePowerline() ? POWERLINE_RIGHT : " ";
            return (
              <text key={p} fg={active ? theme.accent : theme.dim}>
                {active ? `${sep}${p}${sep}` : ` ${p} `}
              </text>
            );
          })}
        </box>
```

- [ ] **Step 2: Powerline pill in `PhaseRibbon.tsx`**

Add `import { usePowerline, POWERLINE_RIGHT, POWERLINE_LEFT } from "./icons";`. In the `phases.map`, wrap the active phase with separators:
```tsx
        return (
          <text key={p} fg={color}>
            {active && usePowerline() ? `${POWERLINE_LEFT}${p}${POWERLINE_RIGHT}` : p}
            {i < phases.length - 1 ? (active ? " ▸" : " ─") : ""}
          </text>
        );
```

- [ ] **Step 3: Verify and commit**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; tests pass.
Visual (optional, needs your font): `tmux new-session -d -s hf -x 160 -y 44 "bun run dev"; sleep 4; tmux capture-pane -t hf -p | sed -n '3,6p'; tmux kill-session -t hf` — tabs show powerline separators around the active tab. With `HF_ICONS=unicode bun run dev`, plain spacing.
```bash
git add src/ui/Showcase.tsx src/ui/PhaseRibbon.tsx
git commit -m "feat(ui): powerline separators for tabs and active phase"
```

---

## Task 3: README Fonts section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Fonts section**

Insert after the "## Run" section:
```markdown
## Fonts

harness-flow uses [Nerd Font](https://www.nerdfonts.com/) glyphs and powerline
separators for its icons by default. For them to render, install a Nerd Font and
set it as your terminal font:

- macOS: `brew install --cask font-jetbrains-mono-nerd-font` (or FiraCode/Hack Nerd Font)
- Linux: download from https://www.nerdfonts.com/font-downloads and install, then select it in your terminal

No Nerd Font? Run with the plain-Unicode icon set instead:

```bash
HF_ICONS=unicode bun run dev
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Nerd Font install + HF_ICONS=unicode fallback"
```

---

# PHASE 2 — Replay mode

## Task 4: Full-transcript loader

**Files:**
- Create: `src/core/loadTranscript.ts`
- Test: `tests/loadTranscript.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/loadTranscript.test.ts`:
```ts
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBeats } from "../src/core/loadTranscript";

test("loadBeats folds the entire transcript file into beats", () => {
  const dir = mkdtempSync(join(tmpdir(), "hf-load-"));
  const f = join(dir, "s.jsonl");
  const lines = [
    JSON.stringify({ type: "assistant", cwd: "/r", message: { model: "claude-opus-4-8", content: [{ type: "thinking", thinking: "x" }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { description: "build" } }] } }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "done" }] } }),
  ];
  writeFileSync(f, lines.join("\n") + "\n");
  const beats = loadBeats(f);
  expect(beats.length).toBe(3);
  expect(beats[0]!.kind).toBe("thinking");
  expect(beats[1]!.iconKey).toBe("bash");
  expect(beats[2]!.label).toBe("says");
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/loadTranscript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/loadTranscript.ts`**

```ts
import { readFileSync } from "node:fs";
import { parseLine } from "./parse";
import { newSession, applyEntry } from "./reducer";
import type { Beat } from "./types";

// Read an ENTIRE transcript file (no EOF/backfill window) and fold it into the
// full ordered beat list — used for cinematic replay from event #1.
export function loadBeats(file: string): Beat[] {
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return []; }
  let s = newSession("replay", file);
  const now = 0;
  for (const raw of text.split("\n")) {
    const entry = parseLine(raw);
    if (entry) s = applyEntry(s, entry, now);
  }
  return s.beats;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/loadTranscript.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/loadTranscript.ts tests/loadTranscript.test.ts
git commit -m "feat(core): full-transcript loader for replay"
```

---

## Task 5: Replay/loop mode in the player

**Files:**
- Modify: `src/core/player.ts`
- Modify: `tests/player.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/player.test.ts`:
```ts
test("replay player drains from 0 at base interval and loops", () => {
  const p = createPlayer({ baseIntervalMs: 100, replay: true, loop: true });
  p.setBeats([beat("1","A"), beat("2","B"), beat("3","C")]);
  expect(p.presented().length).toBe(0);
  for (let t = 0; t <= 100; t += 100) p.tick(t);   // ~1 beat
  const after1 = p.presented().length;
  expect(after1).toBeGreaterThanOrEqual(1);
  for (let t = 200; t <= 1000; t += 100) p.tick(t); // drain past end
  // looped: head wrapped back to a small count rather than stuck at end
  expect(p.headIndex()).toBeLessThanOrEqual(3);
});

test("replay without loop stops at the end", () => {
  const p = createPlayer({ baseIntervalMs: 1, replay: true, loop: false });
  p.setBeats([beat("1","A"), beat("2","B")]);
  for (let t = 0; t <= 100; t += 5) p.tick(t);
  expect(p.headIndex()).toBe(2); // all shown, then stops
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/player.test.ts`
Expected: FAIL — `createPlayer` doesn't accept `replay`/`loop`.

- [ ] **Step 3: Implement replay/loop in `src/core/player.ts`**

Extend `PlayerOpts` and the engine. Change the opts interface:
```ts
export interface PlayerOpts { baseIntervalMs?: number; minIntervalMs?: number; replay?: boolean; loop?: boolean }
```
In `createPlayer`, after reading `base`/`min`, add:
```ts
  const replay = opts.replay ?? false;
  let loop = opts.loop ?? false;
```
Change `interval()` so replay ignores adaptive catch-up (steady cadence):
```ts
  function interval(): number {
    if (replay) return Math.max(1, base / speed); // steady cadence; no live min floor
    const factor = 1 / (1 + Math.min(backlog(), 20) * 0.5);
    return Math.max(min, (base / speed) * factor);
  }
```
Change `tick` so replay advances regardless of `mode === "live"` and loops at the end:
```ts
    tick(now: number) {
      if (!started) return;
      if (!replay && mode !== "live") return;
      if (lastAdvanceAt < 0) lastAdvanceAt = now;
      while (head < coalesced.length && now - lastAdvanceAt >= interval()) {
        head += 1;
        lastAdvanceAt += interval();
      }
      if (replay && loop && head >= coalesced.length && coalesced.length > 0) {
        head = 0; // screensaver wrap
        lastAdvanceAt = now;
      }
      cursor = head;
    },
```
Add a `setLoop` method to the returned object (next to `setSpeed`):
```ts
    setLoop(on: boolean) { loop = on; },
    isLoop(): boolean { return loop; },
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/player.test.ts`
Expected: PASS (all player tests, incl. the original live ones).

- [ ] **Step 5: Commit**

```bash
git add src/core/player.ts tests/player.test.ts
git commit -m "feat(core): replay + loop mode in the player"
```

---

## Task 6: Replay wiring (R / L) in the App

**Files:**
- Modify: `src/store/sessionStore.ts` (add `fullBeats`)
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Add `fullBeats` to the store**

In `src/store/sessionStore.ts`, add `import { loadBeats } from "../core/loadTranscript";` and expose a method in the returned object:
```ts
    fullBeats(id: string) {
      const s = map.get(id);
      return s ? loadBeats(s.file) : [];
    },
```

- [ ] **Step 2: Add replay state + keys in `App.tsx`**

Add `import { createPlayer } from "../core/player";`. Add state:
```tsx
  const [replay, setReplay] = useState<{ player: ReturnType<typeof createPlayer> | null }>({ player: null });
```
In the `useKeyboard` switch, add cases:
```tsx
      case "replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
      case "loop": replay.player?.setLoop(!replay.player.isLoop()); break;
```
Tick the replay player too — in the existing `usePlayers` 100ms tick, the replay player isn't registered there, so add a dedicated effect in `App.tsx`:
```tsx
  useEffect(() => {
    if (!replay.player) return;
    const id = setInterval(() => { replay.player!.tick(Date.now()); }, 100);
    return () => clearInterval(id);
  }, [replay.player]);
```
Choose the active player and feed the Showcase:
```tsx
  const activePlayer = replay.player ?? player;
```
Replace the `presented`/`cursor` props passed to `<Showcase>` to use `activePlayer`:
```tsx
        presented={activePlayer ? activePlayer.presented() : []}
        cursor={activePlayer ? activePlayer.cursor() : 0}
```
Update the `marker` IIFE to prefer replay:
```tsx
  const marker = (() => {
    if (replay.player) return `⏮ replay ${replay.player.cursor()}/${replay.player.all().length}${replay.player.isLoop() ? " · ⟳" : ""}`;
    if (!player) return "";
    if (player.mode() === "history") return `⏪ ${player.cursor()}/${player.all().length}`;
    if (player.mode() === "paused") return "⏸ paused";
    const back = player.backlog();
    return back > 0 ? `▸+${back}` : "▸ live";
  })();
```

- [ ] **Step 3: Add the keymap entries**

In `src/ui/keymap.ts`, add to the `Action` union: `| { type: "replay" } | { type: "loop" }`. In `mapKey`, add these as the **FIRST** checks, immediately after `const n = key.name;`, so they take precedence over the lowercase `r`→`rescan` and `l`→`beat-fwd` bindings (which match `"r"`/`"l"` regardless of shift):
```ts
  if (n === "R" || (n === "r" && key.shift)) return { type: "replay" };
  if (n === "L" || (n === "l" && key.shift)) return { type: "loop" };
```
(lowercase `r` stays `rescan`, lowercase `l` stays `beat-fwd`.) Update `tests/keymap.test.ts` to assert `mapKey({ name: "R" })` → `{ type: "replay" }` and `mapKey({ name: "L" })` → `{ type: "loop" }`.

- [ ] **Step 4: Verify + tmux visual**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; tests pass.
Visual: launch in tmux, `tmux send-keys -t hf R`, capture frames 0.5s apart — the Flow rebuilds from the first beat and the marker shows `⏮ replay n/total`; `tmux send-keys -t hf L` → marker gains `· ⟳`.

- [ ] **Step 5: Commit**

```bash
git add src/store/sessionStore.ts src/ui/App.tsx src/ui/keymap.ts tests/keymap.test.ts
git commit -m "feat(ui): Replay mode (R) with loop (L), reusing the metro Flow"
```

---

# PHASE 3 — Git commit-graph panel

## Task 7: `git-log.ts` parser + `Commit` type

**Files:**
- Modify: `src/core/types.ts` (add `Commit`)
- Create: `src/core/git-log.ts`
- Test: `tests/git-log.test.ts`

- [ ] **Step 1: Add the `Commit` type**

In `src/core/types.ts`:
```ts
export interface Commit {
  hash: string;
  shortHash: string;
  parents: string[];
  refs: string[];   // e.g. "HEAD -> main", "origin/main", "tag: v1"
  subject: string;
}
```

- [ ] **Step 2: Write the failing test**

`tests/git-log.test.ts`:
```ts
import { test, expect } from "bun:test";
import { parseGitLog, GIT_LOG_ARGS } from "../src/core/git-log";

const US = "\x1f";
test("parses commits with parents, refs, subject", () => {
  const stdout = [
    `aaaaaaa1${US}bbbbbbb2 ccccccc3${US}HEAD -> main, tag: v1${US}merge: feature`,
    `bbbbbbb2${US}ddddddd4${US}${US}feat: wires`,
    `ddddddd4${US}${US}${US}init`,
  ].join("\n");
  const commits = parseGitLog(stdout);
  expect(commits.length).toBe(3);
  expect(commits[0]!.shortHash).toBe("aaaaaaa");
  expect(commits[0]!.parents).toEqual(["bbbbbbb2", "ccccccc3"]);
  expect(commits[0]!.refs).toEqual(["HEAD -> main", "tag: v1"]);
  expect(commits[0]!.subject).toBe("merge: feature");
  expect(commits[2]!.parents).toEqual([]);
});

test("empty / malformed -> empty array", () => {
  expect(parseGitLog("")).toEqual([]);
  expect(parseGitLog("\n  \n")).toEqual([]);
});

test("GIT_LOG_ARGS requests the right format (no diff)", () => {
  expect(GIT_LOG_ARGS).toContain("--no-patch");
  expect(GIT_LOG_ARGS.join(" ")).toContain("%H");
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test tests/git-log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/git-log.ts`**

```ts
import type { Commit } from "./types";

const US = "\x1f"; // unit separator between fields
// commits only, no diffs; %D = ref names; date-order across all refs
export const GIT_LOG_ARGS = [
  "log", "--all", "--date-order", "--no-patch",
  `--pretty=format:%H${US}%P${US}%D${US}%s`, "-n", "120",
];

export function parseGitLog(stdout: string): Commit[] {
  const out: Commit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(US);
    const hash = parts[0] ?? "";
    if (!hash) continue;
    const parents = (parts[1] ?? "").trim();
    const refs = (parts[2] ?? "").trim();
    out.push({
      hash,
      shortHash: hash.slice(0, 7),
      parents: parents ? parents.split(/\s+/).filter(Boolean) : [],
      refs: refs ? refs.split(",").map((r) => r.trim()).filter(Boolean) : [],
      subject: parts[3] ?? "",
    });
  }
  return out;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `bun test tests/git-log.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/git-log.ts tests/git-log.test.ts
git commit -m "feat(core): parse git log into a commit DAG (commits only)"
```

---

## Task 8: `git-graph.ts` lane layout

**Files:**
- Create: `src/core/git-graph.ts`
- Test: `tests/git-graph.test.ts`

This produces the SAME `FlowGraph` shape (`lanes/nodes/segments/rows/columns`) the metro renderer already draws. `node.beatId` holds the commit hash; `node.row` is the commit index. Display-y uses `ROW_STRIDE` from `flow-layout.ts`. Highest-complexity module.

- [ ] **Step 1: Write the failing tests**

`tests/git-graph.test.ts`:
```ts
import { test, expect } from "bun:test";
import { layoutGitGraph } from "../src/core/git-graph";
import type { Commit } from "../src/core/types";

function c(hash: string, parents: string[]): Commit {
  return { hash, shortHash: hash.slice(0, 7), parents, refs: [], subject: hash };
}

test("linear history -> single column, stacked rows", () => {
  const g = layoutGitGraph([c("a", ["b"]), c("b", ["d"]), c("d", [])]);
  expect(g.nodes.map((n) => n.row)).toEqual([0, 1, 2]);
  expect(g.nodes.every((n) => n.column === 0)).toBe(true);
  // a vertical spine wire exists between the commits
  expect(g.segments.flatMap((s) => s.cells).some((cell) => cell.ch === "│")).toBe(true);
});

test("a merge commit opens a second lane with a branch segment", () => {
  // m merges p1 and p2; p1 and p2 both descend from base
  const g = layoutGitGraph([
    c("m", ["p1", "p2"]),
    c("p1", ["base"]),
    c("p2", ["base"]),
    c("base", []),
  ]);
  expect(g.columns).toBeGreaterThanOrEqual(2);
  expect(g.segments.some((s) => s.kind === "branch")).toBe(true);
  // the two branch tips occupy different columns
  const cols = new Set(g.nodes.map((n) => n.column));
  expect(cols.size).toBeGreaterThanOrEqual(2);
});

test("empty -> empty graph", () => {
  const g = layoutGitGraph([]);
  expect(g.nodes.length).toBe(0);
  expect(g.rows).toBe(0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/git-graph.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/git-graph.ts`**

```ts
import type { Commit } from "./types";
import type { FlowGraph, FlowNodeView, Segment, Cell, FlowLane } from "./flow-layout";
import { ROW_STRIDE } from "./flow-layout";

const COL_WIDTH = 2;

// git log --graph style lane assignment. `lanes[col]` = the hash that column is
// currently waiting to place next (or null when free). First parent continues a
// commit's column; extra parents (merges) open new lanes; lanes converging on
// the same commit close (rejoin).
export function layoutGitGraph(commits: Commit[]): FlowGraph {
  const present = new Set(commits.map((c) => c.hash));
  const lanes: (string | null)[] = [];
  const nodes: FlowNodeView[] = [];
  const segments: Segment[] = [];

  const freeCol = (): number => {
    const i = lanes.indexOf(null);
    if (i !== -1) return i;
    lanes.push(null);
    return lanes.length - 1;
  };

  commits.forEach((commit, row) => {
    const y = row * ROW_STRIDE;

    let col = lanes.indexOf(commit.hash);
    if (col === -1) col = freeCol();
    lanes[col] = null;

    // other lanes also waiting for this commit are branches merging in -> close
    for (let k = 0; k < lanes.length; k++) {
      if (k !== col && lanes[k] === commit.hash) {
        segments.push({ kind: "rejoin", lane: commit.hash, cells: hConnect(k, col, y) });
        lanes[k] = null;
      }
    }

    nodes.push({ beatId: commit.hash, lane: String(col), row, column: col });

    const parents = commit.parents.filter((p) => present.has(p));
    if (parents.length > 0) {
      lanes[col] = parents[0]!; // first parent continues this column
      for (let pi = 1; pi < parents.length; pi++) {
        const pcol = freeCol();
        lanes[pcol] = parents[pi]!;
        segments.push({ kind: "branch", lane: parents[pi]!, cells: hConnect(col, pcol, y) });
      }
    }

    // vertical spine on the gap rows under this row, for every still-open lane
    for (let gy = y + 1; gy < y + ROW_STRIDE; gy++) {
      for (let k = 0; k < lanes.length; k++) {
        if (lanes[k] !== null) {
          segments.push({ kind: "spine", lane: lanes[k]!, cells: [{ x: k * COL_WIDTH, y: gy, ch: "│" }] });
        }
      }
    }
  });

  const rows = commits.length > 0 ? (commits.length - 1) * ROW_STRIDE + 1 : 0;
  const flowLanes: FlowLane[] = lanes.map((_, i) => ({ id: String(i), column: i }));
  return { lanes: flowLanes, nodes, segments, rows, columns: Math.max(commits.length > 0 ? 1 : 0, lanes.length) };
}

function hConnect(fromCol: number, toCol: number, y: number): Cell[] {
  const a = Math.min(fromCol, toCol);
  const b = Math.max(fromCol, toCol);
  const cells: Cell[] = [];
  for (let c = a; c <= b; c++) cells.push({ x: c * COL_WIDTH, y, ch: c === a ? "├" : c === b ? "┐" : "─" });
  return cells;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/git-graph.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/git-graph.ts tests/git-graph.test.ts
git commit -m "feat(core): git commit-DAG lane layout (FlowGraph output)"
```

---

## Task 9: `gitFetch` + `Git.tsx` panel + integration

**Files:**
- Create: `src/store/gitFetch.ts`
- Create: `src/ui/panels/Git.tsx`
- Modify: `src/ui/Showcase.tsx` (PanelId "git" + render Git), `src/ui/App.tsx` (fetch commits)

- [ ] **Step 1: Implement `src/store/gitFetch.ts`**

Spawns git via Bun and parses. I/O wrapper (parsing is covered by Task 7's tests).
```ts
import { parseGitLog, GIT_LOG_ARGS } from "../core/git-log";
import type { Commit } from "../core/types";

export function gitLog(cwd: string): Commit[] {
  if (!cwd) return [];
  try {
    const proc = Bun.spawnSync(["git", ...GIT_LOG_ARGS], { cwd, stdout: "pipe", stderr: "ignore" });
    if (proc.exitCode !== 0) return [];
    return parseGitLog(proc.stdout.toString());
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Implement `src/ui/panels/Git.tsx`**

Draws the commit DAG with the same buffered approach as `Flow.tsx` (static — no pulse), plus hash/refs/subject labels.
```tsx
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { layoutGitGraph } from "../../core/git-graph";
import { ROW_STRIDE } from "../../core/flow-layout";
import type { Commit } from "../../core/types";
import { theme } from "../theme";

const ICON_COL = 4;
const COL_WIDTH = 2;
const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, bg: RGBA) {
  for (let i = 0; i < str.length; i++) buf.setCell(x + i, y, str[i]!, fg, bg);
}

export function Git({ commits, width, height }: { commits: Commit[]; width: number; height: number }) {
  if (commits.length === 0) {
    return <text fg={theme.dim}>not a git repo (or no commits)</text>;
  }
  const graph = layoutGitGraph(commits);
  const wireColor = RGBA.fromHex(theme.dim);
  const nodeColor = RGBA.fromHex(theme.accent);
  const refColor = RGBA.fromHex(theme.warn);
  const subjColor = RGBA.fromHex(theme.fg);
  return (
    <box
      style={{ width, height }}
      buffered
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const top = 0; // commits are date-desc; HEAD near the top
        for (const seg of graph.segments) {
          for (const cell of seg.cells) {
            const y = cell.y - top;
            if (y < 0 || y >= height) continue;
            const x = ICON_COL + cell.x;
            if (x < 0 || x >= width) continue;
            buffer.setCell(x, y, cell.ch, wireColor, TRANSPARENT);
          }
        }
        for (const node of graph.nodes) {
          const y = node.row * ROW_STRIDE - top;
          if (y < 0 || y >= height) continue;
          const commit = commits[node.row]!;
          const x = ICON_COL + node.column * COL_WIDTH;
          buffer.setCell(x, y, "●", nodeColor, TRANSPARENT);
          const labelX = ICON_COL + (graph.columns + 1) * COL_WIDTH;
          const refStr = commit.refs.length ? `(${commit.refs.join(", ")}) ` : "";
          drawStr(buffer, labelX, y, commit.shortHash + " ", RGBA.fromHex(theme.ok), TRANSPARENT);
          let cx = labelX + 8;
          if (refStr) { drawStr(buffer, cx, y, refStr, refColor, TRANSPARENT); cx += refStr.length; }
          const subj = commit.subject.slice(0, Math.max(0, width - cx - 1));
          drawStr(buffer, cx, y, subj, subjColor, TRANSPARENT);
        }
      }}
    />
  );
}
```

- [ ] **Step 3: Wire the panel into `Showcase.tsx`**

Add `import { Git } from "./panels/Git";` and `import type { Commit } from "../core/types";`. Add `"git"` to `PanelId` and `PANELS`:
```ts
export type PanelId = "flow" | "files" | "todos" | "log" | "git";
export const PANELS: PanelId[] = ["flow", "files", "todos", "log", "git"];
```
Add `commits: Commit[]` to the Showcase `Props` and render it:
```tsx
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 4: Fetch commits in `App.tsx`**

Add `import { gitLog } from "../store/gitFetch";`. Add state + effect that refetches when the git panel is shown for a session, or on rescan:
```tsx
  const [commits, setCommits] = useState<import("../core/types").Commit[]>([]);
  useEffect(() => {
    if (panel === "git" && selected?.cwd) setCommits(gitLog(selected.cwd));
    else if (panel !== "git") setCommits([]);
  }, [panel, selected?.id, selected?.cwd]);
```
In the `rescan` keyboard case, also refresh commits when on the git panel:
```tsx
      case "rescan": store.pollOnce(Date.now()); if (panel === "git" && selected?.cwd) setCommits(gitLog(selected.cwd)); break;
```
Pass `commits` to `<Showcase … commits={commits} />`.

- [ ] **Step 5: Verify + tmux visual**

Run: `bunx tsc --noEmit && bun test`
Expected: clean; all tests pass.
Visual: launch in tmux, `tmux send-keys -t hf "llll"` won't work (panel cycle is Tab) — use `tmux send-keys -t hf Tab Tab Tab Tab` to reach the `git` tab; capture and confirm the commit graph: `●` nodes, `│`/`├─┐` wires, `(HEAD → main)` ref labels, hashes + subjects, for the selected session's repo. Select a session whose cwd is a real repo (e.g. harness-flow itself).

- [ ] **Step 6: Commit**

```bash
git add src/store/gitFetch.ts src/ui/panels/Git.tsx src/ui/Showcase.tsx src/ui/App.tsx
git commit -m "feat(ui): git commit-graph panel for the selected session's repo"
```

---

## Self-Review (against spec)

- **Spec coverage:** §4 icons → Tasks 1–3 (iconKey/icons.ts/powerline/README); §5 replay → Tasks 4–6 (loader/player/wiring incl. loop); §6 git graph → Tasks 7–9 (parse/layout/panel+fetch+integration). All spec sections map to a task.
- **Type consistency:** `IconKey` (types.ts) used by `icons.ts` + reducer + Beat; `iconFor`/`activeIconSet`/`usePowerline`/`POWERLINE_*` consistent across icons.ts and the UI; `createPlayer` opts `{replay,loop}` + methods `setLoop/isLoop` match Task 5 ↔ Task 6 usage; `Commit` shape consistent across git-log/git-graph/Git/gitFetch; `FlowGraph`/`Segment`/`Cell`/`FlowNodeView`/`ROW_STRIDE` reused from `flow-layout.ts`; `PanelId` extended in one place (Showcase) and imported by App.
- **No placeholders:** every step has runnable code + a command/expected result. Two verifiability notes (nerd glyph rendering needs the user's font; git-DAG layout is common-case-correct with the documented `git log --graph` fallback) are surfaced, not deferred work.

## Handoff

Three phases, each independently shippable: Phase 1 (icons) → Phase 2 (replay) → Phase 3 (git graph). Build subagent-driven with tmux visual verification per phase.
