# harness-flow Engine Implementation Plan (Part 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless engine that turns Claude Code transcript JSONL into live per-session state (status, tokens/cost, narrative beats, flow graph, workflow phase) plus a paced player — fully tested, with a debug CLI proving it works without any UI.

**Architecture:** Pure-core-first. `discover` finds session files; `tailer` incrementally reads appended JSONL bytes; `parse` types each line; `reducer` folds entries into `SessionState`; `status`/`lens`/`flow-layout` derive views; `player` paces/coalesces beats and holds the playback cursor. `sessionStore` wires these and is subscribable. Everything except `discover`/`tailer` is pure and unit-tested.

**Tech Stack:** Bun, TypeScript, `bun:test`. No UI deps in this part.

**Spec:** `docs/superpowers/specs/2026-06-06-harness-flow-design.md`

---

## File Structure

```
src/core/
  types.ts        # all shared types (used by Part 2 too)
  parse.ts        # parseLine(raw) -> Entry | null
  tokens.ts       # context limits, token totals, cost estimate
  status.ts       # deriveStatus(StatusInput) -> Status
  reducer.ts      # applyEntry(state, entry) -> state ; newSession()
  lens.ts         # superpowers workflow detector
  flow-layout.ts  # beats -> rows/lanes/segments(cells)
  player.ts       # coalesce + pace + cursor/modes (time injected)
  discover.ts     # list project dirs + session files
  tailer.ts       # incremental offset reads
src/store/
  sessionStore.ts # wire tailer->parse->reducer->status/lens; subscribe
bin/
  hf-dump.ts      # debug CLI: print session states
tests/
  *.test.ts
  fixtures/
```

---

## Task 1: Scaffold the Bun project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "harness-flow",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "module": "src/index.tsx",
  "scripts": {
    "test": "bun test",
    "dump": "bun run bin/hf-dump.ts"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "bun-types": "^1.3.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true
  },
  "include": ["src", "bin", "tests"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
*.log
.DS_Store
```

- [ ] **Step 4: Write a smoke test and run it**

`tests/smoke.test.ts`:
```ts
import { test, expect } from "bun:test";

test("bun test runs", () => {
  expect(1 + 1).toBe(2);
});
```

Run: `bun install && bun test tests/smoke.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore tests/smoke.test.ts bun.lock
git commit -m "chore: scaffold bun + typescript project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/core/types.ts`
- Test: `tests/types.test.ts`

- [ ] **Step 1: Write a failing test that imports the types**

`tests/types.test.ts`:
```ts
import { test, expect } from "bun:test";
import { newSessionTokens } from "../src/core/types";

test("newSessionTokens returns a zeroed token record", () => {
  const t = newSessionTokens();
  expect(t.input).toBe(0);
  expect(t.contextPct).toBe(0);
  expect(t.webCalls).toBe(0);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `bun test tests/types.test.ts`
Expected: FAIL — cannot find module / `newSessionTokens` not exported.

- [ ] **Step 3: Write `src/core/types.ts`**

```ts
// Raw transcript shapes (subset we use)
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
}

export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result" | string;
  text?: string;
  thinking?: string;
  name?: string;                 // tool_use
  input?: Record<string, unknown>;
  id?: string;                   // tool_use id
  tool_use_id?: string;          // tool_result -> tool_use id
  is_error?: boolean;
  content?: unknown;
}

export interface Entry {
  type: string;                  // 'assistant' | 'user' | 'ai-title' | 'last-prompt' | 'mode' | ...
  sessionId?: string;
  uuid?: string;
  parentUuid?: string | null;
  timestamp?: string;            // ISO
  cwd?: string;
  gitBranch?: string;
  isSidechain?: boolean | null;
  version?: string;
  attributionSkill?: string;
  attributionPlugin?: string;
  aiTitle?: string;
  lastPrompt?: string;
  sourceToolUseID?: string;
  sourceToolAssistantUUID?: string;
  toolUseResult?: unknown;
  message?: {
    role?: string;
    model?: string;
    stop_reason?: string | null;
    usage?: Usage;
    content?: ContentBlock[] | string;
  };
}

// Derived domain types
export type Status = "running" | "working" | "waiting" | "idle" | "dormant" | "error";

export type BeatKind = "thinking" | "text" | "tool" | "skill" | "result" | "wait" | "phase";

export interface Beat {
  id: string;
  ts: number;                    // ms epoch
  kind: BeatKind;
  icon: string;
  label: string;
  detail?: string;
  count: number;                 // coalesced count, >= 1
  lane: string;                  // "main" or a subagent lane id (Task tool_use id)
  toolUseId?: string;            // for tool beats, to pair with result
  ok?: boolean;                  // result success (tool beats, after pairing)
  skill?: string;                // attributionSkill if present
}

export interface FileHeat {
  reads: number;
  edits: number;
  lastTs: number;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface SessionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate: number;
  contextTokens: number;         // latest-turn context size estimate
  contextPct: number;            // contextTokens / model limit (0..1+)
  webCalls: number;
}

export function newSessionTokens(): SessionTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0, contextTokens: 0, contextPct: 0, webCalls: 0 };
}

export interface LensState {
  lensId: string | null;
  activePhase: string | null;
  phaseHistory: { phase: string; ts: number }[];
  skillGroups: { skill: string; beatIds: string[]; ts: number }[];
}

export function newLensState(): LensState {
  return { lensId: null, activePhase: null, phaseHistory: [], skillGroups: [] };
}

export interface SessionState {
  id: string;
  file: string;
  title: string;
  cwd: string;
  project: string;
  gitBranch: string;
  model: string;
  status: Status;
  startedTs: number;
  lastActivityTs: number;
  tokens: SessionTokens;
  costUSD: number;
  beats: Beat[];                 // full history (lazy-paged beyond a cap by the store)
  toolStats: Record<string, number>;
  fileHeat: Record<string, FileHeat>;
  todos: TodoItem[] | null;
  lens: LensState;
  lastPrompt: string;
  parseErrors: number;

  // internal accumulators (read by status derivation; harmless to expose)
  lastEntryType: string;
  lastStopReason: string | null;
  lastBlockKind: string | null;  // 'thinking' | 'text' | 'tool_use'
  pendingTools: Record<string, string>; // tool_use id -> beat id awaiting result
  lastErrored: boolean;
  openLanes: string[];           // open subagent lane ids
  beatSeq: number;               // monotonic id source
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/types.test.ts
git commit -m "feat(core): add shared domain types"
```

---

## Task 3: `parse.ts`

**Files:**
- Create: `src/core/parse.ts`
- Test: `tests/parse.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/parse.test.ts`:
```ts
import { test, expect } from "bun:test";
import { parseLine } from "../src/core/parse";

test("parses a valid assistant line", () => {
  const raw = JSON.stringify({ type: "assistant", sessionId: "s1", message: { model: "claude-opus-4-8" } });
  const e = parseLine(raw);
  expect(e?.type).toBe("assistant");
  expect(e?.message?.model).toBe("claude-opus-4-8");
});

test("returns null for blank and malformed lines", () => {
  expect(parseLine("")).toBeNull();
  expect(parseLine("   ")).toBeNull();
  expect(parseLine("{not json")).toBeNull();
  expect(parseLine(JSON.stringify({ noType: true }))).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/parse.ts`**

```ts
import type { Entry } from "./types";

export function parseLine(raw: string): Entry | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === "object" && typeof obj.type === "string") {
      return obj as Entry;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/parse.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/parse.ts tests/parse.test.ts
git commit -m "feat(core): parse JSONL lines into typed entries"
```

---

## Task 4: `tokens.ts`

**Files:**
- Create: `src/core/tokens.ts`
- Test: `tests/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tokens.test.ts`:
```ts
import { test, expect } from "bun:test";
import { contextLimit, contextTokens, addUsage, estimateCostUSD } from "../src/core/tokens";

test("context limit: 1m variants vs default", () => {
  expect(contextLimit("claude-opus-4-8")).toBe(200_000);
  expect(contextLimit("claude-opus-4-8[1m]")).toBe(1_000_000);
});

test("contextTokens sums input + cache read + cache create", () => {
  expect(contextTokens({ input_tokens: 2, cache_read_input_tokens: 49566, cache_creation_input_tokens: 1337 })).toBe(50905);
  expect(contextTokens(undefined)).toBe(0);
});

test("addUsage accumulates", () => {
  const a = addUsage({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 }, { input_tokens: 2, output_tokens: 515 });
  expect(a.input).toBe(2);
  expect(a.output).toBe(515);
});

test("estimateCostUSD uses model price (opus default)", () => {
  const cost = estimateCostUSD({ input: 1_000_000, output: 0, cacheRead: 0, cacheCreate: 0 }, "claude-opus-4-8");
  expect(cost).toBeCloseTo(15, 5);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/tokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/tokens.ts`**

```ts
import type { Usage } from "./types";

const DEFAULT_LIMIT = 200_000;
const MILLION = 1_000_000;

export function contextLimit(model: string): number {
  if (!model) return DEFAULT_LIMIT;
  if (/\[1m\]|-1m\b|\b1m\b/i.test(model)) return MILLION;
  return DEFAULT_LIMIT;
}

// USD per million tokens. Approximate; labeled as estimate in the UI.
interface Price { in: number; out: number; cacheRead: number; cacheWrite: number }
const PRICES: { match: RegExp; price: Price }[] = [
  { match: /opus/i,   price: { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 } },
  { match: /sonnet/i, price: { in: 3,  out: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: /haiku/i,  price: { in: 1,  out: 5,  cacheRead: 0.1, cacheWrite: 1.25 } },
];

export function priceFor(model: string): Price {
  for (const p of PRICES) if (p.match.test(model)) return p.price;
  return PRICES[0]!.price; // default to opus
}

export interface TokenTotals { input: number; output: number; cacheRead: number; cacheCreate: number }

export function addUsage(t: TokenTotals, u: Usage | undefined): TokenTotals {
  if (!u) return t;
  return {
    input: t.input + (u.input_tokens ?? 0),
    output: t.output + (u.output_tokens ?? 0),
    cacheRead: t.cacheRead + (u.cache_read_input_tokens ?? 0),
    cacheCreate: t.cacheCreate + (u.cache_creation_input_tokens ?? 0),
  };
}

export function contextTokens(u: Usage | undefined): number {
  if (!u) return 0;
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

export function estimateCostUSD(t: TokenTotals, model: string): number {
  const p = priceFor(model);
  return (t.input * p.in + t.output * p.out + t.cacheRead * p.cacheRead + t.cacheCreate * p.cacheWrite) / MILLION;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/tokens.ts tests/tokens.test.ts
git commit -m "feat(core): token limits, totals, and cost estimate"
```

---

## Task 5: `status.ts`

**Files:**
- Create: `src/core/status.ts`
- Test: `tests/status.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/status.test.ts`:
```ts
import { test, expect } from "bun:test";
import { deriveStatus, type StatusInput } from "../src/core/status";

const base: StatusInput = {
  lastEntryType: "assistant", lastStopReason: null, lastBlockKind: "text",
  pendingToolResult: false, lastErrored: false, ageMs: 0,
};

test("error wins", () => {
  expect(deriveStatus({ ...base, lastErrored: true })).toBe("error");
});
test("waiting on end_turn", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn" })).toBe("waiting");
});
test("running when a tool result is pending and fresh", () => {
  expect(deriveStatus({ ...base, pendingToolResult: true, ageMs: 1000 })).toBe("running");
});
test("working when fresh", () => {
  expect(deriveStatus({ ...base, ageMs: 2000 })).toBe("working");
});
test("idle when stale", () => {
  expect(deriveStatus({ ...base, ageMs: 120_000 })).toBe("idle");
});
test("dormant when very stale (even if end_turn)", () => {
  expect(deriveStatus({ ...base, lastStopReason: "end_turn", ageMs: 40 * 60_000 })).toBe("dormant");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/status.ts`**

```ts
import type { Status } from "./types";

export interface StatusInput {
  lastEntryType: string;
  lastStopReason: string | null;
  lastBlockKind: string | null;
  pendingToolResult: boolean;
  lastErrored: boolean;
  ageMs: number;
}

export const WORKING_MS = 5_000;
export const IDLE_MS = 90_000;
export const DORMANT_MS = 30 * 60_000;

export function deriveStatus(i: StatusInput): Status {
  if (i.lastErrored) return "error";
  if (i.ageMs > DORMANT_MS) return "dormant";
  if (i.lastEntryType === "assistant" && i.lastStopReason === "end_turn") return "waiting";
  if (i.pendingToolResult && i.ageMs <= IDLE_MS) return "running";
  if (i.ageMs <= WORKING_MS) return "working";
  if (i.ageMs > IDLE_MS) return "idle";
  return "working";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/status.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/status.ts tests/status.test.ts
git commit -m "feat(core): derive session status heuristic"
```

---

## Task 6: `reducer.ts` part A — identity, tokens, prompt, title

**Files:**
- Create: `src/core/reducer.ts`
- Test: `tests/reducer.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/reducer.test.ts`:
```ts
import { test, expect } from "bun:test";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Entry } from "../src/core/types";

function feed(entries: Entry[]) {
  let s = newSession("sid", "/home/u/.claude/projects/-home-u-repo-foo/sid.jsonl");
  for (const e of entries) s = applyEntry(s, e, Date.parse("2026-06-06T00:00:00Z"));
  return s;
}

test("identity, title, prompt, model and tokens fold in", () => {
  const s = feed([
    { type: "ai-title", aiTitle: "Fix the thing" },
    { type: "last-prompt", lastPrompt: "please fix the thing" },
    { type: "assistant", cwd: "/home/u/repo/foo", gitBranch: "main",
      message: { model: "claude-opus-4-8", stop_reason: "end_turn",
        usage: { input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 49998 },
        content: [{ type: "text", text: "ok" }] } },
  ]);
  expect(s.title).toBe("Fix the thing");
  expect(s.lastPrompt).toBe("please fix the thing");
  expect(s.cwd).toBe("/home/u/repo/foo");
  expect(s.gitBranch).toBe("main");
  expect(s.model).toBe("claude-opus-4-8");
  expect(s.tokens.contextTokens).toBe(50000);
  expect(s.tokens.contextPct).toBeCloseTo(0.25, 5);
  expect(s.tokens.output).toBe(10);
  expect(s.lastStopReason).toBe("end_turn");
});

test("project derived from cwd basename when no cwd field yet", () => {
  const s = feed([{ type: "assistant", cwd: "/home/u/repo/foo", message: { content: [] } }]);
  expect(s.project).toBe("foo");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test tests/reducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/reducer.ts` (part A)**

```ts
import {
  type Entry, type SessionState, type ContentBlock, type Usage,
  newSessionTokens, newLensState,
} from "./types";
import { addUsage, contextTokens, contextLimit, estimateCostUSD } from "./tokens";

function basename(p: string): string {
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || p;
}

export function newSession(id: string, file: string): SessionState {
  return {
    id, file,
    title: id.slice(0, 8),
    cwd: "", project: "", gitBranch: "", model: "",
    status: "idle",
    startedTs: 0, lastActivityTs: 0,
    tokens: newSessionTokens(),
    costUSD: 0,
    beats: [],
    toolStats: {},
    fileHeat: {},
    todos: null,
    lens: newLensState(),
    lastPrompt: "",
    parseErrors: 0,
    lastEntryType: "",
    lastStopReason: null,
    lastBlockKind: null,
    pendingTools: {},
    lastErrored: false,
    openLanes: [],
    beatSeq: 0,
  };
}

function tsOf(e: Entry, fallback: number): number {
  if (e.timestamp) {
    const t = Date.parse(e.timestamp);
    if (!Number.isNaN(t)) return t;
  }
  return fallback;
}

export function applyEntry(prev: SessionState, e: Entry, now: number): SessionState {
  const s: SessionState = { ...prev };
  const ts = tsOf(e, now);
  if (s.startedTs === 0) s.startedTs = ts;

  if (e.cwd && !s.cwd) { s.cwd = e.cwd; s.project = basename(e.cwd); }
  if (e.gitBranch) s.gitBranch = e.gitBranch;

  switch (e.type) {
    case "ai-title":
      if (e.aiTitle) s.title = e.aiTitle;
      break;
    case "last-prompt":
      if (e.lastPrompt) {
        s.lastPrompt = e.lastPrompt;
        if (s.title === s.id.slice(0, 8)) s.title = e.lastPrompt.slice(0, 60);
      }
      break;
    case "assistant":
      foldAssistant(s, e, ts);
      break;
    case "user":
      foldUser(s, e, ts);
      break;
  }

  s.lastEntryType = e.type;
  if (e.type === "assistant" || e.type === "user") s.lastActivityTs = ts;
  return s;
}

function foldAssistant(s: SessionState, e: Entry, ts: number) {
  const m = e.message;
  if (!m) return;
  if (m.model) s.model = m.model;
  s.lastStopReason = m.stop_reason ?? null;

  const usage: Usage | undefined = m.usage;
  if (usage) {
    const t = addUsage(
      { input: s.tokens.input, output: s.tokens.output, cacheRead: s.tokens.cacheRead, cacheCreate: s.tokens.cacheCreate },
      usage,
    );
    s.tokens = { ...s.tokens, input: t.input, output: t.output, cacheRead: t.cacheRead, cacheCreate: t.cacheCreate };
    const ctx = contextTokens(usage);
    if (ctx > 0) { s.tokens.contextTokens = ctx; s.tokens.contextPct = ctx / contextLimit(s.model); }
    s.tokens.webCalls += (usage.server_tool_use?.web_search_requests ?? 0) + (usage.server_tool_use?.web_fetch_requests ?? 0);
    s.costUSD = estimateCostUSD(t, s.model);
  }
  // content blocks handled in Task 7
  void ts;
}

function foldUser(s: SessionState, e: Entry, ts: number) {
  // tool results handled in Task 8
  void s; void e; void ts;
}
```

> Token totals are threaded through the immutable `s.tokens` fields, so cost and context accumulate correctly across the shallow copies `applyEntry` returns — no external accumulator needed.

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/reducer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/reducer.ts tests/reducer.test.ts
git commit -m "feat(core): reducer folds identity, tokens, prompt, title"
```

---

## Task 7: `reducer.ts` part B — narrative beats from content blocks

**Files:**
- Modify: `src/core/reducer.ts`
- Modify: `tests/reducer.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `tests/reducer.test.ts`:
```ts
import { TOOL_ICONS } from "../src/core/reducer";

test("assistant content blocks become beats with labels and icons", () => {
  const s = feed([
    { type: "assistant", message: { model: "claude-opus-4-8", stop_reason: "tool_use", content: [
      { type: "thinking", thinking: "let me check" },
      { type: "text", text: "I'll run the tests" },
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "pytest -q", description: "run tests" } },
    ] } },
  ]);
  const kinds = s.beats.map(b => b.kind);
  expect(kinds).toEqual(["thinking", "text", "tool"]);
  const bash = s.beats[2]!;
  expect(bash.label).toBe("Bash");
  expect(bash.detail).toBe("run tests");
  expect(bash.icon).toBe(TOOL_ICONS.Bash);
  expect(bash.toolUseId).toBe("t1");
  expect(s.lastBlockKind).toBe("tool_use");
  expect(s.toolStats.Bash).toBe(1);
});

test("Skill tool_use becomes a skill beat", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "t1", name: "Skill", input: { skill: "superpowers:brainstorming" } },
    ] } },
  ]);
  expect(s.beats[0]!.kind).toBe("skill");
  expect(s.beats[0]!.label).toBe("superpowers:brainstorming");
});

test("Edit tool_use records file detail", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "t1", name: "Edit", input: { file_path: "/repo/src/auth.ts" } },
    ] } },
  ]);
  expect(s.beats[0]!.detail).toBe("auth.ts");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/reducer.test.ts`
Expected: FAIL — `TOOL_ICONS` not exported / beats empty.

- [ ] **Step 3: Implement beat-building in `src/core/reducer.ts`**

Add the icon table and helpers near the top of the file (after `basename`):
```ts
export const TOOL_ICONS: Record<string, string> = {
  Bash: "⚙", Edit: "✎", Write: "✎", Read: "",
  Grep: "", Glob: "", WebSearch: "", WebFetch: "",
  Task: "\u{1f916}", Skill: "\u{1f3af}", TodoWrite: "☑", default: "◈",
};
function toolIcon(name: string): string { return TOOL_ICONS[name] ?? TOOL_ICONS.default!; }

function fileOf(input: Record<string, unknown> | undefined): string | undefined {
  const p = input?.file_path ?? input?.path ?? input?.notebook_path;
  return typeof p === "string" ? basename(p) : undefined;
}

function nextBeatId(s: SessionState): string { s.beatSeq += 1; return `${s.id}:${s.beatSeq}`; }

function pushBeat(s: SessionState, b: Omit<import("./types").Beat, "id" | "count">): void {
  s.beats = [...s.beats, { ...b, id: nextBeatId(s), count: 1 }];
}

function laneFor(e: Entry, s: SessionState): string {
  if (e.isSidechain) {
    const link = e.sourceToolUseID;
    if (link && s.openLanes.includes(link)) return link;
    return s.openLanes[s.openLanes.length - 1] ?? "main";
  }
  return "main";
}
```

Now extend `foldAssistant` to walk content blocks (append after the usage block, before the `void ts;` — and remove `void ts;`):
```ts
  const lane = laneFor(e, s);
  const blocks = Array.isArray(m.content) ? m.content : [];
  for (const b of blocks as ContentBlock[]) {
    if (b.type === "thinking") {
      pushBeat(s, { ts, kind: "thinking", icon: "◇", label: "thinking", lane, skill: e.attributionSkill });
      s.lastBlockKind = "thinking";
    } else if (b.type === "text") {
      const text = (b.text ?? "").trim();
      if (text) { pushBeat(s, { ts, kind: "text", icon: "○", label: "says", detail: text.slice(0, 80), lane, skill: e.attributionSkill }); s.lastBlockKind = "text"; }
    } else if (b.type === "tool_use") {
      const name = b.name ?? "Tool";
      s.toolStats = { ...s.toolStats, [name]: (s.toolStats[name] ?? 0) + 1 };
      if (name === "Skill") {
        const skill = String(b.input?.skill ?? "skill");
        pushBeat(s, { ts, kind: "skill", icon: TOOL_ICONS.Skill!, label: skill, lane, toolUseId: b.id, skill });
      } else {
        const detail = name === "Bash"
          ? (typeof b.input?.description === "string" ? b.input.description as string : (typeof b.input?.command === "string" ? (b.input.command as string).slice(0, 60) : undefined))
          : fileOf(b.input) ?? (typeof b.input?.query === "string" ? (b.input.query as string).slice(0, 60) : undefined);
        pushBeat(s, { ts, kind: "tool", icon: toolIcon(name), label: name, detail, lane, toolUseId: b.id, skill: e.attributionSkill });
        if (b.id) s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id };
      }
      s.lastBlockKind = "tool_use";
    }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/reducer.test.ts`
Expected: PASS (all reducer tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/reducer.ts tests/reducer.test.ts
git commit -m "feat(core): reducer builds narrative beats from content blocks"
```

---

## Task 8: `reducer.ts` part C — tool results, file heat, todos, subagent lanes

**Files:**
- Modify: `src/core/reducer.ts`
- Modify: `tests/reducer.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/reducer.test.ts`:
```ts
test("tool_result pairs with its tool beat and sets ok/error", () => {
  const s = feed([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { description: "x" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true }] } },
  ]);
  const bash = s.beats.find(b => b.toolUseId === "t1")!;
  expect(bash.ok).toBe(false);
  expect(s.lastErrored).toBe(true);
  expect(s.pendingTools.t1).toBeUndefined();
});

test("Edit/Write increment file heat edits; Read increments reads", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "e1", name: "Edit", input: { file_path: "/r/a.ts" } },
      { type: "tool_use", id: "r1", name: "Read", input: { file_path: "/r/a.ts" } },
    ] } },
  ]);
  expect(s.fileHeat["a.ts"]!.edits).toBe(1);
  expect(s.fileHeat["a.ts"]!.reads).toBe(1);
});

test("TodoWrite updates todos", () => {
  const s = feed([
    { type: "assistant", message: { content: [
      { type: "tool_use", id: "td", name: "TodoWrite", input: { todos: [
        { content: "do a", status: "completed" }, { content: "do b", status: "in_progress" },
      ] } },
    ] } },
  ]);
  expect(s.todos?.length).toBe(2);
  expect(s.todos?.[1]!.status).toBe("in_progress");
});

test("Task opens a subagent lane; its result closes it; sidechain beats land in the lane", () => {
  const s = feed([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "T1", name: "Task", input: { subagent_type: "code-reviewer", description: "review" } }] } },
    { type: "assistant", isSidechain: true, sourceToolUseID: "T1", message: { content: [{ type: "tool_use", id: "g1", name: "Grep", input: { query: "useEffect" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "T1" }] } },
  ]);
  const grep = s.beats.find(b => b.label === "Grep")!;
  expect(grep.lane).toBe("T1");
  expect(s.openLanes).toEqual([]); // closed after result
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/reducer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement results/heat/todos/lanes**

In `foldAssistant`, when a `Task` tool_use is seen, open a lane. Replace the `else` branch (non-Skill tool) handling so `Task` is special-cased. Update the tool-use handling block to:
```ts
    } else if (b.type === "tool_use") {
      const name = b.name ?? "Tool";
      s.toolStats = { ...s.toolStats, [name]: (s.toolStats[name] ?? 0) + 1 };
      if (name === "Skill") {
        const skill = String(b.input?.skill ?? "skill");
        pushBeat(s, { ts, kind: "skill", icon: TOOL_ICONS.Skill!, label: skill, lane, toolUseId: b.id, skill });
      } else if (name === "Task") {
        const sub = String(b.input?.subagent_type ?? b.input?.description ?? "subagent");
        pushBeat(s, { ts, kind: "tool", icon: TOOL_ICONS.Task!, label: `Task · ${sub}`, lane, toolUseId: b.id, skill: e.attributionSkill });
        if (b.id) { s.openLanes = [...s.openLanes, b.id]; s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id }; }
      } else {
        const detail = name === "Bash"
          ? (typeof b.input?.description === "string" ? b.input.description as string : (typeof b.input?.command === "string" ? (b.input.command as string).slice(0, 60) : undefined))
          : fileOf(b.input) ?? (typeof b.input?.query === "string" ? (b.input.query as string).slice(0, 60) : undefined);
        pushBeat(s, { ts, kind: "tool", icon: toolIcon(name), label: name, detail, lane, toolUseId: b.id, skill: e.attributionSkill });
        if (b.id) s.pendingTools = { ...s.pendingTools, [b.id]: s.beats[s.beats.length - 1]!.id };
        bumpHeat(s, name, b.input, ts);
      }
      s.lastBlockKind = "tool_use";
      if (name === "TodoWrite") foldTodos(s, b.input);
    }
```

Add helpers (after `laneFor`):
```ts
function bumpHeat(s: SessionState, name: string, input: Record<string, unknown> | undefined, ts: number): void {
  const f = fileOf(input);
  if (!f) return;
  const cur = s.fileHeat[f] ?? { reads: 0, edits: 0, lastTs: 0 };
  const isEdit = name === "Edit" || name === "Write" || name === "NotebookEdit";
  s.fileHeat = { ...s.fileHeat, [f]: { reads: cur.reads + (isEdit ? 0 : 1), edits: cur.edits + (isEdit ? 1 : 0), lastTs: ts } };
}

function foldTodos(s: SessionState, input: Record<string, unknown> | undefined): void {
  const todos = input?.todos;
  if (Array.isArray(todos)) {
    s.todos = todos.map((t: any) => ({ content: String(t.content ?? ""), status: t.status ?? "pending" }));
  }
}
```

Implement `foldUser` for tool results:
```ts
function foldUser(s: SessionState, e: Entry, ts: number) {
  const blocks = Array.isArray(e.message?.content) ? e.message!.content as ContentBlock[] : [];
  let errored = false;
  for (const b of blocks) {
    if (b.type !== "tool_result") continue;
    const id = b.tool_use_id;
    if (!id) continue;
    const beatId = s.pendingTools[id];
    if (beatId) {
      s.beats = s.beats.map(bt => bt.id === beatId ? { ...bt, ok: !b.is_error } : bt);
      const np = { ...s.pendingTools }; delete np[id]; s.pendingTools = np;
    }
    if (s.openLanes.includes(id)) s.openLanes = s.openLanes.filter(l => l !== id);
    if (b.is_error) errored = true;
  }
  s.lastErrored = errored;
  void ts;
}
```

Also, in `applyEntry`, after an assistant turn with no error reset `lastErrored` appropriately: set `s.lastErrored = false;` at the start of `foldAssistant`.

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/reducer.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/core/reducer.ts tests/reducer.test.ts
git commit -m "feat(core): tool results, file heat, todos, subagent lanes"
```

---

## Task 9: `lens.ts` — superpowers workflow detector

**Files:**
- Create: `src/core/lens.ts`
- Test: `tests/lens.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/lens.test.ts`:
```ts
import { test, expect } from "bun:test";
import { detectLens } from "../src/core/lens";
import { newSession, applyEntry } from "../src/core/reducer";
import type { Entry } from "../src/core/types";

function run(entries: Entry[]) {
  let s = newSession("sid", "f");
  for (const e of entries) s = applyEntry(s, e, 0);
  return detectLens(s);
}

test("brainstorming -> Brainstorm; spec write -> Spec; writing-plans -> Plan", () => {
  const lens = run([
    { type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Skill", input: { skill: "superpowers:brainstorming" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "2", name: "Write", input: { file_path: "docs/superpowers/specs/x-design.md" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "3", name: "Skill", input: { skill: "superpowers:writing-plans" } }] } },
  ]);
  expect(lens.lensId).toBe("superpowers");
  expect(lens.activePhase).toBe("Plan");
  expect(lens.phaseHistory.map(p => p.phase)).toEqual(["Brainstorm", "Spec", "Plan"]);
});

test("no superpowers signal -> null lens", () => {
  const lens = run([{ type: "assistant", message: { content: [{ type: "tool_use", id: "1", name: "Bash", input: {} }] } }]);
  expect(lens.lensId).toBeNull();
  expect(lens.activePhase).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/lens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/lens.ts`**

```ts
import type { SessionState, LensState, Beat } from "./types";

const PHASE_BY_SKILL: { match: RegExp; phase: string }[] = [
  { match: /brainstorming/i, phase: "Brainstorm" },
  { match: /writing-plans/i, phase: "Plan" },
  { match: /(executing-plans|subagent-driven-development|dispatching-parallel-agents)/i, phase: "Execute" },
  { match: /(requesting-code-review|receiving-code-review|code-review)/i, phase: "Review" },
  { match: /(finishing-a-development-branch)/i, phase: "Ship" },
];
export const SUPERPOWERS_PHASES = ["Brainstorm", "Spec", "Plan", "Execute", "Review", "Ship"];

// `b.detail` for file tools holds the basename only (e.g. "x-design.md"),
// so Spec detection matches the "-design.md" suffix, not a path.
function phaseForBeat(b: Beat): string | null {
  const skill = b.skill ?? (b.kind === "skill" ? b.label : undefined);
  if (skill) {
    for (const p of PHASE_BY_SKILL) if (p.match.test(skill)) return p.phase;
    if (/(^|:)pr(-merge)?$/i.test(skill)) return "Ship";
  }
  if (b.kind === "tool" && /Write|Edit/.test(b.label) && /design\.md$/i.test(b.detail ?? "")) return "Spec";
  return null;
}

const SUPERPOWERS_SIGNAL = /superpowers|brainstorm|writing-plans|executing-plans|code-review|subagent-driven|dispatching-parallel/i;

export function detectLens(s: SessionState): LensState {
  const history: { phase: string; ts: number }[] = [];
  const groups: { skill: string; beatIds: string[]; ts: number }[] = [];
  let active: string | null = null;
  let sawSuperpowers = false;
  let curGroup: { skill: string; beatIds: string[]; ts: number } | null = null;

  for (const b of s.beats) {
    const skill = b.skill ?? (b.kind === "skill" ? b.label : undefined);
    if (skill) {
      if (SUPERPOWERS_SIGNAL.test(skill)) sawSuperpowers = true;
      if (!curGroup || curGroup.skill !== skill) { curGroup = { skill, beatIds: [], ts: b.ts }; groups.push(curGroup); }
      curGroup.beatIds.push(b.id);
    }
    const phase = phaseForBeat(b);
    if (phase) {
      if (phase === "Spec" || phase === "Plan") sawSuperpowers = true;
      if (phase !== active) { active = phase; history.push({ phase, ts: b.ts }); }
    }
  }
  return {
    lensId: sawSuperpowers ? "superpowers" : null,
    activePhase: sawSuperpowers ? active : null,
    phaseHistory: sawSuperpowers ? history : [],
    skillGroups: groups,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/lens.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/lens.ts tests/lens.test.ts
git commit -m "feat(core): superpowers workflow lens detector"
```

---

## Task 10: `flow-layout.ts` — beats to rows/lanes/segments

**Files:**
- Create: `src/core/flow-layout.ts`
- Test: `tests/flow-layout.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/flow-layout.test.ts`:
```ts
import { test, expect } from "bun:test";
import { layoutFlow } from "../src/core/flow-layout";
import type { Beat } from "../src/core/types";

function beat(p: Partial<Beat>): Beat {
  return { id: p.id ?? "b", ts: 0, kind: p.kind ?? "tool", icon: "x", label: p.label ?? "L", count: 1, lane: p.lane ?? "main", ...p } as Beat;
}

test("main-lane beats stack in column 0 on increasing rows", () => {
  const g = layoutFlow([beat({ id: "a" }), beat({ id: "b" }), beat({ id: "c" })]);
  expect(g.nodes.map(n => n.row)).toEqual([0, 1, 2]);
  expect(g.nodes.every(n => n.column === 0)).toBe(true);
  expect(g.lanes.find(l => l.id === "main")?.column).toBe(0);
});

test("subagent lane gets its own column and a branch segment", () => {
  const g = layoutFlow([
    beat({ id: "task", lane: "main", label: "Task" }),
    beat({ id: "sub", lane: "T1" }),
    beat({ id: "after", lane: "main" }),
  ]);
  const subLane = g.lanes.find(l => l.id === "T1");
  expect(subLane && subLane.column > 0).toBe(true);
  // there is at least one branch segment between columns
  expect(g.segments.some(seg => seg.kind === "branch")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/flow-layout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/flow-layout.ts`**

```ts
import type { Beat } from "./types";

export interface FlowNodeView { beatId: string; lane: string; row: number; column: number }
export interface Cell { x: number; y: number; ch: string }
export interface Segment { kind: "spine" | "branch" | "rejoin"; lane: string; cells: Cell[] }
export interface FlowLane { id: string; column: number; label?: string }
export interface FlowGraph { lanes: FlowLane[]; nodes: FlowNodeView[]; segments: Segment[]; rows: number; columns: number }

const COL_WIDTH = 2; // cells between lane columns when drawn

export function layoutFlow(beats: Beat[]): FlowGraph {
  const lanes = new Map<string, FlowLane>();
  lanes.set("main", { id: "main", column: 0 });
  let nextCol = 1;

  const nodes: FlowNodeView[] = [];
  const segments: Segment[] = [];
  const lastRowInLane = new Map<string, number>();

  beats.forEach((b, row) => {
    if (!lanes.has(b.lane)) lanes.set(b.lane, { id: b.lane, column: nextCol++, label: b.label });
    const lane = lanes.get(b.lane)!;
    nodes.push({ beatId: b.id, lane: b.lane, row, column: lane.column });

    const x = lane.column * COL_WIDTH;
    const prevRow = lastRowInLane.get(b.lane);
    if (prevRow !== undefined && row - prevRow >= 1) {
      const cells: Cell[] = [];
      for (let y = prevRow + 1; y < row; y++) cells.push({ x, y, ch: "│" });
      segments.push({ kind: "spine", lane: b.lane, cells });
    } else if (lane.column > 0 && prevRow === undefined) {
      // first appearance of a subagent lane -> branch from main at this row
      segments.push({ kind: "branch", lane: b.lane, cells: branchCells(0, lane.column, row) });
    }
    lastRowInLane.set(b.lane, row);
  });

  return { lanes: [...lanes.values()], nodes, segments, rows: beats.length, columns: nextCol };
}

function branchCells(fromCol: number, toCol: number, row: number): Cell[] {
  const cells: Cell[] = [];
  const y = row;
  const x0 = fromCol * COL_WIDTH;
  const x1 = toCol * COL_WIDTH;
  for (let x = x0 + 1; x < x1; x++) cells.push({ x, y, ch: "─" });
  cells.push({ x: x1, y, ch: "┐" });
  return cells;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/flow-layout.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/flow-layout.ts tests/flow-layout.test.ts
git commit -m "feat(core): flow layout assigns rows, lanes, segments"
```

---

## Task 11: `player.ts` — coalesce, pace, cursor, modes

**Files:**
- Create: `src/core/player.ts`
- Test: `tests/player.test.ts`

The player is pure: it owns a full beat list and a presentation cursor. Time is injected via `tick(nowMs)`. It coalesces consecutive same-(kind,label) beats and advances the presented head at a cadence that speeds up with backlog.

- [ ] **Step 1: Write the failing test**

`tests/player.test.ts`:
```ts
import { test, expect } from "bun:test";
import { createPlayer } from "../src/core/player";
import type { Beat } from "../src/core/types";

function beat(id: string, label = "Bash", kind: Beat["kind"] = "tool"): Beat {
  return { id, ts: 0, kind, icon: "x", label, count: 1, lane: "main" };
}

test("coalesces consecutive same-kind same-label beats", () => {
  const p = createPlayer();
  p.setBeats([beat("1"), beat("2"), beat("3")]);
  for (let t = 0; t < 10_000; t += 200) p.tick(t); // drain fully
  const shown = p.presented();
  expect(shown.length).toBe(1);
  expect(shown[0]!.count).toBe(3);
});

test("paces: presents fewer beats early than after enough time", () => {
  const p = createPlayer({ baseIntervalMs: 1000 });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C"), beat("4", "D")]);
  p.tick(0);
  const early = p.presented().length;
  p.tick(1100);
  const later = p.presented().length;
  expect(later).toBeGreaterThan(early);
});

test("history navigation: stepBack freezes, toLive resumes", () => {
  const p = createPlayer({ baseIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C")]);
  for (let t = 0; t < 100; t += 5) p.tick(t);
  expect(p.mode()).toBe("live");
  p.stepBack();
  expect(p.mode()).toBe("history");
  const frozen = p.cursor();
  p.tick(200);
  expect(p.cursor()).toBe(frozen); // does not advance while in history
  p.toLive();
  expect(p.mode()).toBe("live");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/player.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/player.ts`**

```ts
import type { Beat } from "./types";

export interface PlayerOpts { baseIntervalMs?: number; minIntervalMs?: number }
export type PlayMode = "live" | "paused" | "history";

interface Coalesced extends Beat {}

export function createPlayer(opts: PlayerOpts = {}) {
  const base = opts.baseIntervalMs ?? 1000;
  const min = opts.minIntervalMs ?? 120;

  let coalesced: Coalesced[] = [];
  let head = 0;             // number of coalesced beats presented (live head)
  let cursor = 0;          // presentation cursor (== head in live mode)
  let mode: PlayMode = "live";
  let speed = 1;
  let lastAdvanceAt = 0;
  let started = false;

  function rebuild(beats: Beat[]) {
    const out: Coalesced[] = [];
    for (const b of beats) {
      const last = out[out.length - 1];
      if (last && last.kind === b.kind && last.label === b.label && last.lane === b.lane) {
        out[out.length - 1] = { ...last, count: last.count + b.count };
      } else {
        out.push({ ...b });
      }
    }
    coalesced = out;
    if (head > coalesced.length) head = coalesced.length;
    if (mode === "live") cursor = head;
  }

  function backlog(): number { return coalesced.length - head; }

  function interval(): number {
    // more backlog -> shorter interval (adaptive catch-up)
    const factor = 1 / (1 + Math.min(backlog(), 20) * 0.5);
    return Math.max(min, (base / speed) * factor);
  }

  return {
    setBeats(beats: Beat[]) { rebuild(beats); started = true; },
    tick(now: number) {
      if (!started || mode !== "live") return;
      if (lastAdvanceAt === 0) lastAdvanceAt = now;
      while (head < coalesced.length && now - lastAdvanceAt >= interval()) {
        head += 1;
        lastAdvanceAt += interval();
      }
      cursor = head;
    },
    presented(): Coalesced[] { return coalesced.slice(0, cursor); },
    all(): Coalesced[] { return coalesced; },
    backlog,
    mode(): PlayMode { return mode; },
    cursor(): number { return cursor; },
    headIndex(): number { return head; },
    setSpeed(mult: number) { speed = Math.max(0.25, Math.min(8, mult)); },
    speed(): number { return speed; },
    pause() { if (mode === "live") mode = "paused"; },
    play() { if (mode === "paused") mode = "live"; },
    stepBack() { mode = "history"; cursor = Math.max(0, cursor - 1); },
    stepForward() { if (mode === "history") { cursor = Math.min(coalesced.length, cursor + 1); if (cursor >= head) toLiveInternal(); } },
    toStart() { mode = "history"; cursor = 0; },
    toLive() { toLiveInternal(); },
  };

  function toLiveInternal() { mode = "live"; cursor = head; }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/player.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/player.ts tests/player.test.ts
git commit -m "feat(core): paced coalescing player with history cursor"
```

---

## Task 12: `discover.ts` — find session files

**Files:**
- Create: `src/core/discover.ts`
- Test: `tests/discover.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/discover.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverSessions } from "../src/core/discover";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hf-"));
  const proj = join(root, "-home-u-repo-foo");
  mkdirSync(proj, { recursive: true });
  writeFileSync(join(proj, "abc.jsonl"), "{}\n");
  writeFileSync(join(proj, "notes.txt"), "ignore me");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("finds .jsonl files and ignores others", () => {
  const found = discoverSessions(root);
  expect(found.length).toBe(1);
  expect(found[0]!.id).toBe("abc");
  expect(found[0]!.file.endsWith("abc.jsonl")).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/discover.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/discover.ts`**

```ts
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface FoundSession { id: string; file: string; project: string; mtimeMs: number }

export function projectsRoot(): string {
  return join(homedir(), ".claude", "projects");
}

export function discoverSessions(root: string = projectsRoot()): FoundSession[] {
  const out: FoundSession[] = [];
  let dirs: string[];
  try { dirs = readdirSync(root); } catch { return out; }
  for (const d of dirs) {
    const projDir = join(root, d);
    let files: string[];
    try {
      if (!statSync(projDir).isDirectory()) continue;
      files = readdirSync(projDir);
    } catch { continue; }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const file = join(projDir, f);
      let mtimeMs = 0;
      try { mtimeMs = statSync(file).mtimeMs; } catch { continue; }
      out.push({ id: f.replace(/\.jsonl$/, ""), file, project: d, mtimeMs });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/discover.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/discover.ts tests/discover.test.ts
git commit -m "feat(core): discover session transcript files"
```

---

## Task 13: `tailer.ts` — incremental reads

**Files:**
- Create: `src/core/tailer.ts`
- Test: `tests/tailer.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/tailer.test.ts`:
```ts
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTailer } from "../src/core/tailer";

test("reads only newly appended lines; resets on truncation; tails large files from end", () => {
  const dir = mkdtempSync(join(tmpdir(), "hf-tail-"));
  const f = join(dir, "s.jsonl");
  writeFileSync(f, "line1\nline2\n");

  const tail = createTailer();
  // first read of an existing file starts at EOF (no replay)
  expect(tail.read(f, { startAtEof: true })).toEqual([]);

  appendFileSync(f, "line3\n");
  expect(tail.read(f)).toEqual(["line3"]);

  appendFileSync(f, "partial"); // no newline yet
  expect(tail.read(f)).toEqual([]); // incomplete line held back
  appendFileSync(f, " done\n");
  expect(tail.read(f)).toEqual(["partial done"]);

  // truncation resets offset
  writeFileSync(f, "fresh\n");
  expect(tail.read(f)).toEqual(["fresh"]);

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/tailer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/core/tailer.ts`**

```ts
import { openSync, readSync, closeSync, statSync } from "node:fs";

interface FileState { offset: number; carry: string }

export function createTailer() {
  const states = new Map<string, FileState>();

  function read(file: string, opts: { startAtEof?: boolean } = {}): string[] {
    let size = 0;
    try { size = statSync(file).size; } catch { return []; }

    let st = states.get(file);
    if (!st) {
      st = { offset: opts.startAtEof ? size : 0, carry: "" };
      states.set(file, st);
    }
    if (size < st.offset) { st.offset = 0; st.carry = ""; } // truncated/rotated
    if (size === st.offset) return [];

    const len = size - st.offset;
    const buf = Buffer.allocUnsafe(len);
    const fd = openSync(file, "r");
    try { readSync(fd, buf, 0, len, st.offset); } finally { closeSync(fd); }
    st.offset = size;

    const text = st.carry + buf.toString("utf8");
    const parts = text.split("\n");
    st.carry = parts.pop() ?? ""; // last element is incomplete (no trailing newline) or ""
    return parts.filter(l => l.length > 0);
  }

  return { read, forget(file: string) { states.delete(file); } };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/tailer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tailer.ts tests/tailer.test.ts
git commit -m "feat(core): incremental JSONL tailer with truncation handling"
```

---

## Task 14: `sessionStore.ts` — wire it together

**Files:**
- Create: `src/store/sessionStore.ts`
- Test: `tests/sessionStore.test.ts`

The store owns: discovery, per-file tailing, the reducer state per session, status derivation, lens detection, and a subscriber list. It exposes `pollOnce(now)` (testable, no timers) and `start()/stop()` (wraps `setInterval`).

- [ ] **Step 1: Write the failing test**

`tests/sessionStore.test.ts`:
```ts
import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore } from "../src/store/sessionStore";

test("pollOnce ingests appended lines into session state and derives status", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-store-"));
  const proj = join(root, "-home-u-repo-foo");
  mkdirSync(proj, { recursive: true });
  const f = join(proj, "sid.jsonl");
  writeFileSync(f, ""); // empty session file

  const store = createStore({ root });
  store.pollOnce(1000); // discovers file, starts at EOF

  appendFileSync(f, JSON.stringify({ type: "ai-title", aiTitle: "Hello" }) + "\n");
  appendFileSync(f, JSON.stringify({ type: "assistant", cwd: "/home/u/repo/foo",
    message: { model: "claude-opus-4-8", stop_reason: "end_turn",
      usage: { input_tokens: 1, cache_read_input_tokens: 99999 },
      content: [{ type: "text", text: "hi" }] } }) + "\n");

  store.pollOnce(2000);
  const sessions = store.sessions();
  expect(sessions.length).toBe(1);
  const s = sessions[0]!;
  expect(s.title).toBe("Hello");
  expect(s.status).toBe("waiting");
  expect(s.tokens.contextPct).toBeCloseTo(0.5, 2);

  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test tests/sessionStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/store/sessionStore.ts`**

```ts
import { discoverSessions, projectsRoot } from "../core/discover";
import { createTailer } from "../core/tailer";
import { parseLine } from "../core/parse";
import { newSession, applyEntry } from "../core/reducer";
import { deriveStatus } from "../core/status";
import { detectLens } from "../core/lens";
import type { SessionState } from "../core/types";

export interface StoreOpts { root?: string; pollMs?: number; seenAtStart?: boolean }
type Listener = () => void;

export function createStore(opts: StoreOpts = {}) {
  const root = opts.root ?? projectsRoot();
  const pollMs = opts.pollMs ?? 750;
  const tailer = createTailer();
  const map = new Map<string, SessionState>();
  const firstRead = new Set<string>();
  const listeners = new Set<Listener>();
  let timer: ReturnType<typeof setInterval> | null = null;

  function emit() { for (const l of listeners) l(); }

  function pollOnce(now: number) {
    const found = discoverSessions(root);
    let changed = false;
    for (const fs of found) {
      const startAtEof = !firstRead.has(fs.file);
      const lines = tailer.read(fs.file, { startAtEof });
      firstRead.add(fs.file);
      if (!map.has(fs.id)) map.set(fs.id, newSession(fs.id, fs.file));
      if (lines.length === 0) continue;
      let s = map.get(fs.id)!;
      for (const raw of lines) {
        const entry = parseLine(raw);
        if (!entry) { s = { ...s, parseErrors: s.parseErrors + 1 }; continue; }
        s = applyEntry(s, entry, now);
      }
      s = recompute(s, now);
      map.set(fs.id, s);
      changed = true;
    }
    // refresh status (ages change even without new lines)
    for (const [id, s] of map) {
      const next = recompute(s, now);
      if (next.status !== s.status) { map.set(id, next); changed = true; }
    }
    if (changed) emit();
  }

  function recompute(s: SessionState, now: number): SessionState {
    const status = deriveStatus({
      lastEntryType: s.lastEntryType,
      lastStopReason: s.lastStopReason,
      lastBlockKind: s.lastBlockKind,
      pendingToolResult: Object.keys(s.pendingTools).length > 0,
      lastErrored: s.lastErrored,
      ageMs: s.lastActivityTs ? now - s.lastActivityTs : 0,
    });
    const lens = detectLens(s);
    return { ...s, status, lens };
  }

  return {
    pollOnce,
    sessions(): SessionState[] {
      return [...map.values()].sort((a, b) => b.lastActivityTs - a.lastActivityTs);
    },
    get(id: string) { return map.get(id); },
    subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); },
    start() {
      if (timer) return;
      pollOnce(Date.now());
      timer = setInterval(() => pollOnce(Date.now()), pollMs);
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test tests/sessionStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/sessionStore.ts tests/sessionStore.test.ts
git commit -m "feat(store): wire discovery, tail, reduce, status, lens"
```

---

## Task 15: `bin/hf-dump.ts` — debug CLI (proves the engine end-to-end)

**Files:**
- Create: `bin/hf-dump.ts`

- [ ] **Step 1: Implement the CLI**

```ts
#!/usr/bin/env bun
import { createStore } from "../src/store/sessionStore";

const store = createStore({ pollMs: 1000 });
const unsub = store.subscribe(() => {
  const lines = store.sessions().map((s) => {
    const ctx = Math.round(s.tokens.contextPct * 100);
    const phase = s.lens.activePhase ? ` [${s.lens.activePhase}]` : "";
    const last = s.beats[s.beats.length - 1];
    const doing = last ? `${last.icon} ${last.label}${last.detail ? " · " + last.detail : ""}` : "—";
    return `${s.status.padEnd(8)} ${s.project.padEnd(16)} ctx ${String(ctx).padStart(3)}%  $${s.costUSD.toFixed(2)}${phase}  ${doing}`;
  });
  console.clear();
  console.log("harness-flow — live sessions\n");
  console.log(lines.join("\n") || "(no sessions yet)");
});

store.start();
process.on("SIGINT", () => { store.stop(); unsub(); process.exit(0); });
```

- [ ] **Step 2: Run it manually against real sessions**

Run: `bun run bin/hf-dump.ts`
Expected: a live, refreshing list of your real Claude Code sessions with status, context %, cost, phase, and current action. Start or interact with a Claude Code session in another terminal and watch a row update. Ctrl+C to exit.

- [ ] **Step 3: Run the full test suite**

Run: `bun test`
Expected: ALL tests pass (smoke, types, parse, tokens, status, reducer, lens, flow-layout, player, discover, tailer, sessionStore).

- [ ] **Step 4: Commit**

```bash
git add bin/hf-dump.ts
git commit -m "feat(cli): hf-dump debug view proves engine end-to-end"
```

---

## Self-Review (engine)

- **Spec coverage:** §6 pipeline → discover/tailer/parse/reducer/store; §7 fields → parse/types; §8 model → types; §9 modules → Tasks 2–14; §11 status → Task 5; §13 lens → Task 9; flow data → Task 10; player+coalesce+history → Task 11; §16 edge cases → tailer truncation/EOF (Task 13), parseErrors (Tasks 6/14). UI (§12, §14) and playback keybindings (§15) are Part 2.
- **Type consistency:** `Beat`, `SessionState`, `SessionTokens`, `LensState` defined once in `types.ts`; `applyEntry(state, entry, now)` signature consistent across reducer/lens/store tests; `createPlayer` API (`setBeats/tick/presented/stepBack/toLive/mode/cursor`) consistent with Part 2 usage.
- **No placeholders:** every step has runnable code and a concrete command + expected result.

---

## Handoff

Part 1 produces a fully tested headless engine + a working debug CLI. **Part 2** (`2026-06-06-harness-flow-2-tui.md`) builds the OpenTUI React UI (Mission Control, vertical-metro Flow with energy-pulse, panels, gauges, playback/scrub keybindings) on top of `sessionStore` and `createPlayer`.
