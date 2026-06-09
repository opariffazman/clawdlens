import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { SessionTokens } from "../../../core/types";
import { economyView } from "../../../core/lens-bands";
import { theme } from "../../theme";
import { drawStr } from "./draw";

export function drawEconomy(buf: OptimizedBuffer, x: number, y: number, tokens: SessionTokens, w: number, h: number) {
  const e = economyView(tokens);
  const line = `↑ in ${e.inTok}   ↓ out ${e.outTok}   ⟳ cache ${e.cachePct}%   ◉ web ${e.web}`;
  drawStr(buf, x, y, line, RGBA.fromHex(theme.dim), w, h);
}
