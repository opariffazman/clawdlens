import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { buildPipeline, edgeVisible, type PipeKind, type PipeNode } from "../../core/pipeline";
import type { Beat, BeatKind, SessionState } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulseIntensity, lerpHex } from "../anim";

interface Props {
  full: SessionState | null;   // whole-session fold (aggregate source)
  presented: Beat[];           // paced beats (for the cursor flare)
  cursor: number;
  pulse: boolean;
  width: number;
  height: number;
}

const LEFT = 2;
const TOP = 1;
const COL_GAP = 14; // cells between stage columns (fits "◍ result" + arrow + stat)
const ROW_GAP = 4;  // vertical block per stage row (row0 spine vs row1 skill)
const TAIL = 4;     // energy tail length
const BARS = "▁▂▃▄▅▆▇█";

const PIPE_OF: Partial<Record<BeatKind, PipeKind>> = {
  thinking: "think", text: "chat", skill: "skill", tool: "tool",
};

function xOf(col: number) { return LEFT + col * COL_GAP; }
function laneOf(col: number) { return theme.laneColors[col % theme.laneColors.length]!; }
function frac(n: number, max: number) { return max > 0 ? n / max : 0; }

function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, width: number) {
  for (let i = 0; i < str.length; i++) {
    const xi = x + i;
    if (xi < 0) continue;
    if (xi >= width) break;
    buf.setCell(xi, y, str[i]!, fg, TRANSPARENT);
  }
}
function barChar(f: number) {
  return BARS[Math.max(0, Math.min(BARS.length - 1, Math.round(f * (BARS.length - 1))))]!;
}

type Cell = { x: number; y: number; ch: string };

// one energy dot riding a run of cells; dir +1 = toward end, -1 = toward start
function energyRun(
  buf: OptimizedBuffer, cells: Cell[], weight: number, maxWeight: number,
  laneHex: string, animating: boolean, now: number, restBoost: number, dir: 1 | -1,
  width: number, height: number,
) {
  const n = cells.length;
  if (n === 0) return;
  const wf = frac(weight, maxWeight);
  const rest = Math.min(1, 0.22 + 0.35 * wf + restBoost);
  const span = n + TAIL;
  const head = animating ? (now * (0.5 + 1.6 * wf)) % span : -999;
  for (let i = 0; i < n; i++) {
    const c = cells[i]!;
    if (c.x < 0 || c.x >= width || c.y < 0 || c.y >= height) continue;
    const pos = dir === 1 ? i : n - 1 - i;
    let intensity = rest;
    if (animating) {
      const d = (((head - pos) % span) + span) % span;
      intensity = Math.max(rest, pulseIntensity(d, TAIL));
    }
    buf.setCell(c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, intensity)), TRANSPARENT);
  }
}

export function Lens({ full, presented, cursor, pulse, width, height }: Props) {
  const graph = buildPipeline(full?.beats ?? []);
  if (graph.nodes.length === 0) return <text fg={theme.dim}>no activity yet</text>;

  const byKind = new Map<PipeKind, PipeNode>(graph.nodes.map((n) => [n.kind, n]));
  const colOf = (k: PipeKind) => byKind.get(k)?.col ?? 0;
  const nameAt = (col: number) =>
    graph.nodes.find((n) => n.row === 0 && n.col === col)?.kind ?? "";

  const drawn = graph.edges.filter(
    (e) => edgeVisible(e.weight, graph.maxWeight) && byKind.has(e.from) && byKind.has(e.to),
  );
  const liveKind = PIPE_OF[(presented[cursor]?.kind ?? "") as BeatKind] ?? null;
  const flareEdge =
    liveKind != null
      ? drawn.filter((e) => e.to === liveKind).sort((a, b) => b.weight - a.weight)[0]
      : undefined;

  const spineCols = graph.nodes.filter((n) => n.row === 0).map((n) => n.col).sort((a, b) => a - b);
  const animating = pulse;

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animating}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = (globalThis.performance?.now?.() ?? 0) / 120;

        // forward spine: one dot per gap between adjacent present row-0 columns
        for (let i = 0; i + 1 < spineCols.length; i++) {
          const c0 = spineCols[i]!;
          const c1 = spineCols[i + 1]!;
          const fwd = drawn.filter(
            (e) => !e.back &&
              Math.min(colOf(e.from), colOf(e.to)) <= c0 &&
              Math.max(colOf(e.from), colOf(e.to)) >= c1,
          );
          if (fwd.length === 0) continue;
          const weight = fwd.reduce((m, e) => Math.max(m, e.weight), 0);
          const start = xOf(c0) + 2 + nameAt(c0).length + 1;
          const end = xOf(c1) - 1;
          if (end <= start) continue;
          const cells: Cell[] = [];
          for (let x = start; x < end; x++) cells.push({ x, y: TOP, ch: "─" });
          cells.push({ x: end, y: TOP, ch: "▶" });
          const boost = fwd.some((e) => e === flareEdge) ? 0.45 : 0;
          energyRun(buffer, cells, weight, graph.maxWeight, laneOf(c0), animating, now, boost, 1, width, height);
        }

        // back-edge arcs: top 2 by weight, stacked on rows below the row-0 stats
        const backs = drawn.filter((e) => e.back).sort((a, b) => b.weight - a.weight).slice(0, 2);
        backs.forEach((e, idx) => {
          const xa = xOf(Math.min(colOf(e.from), colOf(e.to)));
          const xb = xOf(Math.max(colOf(e.from), colOf(e.to)));
          const yArc = TOP + 2 + idx;
          if (yArc >= height || xb <= xa) return;
          const cells: Cell[] = [{ x: xb, y: yArc, ch: "╯" }];
          for (let x = xb - 1; x > xa; x--) cells.push({ x, y: yArc, ch: "─" });
          cells.push({ x: xa, y: yArc, ch: "◂" });
          const boost = e === flareEdge ? 0.45 : 0;
          energyRun(buffer, cells, e.weight, graph.maxWeight, laneOf(colOf(e.to)), animating, now, boost, -1, width, height);
        });

        // skill branch: vertical feeder from the row-1 skill node up into the spine
        const skill = byKind.get("skill");
        if (skill) {
          const x = xOf(skill.col);
          const yMid = TOP + ROW_GAP;
          const cells: Cell[] = [];
          for (let y = yMid - 1; y > TOP; y--) cells.push({ x, y, ch: "│" });
          cells.push({ x, y: TOP, ch: "┴" });
          const w = drawn
            .filter((e) => e.from === "skill" || e.to === "skill")
            .reduce((m, e) => Math.max(m, e.weight), 0);
          energyRun(buffer, cells, w, graph.maxWeight, laneOf(skill.col), animating, now, 0, -1, width, height);
        }

        // nodes + labels + stats
        for (const n of graph.nodes) {
          const x = xOf(n.col);
          const yGlyph = TOP + n.row * ROW_GAP;
          const yStat = yGlyph + 1;
          if (x >= width || yGlyph >= height) continue;
          const focused = n.kind === liveKind;
          const glyph = focused ? "◉" : n.count > 1 ? "◍" : "○";
          buffer.setCell(x, yGlyph, glyph, RGBA.fromHex(laneOf(n.col)), TRANSPARENT);
          drawStr(buffer, x + 2, yGlyph, n.kind, RGBA.fromHex(focused ? theme.accent : theme.fg), width);

          if (yStat >= height) continue;
          let cx = x + 2;
          const cnt = `×${n.count} `;
          drawStr(buffer, cx, yStat, cnt, RGBA.fromHex(theme.dim), width);
          cx += cnt.length;
          if (cx < width) buffer.setCell(cx, yStat, barChar(frac(n.count, graph.maxCount)), RGBA.fromHex(laneOf(n.col)), TRANSPARENT);
          cx += 2;
          if (n.kind === "result") {
            if ((n.ok ?? 0) > 0) { const s = `✓${n.ok} `; drawStr(buffer, cx, yStat, s, RGBA.fromHex(theme.ok), width); cx += s.length; }
            if ((n.err ?? 0) > 0) { const s = `✗${n.err}`; drawStr(buffer, cx, yStat, s, RGBA.fromHex(theme.err), width); }
          }
        }
      }}
    />
  );
}
