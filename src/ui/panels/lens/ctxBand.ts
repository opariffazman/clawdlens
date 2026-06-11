import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { CtxPools, SessionTokens } from "../../../core/types";
import { ctxBreakdownView, kfmt } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { drawStr } from "./draw";

const POOL_HEX: Record<string, string> = {
  system: theme.dim, user: theme.coral, tools: theme.accent, subagents: "#C792EA", reasoning: "#82AAFF",
};
const BAR_W = 20;

export function drawCtxBand(buf: OptimizedBuffer, x: number, y: number, tokens: SessionTokens, pools: CtxPools, w: number, h: number) {
  const v = ctxBreakdownView(tokens, pools);
  if (v.total <= 0) return;
  drawStr(buf, x, y, "ctx~ ", RGBA.fromHex(theme.dim), w, h);
  let cx = x + 5;
  let used = 0;
  for (const seg of v.segments) {
    const cells = Math.min(Math.round(seg.frac * BAR_W), BAR_W - used);
    if (cells <= 0) continue;
    used += cells;
    const col = RGBA.fromHex(POOL_HEX[seg.key] ?? theme.dim);
    for (let i = 0; i < cells; i++) drawStr(buf, cx++, y, "▓", col, w, h);
  }
  cx = x + 5 + BAR_W + 2;
  for (const seg of v.segments) {
    if (seg.tokens <= 0) continue;
    drawStr(buf, cx, y, `${seg.label} `, RGBA.fromHex(theme.dim), w, h); cx += seg.label.length + 1;
    const val = kfmt(seg.tokens);
    drawStr(buf, cx, y, val, RGBA.fromHex(POOL_HEX[seg.key] ?? theme.dim), w, h); cx += val.length;
    drawStr(buf, cx, y, " · ", RGBA.fromHex(theme.dim), w, h); cx += 3;
  }
}
