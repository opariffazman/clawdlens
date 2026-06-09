import { RGBA, type OptimizedBuffer } from "@opentui/core";
import { theme, TRANSPARENT } from "../../theme";

// lane color per pipeline stage / arbitrary key (skills hash to a stable hue)
const STAGE_COL: Record<string, number> = { think: 0, tool: 1, skill: 4, result: 2, chat: 3 };
export function laneHexOf(kind: string): string {
  const col = STAGE_COL[kind] ?? (kind.charCodeAt(0) % theme.laneColors.length);
  return theme.laneColors[col % theme.laneColors.length]!;
}

export function clip(s: string, n: number): string {
  if (n <= 0) return "";
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s;
}

export function put(buf: OptimizedBuffer, x: number, y: number, ch: string, fg: RGBA, w: number, h: number) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  buf.setCell(x, y, ch, fg, TRANSPARENT);
}

export function drawStr(buf: OptimizedBuffer, x: number, y: number, s: string, fg: RGBA, w: number, h: number) {
  for (let i = 0; i < s.length; i++) put(buf, x + i, y, s[i]!, fg, w, h);
}
