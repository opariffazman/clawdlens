# ClawdLens — Lens HUD redesign (n8n boxed cards, two grains)

**Third Lens spec.** Builds on the dynamic n8n pipeline (`…-lens-dynamic-design.md`, shipped on `feat/lens-panel` / PR #8). That version draws stages as glyphs on a single cramped line and wastes ~75% of the panel's vertical space. This redesign renders each node as a **boxed card** (n8n-style), spreads information into **HUD panels** that fill the height, makes **counts live** (cursor-synced), and makes the **`i` key a detail-level zoom** between a coarse overview and a fine per-action canvas.

## Goals

1. **De-cram.** Each pipeline node is its own bordered card; wires + pulses run cleanly box→box (clear endpoints), not threaded through inline text.
2. **Use the space.** A bordered HUD band (NOW + VITALS) anchored toward the bottom fills the wasted vertical area; the current action is shown in full, uncramped.
3. **Live counts.** Stage counts reflect the actual iteration up to the cursor (climb on replay/live, rewind on scrub) — not a static full-session total.
4. **Detail zoom.** `i` toggles two grains: coarse 5-stage overview ⇄ fine per-action cards.

Transparent canvas throughout (no bg fills); cards + HUD use border lines with transparent interiors, like the k9s menus.

## Grain model

A pure **grain mapper** turns a `Beat` into a node id:

- **coarse** (default): BeatKind grain. `thinking→think`, `text→chat`, `skill→skill`, `tool→tool`; `result` synthesized after a completed tool (`ok` defined). Fixed 5 node set: `think, tool, skill, result, chat`.
- **fine**: same, except a `tool` beat maps to its specific `Beat.iconKey` (`bash | edit | read | search | web | task | todo | tool`). Node set = `think`, `skill`, `result`, `chat`, plus whichever tool action kinds occurred. `result` still synthesized after a completed tool.

`NodeKind = string` (a `PipeKind` for coarse; a `PipeKind`-or-`IconKey` for fine). A canonical order ranks nodes for layout: `think`, then tool actions in fixed order `bash, edit, read, search, web, task, todo, tool`, then `skill`, `result`, `chat`.

## Card design

Each node is a 3-row card, width auto-sized to its content (min ~10), transparent interior:

```
╭─◇ think─╮     ← top border carries the stage/action icon + name
│ ×12   ◉ │     ← live count, and ◉ when this card is the active node
╰─────────╯
```
- `result` card's content row shows live `✓<ok> ✗<err>` instead of a plain count.
- **Active card** (the node of the head beat): bright border + `◉`, breathing (`breathe()`); a failed result flashes the border red.
- A **milestone** (commit/branch) blooms/sparks centered on its card.

## Coarse layout (overview, `i` off — default)

Fixed slots rendered as cards: `think`(col0) → `tool`(col1) → `result`(col2) → `chat`(col3) on the top row; `skill` as a card below `tool`. Card x = `LEFT + col * (CARD_W + ARROW_GAP)`.

- **Backbone wires** (dim, always): the canonical chain `think─▶tool─▶result─▶chat`, the `tool│skill` branch, drawn box→box between card edges. This is the stable n8n structure.
- **Live flow**: the comet rides the **current transition** (head's prev→cur, data-driven, including back-edges like `result→think` routed as an arc beneath the row) over the backbone, gliding with `pulsePhase`; a short fading trail covers the last few hops.

## Fine layout (detail, `i` on)

Cards for all present fine nodes, placed left→right in canonical order, **wrapping** to a new row when the next card would exceed `width`. (`fineCardLayout(kinds, width) → rects`.)

- The dense static backbone is **omitted** here (an exploded graph would be spaghetti); instead the **live comet + short trail** hop card→card along the actual transitions, routed as a Manhattan path (horizontal then vertical) between the source and target card edges — so the pulse is easy to follow even across wrapped rows.
- Active card highlight, counts, milestone bloom, failure flash all apply per card.

## `i` toggle = detail zoom

`i` (and the `lens.info` palette command) switches grain: **off → coarse overview (default)**, **on → fine detail**. The HUD's NOW line shows the full current action in both, but the fine view is the literal per-action canvas. (This replaces the previous "toggle the inline detail string" meaning.)

## Live counts (cursor-synced)

`deriveFlow` (grain-aware) computes, over the revealed window `presented[0..cursor)`, the per-node live `counts` and the running `ok`/`err` — so cards climb as the flow runs/replays and rewind when scrubbed. Replaces the static `buildPipeline` aggregate for the card counts.

## Subagent lanes

Below the cards, a compact row per open subagent lane: `◆ <label> ··· ▸ N live` with the lane's current action icon + a mini-comet (capped at MAX_SUBLANES, `+N more`). Unchanged in spirit from the dynamic spec; rendered beneath the card block.

## HUD band (fills the vertical space)

A bordered band anchored toward the **bottom** of the panel:

```
┌ NOW ───────────────────────────────────────────────┐
│ ◈ tool · Bash · npm test && bunx tsc --noEmit       │   full current action, clipped only to width
├ VITALS ─────────────────────────────────────────────┤
│ ● running   tempo ▮▮▮▯   ✓94% 16/1   1 agent   beats 142/318 │
└─────────────────────────────────────────────────────┘
```

- **NOW**: head action in full — `<action-icon> <stage> · <detail>` (e.g. the Bash command, the skill name, the edited file). The de-cramming win.
- **VITALS**: `status` (colored dot — running/working/waiting/idle/dormant/error), `tempo` bar (from `intervalMs`: shorter → more bars), success `✓ok ✗err` + %, `N agents` live, `beats cursor/total` progress. (ctx%/cost stay in the Header — no duplication.)

Vertical distribution: cards block at top → subagent rows → (breathing gap) → HUD band near the bottom, using the panel `height`.

## Architecture

### Pure (TDD)
- **`src/core/pipeline.ts`**: generalize to a grain mapper. Add `type Grain = "coarse" | "fine"` and `nodeKindOf(beat, grain): string | null` (coarse = current `kindOf`; fine = tool→`iconKey`). Export a canonical `ORDER`/`rankOf(kind)` covering fine kinds. Keep `PipeKind` + `slotOf` (coarse fixed slots). **Remove the now-orphaned `buildPipeline`/`edgeVisible`/`EDGE_MIN_FRAC`/`PipeNode`/`PipeEdge`/`PipelineGraph`** (only the old Lens used them; live counts come from `deriveFlow`) and their tests.
- **`src/core/pipeline-flow.ts`**: make `deriveFlow(beats, cursor, trailLen, grain)` grain-aware; extend `LaneFlow` with live `counts: Record<string, number>`, `ok`, `err`. `activeKind`/`trail`/`actionIcon` computed at the chosen grain.
- **`src/core/pipeline-geometry.ts`**: add `CARD_W`/`CARD_H`/`ARROW_GAP`; `coarseCardRect(kind) → {x,y,w,h}` (fixed slots); `fineCardLayout(kinds, width) → Map<kind,{x,y,w,h}>` (left→right, wrapping); and a `cardWire(fromRect, toRect) → Cell[]` Manhattan router for box→box wires/comet. Coarse backbone reuses fixed canonical wires.

### UI
- **`src/ui/panels/Lens.tsx`**: rewrite around cards + HUD band. Draw: backbone (coarse) / nothing dense (fine) → cards (boxes + content) → live comet/trail on wires → active highlight → milestone bloom → subagent rows → HUD band (NOW + VITALS). `i` selects grain. Bounds-clipped via `put`/`drawStr`.
- **`src/ui/Showcase.tsx`**: `<Lens>` no longer needs `full` (counts come from `deriveFlow`); keep `presented/cursor/pulse/lastAdvanceMs/intervalMs/status/infoOn/width/height`.
- `infoOn` default flips to **false** (overview first) in `src/ui/App.tsx`.

### Icons / colors
Action icons via `iconFor` (fine kinds are `IconKey`s directly). Card border / comet colors by node lane color (coarse keeps stage lane colors; fine assigns a stable color per action kind by canonical rank).

## Testing

**Pure (`bun:test`):**
- `nodeKindOf`: coarse vs fine mapping (tool→iconKey in fine; think/chat/skill/result identical; wait/phase → null); `rankOf` canonical order; `slotOf` fixed slots retained. (buildPipeline/edgeVisible tests removed with the functions.)
- `deriveFlow` (both grains): live `counts` climb with cursor and rewind when smaller; `ok`/`err` from completed tools up to cursor; fine grain splits tool counts by action; `activeKind`/`actionIcon` at grain.
- geometry: `coarseCardRect` fixed slots (think/tool/skill/result/chat); `fineCardLayout` lays out N cards left→right and wraps when exceeding width; `cardWire` returns an in-order Manhattan path between two rects.

**Visual (tmux):** replay a session — cards render boxed with box→box wires; counts climb live; comet hops box→box; NOW shows the full action; VITALS reflect status/tempo/success/agents/progress; `i` switches overview⇄fine (tool explodes, wraps); subagent rows; commit bloom / branch spark; idle standby. `-e` frame-diff for animation.

## Out of scope (YAGNI)
- No card drag/zoom/scroll interactions; fine view wraps, it doesn't pan.
- No new milestone types; no RECENT ticker (bloom/spark on cards suffices).
- No ctx%/cost in VITALS (Header owns those).
- Coarse fine-grain back-edge arcs only for the live trail, not a full static fine backbone.

## Files

| File | Change |
|------|--------|
| `src/core/pipeline.ts` | grain mapper `nodeKindOf` + `Grain` + canonical `rankOf`; keep `PipeKind`/`slotOf`; remove orphaned `buildPipeline`/`edgeVisible`/types |
| `src/core/pipeline-flow.ts` | grain-aware `deriveFlow`; live `counts`/`ok`/`err` on `LaneFlow` |
| `src/core/pipeline-geometry.ts` | card rects (coarse fixed + fine wrapping) + `cardWire` router |
| `src/ui/panels/Lens.tsx` | rewrite: boxed cards, HUD band, two grains, live counts, vitals |
| `src/ui/Showcase.tsx` | drop `full` from `<Lens>` |
| `src/ui/App.tsx` | `infoOn` default → false |
| `tests/pipeline.test.ts` · `tests/pipeline-flow.test.ts` · `tests/pipeline-geometry.test.ts` | extend for grains, live counts, card layout |
