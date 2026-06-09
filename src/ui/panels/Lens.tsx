import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow, type LaneFlow } from "../../core/pipeline-flow";
import { coarseLayout, pipeReturn, pipeBranch, pipeElbow, expandStack, railCells, railSegment, type Rect, type Cell, LEFT, TOP, CARD_H, ROW_GAP } from "../../core/pipeline-geometry";
import { rankOf } from "../../core/pipeline";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { pulsePhase, cometColor, breathe, lerpHex } from "../anim";
import { iconFor } from "../icons";
import { put, drawStr, clip, laneHexOf } from "./lens/draw";

interface Props {
  presented: Beat[];
  cursor: number;
  total: number;
  animate: boolean;
  lastAdvanceMs: number;
  intervalMs: number;
  status: Status;
  infoOn: boolean;
  width: number;
  height: number;
}

const TRAIL_HOPS = 3;
const TAIL = 6;
const MAX_CHILDREN = 6;
const SKILL_SIDE_MIN = 16; // min (skill.x - tool.x) to render skill side-by-side; else stack under tool
const COARSE_STAGES = ["think", "tool", "result", "chat"];
const STAGE_ICON: Record<string, IconKey> = { think: "thinking", tool: "tool", skill: "skill", result: "result", chat: "text" };

function statusHex(s: Status) {
  return s === "error" ? theme.err : s === "waiting" ? theme.warn : s === "idle" || s === "dormant" ? theme.dim : theme.ok;
}

function drawCard(buf: OptimizedBuffer, r: Rect, icon: string, name: string, content: string, contentFg: RGBA, border: RGBA, active: boolean, w: number, h: number) {
  const title = ` ${icon} ${name} `;
  put(buf, r.x, r.y, "╭", border, w, h);
  put(buf, r.x + r.w - 1, r.y, "╮", border, w, h);
  for (let i = 1; i < r.w - 1; i++) { const ch = title[i - 1]; put(buf, r.x + i, r.y, ch ?? "─", ch ? contentFg : border, w, h); }
  put(buf, r.x, r.y + 1, "│", border, w, h);
  put(buf, r.x + r.w - 1, r.y + 1, "│", border, w, h);
  drawStr(buf, r.x + 1, r.y + 1, clip(content, r.w - 3), contentFg, w, h);
  if (active) put(buf, r.x + r.w - 2, r.y + 1, "◉", border, w, h);
  put(buf, r.x, r.y + r.h - 1, "╰", border, w, h);
  put(buf, r.x + r.w - 1, r.y + r.h - 1, "╯", border, w, h);
  for (let i = 1; i < r.w - 1; i++) put(buf, r.x + i, r.y + r.h - 1, "─", border, w, h);
}

function drawBurst(buf: OptimizedBuffer, cx: number, cy: number, kind: "commit" | "branch", phase: number, laneHex: string, w: number, h: number) {
  const r = Math.min(2, Math.round(phase * 2));
  const fade = 1 - phase;
  if (r <= 0 || fade <= 0) return;
  const col = RGBA.fromHex(lerpHex(theme.wireDim, kind === "commit" ? laneHex : theme.warn, fade));
  if (kind === "commit") {
    const ring: [number, number][] = [[r, 0], [-r, 0], [0, -1], [r - 1, -1]];
    const g = "✦✧·";
    ring.forEach(([dx, dy], i) => put(buf, cx + dx, cy + dy, g[i % g.length]!, col, w, h));
  } else {
    ([[r, 0], [r, -1], [1, -1]] as [number, number][]).forEach(([dx, dy]) => put(buf, cx + dx, cy + dy, "*", col, w, h));
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
  for (let y = top + 1; y < top + bandH - 1; y++) { put(buf, LEFT, y, "│", border, w, h); put(buf, w - 2, y, "│", border, w, h); }
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
  const rest = `${status}   tempo ${tempoBar}   ✓${succ}% ${m.ok}/${m.err}   ${flow.agentsLive} agent${flow.agentsLive === 1 ? "" : "s"}   beats ${cursor}/${total}`;
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
  const glyph = ln.errored ? "✗" : iconFor(ln.actionIcon ?? (STAGE_ICON[ln.activeKind] ?? ln.activeKind) as IconKey);
  const col = ln.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex);
  put(buf, x + 4, y, glyph, RGBA.fromHex(col), w, h);
}

// pick the routed pipe for a transition between two coarse kinds
function wireFor(from: string, to: string, layout: Map<string, Rect>, channelY: number, railY: number): Cell[] {
  const a = layout.get(from); const b = layout.get(to);
  if (!a || !b) return [];
  if (to === "skill") return pipeElbow(a, b);
  if (from === "skill") return pipeElbow(b, a).reverse();
  if (a.y === b.y && b.x > a.x) return railSegment(a, b, railY); // forward flow rides the rail above
  if (a.y === b.y && b.x < a.x) return pipeReturn(a, b, channelY);
  return a.y < b.y ? pipeBranch(a, [b]) : pipeBranch(b, [a]).reverse();
}

export function Lens({ presented, cursor, total, animate, lastAdvanceMs, intervalMs, status, infoOn, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  // Pulse tracks TIMELINE MOVEMENT, not the session's live status. `animate`
  // (shouldAnimate) is already true only while the cursor is advancing (live
  // reveal/replay) and false at rest/paused/scrub. Gating on status wrongly
  // froze the comet for past/dormant sessions being revealed — Flow/Git gate
  // on `animate` alone; Lens now matches.
  const animating = animate;

  const hasSkill = (flow.main.counts["skill"] ?? 0) > 0;

  // expand child kinds (i): tool by rank, skill by count desc then name
  const toolChildKinds = infoOn
    ? Object.keys(flow.main.toolBreakdown).sort((a, b) => rankOf(a) - rankOf(b)).slice(0, MAX_CHILDREN)
    : [];
  const skillChildKinds = infoOn && hasSkill
    ? Object.keys(flow.main.skillBreakdown).sort((a, b) => (flow.main.skillBreakdown[b]! - flow.main.skillBreakdown[a]!) || (a < b ? -1 : 1)).slice(0, MAX_CHILDREN)
    : [];
  const toolExtra = infoOn ? Object.keys(flow.main.toolBreakdown).length - toolChildKinds.length : 0;
  const skillExtra = infoOn ? Object.keys(flow.main.skillBreakdown).length - skillChildKinds.length : 0;

  // wide (side-by-side skill) vs narrow (skill under tool) — from the spread's gap
  const probe: Map<string, Rect> = coarseLayout(width, TOP);
  const wide = (probe.get("skill")!.x - probe.get("tool")!.x) >= SKILL_SIDE_MIN;

  // vertical centering: estimate the block height (flow rail above + cards/expands),
  // center it between TOP and the HUD band, reserving the sublane rows below.
  const RAIL_ROWS = 2; // flow rail + a stub row above the card row
  const bandH = 4;
  const hudTop = height - bandH;
  const sublaneRows = flow.agentsLive > 0 ? Math.min(3, flow.agentsLive) + 1 : 0;
  const toolN = toolChildKinds.length;
  const skillN = skillChildKinds.length;
  let maxBottomRel = CARD_H + toolN + (toolExtra > 0 ? 1 : 0);
  if (hasSkill) {
    const skillTopRel = wide ? (CARD_H + ROW_GAP) : (CARD_H + toolN + (toolExtra > 0 ? 1 : 0) + ROW_GAP);
    maxBottomRel = Math.max(maxBottomRel, skillTopRel + CARD_H + skillN + (skillExtra > 0 ? 1 : 0));
  }
  const blockH = RAIL_ROWS + maxBottomRel + 1;
  const blockTop = Math.max(TOP, TOP + Math.floor((hudTop - TOP - sublaneRows - blockH) / 2));
  const top = blockTop + RAIL_ROWS;
  const railY = blockTop; // = top - RAIL_ROWS

  const layout: Map<string, Rect> = coarseLayout(width, top);
  const channelY = top + CARD_H + 1;

  const toolRect = layout.get("tool")!;
  const toolChildRects = expandStack(toolRect, toolN);
  const toolBlockBottom = toolN > 0 ? toolChildRects[toolChildRects.length - 1]!.y + 1 + (toolExtra > 0 ? 1 : 0) : toolRect.y + CARD_H;

  // place skill: wide → gap column (from coarseLayout); narrow → below the tool block
  let skillRect = layout.get("skill")!;
  if (hasSkill && !wide) {
    skillRect = { x: toolRect.x, y: toolBlockBottom + ROW_GAP, w: toolRect.w, h: CARD_H };
    layout.set("skill", skillRect);
  }
  const skillChildRects = hasSkill ? expandStack(skillRect, skillN) : [];

  const presentKinds = [...COARSE_STAGES];
  if (hasSkill) presentKinds.push("skill");

  const cardRects = COARSE_STAGES.map((k) => layout.get(k)!); // the four coarse cards tapped by the rail

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animate}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        const phase = pulsePhase(now, lastAdvanceMs, intervalMs);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(1, 600 / intervalMs)) : 0;

        // while tool is expanded, hide back-edge (loop) pipes — the stack uses that space
        const expanded = toolN > 0;
        const isReturn = (from: string, to: string) => {
          const a = layout.get(from); const b = layout.get(to);
          return !!a && !!b && a.y === b.y && b.x < a.x;
        };

        // static forward bus: the flow rail above the cards (with per-card stubs)
        for (const c of railCells(cardRects, railY)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
        // static skill branch elbow (below tool)
        if (hasSkill) for (const c of wireFor("tool", "skill", layout, channelY, railY)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);

        const trail = flow.main.trail;
        for (let i = 0; i + 1 < trail.length; i++) {
          const from = trail[i]!, to = trail[i + 1]!;
          if (expanded && isReturn(from, to)) continue;
          const cells = wireFor(from, to, layout, channelY, railY);
          if (cells.length === 0) continue;
          const isComet = i === trail.length - 2 && animating;
          const a = layout.get(from), b = layout.get(to);
          const isRailFwd = !!a && !!b && a.y === b.y && b.x > a.x;
          if (isRailFwd && !isComet) continue; // static rail already draws it — don't clobber the tees
          const laneHex = laneHexOf(to);
          if (isComet) {
            const head = phase * cells.length;
            cells.forEach((c, ci) => put(buffer, c.x, c.y, c.ch, RGBA.fromHex(cometColor(head - ci, TAIL, flow.main.errored ? theme.err : laneHex, theme.pulseHot, theme.wireDim, 0.2 + 0.3 * tempo)), width, height));
          } else {
            const baseI = 0.2 + 0.3 * ((i + 1) / Math.max(1, trail.length - 1));
            cells.forEach((c) => put(buffer, c.x, c.y, c.ch, RGBA.fromHex(lerpHex(theme.wireDim, laneHex, baseI)), width, height));
          }
        }

        // dynamic drop arrow: the rail taps DOWN into the currently-active card
        const activeK = flow.main.activeKind;
        if (activeK && COARSE_STAGES.includes(activeK)) {
          const r = layout.get(activeK)!;
          const sx = r.x + (r.w >> 1);
          const dropCol = RGBA.fromHex(flow.main.errored ? theme.err : (animating ? lerpHex(laneHexOf(activeK), theme.pulseHot, breathe(now)) : laneHexOf(activeK)));
          put(buffer, sx, railY, "┯", dropCol, width, height);
          for (let y = railY + 1; y < r.y - 1; y++) put(buffer, sx, y, "│", dropCol, width, height);
          put(buffer, sx, r.y - 1, "▼", dropCol, width, height);
        }

        for (const k of presentKinds) {
          const r = layout.get(k)!;
          const active = k === flow.main.activeKind;
          const laneHex = laneHexOf(k);
          const border = RGBA.fromHex(active ? (flow.main.errored ? theme.err : (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex)) : theme.dim);
          const icon = iconFor(active ? (flow.main.actionIcon ?? STAGE_ICON[k] ?? "tool") : (STAGE_ICON[k] ?? "tool"));
          const content = k === "result" ? `✓${flow.main.ok} ✗${flow.main.err}` : `×${flow.main.counts[k] ?? 0}`;
          drawCard(buffer, r, icon, k, content, RGBA.fromHex(active ? theme.fg : theme.dim), border, active, width, height);
        }

        // tool vertical expansion
        if (toolN > 0) {
          for (const c of pipeBranch(toolRect, toolChildRects)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
          toolChildKinds.forEach((k, i) => {
            const r = toolChildRects[i]!;
            const activeChild = k === flow.main.activeTool;
            const laneHex = laneHexOf("tool");
            const fg = RGBA.fromHex(activeChild ? (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : theme.fg) : theme.dim);
            drawStr(buffer, r.x, r.y, clip(`${iconFor(k as IconKey)} ${k} ×${flow.main.toolBreakdown[k] ?? 0}`, width - r.x - 2), fg, width, height);
          });
          if (toolExtra > 0) drawStr(buffer, toolRect.x + 4, (toolChildRects[toolChildRects.length - 1]?.y ?? toolRect.y + toolRect.h) + 1, `+${toolExtra} more`, RGBA.fromHex(theme.dim), width, height);
        }

        // skill vertical expansion (#9)
        if (hasSkill && skillN > 0) {
          for (const c of pipeBranch(skillRect, skillChildRects)) put(buffer, c.x, c.y, c.ch, RGBA.fromHex(theme.wireDim), width, height);
          skillChildKinds.forEach((k, i) => {
            const r = skillChildRects[i]!;
            const activeChild = k === flow.main.activeSkill;
            const laneHex = laneHexOf("skill");
            const fg = RGBA.fromHex(activeChild ? (animating ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : theme.fg) : theme.dim);
            drawStr(buffer, r.x, r.y, clip(`${iconFor("skill")} ${k} ×${flow.main.skillBreakdown[k] ?? 0}`, width - r.x - 2), fg, width, height);
          });
          if (skillExtra > 0) drawStr(buffer, skillRect.x + 4, (skillChildRects[skillChildRects.length - 1]?.y ?? skillRect.y + skillRect.h) + 1, `+${skillExtra} more`, RGBA.fromHex(theme.dim), width, height);
        }

        const ak = flow.main.activeKind;
        if (flow.main.milestone && ak && layout.has(ak) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = layout.get(ak)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y, flow.main.milestone, phase, laneHexOf(ak), width, height);
        }

        const bottoms = [...layout.entries()].filter(([k]) => presentKinds.includes(k)).map(([, r]) => r.y + r.h);
        const toolChildBottom = toolChildRects.length > 0 ? toolChildRects[toolChildRects.length - 1]!.y + 2 : 0;
        const skillChildBottom = skillChildRects.length > 0 ? skillChildRects[skillChildRects.length - 1]!.y + 2 : 0;
        let sy = Math.max(channelY + 1, toolChildBottom, skillChildBottom, ...bottoms) + 1;
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
