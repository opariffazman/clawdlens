# ClawdLens — Lens full-width pipeline + skill-stage expand (#9)

**Fifth Lens spec.** Builds directly on the pipes/vertical-expand work (`2026-06-07-clawdlens-lens-pipes-design.md`, PR #8). Three coupled changes that together make the Lens read like a real CI/CD pipeline on a full-width terminal:

1. **Responsive full-width layout.** The card row was sized for a narrow (mobile) `$COLUMNS` — cards cluster in the top-left ~50 cols and waste the rest. Make the layout fill the available width and vertical space.
2. **Pipes outside the boxes.** Forward connectors sit on the card content row with cards jammed adjacent, so the middle row reads as one band threading *through* the boxes. Spread the cards so connectors become long arrows in clear gaps.
3. **Skill-stage vertical expand (issue #9).** Apply the `tool` expand mechanism to `skill`: on `i`, the skill card explodes into a stack of per-skill children, exactly as `tool` explodes into per-action children.

Transparent canvas throughout; cards/pipes are border glyphs with transparent interiors. No new keys, no new props.

## Goals

- **Full-width spread.** `think · tool · result · chat` justify across the whole panel width; leftover width flows into the inter-card gaps (long connectors), not into oversized cards.
- **Vertically centered block.** The card block is centered in the region above the HUD band, eliminating the top-left clustering and the large vertical void.
- **Connectors clearly between nodes.** Long forward arrows (heavy `━`, ending in `▶`) ride the wide gaps so they detach from card content — the n8n/CI-CD node-and-connector look with real breathing room.
- **Symmetric skill expand.** `i` expands **both** the tool stack and the skill stack at once, reusing `expandStack` + `pipeBranch`.
- **Graceful narrow fallback.** When a terminal is too narrow to fit the skill sub-column plus both expand stacks side-by-side, fall back to a single-column sequential layout that can never overlap.

## 1. Responsive geometry

Replace the fixed-slot `coarseCardRect(kind)` with a width-aware layout function:

**`coarseLayout(width: number, top: number): Map<PipeKind, Rect>`** (pure, in `pipeline-geometry.ts`).

- Four top-row columns in flow order: `think (0) → tool (1) → result (2) → chat (3)`, all on row `top`.
- **Card width capped, gaps absorb slack.** `cardW = clamp(MIN_CARD_W, floor(usable * 0.16), MAX_CARD_W)` with `MIN_CARD_W = 11`, `MAX_CARD_W = 18`, `usable = width - LEFT - RIGHT_PAD`. `gap = max(MIN_GAP, floor((usable - 4*cardW) / 3))`, `MIN_GAP = 4`. Capping the card and dumping the remainder into the 3 gaps is what produces the long connectors.
- Column `c` is placed at `x = LEFT + c * (cardW + gap)`.
- **Skill card** (when skill beats exist) sits one row below the top row at `y = top + CARD_H + ROW_GAP`, horizontally **centered in the tool→result gap**: `skill.x = tool.x + cardW + max(0, floor((gap - cardW) / 2))`, clamped so it never overruns `result.x`. It carries the same `cardW`/`CARD_H`. This keeps the skill node out from under `tool` so the two expand stacks occupy x-separated columns.

`CARD_H` stays `3` (the card content is a single count; a taller card is just more empty interior). `LEFT`, `TOP`, `CARD_H`, `ROW_GAP` consts are retained; `CARD_W`/`ARROW_GAP` become the `MIN_*`/cap constants above (or are kept as the `MIN_*` defaults).

**Vertical centering.** The panel computes `top` so the *collapsed* block (top card row + return channel) is centered in the region between the panel top and the HUD band. When `i` expands the stacks downward, the existing "sublanes + HUD placed below the real content bottom" logic continues to apply; if the expanded content would reach the HUD band, `top` is shifted up (toward `TOP`) so the stacks always have room. `coarseLayout` stays pure — it receives `top`; the panel owns the centering math.

## 2. Pipes outside the boxes

- **Forward pipes** (`pipeForward`) keep their mid-row routing but now span the fat gaps, becoming long connectors. The horizontal run switches from light `─` to **heavy `━`** so a forward pipe is visually distinct from the light `─` card borders; it still terminates in `▶` at the destination's left port. (The comet recolors these cells per-cell as today; only the base glyph changes.)
- **U-return** (`pipeReturn`) is unchanged in shape — it already lives in a dedicated channel row below the card block. It simply spans the wider layout. Forward edges on the mid-row, back-edges in the lower channel; the two never overlap.
- **Branch elbow** to the skill card uses the existing `pipeBranch` from tool's bottom port; with skill now offset right (in the tool→result gap), the branch reads as "tool spawned a skill" rather than a card stacked directly beneath.

No curved/bezier pipes — Manhattan routing only, as before.

## 3. Skill-stage expand (issue #9)

### Data (`pipeline-flow.ts`)
Add to the main `LaneFlow`, mirroring `toolBreakdown`/`activeTool`:

- **`skillBreakdown: Record<string, number>`** — live counts of `skill` beats keyed by `b.skill` (the attribution skill name; fall back to `b.label` if `skill` is unset) over the revealed window, cursor-synced (climbs/rewinds with the cursor).
- **`activeSkill: string | null`** — the head beat's skill name when `head.kind === "skill"`, else `null`, so the expansion highlights the correct child while a skill is active.

`counts["skill"]` stays the aggregate. `activeKind`/`trail`/`counts`/`ok`/`err`/`toolBreakdown`/`activeTool` unchanged.

### Layout / render (`Lens.tsx`)
- The skill card renders whenever `skillBreakdown` is non-empty — **regardless of `i`** (today it is hidden when `i` is on; that special-case is removed now that skill has its own column).
- The skill column gets a **distinct lane hue** (not tool's purple) so it's visually separable — e.g. a `laneColors` index dedicated to skill rather than sharing tool's `col 1`.
- On `i` (`infoOn`), **both** stacks expand simultaneously using the same `expandStack` + `pipeBranch` path:
  - tool's per-action children (`bash`/`edit`/`read`/…) stack under tool, ordered by `rankOf`, from `toolBreakdown`.
  - skill's per-skill children stack under the skill card, ordered by `rankOf` (then count), from `skillBreakdown`.
  - Each stack is capped at `MAX_CHILDREN` (6) with a `+N more` row; the active child (`activeTool` / `activeSkill`) breathes and its branch limb lights.
- The wide full-width tool→result gap guarantees tool's stack (anchored at tool.x) and skill's stack (anchored at the skill sub-column) never x-overlap.

### Narrow-width fallback
Below a width threshold (when the skill sub-column can't fit in the tool→result gap with clearance for both stacks), fall back to the pre-#8 single-column placement: the skill card sits directly under tool, and on `i` the **skill stack renders below the tool stack in one column** (sequential, never overlapping). The threshold is derived from `gap` vs `cardW + child-label width`; the panel selects the layout mode and passes it to the render path. This is always correct at any width and only sacrifices the side-by-side arrangement when it genuinely can't fit.

## Architecture

### Pure (TDD)
- **`pipeline-geometry.ts`**: add `coarseLayout(width, top): Map<PipeKind, Rect>` (top-row spread + skill sub-column). Switch `pipeForward` to emit heavy `━` for the run (arrowhead `▶` unchanged). Keep `pipeReturn`, `pipeBranch`, `expandStack`, `Rect`, `Cell`. `coarseCardRect` is removed (callers use `coarseLayout`); `CARD_W`/`ARROW_GAP` fold into `MIN_CARD_W`/`MIN_GAP` + caps.
- **`pipeline-flow.ts`**: add `skillBreakdown` + `activeSkill` to `LaneFlow`. No other field changes.

### UI
- **`Lens.tsx`**: call `coarseLayout(width, top)`; compute `top` for vertical centering; render the skill card in its own column with a distinct hue; render both expand stacks on `i`; narrow-width fallback to single-column sequential. Comet/bloom/idle/HUD/sublane logic unchanged except for the new layout source.
- **`Showcase.tsx` / `App.tsx`**: unchanged (same props; `i` already wired).

### Icons / colors
Skill children via `iconFor("skill")` + the skill name label. Skill column hue stable (dedicated `laneColors` slot). Tool/coarse card colors unchanged.

## Testing

**Pure (`bun:test`):**
- `coarseLayout`: 4 top-row cards in flow order, non-overlapping, spanning toward the full width (rightmost card's right edge near `width`); gaps grow with width while `cardW` stays capped; skill rect sits one row below, between tool and result, not overrunning result.
- `pipeForward`: run is heavy `━` on the mid-row strictly between the two card edges; last cell is `▶` at the target port.
- `skillBreakdown`: skill beats counted by `b.skill`, cursor-synced (climbs/rewinds); non-skill beats excluded; `counts["skill"]` still the aggregate.
- `activeSkill`: head skill beat's name; null when head is not a skill beat.
- (Existing `pipeReturn`/`pipeBranch`/`expandStack`/`toolBreakdown`/`activeTool` tests stay green.)

**Visual (tmux):** at wide width, cards spread across the panel with long heavy arrows in the gaps and the block vertically centered; `i` explodes both tool and skill into side-by-side stacks; counts live; comet/bloom/idle/U-return still work; at narrow width, skill drops under tool and the stacks render sequentially without overlap. `-e` frame-diff for animation.

## Out of scope (YAGNI)
- Taller cards / in-card detail lines (the HUD already shows the active detail).
- Curved/bezier pipes; horizontal pan/scroll; drag.
- No change to milestone detection, vitals, subagent-lane data, or keymap.

## Files

| File | Change |
|------|--------|
| `src/core/pipeline-geometry.ts` | add `coarseLayout`; heavy-`━` `pipeForward`; remove `coarseCardRect`; fold consts |
| `src/core/pipeline-flow.ts` | add `skillBreakdown` + `activeSkill` to main `LaneFlow` |
| `src/ui/panels/Lens.tsx` | full-width layout, vertical centering, skill column + dual expand + narrow fallback |
| `tests/pipeline-geometry.test.ts` · `tests/pipeline-flow.test.ts` | `coarseLayout` fill/non-overlap; heavy forward; `skillBreakdown`/`activeSkill` |
