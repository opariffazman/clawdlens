import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { Beat } from "../../../core/types";
import { lensTimeline, tsToX, type Span } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { laneHexOf, clip, put, drawStr } from "./draw";

const LABEL_W = 8; // left gutter for the lane label

function drawLane(buf: OptimizedBuffer, x: number, y: number, w: number, label: string, spans: Span[], range: ReturnType<typeof lensTimeline>["range"], colorKey: (s: Span) => string, h: number) {
  drawStr(buf, x, y, clip(label, LABEL_W - 1), RGBA.fromHex(theme.dim), w, h);
  const trackX = x + LABEL_W;
  const trackW = Math.max(1, w - LABEL_W - 1);
  for (const s of spans) {
    if (s.startTs > range.cursorTs) continue;                 // not revealed yet
    const x0 = trackX + tsToX(s.startTs, range, trackW);
    const x1 = trackX + tsToX(Math.min(s.endTs, range.cursorTs), range, trackW);
    const hex = RGBA.fromHex(laneHexOf(colorKey(s)));
    for (let cx = x0; cx <= Math.max(x0, x1); cx++) put(buf, cx, y, "▓", hex, w, h);
    drawStr(buf, x0 + 1, y, clip(s.label, Math.max(0, x1 - x0 - 1)), RGBA.fromHex(theme.fg), w, h);
  }
}

export function drawSkillTimeline(buf: OptimizedBuffer, x: number, y: number, w: number, beats: Beat[], cursor: number, h: number) {
  const tl = lensTimeline(beats, cursor);
  drawLane(buf, x, y, w, "skills", tl.skills, tl.range, (s) => s.label, h);
  drawLane(buf, x, y + 1, w, "agents", tl.agents, tl.range, () => "task", h);
  // axis row: playhead + milestone ticks
  const trackX = x + LABEL_W;
  const trackW = Math.max(1, w - LABEL_W - 1);
  const ay = y + 2;
  for (let cx = trackX; cx < trackX + trackW; cx++) put(buf, cx, ay, "─", RGBA.fromHex(theme.wireDim), w, h);
  for (const m of tl.milestones) {
    if (m.ts > tl.range.cursorTs) continue;
    put(buf, trackX + tsToX(m.ts, tl.range, trackW), ay, "◆", RGBA.fromHex(theme.warn), w, h);
  }
  put(buf, trackX + tsToX(tl.range.cursorTs, tl.range, trackW), ay, "▲", RGBA.fromHex(theme.accent), w, h);
}
