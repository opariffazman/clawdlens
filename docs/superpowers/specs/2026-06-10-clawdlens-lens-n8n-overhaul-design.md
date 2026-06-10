# Lens n8n Overhaul — Design

**Date:** 2026-06-10
**Status:** approved
**Goal:** Remodel the Lens panel to look and move like the n8n workflow-editor canvas: big centered icons in boxy nodes, names below boxes, branch-like wires (straight + dashed + rounded curves), and n8n's modern execution motion (orbiting ring on the active node, persistent green trail).

## Research grounding

Findings verified against the real n8n editor (live template-page embeds, 9 screenshots in `.research/n8n/`, gitignored) and n8n's open-source frontend (`packages/frontend/editor-ui/src/features/workflows/canvas`, master @ v2.26):

- **Node** = exact 96×96 square, ~8px corners, 1.5px border; ONE large centered icon (~42% of node width); **name renders BELOW the box** (absolute `top:100%`), muted subtitle under it. Status badges (✓ success, red error, yellow dirty) sit **inside the bottom-right corner**.
- **Trigger node** = half-pill: `border-radius: 36px 8px 8px 36px` (strongly rounded LEFT edge); filled orange **lightning bolt floats OUTSIDE the left edge**.
- **AI Agent root** = wide node (256×96, icon+name inside); **diamond ports on the bottom edge**; **dashed wires (`strokeDasharray '5,6'`, no arrowheads) drop to circular 80×80 sub-nodes** (Chat Model/Memory/Tool), each with a diamond port on top. Dashed = exactly "every non-main connection type".
- **Wires**: 2px bezier, **straight when nodes aligned**; filled-triangle arrowhead into the target's input circle (main connections only); **backward connections switch to smoothstep rounded elbows (borderRadius 16) routed below the row**; branch labels (`true`/`false`) at the source port; **item-count labels ("5 items") at the wire midpoint, persisting after the run**.
- **Motion**: n8n **removed wire animation** (PR #11446, Oct 2024). All motion is on the active node: border goes transparent and a **rotating conic-gradient ring in coral `#FF6D5A`** orbits it — 1.5s/rev running, **4.5s/rev waiting**. Executed wires turn green (`--color--success`) **and stay green**. Success = green ✓ badge bottom-right (+ run count if >1); error = red border + red badge; disabled = strikethrough.
- **Colors**: canvas ~#171717 (dark) + dot grid, node bg #2b2b2b, border white@15%, accent coral #FF6D5A, success green, resting wires gray ~#b1b1b7 (light theme).

## Decisions (user-confirmed)

1. **Icon scale:** hand-crafted **block-art icons** (~7×3 cells) inside 7-row boxes; auto-fallback to single glyph at short heights.
2. **Topology:** **full n8n grammar** — trigger half-pill (the user prompt) + 4 stage squares; skills AND live subagents hang below tool as round sub-nodes on dashed wires with ◇ diamond ports; port dots, ▶ arrowheads, ×count wire labels.
3. **Motion:** **faithful modern n8n** — orbiting ring on the active node, green persistent trail, ✓ corner badges. No wire comet.
4. **Accent:** **n8n coral `#FF6D5A`** for ring/bolt/active states. Stage lane colors keep coloring icons/labels; cyan stays in the rest of the app.
5. **Curves:** **rounded + tree fan** — all corners `╭╮╰╯` (smoothstep read); backward loop = rounded U below the row; sub-nodes fan from the ◇ port like tree branches; the aligned main row stays straight (n8n is straight when aligned).

## Design

### Node anatomy

- **Stage node**: sharp box `┌┐└┘`, **7 rows × 13 cols** (≈ visually square at the terminal's ~2:1 cell aspect). Interior: 7×3-cell block-art icon centered, blank padding rows above/below. Icon drawn in the stage's lane color; built ONLY from 1-cell block glyphs (`▀▄█▌▐▖▗▘▝` etc.) — no wide/emoji glyphs (tmux ghosting gotcha).
- **Name below the box** (centered, `fg`), **detail line under the name** (dim): e.g. `tool` / `bash ×42`. The box interior holds nothing but the icon.
- **Ports on the border**: `○` replaces the mid-left border cell (input), `●` the mid-right (output).
- **Corner badges** (bottom-right border cell, inside-corner): green `✓` when the stage has completed runs; red `✗` when the last run failed (with red border).
- **Trigger node** (user prompt): `╭`/`╰` rounded left corners, `┐`/`┘` square right; coral `⚡` 1 cell outside-left at mid-height. Name `prompt`, detail `×N turns`. No input port.
- **Sub-node**: 5×3 rounded mini-box (`╭───╮ │ ✦ │ ╰───╯`, circle read), glyph centered, **name centered below**, `◇` top-border port. Live agents breathe their glyph; finished sub-nodes dim.

### Topology & layout

```
 ⚡╭───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐
  │    ▄▄▄     │    │    ███    │    │   ▄███▄   │    │    ▄ ▄    │    │   ▄▄▄▄    │
  │   █████    ●──▶○    ▐█▌     ●──▶○   █▄█▄█    ●──▶○    ▀▄▀     ●──▶○   █▄▄█    │
  │    ▀▀▀     │    │    ▀▀▀    │    │    ▀▀▀   ✓│    │     ▀     │    │   ▀  ▀    │
  ╰───────────┘    └─────◇─────┘    └───────────┘    └───────────┘    └───────────┘
     prompt          think       ×42     tool       ×40    result            chat
     ×3 turns        ×12       (in wire)  ×42     (in wire)  ✓40/✗2           ×9
                                          ┆
                                      ╭┄┄┄┴┄┄┄╮
                                      ┆       ┆
                                    ╭───╮   ╭───╮
                                    │ ✦ │   │ ◆ │
                                    ╰───╯   ╰───╯
                                 brainstorm  explore
                                    ×2       (live)
```

- **Main row**: trigger + think → tool → result → chat, justified across the panel width (evolves `coarseLayout`); block vertically centered between ribbon and bands as today.
- **Sub-row** hangs under **tool** (n8n AI-Agent cluster): `◇` port(s) on tool's bottom border; **dashed trunk + rounded tree fan** (`╭┄┄┼┄┄╮`) splitting to each sub-node's top `◇`; no arrowheads. Default occupants: most-recent **skill** + **live agents** (replaces today's text sub-lanes). `i` toggles the sub-row to **tool breakdown** circles (bash/edit/read… with `×n` below, `+N more` tail) — replaces today's text expand stacks. Sub-node capacity: as many as fit at a ~16-col pitch centered under tool, `+N more` text tail for the rest.
- The old skill card, expand stacks, and agent text rows are removed; their information lives in the sub-row.
- **Width ladder**: full (block-art 13-col boxes, trigger, wire labels) → drop wire labels → drop trigger node → shrink boxes to 9 cols.
- **Height ladder**: 7-row art boxes → 5-row single-glyph boxes (name still below) → existing band-drop order (economy → heartbeat → timeline → ribbon → sub-row), preserving the never-overlap-HUD invariant.
- **Kept zones, untouched logic**: phase ribbon, economy, heartbeat, skill timeline, HUD band (HUD text cosmetics only). Transparent canvas throughout — no background paint anywhere.

### Wires

- **Forward (aligned)**: straight `●────▶○` at box mid-height. **`×N` count label embedded in the wire at its midpoint** (dim text replacing wire cells: `●──×42──▶○`), persists — n8n item-count pills. Dropped first by the width ladder. (No more bus rail above the cards.)
- **Backward loop** (e.g. chat/result → think): rounded U routed **below the row** — `╰` down, solid `─` run, `╭` up, `▶` into the input port. Suppressed when the sub-row occupies that space or it would reach the bottom bands (same suppression rules as today).
- **Trail colors (adapted persistent-green)**: hops traversed this session = **dim green**; the most recent hop = **bright green**; never-traversed = `wireDim` gray. Errors tint the latest hop red. Dashed sub-wires stay dim gray always (n8n: AI wires never animate, never arrowheaded).

### Motion & states

- **Orbiting ring**: the active stage's border cells ordered clockwise; an arc of ~25% of the perimeter rendered in coral `#FF6D5A`, the rest of the border blended toward coral@20%; arc offset advances continuously at **1.5s/rev**. Runs only while `animate` (same shouldAnimate gate as today); parked = static lane-colored border.
- **`waiting` status**: ring relocates to the **chat** box at **4.5s/rev** (n8n waiting = same ring, 3× slower).
- **`error`**: ring stops; active box border + corner badge red.
- **`idle`/`dormant`**: no ring, everything dim.
- **Milestone bursts** (commit/branch) kept as-is on the active box.
- Live agent sub-nodes get a subtle breathe on their glyph while open.

### Architecture (pure-core-first, TDD)

| Module | Change |
|---|---|
| `src/core/pipeline-geometry.ts` | Rewrite: `nodeLayout(width, top, mode)` (7-row art / 5-row glyph boxes, optional trigger, width ladder), `subRowLayout()`, straight/rounded-U/tree-fan wire routers, `ringPerimeter(rect) → ordered border cells`, port/badge cell helpers. Pure; failing tests first. |
| `src/ui/panels/lens/iconArt.ts` | NEW: 13 hand-crafted 7×3 block-art glyphs (12 `IconKey`s + `prompt`); test asserts exact dimensions and 1-cell-wide glyph usage. |
| `src/core/pipeline-flow.ts` | Additive: per-hop traversal counts + recency (drive the `×N` wire labels and the green trail), user-turn count for the trigger detail. Parse/reducer untouched. |
| `src/ui/panels/Lens.tsx` | Render rewrite: boxes, ports, badges, straight/curved wires, ring, sub-row, ladders. Zone/HUD/band composition logic reused. |
| `src/ui/theme.ts` | Add `coral: "#FF6D5A"`. |

Untouched: parse, reducer, store, player (ONE shared cursor still drives reveal), Flow/Files/Tasks/Git panels, keys.

### Testing

- Geometry, ring ordering, ladders, trail recency: `bun:test` unit tests (TDD).
- Icon art: dimension + glyph-safety tests.
- Visual: tmux capture frames at 150×36, 100×30, 80×24 (ladder checks); `-e` frame-diff for ring motion; `CL_ICONS=unicode` pass.

### Out of scope

- Other panels (Flow keeps its metro look), sticky-note phase grouping (ribbon already covers phases; bg paint forbidden by the transparency rule), n8n minimap, `+` add-node affordances (read-only observer), edge-hover toolbars.
