import { RGBA, type OptimizedBuffer } from "@opentui/core";
import type { LensState } from "../../../core/types";
import { SUPERPOWERS_PHASES } from "../../../core/lens";
import { theme } from "../../theme";
import { breathe, lerpHex } from "../../anim";
import { put, drawStr } from "./draw";

// horizontal stepper of superpowers phases at row `y`. Hidden by the caller when
// lens.lensId !== "superpowers".
export function drawPhaseRibbon(buf: OptimizedBuffer, x: number, y: number, lens: LensState, animating: boolean, now: number, w: number, h: number) {
  const done = new Set(lens.phaseHistory.map((p) => p.phase));
  let cx = x;
  SUPERPOWERS_PHASES.forEach((phase, i) => {
    const isActive = phase === lens.activePhase;
    const isDone = done.has(phase) && !isActive;
    const glyph = isActive ? "●" : isDone ? "✓" : "○";
    const col = isActive
      ? (animating ? lerpHex(theme.accent, theme.pulseHot, breathe(now)) : theme.accent)
      : isDone ? theme.ok : theme.dim;
    put(buf, cx, y, glyph, RGBA.fromHex(col), w, h); cx += 2;
    drawStr(buf, cx, y, phase, RGBA.fromHex(isActive ? theme.fg : theme.dim), w, h); cx += phase.length + 1;
    if (i < SUPERPOWERS_PHASES.length - 1) { put(buf, cx, y, "─", RGBA.fromHex(theme.wireDim), w, h); cx += 2; }
  });
}
