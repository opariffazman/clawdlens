# ClawdLens — Lens enrichment: stacked context bands

**Sixth Lens spec.** Builds on the full-width pipeline + rail work (`2026-06-09-clawdlens-lens-fullwidth-skill-expand-design.md`). The default Lens occupies one thin band in a lot of empty canvas. Fill the vertical space with four context bands that turn the panel into a live "mission control" for one session — all from data the reducer already produces, no new I/O.

The four bands: **phase ribbon** (top), **skill & agent timeline** (below the pipeline), **activity heartbeat**, and a **token economy line**.

## Principles

- **One shared timeline.** Every band derives from the revealed beat window and reveals in lockstep with the cursor (`progress = cursor/total`), like the rest of the panel. Fast-forward grows the bands; they finish together.
- **No new I/O.** All data comes from `presented` (the player's full beat array), `cursor`, and the session's `tokens` — already in hand.
- **Transparent canvas.** Bands are glyphs on the inherited background; no bg fills.
- **Self-hiding + graceful degradation.** A band with no data hides and reclaims its rows. On short terminals bands drop in priority order so the pipeline + HUD always survive.

## Layout

Top→bottom, phase ribbon anchored at the top and the NOW HUD anchored at the bottom, the rest distributed between:

```
phase ribbon        (1 row, hidden on non-superpowers sessions)
pipeline            (existing: rail + cards + skill branch + expand stacks)
skill/agent timeline(3–4 rows: skills lane, agents lane, axis+playhead)
activity heartbeat  (1 row + tiny legend)
economy line        (1 row)
NOW HUD             (existing, 4 rows, bottom-anchored)
```

The pipeline is no longer vertically centered with large empty margins; instead the bands fill from the top and bottom toward the middle. **Drop order when height is tight:** economy → heartbeat → timeline (each removed if the remaining content wouldn't fit above the HUD). The phase ribbon, pipeline, and HUD always render.

## Data derivation (pure)

All band data derives from `presented` + `cursor`:
- **Axis range** for the time-based bands: `startTs = presented[0].ts`, `endTs = presented.at(-1).ts`. The **playhead** is at `cursorTs = presented[cursor-1].ts` (clamped). Counts/spans are revealed only up to `cursorTs`.
- `src/core/lens.ts` is refactored so the per-beat detection works on a beat slice: extract **`detectLensFromBeats(beats: Beat[]): LensState`** (current `detectLens(s)` becomes `detectLensFromBeats(s.beats)`). The bands call it on the revealed slice so phases/skill groups reveal in sync. `SUPERPOWERS_PHASES` and the existing detection are unchanged.

### 1. Phase ribbon (top)
- Source: `detectLensFromBeats(revealed)` → `lensId`, `activePhase`, `phaseHistory`.
- Render: a stepper over `SUPERPOWERS_PHASES` = `Brainstorm · Spec · Plan · Execute · Review · Ship`, joined by `─`. Each phase: **done** (`✓`, in `phaseHistory`, dim), **active** (`●`, `=== activePhase`, lit; breathing while animating), **future** (`○`, dim).
- **Fallback:** when `lensId !== "superpowers"` (empty `phaseHistory` — e.g. a custom-skill or ad-hoc session) the ribbon **hides** and reclaims its row.

### 2. Skill & agent timeline (below pipeline)
A wall-clock swimlane over `[startTs..endTs]`, revealed up to `cursorTs`. New pure fn **`lensTimeline(beats, cursor)`** → `{ range:{startTs,endTs,cursorTs}, skills: Span[], agents: Span[], milestones: {ts, kind}[] }` where `Span = { label, startTs, endTs, key }`:
- **skills lane:** one span per `skillGroups` entry; `startTs = group.ts`, `endTs = next group.ts` (last group → `cursorTs`/`endTs`). Includes custom skills (`bootcamp-quiz`, `bootcamp-session`) — they appear here even with no superpowers phases.
- **agents lane:** one span per subagent — a `Task` beat (label `Task · …`, `toolUseId` = lane id) opens it; it closes when that tool's result lands (`ok` defined) else stays open to `cursorTs`. Labelled by subagent type.
- **milestones:** `commit`/`branch` milestone beats → `◆` ticks on the axis.
- Render: a pure x-mapping `tsToX(ts, range, width)`; bars are run glyphs (`▓`/`━`) clipped to `cursorTs`; a label inside/left of each bar (clipped); the axis row carries the `▲` playhead at `cursorTs` and milestone `◆`. Each lane is one row; if both lanes empty, the band hides.

### 3. Activity heartbeat (rhythm)
New pure fn **`heartbeatBuckets(beats, cursor, width)`** → `Bucket[]` of length ≈ width over the **full** `[startTs..endTs]` axis; each bucket counts beats whose `ts` falls in it **and** index < cursor (so it fills left→right on reveal). `Bucket = { count, kind }` where `kind` is the bucket's dominant beat kind.
- Render: one row of sparkline blocks `▁▂▃▅▇█` scaled by `count / maxCount`, each tinted by its dominant `kind` (think/tool/skill/chat lane colors); a small inline legend. Empty buckets render as a faint baseline `·`.

### 4. Economy line (token breakdown)
New pure fn **`economyView(tokens)`** → formatted parts. Source: the **full-session** `tokens` (a new `tokens` prop on the panel, fed from `agg.tokens` in Showcase — the whole-session fold, like the Files/Tasks panels) — aggregate, not cursor-synced (the header already counts ctx%/cost up with the cursor; this band shows the breakdown the header omits).
- Render one line: `↑ in <k>   ↓ out <k>   ⟳ cache <pct>%   ◉ web <n>   $<cost>` where `cache% = cacheRead / (cacheRead + cacheCreate + input)`. Uses the existing `format.ts` humanized number/cost helpers.

## Architecture / files

- **`src/core/lens.ts`** — extract `detectLensFromBeats(beats)`; keep `detectLens(s)` as a thin wrapper. No behavior change.
- **`src/core/lens-bands.ts`** (new, pure/TDD) — `lensTimeline(beats, cursor)`, `heartbeatBuckets(beats, cursor, width)`, `economyView(tokens)`, and the `tsToX`/range helpers. Ribbon state needs no new fn (reads `LensState`).
- **`src/ui/panels/lens/draw.ts`** (new) — extract the shared buffer primitives (`put`, `drawStr`, `clip`, `laneHexOf`, the lane-color map) currently inline in `Lens.tsx`, so both the pipeline and the band renderers share them.
- **`src/ui/panels/lens/phaseRibbon.ts` · `skillTimeline.ts` · `heartbeat.ts` · `economy.ts`** (new) — one `draw…(buffer, data, rect, theme, anim)` per band. Each is a focused unit: takes its band data + a target rect, draws into the buffer.
- **`src/ui/panels/Lens.tsx`** — composes the bands: compute the zone rects (top ribbon, pipeline block, bottom bands above the HUD), derive each band's data from `presented`/`cursor`/`tokens`, call the band renderers, apply the drop-order when height is tight. The pipeline rendering itself is unchanged (just no longer force-centered).
- **`src/ui/Showcase.tsx`** — pass the session `tokens` to `<Lens>` (one new prop).

## Testing

**Pure (`bun:test`):**
- `detectLensFromBeats`: same results as `detectLens` over a beat list (refactor parity); phases/skillGroups over a partial slice reflect only those beats.
- `lensTimeline`: skill spans abut (group end = next start; last = cursorTs); agent span closes on result vs stays open; spans/milestones clipped to cursorTs; non-overlapping rows.
- `tsToX`: maps startTs→0, endTs→width-1, monotonic; safe when startTs===endTs (degenerate single-beat session).
- `heartbeatBuckets`: bucket count ≈ width; only beats with index < cursor counted; dominant kind per bucket; empty buckets count 0.
- `economyView`: cache% math, humanized in/out/cost, web count; zero/empty tokens → sane "0".

**Visual (tmux):** a superpowers session shows the phase ribbon advancing on fast-forward; a non-superpowers (bootcamp) session hides the ribbon but shows its skills in the timeline; heartbeat fills left→right with the cursor; economy line correct; bands drop in order at small heights; `-e` frame-diff confirms the playhead/animation still run.

## Out of scope (YAGNI)
- No per-band on/off toggles or config (always on; auto-hide on empty).
- No horizontal scroll/zoom on the timeline; Manhattan glyphs only.
- No new data sources; no real-time clock independent of beats.
- Economy stays aggregate (no per-beat cache/in-out snapshots) — only the header's ctx/cost are cursor-synced.

## Files

| File | Change |
|------|--------|
| `src/core/lens.ts` | extract `detectLensFromBeats(beats)` |
| `src/core/lens-bands.ts` | new: `lensTimeline`, `heartbeatBuckets`, `economyView`, `tsToX` |
| `src/ui/panels/lens/draw.ts` | new: shared `put`/`drawStr`/`clip`/`laneHexOf` |
| `src/ui/panels/lens/{phaseRibbon,skillTimeline,heartbeat,economy}.ts` | new: per-band renderers |
| `src/ui/panels/Lens.tsx` | zone layout + compose bands; pipeline no longer force-centered |
| `src/ui/Showcase.tsx` | pass `tokens` prop |
| `tests/lens-bands.test.ts` · `tests/lens.test.ts` | new band tests + `detectLensFromBeats` parity |
