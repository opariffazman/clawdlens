# ClawdLens — Lens pipes & vertical expand

**Fourth Lens spec.** Refines the n8n boxed-card HUD (`…-lens-hud-design.md`, on `feat/lens-panel` / PR #8). Three problems to fix:

1. **Confusing wires.** Forward connectors are a single straight line at card-content height, so they read as one line threading *through* the boxes rather than discrete connections.
2. **The "weird blue incomplete box."** The loop-back edge (`result→think`) is drawn with *top* corners (`╭───╮`) on one row below the cards — it reads as an orphaned box-top, not a pipe.
3. **Horizontal fine expand is unclear.** When `i` explodes `tool` into per-action cards, a wrapping left→right strip doesn't show *which* node expanded.

## Goals

- **Dedicated port-routed pipes** — each edge is its own routed pipe attaching at card ports with an arrowhead, resembling a proper pipeline flow.
- **Clean U-return loop pipe** — `result→think` becomes a real return pipe in its own channel below the cards.
- **Vertical tool expand** — `i` explodes the `tool` card *downward* into a vertical stack of its action cards, so the expanded node is obvious. Built generically so `skill` can reuse it later (issue #9).

Transparent canvas; cards/pipes are border glyphs with transparent interiors.

## 1. Ports + dedicated pipes

Each card has connection **ports** at its vertical mid-row: a left input port and a right output port; and bottom/top ports for vertical pipes. Pipes attach at ports and carry an arrowhead at the destination, so each connection reads as a discrete pipe — never a single line crossing through a card body.

Pipe routers (pure, in `pipeline-geometry.ts`), each returning ordered `Cell[]` (the comet rides these; the renderer colors them):

- **`pipeForward(a: Rect, b: Rect): Cell[]`** — adjacent same-row cards: horizontal run on the mid-row from a's right edge to b's left edge, terminating in `▶` at b's left port. (think→tool, tool→result, result→chat.)
- **`pipeReturn(a: Rect, b: Rect, channelY: number): Cell[]`** — loop-back (b left of a, same row): drop from a's bottom port (`│`) to `channelY`, corner `╯`, run left, corner `╰`, rise into b's bottom port, terminating in a `◀` arrowhead near b. A proper U. `channelY` is supplied by the renderer (a dedicated channel row below the card block); multiple back-edges get successive channels.
- **`pipeBranch(parent: Rect, children: Rect[]): Cell[]`** — vertical tree from the parent's bottom port down a trunk, with a tee (`├`/`└`) into each child's top port. Used for the tool expansion (and future skill expansion).

The old `cardWire` (single midline line + top-corner back-arc) is removed.

## 2. Loop-back U-return pipe

`result→think` (and any data-driven back-edge on the live trail) is drawn via `pipeReturn` on a dedicated channel row below the whole card block. Bottom corners (`╰╯`) + drops form a clean U with a `◀` arrowhead into the target — replacing the confusing top-corner box. Forward edges stay on the mid-row; back-edges live in the lower channel(s); the two never overlap.

## 3. Vertical tool expand (`i`)

The main pipeline is **always coarse**: `think → tool → result → chat` cards (+ `skill` card when active), port-routed. `i` toggles the **tool expansion** — it does not regrain the whole graph.

When `infoOn`:
- The `tool` card's per-action **children** (bash / edit / read / search / web / task / todo …) render as cards stacked **vertically below** the tool card, ordered by `rankOf`, joined by a `pipeBranch` tree from tool's bottom port.
- Each child card shows its live count from `toolBreakdown`; the parent `tool` card keeps its aggregate count.
- The **active** child (when the current beat is a tool of that action) highlights (breathing border) and its branch limb lights; the comet into `tool` plus the lit limb convey "tool → this action".
- Children capped (e.g. top 6 by count), with a `+N more` row. When `infoOn` is off, no children render.

This supersedes the HUD-5 horizontal wrapping fine strip. The vertical-expand layout + `pipeBranch` are written generically (parent rect + child kinds → child rects) so the `skill` stage can expand identically in a later spec (issue #9).

## 4. Bloom polish

Milestone bloom/spark is centered on its card with a capped radius so the `✦✧`/`*` glyphs stay near the node and don't splatter onto the pipes/channel.

## Layout / vertical fill

`think/tool/result/chat` on the top card row; `skill` card below `tool` (coarse). With `i`, the tool children stack below tool (pushing the effective content bottom down). Subagent lane rows and the HUD band are placed below the **actual** content bottom (computed from all rendered rects, as today's `cardsBottom`), with the HUD band still anchored toward the panel bottom. The return-pipe channel sits between the card block and the sublanes/HUD.

## Architecture

### Pure (TDD)
- **`src/core/pipeline-flow.ts`**: add to the main `LaneFlow`: `toolBreakdown: Record<string, number>` — live counts of `tool` beats keyed by `iconKey` over the revealed window (cursor-synced) — and `activeTool: string | null` — the head beat's `iconKey` when the head is a `tool` beat (regardless of `ok`), else null, so the expansion can highlight the correct child even after the tool completes (when `activeKind` is `"result"`). `activeKind`/`trail`/`counts`/`ok`/`err` unchanged. The `grain` param + `nodeKindOf`/`rankOf` stay (the panel calls `deriveFlow` coarse; `rankOf` orders the expand children).
- **`src/core/pipeline-geometry.ts`**: add `pipeForward`, `pipeReturn`, `pipeBranch`, and `expandStack(parentRect, n): Rect[]` (n child rects stacked below the parent). Keep `coarseCardRect`, `Rect`, `Cell`, consts. **Remove `cardWire`.**

### UI
- **`src/ui/panels/Lens.tsx`**: render cards with ports; forward pipes via `pipeForward`; loop-back via `pipeReturn` in a dedicated channel; when `infoOn`, render the tool children stack via `expandStack` + `pipeBranch`; comet rides the active pipe; place sublanes + HUD below the real content bottom; centered/capped bloom.
- **`src/ui/Showcase.tsx`** / **`src/ui/App.tsx`**: unchanged props (the `infoOn` toggle already exists; it now drives the tool expansion).

### Icons / colors
Action child icons via `iconFor(iconKey)`; child lane color stable per action (by `rankOf` or a fixed map). Coarse card colors unchanged.

## Testing

**Pure (`bun:test`):**
- `pipeForward`: horizontal cells on the mid-row strictly between the two card edges; last cell is `▶` at the target port.
- `pipeReturn`: cells drop below to `channelY`, include bottom corners (`╰`/`╯`) and a `◀`; the horizontal run is on `channelY`; path is connected source→target.
- `pipeBranch`: trunk from parent bottom + a tee into each child's top; connected; n children → n limbs.
- `expandStack`: n rects stacked below the parent, non-overlapping, increasing y.
- `deriveFlow.toolBreakdown`: tool beats counted by `iconKey`, cursor-synced (climbs/rewinds); non-tool beats excluded; coarse `counts["tool"]` still the aggregate.

**Visual (tmux):** cards show ports + discrete arrowheaded pipes; the loop-back is a clean U below (no box-top); `i` stacks the tool's action cards vertically under tool with a branch tree; counts live; comet/bloom/idle still work. `-e` frame-diff for animation.

## Out of scope (YAGNI)
- Skill-stage vertical expand → issue #9 (mechanism is built generically here, not wired for skill).
- No curved/bezier pipes (Manhattan only); no pan/scroll; no drag.
- No change to milestone detection, vitals, or subagent-lane data.

## Files

| File | Change |
|------|--------|
| `src/core/pipeline-flow.ts` | add `toolBreakdown` + `activeTool` to main `LaneFlow` |
| `src/core/pipeline-geometry.ts` | add `pipeForward`/`pipeReturn`/`pipeBranch`/`expandStack`; remove `cardWire` + `fineCardLayout` |
| `src/ui/panels/Lens.tsx` | ports + dedicated pipes + U-return + vertical tool expand + capped bloom |
| `tests/pipeline-geometry.test.ts` · `tests/pipeline-flow.test.ts` | new pipe/expand/toolBreakdown tests; drop `cardWire`/`fineCardLayout` tests |
