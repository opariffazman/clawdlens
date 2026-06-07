# ClawdLens — Lens panel (CI/CD pipeline hawk-eye)

**Spec 3 of 4 in the UI/UX overhaul.** Depends on #2 Chrome & Theme (done) and #3 Pulse (done). GitHub issue #4.

## Goal

A new **Lens** panel: a holistic, hawk-eye overview of a session rendered as a
**CI/CD-style pipeline of reusable node types**. Unlike the **Log** panel (raw
chronological beat stream, cursor-driven reveal), Lens is **aggregate over the
whole session** — a frozen, legible pipeline whose shape never rearranges. The
five canonical stages are always present; recurring stages feel "always
running" via flowing edge energy.

**Lens vs Log:** Log = raw chronological stream. Lens = aggregate holistic
overview.

## Design principles (legibility first)

The enemy of an easy-to-read pipeline is a diagram that rearranges itself. So:

- **Frozen layout.** Five stages sit in fixed lifecycle slots, left→right. The
  eye learns the map once and never re-learns it.
- **Whole-session counts, always shown.** Counts never hide or grow while
  scrubbing.
- **Edge thresholding.** Only the hottest transitions are drawn; rare ones are
  suppressed. This is the single biggest clarity win (prevents 5-node
  spaghetti).
- **Movement adds info, never reshuffles.** The only moving things are (a) one
  calm energy dot per edge, and (b) a single "you are here" glow tracking the
  live stage.

## Node grain

A node is a **BeatKind**, collapsed to five canonical pipeline kinds:

```
PipeKind = "think" | "tool" | "skill" | "result" | "chat"
```

Mapping from `Beat.kind`:

| Beat.kind  | PipeKind | Notes                                  |
|------------|----------|----------------------------------------|
| `thinking` | `think`  |                                        |
| `tool`     | `tool`   | includes Task subagents                |
| `skill`    | `skill`  |                                        |
| `text`     | `chat`   |                                        |
| `wait`     | —        | reducer never emits it; ignored        |
| `phase`    | —        | reducer never emits it; ignored        |
| —          | `result` | **synthetic** — see below              |

### Synthetic `result`

The reducer never emits `result` beats. It pairs a `tool_result` onto the
originating tool beat by setting `Beat.ok` (`true` = success, `false` = error)
in `foldUser`. So Lens **synthesizes** a `result` step:

- After any `tool` beat whose `ok` is **defined**, emit a `result` step.
- `ok === true`  → increment `result.ok`.
- `ok === false` → increment `result.err`.
- A tool beat with `ok` still `undefined` (pending / never paired) emits **no**
  result step.

`result.count = result.ok + result.err`.

## Data model (lives in `pipeline.ts`, local — like `flow-layout.ts`'s `FlowGraph`)

```ts
export type PipeKind = "think" | "tool" | "skill" | "result" | "chat";

export interface PipeNode {
  kind: PipeKind;
  count: number;    // frequency over ALL steps (not coalesced)
  ok?: number;      // result node only
  err?: number;     // result node only
  col: number;      // fixed slot column
  row: number;      // fixed slot row
}

export interface PipeEdge {
  from: PipeKind;
  to: PipeKind;
  weight: number;   // frequency over coalesced transitions
  back: boolean;    // runs against column order → drawn as an arc below
}

export interface PipelineGraph {
  nodes: PipeNode[];
  edges: PipeEdge[];
  maxCount: number; // for proportional bars
  maxWeight: number; // for energy speed/brightness + thresholding
}
```

### Fixed lifecycle slots

```
 col0      col1        col2       col3
 think  →  tool    →   result  →  chat
           skill
            (row1)
```

| kind   | col | row |
|--------|-----|-----|
| think  | 0   | 0   |
| tool   | 1   | 0   |
| skill  | 1   | 1   |
| result | 2   | 0   |
| chat   | 3   | 0   |

A node is included only if its `count > 0`. Slots are still fixed; absent kinds
simply aren't drawn.

## Aggregation algorithm (pure, `buildPipeline(beats): PipelineGraph`)

Input is the **whole-session** beat list (the `full` fold, as Files/Tasks use).

1. **Expand** beats → `steps: PipeKind[]`, in order:
   - Map each beat's kind to a `PipeKind` (skip unmapped `wait`/`phase`).
   - If a `tool` beat has `ok` defined, push the mapped `tool` step **then** a
     `result` step; tally `ok`/`err`.
2. **Node counts** = frequency of each `PipeKind` over `steps` (all steps, not
   coalesced). `maxCount` = largest node count.
3. **Edges**: coalesce `steps` by dropping consecutive duplicates (→ no
   self-loops), then count each consecutive ordered pair `(from, to)` as
   `weight`. `maxWeight` = largest edge weight.
4. **Back-edge flag**: `back = toCol <= fromCol` using the slot columns (e.g.
   `result(2) → think(0)` is back; `skill(1) → tool(1)` is back since equal
   column; forward otherwise).
5. **Threshold** (applied at render, not in the graph — graph keeps all edges so
   it stays testable): an edge is drawn iff
   `weight >= max(1, Math.ceil(0.05 * maxWeight))`. The hottest edge always
   survives. (Threshold constant `EDGE_MIN_FRAC = 0.05` exported for the panel.)

`buildPipeline([])` → `{ nodes: [], edges: [], maxCount: 0, maxWeight: 0 }`.

## Render (`src/ui/panels/Lens.tsx`, buffered)

Props: `{ full, presented, cursor, pulse, width, height }`.

- Uses `full` (whole-session fold) for the graph; `presented[cursor]` only for
  the flare.
- Buffered box, `buffer.clear(TRANSPARENT)` each frame, `setCell` +
  `RGBA.fromHex` / `lerpHex` — same substrate as `Flow`/`Git`.

**Nodes:**
- Glyph `◍` if `count > 1` (recurring), `○` if `count === 1` (one-shot), colored
  by `theme.laneColors[col % …]`.
- Label: ` <kind> ×<count>` in `theme.fg`.
- Proportional bar: one block char from `▁▂▃▄▅▆▇█` scaled to `maxCount`, in
  `theme.dim`.
- `result` node also renders `✓<ok>` in `theme.ok` and `✗<err>` in `theme.err`
  (omit a half if its count is 0).

**Forward edges:** horizontal wire (`═`) spanning the gap between adjacent
columns. One energy dot rides **L→R**, position `= (now * speed) % len`. Speed
and rest-brightness scale with `weight / maxWeight` (hotter = faster, brighter);
brightness around the dot via `pulseIntensity`, color via `lerpHex(wireDim,
laneColor, intensity)`, rest floor ~0.25 like Git's 0.4 floor.

**Back edges:** routed as an arc on the row **below** the spine (box-drawing
`╰ ─ ╯` / `┘ ┐`), energy flows in the edge's direction (right→left for the
canonical `result→think` loop).

**Skill branch:** `skill` sits at row 1 under `tool`; its edges branch up into
the spine using the same idea as `flow-layout`'s `branchCells` (`┐`/`┘`).

**Cursor flare:** map `presented[cursor]?.kind` → `PipeKind`. That node renders
`◉` and brightened; its single hottest incoming drawn edge is brightened too.
This is the only motion that tracks the shared timeline — the shape stays
frozen.

**Liveness:** `live = pulse && nodes.length > 0` (continuous loop while pulse
on). When `pulse` is off, wires are static dim and no dots move (matches `Flow`
honoring the `p` toggle). The global `forceRepaint` in `App.tsx` already fires on
cursor/panel/session change, so no ghosting handling is needed here.

**Empty state:** no nodes → dim text `no activity yet`.

## Wiring changes

- **`src/ui/Showcase.tsx`**: render
  `<Lens full={agg} presented={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />`
  (currently `<Lens />` with no props). `agg = full ?? session` already exists.
- **`src/core/types.ts`**: flip `DEFAULT_PANEL` from `"log"` to `"lens"` (the
  panel is now real). `PANELS` order unchanged (lens already leftmost).

## Tests (`src/core/pipeline.test.ts`, bun:test, TDD — failing first)

Pure `buildPipeline` only:

1. `[]` → empty graph (`maxCount` / `maxWeight` 0).
2. Kind mapping: `thinking→think`, `text→chat`, `skill→skill`, `tool→tool`;
   `wait`/`phase` beats produce no node.
3. Synthetic result: a `tool` beat with `ok:true` → a `result` node with
   `ok:1,err:0,count:1`; `ok:false` → `err:1`; `ok:undefined` → **no** result
   node and no result step.
4. Node `count` counts all beats (including consecutive duplicates).
5. Edges from **coalesced** sequence: consecutive same-kind beats produce **no**
   self-edge; distinct transitions get the right weights.
6. Back-edge classification: `result→think` and `skill→tool` are `back:true`;
   `think→tool`, `tool→result` are `back:false`.
7. Thresholding helper: an edge below `max(1, ceil(0.05*maxWeight))` would be
   suppressed while the top edge survives (test the predicate / exported
   constant, since thresholding is applied at render).
8. `maxCount` / `maxWeight` reflect the largest node / edge.

**Visual verification** via tmux per CLAUDE.md:
`tmux new-session -d -s cl -x 150 -y 36 "bun run dev"; sleep 4; tmux capture-pane -t cl -p`
— confirm the frozen pipeline, counts/bars, energy dots, and cursor flare; `-e`
+ frame-diff for the pulse animation.

## Out of scope (YAGNI)

- No per-tool breakdown inside the `tool` node (BeatKind grain only).
- No configurable layout / no general graph-layout algorithm (fixed 5-slot
  grid).
- No new keybindings.
- No persistence / no changes to reducer or core types beyond `DEFAULT_PANEL`.

## Files

| File | Change |
|------|--------|
| `src/core/pipeline.ts` | **new** — pure `buildPipeline` + types + `EDGE_MIN_FRAC` |
| `src/core/pipeline.test.ts` | **new** — TDD suite |
| `src/ui/panels/Lens.tsx` | replace placeholder with buffered pipeline render |
| `src/ui/Showcase.tsx` | pass props to `<Lens>` |
| `src/core/types.ts` | `DEFAULT_PANEL` `"log"` → `"lens"` |
