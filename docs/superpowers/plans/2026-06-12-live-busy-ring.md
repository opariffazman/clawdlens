# Live-busy ring keep-alive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On live, keep the active Lens component box's orbiting ring spinning (off the wall clock) whenever the real session is working/running/waiting — even after the timeline player catches up — and surface the running tool as a live sub-node.

**Architecture:** Add a pure `ringSpin(status, live, animating)` predicate (anim.ts) that decides when the ring spins independent of the timeline player. Add `activeToolName` to `LaneFlow` so the running tool can be named. Thread a `live` boolean (player playing + caught-up) from App → Showcase → Lens. Lens consumes the predicate to gate the ring + the buffered box's render loop, drops the narrow `thinkPulse`, and injects a live tool sub-node.

**Tech Stack:** Bun · TypeScript (strict, noUncheckedIndexedAccess) · React 19 · @opentui/react · bun:test.

---

### Task 1: `activeToolName` on LaneFlow

**Files:**
- Modify: `src/core/pipeline-flow.ts` (interface `LaneFlow` ~line 4-23; `laneFlow` return ~line 74-79)
- Test: `tests/pipeline-flow.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/pipeline-flow.test.ts` (the file already has a `beat()` helper and imports `deriveFlow`):

```ts
test("activeToolName = head tool's label while a tool is the head", () => {
  const f = deriveFlow([beat({ kind: "tool", label: "Bash" })], 1, 3);
  expect(f.main.activeToolName).toBe("Bash");
});

test("activeToolName is null when the head is not a tool", () => {
  const f = deriveFlow([beat({ kind: "tool", label: "Bash" }), beat({ kind: "thinking" })], 2, 3);
  expect(f.main.activeToolName).toBeNull();
});

test("activeToolName is null with no revealed beats", () => {
  const f = deriveFlow([], 0, 3);
  expect(f.main.activeToolName).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/pipeline-flow.test.ts`
Expected: FAIL — `activeToolName` does not exist on the result (type error / undefined).

- [ ] **Step 3: Add the field to the interface**

In `src/core/pipeline-flow.ts`, inside `interface LaneFlow`, add after the `activeTool` line (the `activeSkill` line is right below it):

```ts
  activeTool: string | null;             // head tool's iconKey (for the expand highlight)
  activeToolName: string | null;         // head tool's human name (e.g. "Bash") for the live sub-node
```

- [ ] **Step 4: Populate it in `laneFlow`**

In the `return { ... }` of `laneFlow`, add `activeToolName` next to `activeTool`:

```ts
    errored, milestone: head?.milestone ?? null, isOpen, counts, ok, err, toolBreakdown,
    activeTool, activeToolName: head?.kind === "tool" ? head.label : null,
    skillBreakdown, activeSkill, hops, lastHop,
```

(`head` is already in scope: `const head = beats.at(-1) ?? null;`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/pipeline-flow.test.ts`
Expected: PASS (all, including the 3 new).

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/pipeline-flow.ts tests/pipeline-flow.test.ts
git commit -m "feat(flow): expose activeToolName on LaneFlow"
```

---

### Task 2: `ringSpin` predicate

**Files:**
- Modify: `src/ui/anim.ts` (add import + function at end)
- Test: `tests/anim.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/anim.test.ts`. Update the import line at the top to include `ringSpin`:

```ts
import { spinnerFrame, pulseIntensity, lerpHex, pulsePhase, cometColor, breathe, shouldAnimate, ringSpin } from "../src/ui/anim";
```

(Replace the two existing import lines for `../src/ui/anim` with this single line.) Then add:

```ts
test("ringSpin: live working/running spins; idle/done/dormant still", () => {
  expect(ringSpin("working", true, false)).toEqual({ spin: true, busy: true });
  expect(ringSpin("running", true, false)).toEqual({ spin: true, busy: true });
  expect(ringSpin("idle", true, false)).toEqual({ spin: false, busy: false });
  expect(ringSpin("done", true, false)).toEqual({ spin: false, busy: false });
  expect(ringSpin("dormant", true, false)).toEqual({ spin: false, busy: false });
});

test("ringSpin: live waiting spins but is not 'busy'", () => {
  expect(ringSpin("waiting", true, false)).toEqual({ spin: true, busy: false });
});

test("ringSpin: not live → no keep-alive (paused/replay scrub stays static)", () => {
  expect(ringSpin("working", false, false)).toEqual({ spin: false, busy: false });
  expect(ringSpin("waiting", false, false)).toEqual({ spin: false, busy: false });
});

test("ringSpin: animating (replay reveal) spins regardless of live", () => {
  expect(ringSpin("idle", false, true)).toEqual({ spin: true, busy: false });
  expect(ringSpin("working", true, true)).toEqual({ spin: true, busy: true });
});

test("ringSpin: error never spins", () => {
  expect(ringSpin("error", true, true)).toEqual({ spin: false, busy: false });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/anim.test.ts`
Expected: FAIL — `ringSpin` is not exported.

- [ ] **Step 3: Implement `ringSpin`**

In `src/ui/anim.ts`, add the `Status` import near the existing `PlayMode` import (bottom of the file, above `shouldAnimate`):

```ts
import type { Status } from "../core/types";
```

Then add at the end of the file:

```ts
// Whether the active node's orbiting ring should spin, independent of the timeline
// player. `busy` = the real session is actively doing work (working/running) on
// live — used to surface the running tool. `live` = player playing AND caught up.
// Errors stop the ring. Waiting spins too (a gentle "ready for you"); the slower
// period is chosen at the call site via RING_WAIT_MS, so it is not returned here.
export function ringSpin(status: Status, live: boolean, animating: boolean): { spin: boolean; busy: boolean } {
  if (status === "error") return { spin: false, busy: false };
  const busy = live && (status === "working" || status === "running");
  const wait = live && status === "waiting";
  return { spin: animating || busy || wait, busy };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/anim.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/anim.ts tests/anim.test.ts
git commit -m "feat(anim): ringSpin predicate for live-busy ring keep-alive"
```

---

### Task 3: Wire `live` and apply the keep-alive in Lens

**Files:**
- Modify: `src/ui/App.tsx` (compute `live` ~after line 113; pass to `<Showcase>` ~line 252; effect deps ~line 122)
- Modify: `src/ui/Showcase.tsx` (Props interface; destructure; `<Lens>` render ~line 64)
- Modify: `src/ui/panels/Lens.tsx` (import; Props; destructure; ring gate; box `live`; node-box border; sub-node breathe; drop `thinkPulse`)

No unit test — this is render wiring. Verified by typecheck + visual (Task 4 includes the combined visual check). Each step keeps the build green.

- [ ] **Step 1: App — compute `live`**

In `src/ui/App.tsx`, immediately after the `const animate = ...` line (currently line 113), add:

```ts
  // "live" = watching the live head: player playing AND caught up. Gates the
  // ring keep-alive so a paused/replay scrub stays static.
  const live = player ? player.mode() === "playing" && player.backlog() === 0 : false;
```

- [ ] **Step 2: App — pass `live` to Showcase and the repaint effect**

In the `<Showcase ... />` JSX, add `live={live}` next to `animate={animate}`:

```tsx
          animate={animate}
          live={live}
          marker={marker}
```

In the forceRepaint effect deps array (currently line 122), add `live`:

```ts
  useEffect(() => { forceRepaint(); }, [panel, selected?.id, picker.open, picker.stage, picker.query, picker.filtering, full, infoOn, showHelp, animate, live, palette.open, palette.query, palette.sugIndex, forceRepaint]);
```

- [ ] **Step 3: Showcase — thread the prop**

In `src/ui/Showcase.tsx`, add to the `Props` interface (next to `animate: boolean;`):

```ts
  animate: boolean;
  live: boolean;             // player playing + caught up → keep the active ring alive
```

Add `live` to the destructured params of `export function Showcase({ ... })` (next to `animate`):

```ts
export function Showcase({ session, panel, presented, cursor, playerTotal, infoOn, lastAdvanceMs, intervalMs, animate, live, marker, width, height, commits, full, progress, filesSort, tasksHideDone, paletteOpen, paletteQuery, paletteGhost, reveal, focusLocked }: Props) {
```

In the `<Lens ... />` render, add `live={live}` next to `animate={animate}`:

```tsx
        {panel === "lens" && <Lens presented={presented} cursor={cursor} total={playerTotal} animate={animate} live={live} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} status={session.status} infoOn={infoOn} tokens={agg.tokens} ctxPools={agg.ctxPools} toolTimings={agg.toolTimings} width={width - 4} height={bodyHeight} />}
```

- [ ] **Step 4: Lens — import `ringSpin`**

In `src/ui/panels/Lens.tsx`, update the anim import (currently `import { breathe, lerpHex, pulsePhase } from "../anim";`):

```ts
import { breathe, lerpHex, pulsePhase, ringSpin } from "../anim";
```

- [ ] **Step 5: Lens — add `live` to Props and destructure**

In `interface Props`, add after `animate: boolean;`:

```ts
  animate: boolean;
  live: boolean;
```

In the function signature, add `live` next to `animate`:

```ts
export function Lens({ presented, cursor, total, animate, live, lastAdvanceMs, intervalMs, status, infoOn, tokens, ctxPools, toolTimings, width, height }: Props) {
```

- [ ] **Step 6: Lens — compute `ringSpin` + `activeK` near the top**

Right after `const animating = animate;` (currently line 173), add:

```ts
  const { spin, busy } = ringSpin(status, live, animating);
  const activeK = flow.main.activeKind;
```

(`busy` is consumed in Task 4. It is harmless unused here — the project has no `noUnusedLocals`.)

- [ ] **Step 7: Lens — drop the old `thinkPulse`/`activeK` block**

Replace this block (currently lines 258-263):

```ts
  const activeK = flow.main.activeKind;
  const ringKey = status === "waiting" ? "chat" : activeK && nl.boxes.has(activeK) ? activeK : null;
  const ringMs = status === "waiting" ? RING_WAIT_MS : RING_MS;
  // long thinks park the timeline (animate=false) but the model is still working —
  // keep the think box breathing so the user sees life (n8n keeps its ring spinning).
  const thinkPulse = (status === "working" || status === "running") && activeK === "think";
```

with (just the ring-key lines — `activeK` now lives at the top, `thinkPulse` is gone):

```ts
  const ringKey = status === "waiting" ? "chat" : activeK && nl.boxes.has(activeK) ? activeK : null;
  const ringMs = status === "waiting" ? RING_WAIT_MS : RING_MS; // waiting spins on the slower period
```

- [ ] **Step 8: Lens — box `live` prop**

Change the buffered box (currently `live={animate || thinkPulse}`, line 269) to:

```tsx
      live={animate || spin}
```

- [ ] **Step 9: Lens — simplify the node-box border (remove think breathe)**

Replace this block inside the `for (const k of row)` loop (currently lines 332-337):

```ts
          const pulseThis = thinkPulse && !animating && k === "think";
          const pulseHex = pulseThis ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex;
          const border = RGBA.fromHex(
            pulseThis ? pulseHex
            : active ? (flow.main.errored ? theme.err : laneHex) : theme.dim,
          );
```

with:

```ts
          const border = RGBA.fromHex(active ? (flow.main.errored ? theme.err : laneHex) : theme.dim);
```

Then in the `drawNodeBox(...)` call below it (currently line 351), replace the `pulseHex` argument with `laneHex`:

```tsx
          drawNodeBox(buffer, r, art, iconFor(STAGE_GLYPH[k] ?? "tool"), k, k, bigLabel, hitsCircle ? "" : detail, border, laneHex, RGBA.fromHex(active ? theme.fg : theme.dim), width, height);
```

- [ ] **Step 10: Lens — widen the ring gate**

Change the ring guard (currently line 367):

```ts
        if (ringKey && animating && !flow.main.errored && status !== "error") {
```

to (the `spin` flag already excludes `status === "error"`; keep the `flow.main.errored` guard for an errored head that has not yet flipped status):

```ts
        if (ringKey && spin && !flow.main.errored) {
```

- [ ] **Step 11: Lens — breathe sub-nodes on `spin`**

The `drawSubNode` calls (currently line 319) pass `animating` as the breathe flag:

```tsx
          sr.circles.forEach((c, i) => drawSubNode(buffer, c, items[i]!, sr.labelY, now, animating, width, height));
```

Change `animating` → `spin` so sub-nodes keep breathing while the live ring spins:

```tsx
          sr.circles.forEach((c, i) => drawSubNode(buffer, c, items[i]!, sr.labelY, now, spin, width, height));
```

(`drawSubNode`'s 6th param is named `animating`; its meaning is "should pulse". No signature change needed.)

- [ ] **Step 12: Typecheck + full test run**

Run: `bunx tsc --noEmit && bun test`
Expected: no type errors; all tests pass. (`breathe` and `lerpHex` are still used by `drawRing`/`drawSubNode`/`drawBurst`, so their imports stay live.)

- [ ] **Step 13: Commit**

```bash
git add src/ui/App.tsx src/ui/Showcase.tsx src/ui/panels/Lens.tsx
git commit -m "feat(lens): live-busy ring keep-alive (spins while session works, not just while timeline advances)"
```

---

### Task 4: Live tool sub-node + visual verification

**Files:**
- Modify: `src/ui/panels/Lens.tsx` (the `else` branch of the sub-row `items` build, currently lines 187-195)

- [ ] **Step 1: Inject the running-tool sub-node**

In `src/ui/panels/Lens.tsx`, the `else` branch (when `infoOn` is false) currently starts:

```ts
  } else {
    const lastGroup = lensState.skillGroups[lensState.skillGroups.length - 1];
```

Insert the tool node as the FIRST item in that branch (so it sits leftmost under the box), before the `lastGroup` line:

```ts
  } else {
    // live: the running tool gets a breathing sub-node under its box, named (e.g. "Bash · npm test").
    // Skip Task tools — they already show as agent sub-lanes below.
    if (busy && activeK === "tool" && flow.main.activeTool && flow.main.activeTool !== "task" && flow.main.activeToolName) {
      const detail = flow.main.detail ? ` · ${flow.main.detail}` : "";
      items.push({
        glyph: iconFor(flow.main.activeTool as IconKey),
        label: `${flow.main.activeToolName}${detail}`,
        live: true,
        hex: laneHexOf("tool"),
      });
    }
    const lastGroup = lensState.skillGroups[lensState.skillGroups.length - 1];
```

(`busy` and `activeK` come from Task 3 Step 6. `IconKey` is already imported at the top of the file. `iconFor`, `laneHexOf`, `clip` are imported. `drawSubNode` clips the label to 14 chars, so an over-long `detail` is truncated for display.)

- [ ] **Step 2: Typecheck + full test run**

Run: `bunx tsc --noEmit && bun test`
Expected: no type errors; all tests pass.

- [ ] **Step 3: Visual verification via tmux — ring keeps spinning on live**

The ring animates off `Date.now() % periodMs`, so motion shows across frames, not in a single capture. Run the app, let it focus a live working session, and diff two frames captured ~0.6s apart (no new beats in between):

```bash
tmux kill-session -t cl 2>/dev/null; tmux new-session -d -s cl -x 150 -y 40 "bun run dev"
sleep 5
tmux capture-pane -t cl -p -e > /tmp/cl-a.txt
sleep 1
tmux capture-pane -t cl -p -e > /tmp/cl-b.txt
diff /tmp/cl-a.txt /tmp/cl-b.txt; echo "exit=$?"
tmux kill-session -t cl 2>/dev/null
```

Expected: when a focused session is `working`/`running`/`waiting`, the diff is NON-empty — the ESC colour codes on the active box's border cells differ between frames (the coral arc advanced) even though the `beats N/N` count is unchanged. Also confirm a `tool` sub-node (e.g. `Bash …`) appears under the box during a live tool call. If you have no live session, start one in another terminal (`claude` in any project) and re-run.

Note: if the active kind is `think` during a long model think, the same diff should show the ring advancing on the THINK box (this is the case `thinkPulse` used to cover, now handled by `ringSpin`).

- [ ] **Step 4: Commit**

```bash
git add src/ui/panels/Lens.tsx
git commit -m "feat(lens): surface the running tool as a live sub-node"
```

---

## Self-Review notes

- **Spec coverage:** live signal (T3.S1), `liveBusy`/`liveWait` via `ringSpin` (T2), ring gate widened (T3.S10), box render loop (T3.S8), `thinkPulse` removed (T3.S7,S9), tool sub-node (T4.S1), HUD line unchanged (no task needed — kept as-is), `activeToolName` (T1), pure tests (T1,T2), visual verify (T4.S3). All covered.
- **Refinement vs spec:** `ringSpin` returns `{ spin, busy }` rather than `{ spin, slow }`. `busy` is needed by the tool sub-node; the waiting "slow ring" is already produced by Lens's existing `ringMs = status === "waiting" ? RING_WAIT_MS : RING_MS` line (unchanged), so `slow` was redundant. Test matrix updated to match.
- **Type consistency:** `activeToolName: string | null` defined in T1, read in T4. `ringSpin(status, live, animating) → { spin, busy }` defined in T2, consumed in T3/T4. `live: boolean` added to Showcase + Lens Props in T3. `flow.main.activeTool` is typed `string | null` → cast to `IconKey` for `iconFor` in T4.
- **No placeholders:** every code step shows exact code and exact commands.
