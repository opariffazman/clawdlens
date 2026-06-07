import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { buildPipeline, edgeVisible, type PipeKind } from "../../core/pipeline";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { nodePos, edgePath, LEFT, TOP, COL_GAP, STAGE_ROW_H } from "../../core/pipeline-geometry";
import type { Beat, IconKey, SessionState, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  full: SessionState | null;
  presented: Beat[];
  cursor: number;
  pulse: boolean;
  lastAdvanceMs: number;
  intervalMs: number;
  status: Status;
  infoOn: boolean;
  width: number;
  height: number;
}

const TRAIL_HOPS = 3;
const TAIL = 6;
const SUBLANE_Y0 = TOP + STAGE_ROW_H + 3;
const SUBLANE_H = 2;
const MAX_SUBLANES = 3;

const STAGE_ICON: Record<PipeKind, IconKey> = {
  think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text",
};
const STAGE_COL: Record<PipeKind, number> = { think: 0, tool: 1, skill: 1, result: 2, chat: 3 };

function laneHexOf(kind: PipeKind) { return theme.laneColors[STAGE_COL[kind] % theme.laneColors.length]!; }
function clip(s: string, n: number) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }

function put(buf: OptimizedBuffer, x: number, y: number, ch: string, fg: RGBA, width: number, height: number) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  buf.setCell(x, y, ch, fg, TRANSPARENT);
}
function drawStr(buf: OptimizedBuffer, x: number, y: number, str: string, fg: RGBA, width: number, height: number) {
  for (let i = 0; i < str.length; i++) put(buf, x + i, y, str[i]!, fg, width, height);
}

// burst overlay for a git milestone landing on a node
function drawBurst(buf: OptimizedBuffer, cx: number, cy: number, kind: "commit" | "branch", phase: number, laneHex: string, width: number, height: number) {
  const r = Math.round(phase * 3);
  const fade = 1 - phase;
  if (r <= 0 || fade <= 0) return;
  const col = RGBA.fromHex(lerpHex(theme.wireDim, kind === "commit" ? laneHex : theme.warn, fade));
  if (kind === "commit") {
    const ring: [number, number][] = [[r, 0], [-r, 0], [0, 1], [0, -1], [r - 1, 1], [-(r - 1), -1]];
    const glyphs = "✦✧·*";
    ring.forEach(([dx, dy], i) => put(buf, cx + dx, cy + dy, glyphs[i % glyphs.length]!, col, width, height));
  } else {
    ([[r, 0], [r, -1], [r - 1, 1], [1, -1]] as [number, number][]).forEach(([dx, dy]) => put(buf, cx + dx, cy + dy, "*", col, width, height));
    put(buf, cx + 1, cy, "+", col, width, height);
  }
}

// main lane: fading trail + comet on the current transition + highlighted active node
function drawMain(buf: OptimizedBuffer, ln: LaneFlow, phase: number, now: number, animating: boolean, tempo: number, infoOn: boolean, width: number, height: number) {
  const trail = ln.trail;
  for (let i = 0; i + 1 < trail.length; i++) {
    const from = trail[i]!, to = trail[i + 1]!;
    const cells = edgePath(from, to);
    const laneHex = laneHexOf(to);
    const isCurrent = i === trail.length - 2;
    if (isCurrent && animating) {
      const head = phase * cells.length;
      cells.forEach((c, ci) => {
        const col = cometColor(head - ci, TAIL, ln.errored ? theme.err : laneHex, theme.pulseHot, theme.wireDim, 0.15 + tempo);
        put(buf, c.x, c.y, ln.errored ? "┉" : c.ch, RGBA.fromHex(col), width, height);
      });
    } else {
      const baseI = 0.18 + 0.32 * ((i + 1) / Math.max(1, trail.length - 1));
      cells.forEach((c) => put(buf, c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, baseI)), width, height));
    }
  }
  const active = ln.activeKind;
  if (!active) return;
  const p = nodePos(active);
  const laneHex = laneHexOf(active);
  const hot = ln.errored ? theme.err : theme.pulseHot;
  const glyphCol = animating ? lerpHex(laneHex, hot, breathe(now)) : laneHex;
  put(buf, p.x, p.y, "◉", RGBA.fromHex(glyphCol), width, height);
  const icon = iconFor(ln.actionIcon ?? STAGE_ICON[active]);
  const label = infoOn && ln.detail ? `${icon} ${clip(ln.detail, Math.max(6, COL_GAP - 3))}` : `${icon} ${active}`;
  drawStr(buf, p.x + 2, p.y, label, RGBA.fromHex(ln.errored ? theme.err : theme.fg), width, height);
}

// compact one-row view of an open subagent lane
function drawSubLane(buf: OptimizedBuffer, ln: LaneFlow, y: number, now: number, animating: boolean, infoOn: boolean, width: number, height: number) {
  const taskHex = theme.laneColors[5 % theme.laneColors.length]!;
  put(buf, LEFT + 2, y, iconFor("task"), RGBA.fromHex(taskHex), width, height);
  drawStr(buf, LEFT + 4, y, clip(ln.label, 12), RGBA.fromHex(theme.dim), width, height);
  if (!ln.activeKind) return;
  const x = LEFT + 18;
  const headi = animating ? Math.floor((now / 120) % 3) : 99;
  for (let i = 0; i < 3; i++) put(buf, x + i, y, "·", RGBA.fromHex(i === headi ? laneHexOf(ln.activeKind) : theme.wireDim), width, height);
  const laneHex = laneHexOf(ln.activeKind);
  const glyph = ln.errored ? "✗" : iconFor(ln.actionIcon ?? STAGE_ICON[ln.activeKind]);
  const col = ln.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
  put(buf, x + 4, y, glyph, RGBA.fromHex(col), width, height);
  if (infoOn && ln.detail) drawStr(buf, x + 6, y, clip(ln.detail, 18), RGBA.fromHex(theme.fg), width, height);
}

export function Lens({ full, presented, cursor, pulse, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS);
  const graph = buildPipeline(full?.beats ?? []);
  if (graph.nodes.length === 0 && flow.main.activeKind === null) {
    return <text fg={theme.dim}>no activity yet</text>;
  }

  const present = new Set<PipeKind>(graph.nodes.map((n) => n.kind));
  if (flow.main.activeKind) present.add(flow.main.activeKind);
  const countOf = new Map<PipeKind, number>(graph.nodes.map((n) => [n.kind, n.count]));
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(0.4, (600 / intervalMs) * 0.2)) : 0;

        // 0. dim backbone: connect present stages (node labels are drawn on top next)
        for (const e of graph.edges) {
          if (!edgeVisible(e.weight, graph.maxWeight)) continue;
          if (!present.has(e.from) || !present.has(e.to)) continue;
          for (const c of edgePath(e.from, e.to)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
        }

        // 1. dim backdrop: every present stage + its count
        for (const kind of present) {
          const p = nodePos(kind);
          put(buffer, p.x, p.y, "○", RGBA.fromHex(theme.wireDim), width, height);
          drawStr(buffer, p.x + 2, p.y, kind, RGBA.fromHex(theme.dim), width, height);
          const cnt = countOf.get(kind);
          if (cnt) drawStr(buffer, p.x + 2, p.y + 1, `×${cnt}`, RGBA.fromHex(theme.wireDim), width, height);
        }

        // 2. main lane flow (trail + comet + active node)
        drawMain(buffer, flow.main, phase, now, animating, tempo, infoOn, width, height);

        // 3. milestone bloom/spark (skip a failed commit)
        if (flow.main.milestone && flow.main.activeKind && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const p = nodePos(flow.main.activeKind);
          drawBurst(buffer, p.x, p.y, flow.main.milestone, phase, laneHexOf(flow.main.activeKind), width, height);
        }

        // 4. subagent lanes
        if (flow.agentsLive > 0) {
          drawStr(buffer, LEFT, SUBLANE_Y0 - 1, `▸ ${flow.agentsLive} agent${flow.agentsLive > 1 ? "s" : ""} live`, RGBA.fromHex(theme.accent), width, height);
        }
        flow.subLanes.slice(0, MAX_SUBLANES).forEach((ln, i) => {
          drawSubLane(buffer, ln, SUBLANE_Y0 + i * SUBLANE_H, now, animating, infoOn, width, height);
        });
        if (flow.subLanes.length > MAX_SUBLANES) {
          drawStr(buffer, LEFT, SUBLANE_Y0 + MAX_SUBLANES * SUBLANE_H, `+${flow.subLanes.length - MAX_SUBLANES} more`, RGBA.fromHex(theme.dim), width, height);
        }

        // 5. idle/waiting cue at the chat node
        if (idle && present.has("chat")) {
          const p = nodePos("chat");
          const cue = status === "waiting" ? "waiting…" : status;
          drawStr(buffer, p.x + 2, p.y, cue, RGBA.fromHex(lerpHex(theme.dim, theme.fg, breathe(now) - 0.6)), width, height);
        }
      }}
    />
  );
}
