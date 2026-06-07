import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { coarseCardRect, fineCardLayout, cardWire, type Rect, LEFT, TOP, CARD_H, ROW_GAP } from "../../core/pipeline-geometry";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";

interface Props {
  presented: Beat[];
  cursor: number;
  total: number;
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
const COARSE_STAGES = ["think", "tool", "result", "chat"];
const STAGE_ICON: Record<string, IconKey> = { think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text" };
const STAGE_COL: Record<string, number> = { think: 0, tool: 1, skill: 1, result: 2, chat: 3 };

function laneHexOf(kind: string) {
  const col = STAGE_COL[kind] ?? (kind.charCodeAt(0) % theme.laneColors.length);
  return theme.laneColors[col % theme.laneColors.length]!;
}
function clip(s: string, n: number) { return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }
function statusHex(s: Status) {
  return s === "error" ? theme.err : s === "waiting" ? theme.warn
    : s === "idle" || s === "dormant" ? theme.dim : theme.ok;
}

function put(buf: OptimizedBuffer, x: number, y: number, ch: string, fg: RGBA, w: number, h: number) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  buf.setCell(x, y, ch, fg, TRANSPARENT);
}
function drawStr(buf: OptimizedBuffer, x: number, y: number, s: string, fg: RGBA, w: number, h: number) {
  for (let i = 0; i < s.length; i++) put(buf, x + i, y, s[i]!, fg, w, h);
}

function drawCard(buf: OptimizedBuffer, r: Rect, icon: string, name: string, content: string, contentFg: RGBA, border: RGBA, active: boolean, w: number, h: number) {
  const title = ` ${icon} ${name} `;
  put(buf, r.x, r.y, "╭", border, w, h);
  put(buf, r.x + r.w - 1, r.y, "╮", border, w, h);
  for (let i = 1; i < r.w - 1; i++) {
    const ch = title[i - 1];
    put(buf, r.x + i, r.y, ch ?? "─", ch ? contentFg : border, w, h);
  }
  put(buf, r.x, r.y + 1, "│", border, w, h);
  put(buf, r.x + r.w - 1, r.y + 1, "│", border, w, h);
  drawStr(buf, r.x + 1, r.y + 1, clip(content, r.w - 3), contentFg, w, h);
  if (active) put(buf, r.x + r.w - 2, r.y + 1, "◉", border, w, h);
  put(buf, r.x, r.y + r.h - 1, "╰", border, w, h);
  put(buf, r.x + r.w - 1, r.y + r.h - 1, "╯", border, w, h);
  for (let i = 1; i < r.w - 1; i++) put(buf, r.x + i, r.y + r.h - 1, "─", border, w, h);
}

function drawBurst(buf: OptimizedBuffer, cx: number, cy: number, kind: "commit" | "branch", phase: number, laneHex: string, w: number, h: number) {
  const r = Math.round(phase * 3);
  const fade = 1 - phase;
  if (r <= 0 || fade <= 0) return;
  const col = RGBA.fromHex(lerpHex(theme.wireDim, kind === "commit" ? laneHex : theme.warn, fade));
  if (kind === "commit") {
    const ring: [number, number][] = [[r, 0], [-r, 0], [0, 1], [0, -1], [r - 1, 1], [-(r - 1), -1]];
    const g = "✦✧·*";
    ring.forEach(([dx, dy], i) => put(buf, cx + dx, cy + dy, g[i % g.length]!, col, w, h));
  } else {
    ([[r, 0], [r, -1], [r - 1, 1], [1, -1]] as [number, number][]).forEach(([dx, dy]) => put(buf, cx + dx, cy + dy, "*", col, w, h));
    put(buf, cx + 1, cy, "+", col, w, h);
  }
}

function drawHud(buf: OptimizedBuffer, flow: { main: LaneFlow; agentsLive: number }, status: Status, tempo: number, total: number, cursor: number, w: number, h: number) {
  const bandH = 4;
  const top = h - bandH;
  if (top < TOP + 2) return;
  const border = RGBA.fromHex(theme.dim);
  put(buf, LEFT, top, "┌", border, w, h);
  put(buf, LEFT, top + bandH - 1, "└", border, w, h);
  for (let x = LEFT + 1; x < w - 2; x++) { put(buf, x, top, "─", border, w, h); put(buf, x, top + bandH - 1, "─", border, w, h); }
  put(buf, w - 2, top, "┐", border, w, h);
  put(buf, w - 2, top + bandH - 1, "┘", border, w, h);
  for (let y = top + 1; y < top + bandH - 1; y++) {
    put(buf, LEFT, y, "│", border, w, h);
    put(buf, w - 2, y, "│", border, w, h);
  }
  drawStr(buf, LEFT + 2, top, " NOW ", RGBA.fromHex(theme.accent), w, h);
  const m = flow.main;
  const nowLine = m.activeKind
    ? `${iconFor(m.actionIcon ?? STAGE_ICON[m.activeKind] ?? "tool")} ${m.activeKind}${m.detail ? " · " + m.detail : ""}`
    : "idle";
  drawStr(buf, LEFT + 2, top + 1, clip(nowLine, w - 6), RGBA.fromHex(m.errored ? theme.err : theme.fg), w, h);
  const succTotal = m.ok + m.err;
  const succ = succTotal > 0 ? Math.round((100 * m.ok) / succTotal) : 100;
  const bars = Math.max(0, Math.min(4, Math.round(tempo * 4)));
  const tempoBar = "▮".repeat(bars) + "▯".repeat(4 - bars);
  let cx = LEFT + 2;
  put(buf, cx, top + 2, "●", RGBA.fromHex(statusHex(status)), w, h); cx += 2;
  const rest = `${status}   tempo ${tempoBar}   ✓${succ}% ${m.ok}/${m.err}   ${flow.agentsLive} agent   beats ${cursor}/${total}`;
  drawStr(buf, cx, top + 2, clip(rest, w - cx - 3), RGBA.fromHex(theme.dim), w, h);
}

function drawSubLane(buf: OptimizedBuffer, ln: LaneFlow, y: number, now: number, animating: boolean, w: number, h: number) {
  const taskHex = theme.laneColors[5 % theme.laneColors.length]!;
  put(buf, LEFT + 2, y, iconFor("task"), RGBA.fromHex(taskHex), w, h);
  drawStr(buf, LEFT + 4, y, clip(ln.label, 14), RGBA.fromHex(theme.dim), w, h);
  if (!ln.activeKind) return;
  const x = LEFT + 20;
  const laneHex = laneHexOf(ln.activeKind);
  const headi = animating ? Math.floor((now / 120) % 3) : 99;
  for (let i = 0; i < 3; i++) put(buf, x + i, y, "·", RGBA.fromHex(i === headi ? laneHex : theme.wireDim), w, h);
  const glyph = ln.errored ? "✗" : iconFor(ln.actionIcon ?? STAGE_ICON[ln.activeKind] ?? "tool");
  const col = ln.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
  put(buf, x + 4, y, glyph, RGBA.fromHex(col), w, h);
}

export function Lens({ presented, cursor, total, pulse, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
  const grain = infoOn ? "fine" : "coarse";
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, grain);
  const idle = status === "idle" || status === "dormant" || status === "waiting";
  const animating = pulse && !idle;

  let presentKinds: string[];
  let layout: Map<string, Rect>;
  let backbone: [string, string][];
  if (grain === "coarse") {
    presentKinds = [...COARSE_STAGES];
    if ((flow.main.counts["skill"] ?? 0) > 0) presentKinds.push("skill");
    layout = new Map(presentKinds.map((k) => [k, coarseCardRect(k as Parameters<typeof coarseCardRect>[0])]));
    backbone = [["think", "tool"], ["tool", "result"], ["result", "chat"]];
    if (presentKinds.includes("skill")) backbone.push(["tool", "skill"]);
  } else {
    // fine: a card per node that has fired (incl. synthetic result). No dense
    // static backbone — the live comet/trail carries the flow across the strip.
    presentKinds = Object.keys(flow.main.counts);
    layout = fineCardLayout(presentKinds, width);
    backbone = [];
  }

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={pulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(1, 600 / intervalMs)) : 0;

        for (const [a, b] of backbone) {
          const ra = layout.get(a); const rb = layout.get(b);
          if (!ra || !rb) continue;
          for (const c of cardWire(ra, rb)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
        }

        const trail = flow.main.trail;
        for (let i = 0; i + 1 < trail.length; i++) {
          const ra = layout.get(trail[i]!); const rb = layout.get(trail[i + 1]!);
          if (!ra || !rb) continue;
          const cells = cardWire(ra, rb);
          const laneHex = laneHexOf(trail[i + 1]!);
          if (i === trail.length - 2 && animating) {
            const head = phase * cells.length;
            cells.forEach((c, ci) => put(buffer, c.x, c.y, flow.main.errored ? "┉" : c.ch,
              RGBA.fromHex(cometColor(head - ci, TAIL, flow.main.errored ? theme.err : laneHex, theme.pulseHot, theme.wireDim, 0.2 + 0.3 * tempo)), width, height));
          } else {
            const baseI = 0.2 + 0.3 * ((i + 1) / Math.max(1, trail.length - 1));
            cells.forEach((c) => put(buffer, c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, baseI)), width, height));
          }
        }

        for (const k of presentKinds) {
          const r = layout.get(k)!;
          const active = k === flow.main.activeKind;
          const laneHex = laneHexOf(k);
          const border = RGBA.fromHex(active ? (flow.main.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex)) : theme.dim);
          const idleIcon = (STAGE_ICON[k] ?? k) as IconKey; // coarse stage icon, else the fine kind is itself an IconKey
          const icon = iconFor(active ? (flow.main.actionIcon ?? idleIcon) : idleIcon);
          const content = k === "result" ? `✓${flow.main.ok} ✗${flow.main.err}` : `×${flow.main.counts[k] ?? 0}`;
          drawCard(buffer, r, icon, k, content, RGBA.fromHex(active ? theme.fg : theme.dim), border, active, width, height);
        }

        const ak = flow.main.activeKind;
        if (flow.main.milestone && ak && layout.has(ak) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = layout.get(ak)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y + r.h, flow.main.milestone, phase, laneHexOf(ak), width, height);
        }

        let sy = TOP + 2 * (CARD_H + ROW_GAP);
        if (flow.agentsLive > 0) {
          drawStr(buffer, LEFT, sy, `▸ ${flow.agentsLive} agent${flow.agentsLive > 1 ? "s" : ""} live`, RGBA.fromHex(theme.accent), width, height);
          sy += 1;
          flow.subLanes.slice(0, 3).forEach((ln) => { drawSubLane(buffer, ln, sy, now, animating, width, height); sy += 1; });
        }

        drawHud(buffer, flow, status, tempo, total, cursor, width, height);
      }}
    />
  );
}
