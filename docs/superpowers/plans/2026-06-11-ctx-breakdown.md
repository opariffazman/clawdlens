# Context-Token Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estimated context pools (system/user/tools/subagents/reasoning) folded in the reducer, rendered as a color-coded 1-row Lens band. Closes #20.

**Architecture:** `estimateTokens` (chars/4) in tokens.ts; reducer accumulates `ctxPools` per content category (tool_result attribution to subagents uses `pendingTools[id].name === "Task"` — REQUIRES the tool-timing feature merged first); `ctxBreakdownView` computes segments + residual system pool against `tokens.contextTokens`; new `ctxBand` joins the Lens height ladder.

**Tech Stack:** Bun, TypeScript strict, bun:test.

**Branch:** `feat/ctx-breakdown` off `main` (after tool-timing merges).

---

### Task 1: `estimateTokens` in tokens.ts

**Files:**
- Modify: `src/core/tokens.ts`
- Test: `tests/tokens.test.ts`

- [ ] **Step 1: Failing test** — append to `tests/tokens.test.ts` (add `estimateTokens` to the import):

```ts
test("estimateTokens ~ chars/4, ceil, empty-safe", () => {
  expect(estimateTokens("")).toBe(0);
  expect(estimateTokens("abcd")).toBe(1);
  expect(estimateTokens("abcde")).toBe(2);
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/tokens.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement** — `src/core/tokens.ts`:

```ts
// rough tokenizer-free estimate (~4 chars/token) for context-pool attribution
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tokens.ts tests/tokens.test.ts
git commit -m "feat(tokens): estimateTokens chars/4 heuristic"
```

### Task 2: Reducer ctxPools fold

**Files:**
- Modify: `src/core/types.ts` (CtxPools + SessionState.ctxPools)
- Modify: `src/core/reducer.ts` (resultText, foldAssistant, foldUser, newSession)
- Test: `tests/reducer.test.ts`

- [ ] **Step 1: Failing tests** — append to `tests/reducer.test.ts`:

```ts
test("ctxPools attribute content estimates per category", () => {
  const s = feed([
    { type: "user", message: { content: [{ type: "text", text: "x".repeat(40) }] } },          // user: 10
    { type: "assistant", message: { content: [
      { type: "thinking", thinking: "y".repeat(80) },                                          // reasoning: 20
      { type: "text", text: "z".repeat(40) },                                                  // reasoning: +10
      { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
      { type: "tool_use", id: "t2", name: "Task", input: { subagent_type: "Explore" } },
    ] } },
    { type: "user", message: { content: [
      { type: "tool_result", tool_use_id: "t1", content: "r".repeat(400) },                    // tools: 100
      { type: "tool_result", tool_use_id: "t2", content: [{ type: "text", text: "s".repeat(200) }] }, // subagents: 50
    ] } },
  ]);
  expect(s.ctxPools).toEqual({ user: 10, tools: 100, subagents: 50, reasoning: 30 });
});

test("plain-string user content counts to the user pool", () => {
  const s = feed([{ type: "user", message: { content: "hello world!" } }]); // 12 chars → 3
  expect(s.ctxPools.user).toBe(3);
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/reducer.test.ts`
Expected: FAIL — `ctxPools` missing.

- [ ] **Step 3: Implement types** — `src/core/types.ts`:

```ts
export interface CtxPools { user: number; tools: number; subagents: number; reasoning: number }
```

In `SessionState` after `tokens: SessionTokens;`:

```ts
  ctxPools: CtxPools;            // estimated context attribution (system = residual, derived in view)
```

- [ ] **Step 4: Implement reducer** — `src/core/reducer.ts`: import `estimateTokens` from `./tokens` and `CtxPools` type from `./types`; add helper near `fileOf`:

```ts
// tool_result content is a string or an array of text-ish blocks — flatten for estimation
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === "string" ? c : typeof (c as ContentBlock).text === "string" ? (c as ContentBlock).text! : "")).join("");
  }
  return "";
}

function bumpPool(s: SessionState, key: keyof CtxPools, tok: number): void {
  if (tok > 0) s.ctxPools = { ...s.ctxPools, [key]: s.ctxPools[key] + tok };
}
```

`newSession`: add `ctxPools: { user: 0, tools: 0, subagents: 0, reasoning: 0 },` after `tokens: newSessionTokens(),`.

`foldAssistant` block loop — inside the `thinking` branch add:

```ts
      bumpPool(s, "reasoning", estimateTokens(b.thinking ?? ""));
```

inside the `text` branch (after the `if (text)` push) add at the branch end (counts even when the trimmed text is empty-pushed — use the raw text):

```ts
      bumpPool(s, "reasoning", estimateTokens(b.text ?? ""));
```

`foldUser` — handle plain-string content before the block loop:

```ts
  if (typeof e.message?.content === "string") bumpPool(s, "user", estimateTokens(e.message.content));
```

The block loop REUSES the timing feature's `const p` lookup — do NOT declare a second one. The full merged loop head (everything before `if (p) {` is shown; the timing/pairing body inside `if (p)` and the lane/error lines after it stay exactly as the tool-timing feature left them):

```ts
  for (const b of blocks) {
    if (b.type === "text") { bumpPool(s, "user", estimateTokens(b.text ?? "")); continue; }
    if (b.type !== "tool_result") continue;
    const id = b.tool_use_id;
    if (!id) continue;
    const p = s.pendingTools[id];
    bumpPool(s, p?.name === "Task" ? "subagents" : "tools", estimateTokens(resultText(b.content)));
    if (p) {
      // …existing pairing + toolTimings fold, unchanged…
```

(the pool bump sits BEFORE the pairing block deletes `pendingTools[id]`, so Task attribution still sees the name).

- [ ] **Step 5: Verify pass**

Run: `bun test tests/reducer.test.ts && bunx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/reducer.ts tests/reducer.test.ts
git commit -m "feat(reducer): ctxPools — estimated context attribution per category"
```

### Task 3: `ctxBreakdownView` view model

**Files:**
- Modify: `src/core/lens-bands.ts`
- Test: `tests/lens-bands.test.ts`

- [ ] **Step 1: Failing test** — append (import `ctxBreakdownView`, `newSessionTokens` already imported):

```ts
test("ctxBreakdownView: residual system pool, clamped at 0, ordered", () => {
  const tokens = { ...newSessionTokens(), contextTokens: 200 };
  const v = ctxBreakdownView(tokens, { user: 20, tools: 100, subagents: 30, reasoning: 10 });
  expect(v.total).toBe(200);
  expect(v.segments.map((s) => s.key)).toEqual(["system", "user", "tools", "subagents", "reasoning"]);
  expect(v.segments[0]).toEqual({ key: "system", label: "sys", tokens: 40, frac: 0.2 }); // 200-160 residual
  const over = ctxBreakdownView({ ...newSessionTokens(), contextTokens: 100 }, { user: 80, tools: 80, subagents: 0, reasoning: 0 });
  expect(over.segments[0]!.tokens).toBe(0); // estimates exceed total → residual clamps
});
```

- [ ] **Step 2: Verify failure**

Run: `bun test tests/lens-bands.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — `src/core/lens-bands.ts` (import `CtxPools` from `./types`; export the existing `kfmt` by changing `function kfmt` to `export function kfmt`):

```ts
export interface CtxSegment { key: string; label: string; tokens: number; frac: number }
export interface CtxBreakdownView { total: number; segments: CtxSegment[] }

// composition of what's IN context (vs contextTokens, not the model limit);
// system prompt/tool defs/memory aren't in the transcript → residual, clamped ≥ 0.
export function ctxBreakdownView(t: SessionTokens, p: CtxPools): CtxBreakdownView {
  const total = t.contextTokens;
  const sys = Math.max(0, total - (p.user + p.tools + p.subagents + p.reasoning));
  const segs = [
    { key: "system", label: "sys", tokens: sys },
    { key: "user", label: "usr", tokens: p.user },
    { key: "tools", label: "tool", tokens: p.tools },
    { key: "subagents", label: "sub", tokens: p.subagents },
    { key: "reasoning", label: "think", tokens: p.reasoning },
  ];
  return { total, segments: segs.map((s) => ({ ...s, frac: total > 0 ? s.tokens / total : 0 })) };
}
```

- [ ] **Step 4: Verify pass**

Run: `bun test tests/lens-bands.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/lens-bands.ts tests/lens-bands.test.ts
git commit -m "feat(lens): ctxBreakdownView with residual system pool"
```

### Task 4: ctxBand UI + Lens integration

**Files:**
- Create: `src/ui/panels/lens/ctxBand.ts`
- Modify: `src/ui/panels/Lens.tsx` (Props, height ladder, render)
- Modify: `src/ui/Showcase.tsx:68` (pass ctxPools)

- [ ] **Step 1: Band drawer** — create `src/ui/panels/lens/ctxBand.ts`:

```ts
import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { CtxPools, SessionTokens } from "../../../core/types";
import { ctxBreakdownView, kfmt } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { drawStr } from "./draw";

const POOL_HEX: Record<string, string> = {
  system: theme.dim, user: theme.coral, tools: theme.accent, subagents: "#C792EA", reasoning: "#82AAFF",
};
const BAR_W = 20;

export function drawCtxBand(buf: OptimizedBuffer, x: number, y: number, tokens: SessionTokens, pools: CtxPools, w: number, h: number) {
  const v = ctxBreakdownView(tokens, pools);
  if (v.total <= 0) return;
  drawStr(buf, x, y, "ctx~ ", RGBA.fromHex(theme.dim), w, h);
  let cx = x + 5;
  for (const seg of v.segments) {
    const cells = Math.round(seg.frac * BAR_W);
    const col = RGBA.fromHex(POOL_HEX[seg.key] ?? theme.dim);
    for (let i = 0; i < cells; i++) drawStr(buf, cx++, y, "▓", col, w, h);
  }
  cx = x + 5 + BAR_W + 2;
  for (const seg of v.segments) {
    if (seg.tokens <= 0) continue;
    drawStr(buf, cx, y, `${seg.label} `, RGBA.fromHex(theme.dim), w, h); cx += seg.label.length + 1;
    const val = kfmt(seg.tokens);
    drawStr(buf, cx, y, val, RGBA.fromHex(POOL_HEX[seg.key] ?? theme.dim), w, h); cx += val.length;
    drawStr(buf, cx, y, " · ", RGBA.fromHex(theme.dim), w, h); cx += 3;
  }
}
```

(`drawStr` clips at `w` via `put` — overflow truncates safely on narrow terminals.)

- [ ] **Step 2: Lens integration** — `src/ui/panels/Lens.tsx`:

Props gains `ctxPools: import("../../core/types").CtxPools;` (destructure it). Import:

```ts
import { drawCtxBand } from "./lens/ctxBand";
```

Height ladder (`let ribbon = ...` line): add `ctxB`:

```ts
  let ribbon = ribbonOn ? 2 : 0, econ = 1, ctxB = 1, heart = 1, time = hasTimeline ? 3 : 0;
```

Pressure loop: insert the drop right after econ (econ goes first, then the ctx band):

```ts
    else if (econ) econ = 0;
    else if (ctxB) ctxB = 0;
```

Flags + region accounting:

```ts
  const showRibbon = ribbon > 0, showEconomy = econ > 0, showCtx = ctxB > 0, showHeartbeat = heart > 0, showTimeline = time > 0;
```

```ts
  const regionBottom = hudTop - (econ + ctxB + heart + time);
```

Bottom-band render block (bands stack upward from the HUD):

```ts
        let by = hudTop;
        if (showEconomy) { by -= 1; drawEconomy(buffer, LEFT, by, tokens, width, height); }
        if (showCtx) { by -= 1; drawCtxBand(buffer, LEFT, by, tokens, ctxPools, width, height); }
        if (showHeartbeat) { by -= 1; drawHeartbeat(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
```

- [ ] **Step 3: Wire the prop** — `src/ui/Showcase.tsx:68` `<Lens …>` gains:

```tsx
ctxPools={agg.ctxPools}
```

- [ ] **Step 4: Full gates**

Run: `bunx tsc --noEmit && bun test`
Expected: all green.

- [ ] **Step 5: Visual tmux check**

```bash
tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 5; tmux capture-pane -t cl -p | grep "ctx~"
```

Expected: `ctx~ ▓▓▓… sys 41k · tool 95k · …` row above the economy row; shrink the pane (`tmux resize-window -t cl -y 18`) and confirm the band drops without artifacts. Then `tmux kill-session -t cl`.

- [ ] **Step 6: Commit + PR**

```bash
git add src/ui/panels/lens/ctxBand.ts src/ui/panels/Lens.tsx src/ui/Showcase.tsx
git commit -m "feat(lens): ctx~ band — color-coded context pool breakdown"
git push -u origin feat/ctx-breakdown
gh pr create --title "feat: context-token breakdown lens band" --body "Closes #20. Spec: docs/superpowers/specs/2026-06-11-ctx-breakdown-design.md"
```

Merge after CI green: `gh pr merge --squash --delete-branch`.
