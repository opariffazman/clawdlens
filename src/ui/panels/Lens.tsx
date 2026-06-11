import { RGBA, renderFontToFrameBuffer, measureText, type OptimizedBuffer } from "@opentui/core";
import { deriveFlow } from "../../core/pipeline-flow";
import {
  nodeLayout, borderCells, portIn, portOut, badgeCell, diamondCell, boltCell,
  wireForward, wireLoop, subRow, subPortCell,
  SUB_ROWS, BOX_H_ART, BOX_H_GLYPH, LEFT, TOP,
  type BoxMode, type NodeLayout, type Rect,
} from "../../core/pipeline-geometry";
import { rankOf } from "../../core/pipeline";
import type { Beat, IconKey, Status } from "../../core/types";
import { theme, TRANSPARENT } from "../theme";
import { breathe, lerpHex, pulsePhase } from "../anim";
import { iconFor } from "../icons";
import { put, drawStr, clip, laneHexOf } from "./lens/draw";
import { ICON_ART_7, ICON_ART_13, LABEL_ART, LABEL_H, type ArtKey } from "./lens/iconArt";
import { detectLensFromBeats } from "../../core/lens";
import { drawPhaseRibbon } from "./lens/phaseRibbon";
import { drawEconomy } from "./lens/economy";
import { drawHeartbeat } from "./lens/heartbeat";
import { drawSkillTimeline } from "./lens/skillTimeline";
import { toolTimingView } from "../../core/lens-bands";
import { iconKeyFor } from "../../core/reducer";
import { fmtDur } from "../format";

interface Props {
  presented: Beat[];
  cursor: number;
  total: number;
  animate: boolean;
  lastAdvanceMs: number;
  intervalMs: number;
  status: Status;
  infoOn: boolean;
  tokens: import("../../core/types").SessionTokens;
  toolTimings: Record<string, import("../../core/types").ToolTiming>;
  width: number;
  height: number;
}

const TRAIL_HOPS = 3;
const RING_MS = 1500;
const RING_WAIT_MS = 4500;
const STAGE_GLYPH: Record<string, IconKey> = { prompt: "text", think: "thinking", tool: "tool", result: "result", chat: "text" };
const STAGE_ART: Record<string, ArtKey> = { prompt: "prompt", think: "thinking", tool: "tool", result: "result", chat: "text" };

interface SubItem { glyph: string; label: string; live: boolean; hex: string }

function statusHex(s: Status) {
  return s === "error" ? theme.err : s === "waiting" ? theme.warn : s === "idle" || s === "dormant" ? theme.dim : theme.ok;
}

// milestone sparkle on the active box (ported unchanged from the old Lens)
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

// box: border + centered art/glyph + name/detail BELOW (n8n anatomy)
function drawNodeBox(
  buf: OptimizedBuffer, r: Rect, art: string[] | null, glyph: string, key: string,
  name: string, bigLabel: string[] | null, detail: string, border: RGBA, iconHex: string, nameFg: RGBA,
  w: number, h: number,
) {
  for (const c of borderCells(r, key === "prompt")) put(buf, c.x, c.y, c.ch, border, w, h);
  const icon = RGBA.fromHex(iconHex);
  if (art) {
    const aw = [...art[0]!].length;
    const ax = r.x + ((r.w - aw) >> 1);
    const ay = r.y + ((r.h - art.length) >> 1);
    art.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) if (row[j] !== " ") put(buf, ax + j, ay + i, row[j]!, icon, w, h);
    });
  } else {
    put(buf, r.x + (r.w >> 1), r.y + (r.h >> 1), glyph, icon, w, h);
  }
  let ny = r.y + r.h;
  if (bigLabel) {
    const lw = [...bigLabel[0]!].length;
    const lx = r.x + ((r.w - lw) >> 1);
    bigLabel.forEach((row, i) => {
      for (let j = 0; j < row.length; j++) if (row[j] !== " ") put(buf, lx + j, ny + i, row[j]!, nameFg, w, h);
    });
    ny += bigLabel.length;
  } else {
    const nm = clip(name, r.w + 2);
    drawStr(buf, r.x + ((r.w - nm.length) >> 1), ny, nm, nameFg, w, h);
    ny += 1;
  }
  const dt = clip(detail, r.w); // within the box width — an overhang punches holes in the chat backward wire
  if (dt) drawStr(buf, r.x + ((r.w - dt.length) >> 1), ny, dt, RGBA.fromHex(theme.dim), w, h);
}

// orbiting coral ring: recolor the border cells with a chasing arc (n8n conic ring)
function drawRing(buf: OptimizedBuffer, r: Rect, rounded: boolean, now: number, periodMs: number, w: number, h: number) {
  const cells = borderCells(r, rounded);
  const head = Math.floor(((now % periodMs) / periodMs) * cells.length);
  const arc = Math.max(4, cells.length >> 2);
  const base = lerpHex(theme.dim, theme.coral, 0.2);
  const hot = lerpHex(theme.coral, theme.pulseHot, 0.6);
  cells.forEach((c, i) => {
    const d = (i - head + cells.length) % cells.length;
    // conic fade: hot at the head, easing to base over the whole arc (n8n-style)
    const hex = d < arc ? lerpHex(base, hot, 1 - d / arc) : base;
    put(buf, c.x, c.y, c.ch, RGBA.fromHex(hex), w, h);
  });
}

function drawSubNode(buf: OptimizedBuffer, c: Rect, it: SubItem, labelY: number, now: number, animating: boolean, w: number, h: number) {
  const hex = it.live && animating ? lerpHex(it.hex, theme.pulseHot, breathe(now)) : it.hex;
  const border = RGBA.fromHex(it.live ? hex : theme.dim);
  for (const cell of borderCells(c)) {
    const rounded = cell.ch === "┌" ? "╭" : cell.ch === "┐" ? "╮" : cell.ch === "└" ? "╰" : cell.ch === "┘" ? "╯" : cell.ch;
    put(buf, cell.x, cell.y, rounded, border, w, h);
  }
  const p = subPortCell(c);
  put(buf, p.x, p.y, "◇", RGBA.fromHex(theme.dim), w, h);
  put(buf, c.x + (c.w >> 1), c.y + (c.h >> 1), it.glyph, RGBA.fromHex(hex), w, h);
  const lbl = clip(it.label, 14);
  drawStr(buf, Math.max(0, c.x + (c.w >> 1) - (lbl.length >> 1)), labelY, lbl, RGBA.fromHex(it.live ? theme.fg : theme.dim), w, h);
}

function drawHud(buf: OptimizedBuffer, flow: ReturnType<typeof deriveFlow>, status: Status, tempo: number, total: number, cursor: number, w: number, h: number) {
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
  const nowM = measureText({ text: "NOW", font: "tiny" }); // ~14x2
  const bigNow = w >= 80;
  let tx = LEFT + 2;
  if (bigNow) {
    renderFontToFrameBuffer(buf, { text: "NOW", x: tx, y: top + 1, color: RGBA.fromHex(theme.accent), font: "tiny", backgroundColor: TRANSPARENT });
    tx += nowM.width + 2;
  } else {
    drawStr(buf, LEFT + 2, top, " NOW ", RGBA.fromHex(theme.accent), w, h);
  }
  const m = flow.main;
  const nowLine = m.activeKind
    ? `${iconFor(m.actionIcon ?? STAGE_GLYPH[m.activeKind] ?? "tool")} ${m.activeKind}${m.detail ? " · " + m.detail : ""}`
    : "idle";
  drawStr(buf, tx, top + 1, clip(nowLine, w - tx - 4), RGBA.fromHex(m.errored ? theme.err : theme.fg), w, h);
  const succTotal = m.ok + m.err;
  const succ = succTotal > 0 ? Math.round((100 * m.ok) / succTotal) : 100;
  const bars = Math.max(0, Math.min(4, Math.round(tempo * 4)));
  const tempoBar = "▮".repeat(bars) + "▯".repeat(4 - bars);
  let cx = tx;
  put(buf, cx, top + 2, "●", RGBA.fromHex(statusHex(status)), w, h); cx += 2;
  const rest = `${status}   tempo ${tempoBar}   ✓${succ}% ${m.ok}/${m.err}   ${flow.agentsLive} agent${flow.agentsLive === 1 ? "" : "s"}   beats ${cursor}/${total}`;
  drawStr(buf, cx, top + 2, clip(rest, w - cx - 3), RGBA.fromHex(theme.dim), w, h);
}

export function Lens({ presented, cursor, total, animate, lastAdvanceMs, intervalMs, status, infoOn, tokens, toolTimings, width, height }: Props) {
  const flow = deriveFlow(presented, cursor, TRAIL_HOPS, "coarse");
  const lensState = detectLensFromBeats(presented.slice(0, cursor));
  const ribbonOn = lensState.lensId === "superpowers";
  const animating = animate;

  // sub-row occupants: default = latest skill + live agents; `i` = tool breakdown
  const items: SubItem[] = [];
  if (infoOn) {
    const rows = toolTimingView(toolTimings);
    if (rows.length > 0) {
      for (const r of rows) {
        items.push({ glyph: iconFor(iconKeyFor(r.name)), label: `${r.name} ×${r.count} ${fmtDur(r.avgMs)}`, live: false, hex: laneHexOf("tool") });
      }
    } else {
      for (const k of Object.keys(flow.main.toolBreakdown).sort((a, b) => rankOf(a) - rankOf(b))) {
        items.push({ glyph: iconFor(k as IconKey), label: `${k} ×${flow.main.toolBreakdown[k]}`, live: false, hex: laneHexOf("tool") });
      }
    }
  } else {
    const lastGroup = lensState.skillGroups[lensState.skillGroups.length - 1];
    const skillName = flow.main.activeSkill ?? lastGroup?.skill;
    if (skillName) {
      const short = skillName.split(":").pop() ?? skillName;
      items.push({ glyph: iconFor("skill"), label: `${short} ×${flow.main.skillBreakdown[skillName] ?? 1}`, live: flow.main.activeKind === "skill", hex: laneHexOf("skill") });
    }
    for (const ln of flow.subLanes) items.push({ glyph: iconFor("task"), label: ln.label, live: true, hex: laneHexOf("task") });
  }

  // height ladder: art -> glyph -> drop economy -> heartbeat -> timeline -> ribbon -> sub-row
  const bandH = 4;
  const hudTop = height - bandH;
  const hasTimeline = lensState.skillGroups.length > 0 || presented.slice(0, cursor).some((b) => b.iconKey === "task");
  let ribbon = ribbonOn ? 2 : 0, econ = 1, heart = 1, time = hasTimeline ? 3 : 0;
  let mode: BoxMode = "art";
  let bigNames = true; // miniwi node names; falls back to 1-row plain under pressure
  let sub = items.length > 0 ? SUB_ROWS : 0;
  // sub-row rows OVERLAP the name rows (wires pass behind labels, as in n8n)
  const nameRows = () => (bigNames ? LABEL_H : 1) + 1; // + detail line
  const blockNeed = () => (mode === "art" ? BOX_H_ART : BOX_H_GLYPH) + Math.max(sub, nameRows()) + 1; // +1 loop channel
  const usable = hudTop - TOP;
  while (usable - ribbon - econ - heart - time < blockNeed()) {
    if (bigNames) bigNames = false;
    else if (mode === "art") mode = "glyph";
    else if (econ) econ = 0;
    else if (heart) heart = 0;
    else if (time) time = 0;
    else if (ribbon) ribbon = 0;
    else if (sub) sub = 0;
    else break;
  }
  const showRibbon = ribbon > 0, showEconomy = econ > 0, showHeartbeat = heart > 0, showTimeline = time > 0;
  const showSub = sub > 0;

  const regionTop = TOP + ribbon;
  const regionBottom = hudTop - (econ + heart + time);
  const boxH = mode === "art" ? BOX_H_ART : BOX_H_GLYPH;
  const blockH = boxH + Math.max(showSub ? SUB_ROWS : 0, (bigNames ? LABEL_H : 1) + 1);
  const top = Math.max(regionTop, regionTop + ((regionBottom - regionTop - blockH) >> 1));
  const nl: NodeLayout = nodeLayout(width, top, mode);
  const row = nl.row;

  // wire segment cover from hops
  const segN = row.length - 1;
  const cover: number[] = new Array(segN).fill(0);
  let backCount = 0;
  const idx = (k: string) => row.indexOf(k);
  for (const [k, n] of Object.entries(flow.main.hops)) {
    const gt = k.indexOf(">");
    const ia = idx(k.slice(0, gt)), ib = idx(k.slice(gt + 1));
    if (ia < 0 || ib < 0) continue;
    if (ib > ia) for (let s = ia; s < ib; s++) cover[s]! += n;
    else backCount += n;
  }
  if (nl.showTrigger && flow.main.trail.length > 0) cover[0] = Math.max(cover[0]!, 1);
  let hotLo = -1, hotHi = -2, hotBack: [string, string] | null = null;
  if (flow.main.lastHop) {
    const gt = flow.main.lastHop.indexOf(">");
    const a = flow.main.lastHop.slice(0, gt), b = flow.main.lastHop.slice(gt + 1);
    const ia = idx(a), ib = idx(b);
    if (ia >= 0 && ib >= 0) { if (ib > ia) { hotLo = ia; hotHi = ib - 1; } else hotBack = [a, b]; }
  }

  const sr = showSub ? subRow(nl.boxes.get("tool")!, items.length, width) : null;
  const nameBottom = top + boxH + (bigNames ? LABEL_H : 1) + 1;
  const blockBottom = Math.max(nameBottom, sr ? sr.labelY + 1 : 0);
  const channelY = blockBottom;
  const loopOn = (backCount > 0 || hotBack !== null) && channelY < regionBottom;

  const activeK = flow.main.activeKind;
  const ringKey = status === "waiting" ? "chat" : activeK && nl.boxes.has(activeK) ? activeK : null;
  const ringMs = status === "waiting" ? RING_WAIT_MS : RING_MS;
  // long thinks park the timeline (animate=false) but the model is still working —
  // keep the think box breathing so the user sees life (n8n keeps its ring spinning).
  const thinkPulse = (status === "working" || status === "running") && activeK === "think";

  return (
    <box
      style={{ width, height, backgroundColor: TRANSPARENT }}
      buffered
      live={animate || thinkPulse}
      renderAfter={(buffer: OptimizedBuffer) => {
        buffer.clear(TRANSPARENT);
        const now = Date.now();
        if (presented.length === 0) {
          const t = "CLAWDLENS";
          const slickM = measureText({ text: t, font: "slick" });
          const useSlick = slickM.width <= width - 6 && hudTop - TOP >= slickM.height + 3;
          const font = useSlick ? "slick" : "tiny";
          const fm = useSlick ? slickM : measureText({ text: t, font: "tiny" });
          const sx = Math.max(LEFT, (width - fm.width) >> 1);
          const sy = Math.max(TOP, TOP + ((hudTop - TOP - fm.height - 2) >> 1));
          renderFontToFrameBuffer(buffer, {
            text: t, x: sx, y: sy, font,
            color: useSlick ? [RGBA.fromHex(theme.coral), RGBA.fromHex(theme.dim)] : RGBA.fromHex(theme.coral),
            backgroundColor: TRANSPARENT,
          });
          const hint = "waiting for session activity · : sessions";
          drawStr(buffer, Math.max(LEFT, (width - hint.length) >> 1), sy + fm.height + 1, hint, RGBA.fromHex(theme.dim), width, height);
          drawHud(buffer, flow, status, 0, total, cursor, width, height);
          return;
        }
        if (showRibbon) drawPhaseRibbon(buffer, LEFT, TOP, lensState, animating, now, width, height);
        const tempo = intervalMs > 0 ? Math.max(0, Math.min(1, 600 / intervalMs)) : 0;
        const hotHex = flow.main.errored ? theme.err : theme.ok;

        // forward wires with persistent trail + embedded ×N labels
        for (let i = 0; i < segN; i++) {
          const a = nl.boxes.get(row[i]!)!, b = nl.boxes.get(row[i + 1]!)!;
          const hex = i >= hotLo && i <= hotHi ? hotHex : cover[i]! > 0 ? lerpHex(theme.wireDim, theme.ok, 0.35) : theme.wireDim;
          const lbl = nl.showLabels && row[i] !== "prompt" && cover[i]! > 0 ? `×${cover[i]}` : undefined;
          const col = RGBA.fromHex(hex);
          for (const c of wireForward(a, b, lbl)) put(buffer, c.x, c.y, c.ch, col, width, height);
        }

        // backward loop (rounded U below the row)
        if (loopOn) {
          const [la, lb] = hotBack ?? ["chat", "think"];
          const a = nl.boxes.get(la) ?? nl.boxes.get("chat")!;
          const b = nl.boxes.get(lb) ?? nl.boxes.get("think")!;
          const hex = hotBack ? hotHex : lerpHex(theme.wireDim, theme.ok, 0.35);
          const col = RGBA.fromHex(hex);
          for (const c of wireLoop(a, b, channelY)) put(buffer, c.x, c.y, c.ch, col, width, height);
        }

        // sub-row: dashed tree fan + circles
        if (sr) {
          const d = diamondCell(nl.boxes.get("tool")!);
          const wireDimCol = RGBA.fromHex(theme.wireDim);
          for (const c of sr.cells) put(buffer, c.x, c.y, c.ch, wireDimCol, width, height);
          sr.circles.forEach((c, i) => drawSubNode(buffer, c, items[i]!, sr.labelY, now, animating, width, height));
          put(buffer, d.x, d.y, "◇", RGBA.fromHex(theme.dim), width, height);
          if (items.length > sr.shown && sr.circles.length > 0) {
            const last = sr.circles[sr.circles.length - 1]!;
            drawStr(buffer, last.x + last.w + 2, last.y + 1, `+${items.length - sr.shown} more`, RGBA.fromHex(theme.dim), width, height);
          }
        }

        // node boxes
        for (const k of row) {
          const r = nl.boxes.get(k)!;
          const active = k === activeK;
          const laneHex = k === "prompt" ? theme.coral : laneHexOf(k);
          const pulseThis = thinkPulse && !animating && k === "think";
          const pulseHex = pulseThis ? lerpHex(laneHex, theme.pulseHot, breathe(now)) : laneHex;
          const border = RGBA.fromHex(
            pulseThis ? pulseHex
            : active ? (flow.main.errored ? theme.err : laneHex) : theme.dim,
          );
          const detail =
            k === "prompt" ? `turn ${(flow.main.counts["chat"] ?? 0) + 1}`
            : k === "result" ? `✓${flow.main.ok} ✗${flow.main.err}`
            : active && flow.main.detail ? flow.main.detail
            : `×${flow.main.counts[k] ?? 0}`;
          const art = mode === "art" ? (nl.wide ? ICON_ART_13 : ICON_ART_7)[STAGE_ART[k] ?? "tool"] : null;
          const bigLabel = bigNames ? LABEL_ART[k as keyof typeof LABEL_ART] ?? null : null;
          // miniwi names push the detail line onto the sub-row circles' middle row —
          // suppress a detail that would punch through a circle (it stays in glyph tier)
          const detY = r.y + r.h + (bigLabel ? LABEL_H : 1);
          const dLen = Math.min([...detail].length, r.w);
          const dx = r.x + ((r.w - dLen) >> 1);
          const hitsCircle = sr !== null && sr.circles.some((c) => detY >= c.y && detY < c.y + c.h && dx <= c.x + c.w - 1 && dx + dLen - 1 >= c.x);
          drawNodeBox(buffer, r, art, iconFor(STAGE_GLYPH[k] ?? "tool"), k, k, bigLabel, hitsCircle ? "" : detail, border, pulseHex, RGBA.fromHex(active ? theme.fg : theme.dim), width, height);
          // ports (chat's dangling output stays — n8n shows the bare port circle)
          if (k !== "prompt") put(buffer, portIn(r).x, portIn(r).y, "○", RGBA.fromHex(theme.dim), width, height);
          put(buffer, portOut(r).x, portOut(r).y, "●", RGBA.fromHex(theme.dim), width, height);
          // badge
          const bc = badgeCell(r);
          if (flow.main.errored && active) put(buffer, bc.x, bc.y, "✗", RGBA.fromHex(theme.err), width, height);
          else if ((flow.main.counts[k] ?? 0) > 0) put(buffer, bc.x, bc.y, "✓", RGBA.fromHex(theme.ok), width, height);
          // trigger bolt
          if (k === "prompt") {
            const b = boltCell(r);
            put(buffer, b.x, b.y, "↯", RGBA.fromHex(theme.coral), width, height);
          }
        }

        // orbiting ring on the active (or waiting) node — n8n: errors stop the ring
        if (ringKey && animating && !flow.main.errored && status !== "error") {
          drawRing(buffer, nl.boxes.get(ringKey)!, ringKey === "prompt", now, ringMs, width, height); // rounded: unreachable today, future-proof for a prompt-ring
          const rr = nl.boxes.get(ringKey)!;
          if (ringKey !== "prompt") put(buffer, portIn(rr).x, portIn(rr).y, "○", RGBA.fromHex(theme.dim), width, height);
          put(buffer, portOut(rr).x, portOut(rr).y, "●", RGBA.fromHex(theme.dim), width, height);
          if ((flow.main.counts[ringKey] ?? 0) > 0) put(buffer, badgeCell(rr).x, badgeCell(rr).y, "✓", RGBA.fromHex(theme.ok), width, height);
        }

        // milestone burst (commit/branch) on the active box, as before
        const ak2 = flow.main.activeKind;
        if (flow.main.milestone && ak2 && nl.boxes.has(ak2) && !(flow.main.milestone === "commit" && flow.main.errored)) {
          const r = nl.boxes.get(ak2)!;
          drawBurst(buffer, r.x + (r.w >> 1), r.y, flow.main.milestone, pulsePhase(now, lastAdvanceMs, intervalMs), laneHexOf(ak2), width, height);
        }

        // bottom bands + HUD (unchanged zones)
        let by = hudTop;
        if (showEconomy) { by -= 1; drawEconomy(buffer, LEFT, by, tokens, width, height); }
        if (showHeartbeat) { by -= 1; drawHeartbeat(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
        if (showTimeline) { by -= 3; drawSkillTimeline(buffer, LEFT, by, width - LEFT - 2, presented, cursor, height); }
        drawHud(buffer, flow, status, tempo, total, cursor, width, height);
      }}
    />
  );
}
