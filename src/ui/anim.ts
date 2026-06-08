const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export function spinnerFrame(tick: number): string {
  return SPINNER[((tick % SPINNER.length) + SPINNER.length) % SPINNER.length]!;
}

// distance d (cells) from the pulse head; tailLen cells until fully dim
export function pulseIntensity(d: number, tailLen: number): number {
  if (d < 0 || d >= tailLen) return 0;
  return 1 - d / tailLen;
}

// 0..1 progress from the last advance toward the next. Parks at 1 (head sits on
// the newest node, breathing) when there is no advance to interpolate from.
export function pulsePhase(now: number, lastAdvanceMs: number, intervalMs: number): number {
  if (lastAdvanceMs < 0 || intervalMs <= 0) return 1;
  const p = (now - lastAdvanceMs) / intervalMs;
  return Math.max(0, Math.min(1, p));
}

function clampByte(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");
}
export function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

// fg-only comet gradient along the spine. `d` = cells from the head (0 = head).
// Two-stage blend: dim→lane by pulse intensity, then lane→hot concentrated at the
// head (t²). `floor` keeps a minimum lane tint (Git's resting branch color).
export function cometColor(
  d: number,
  tail: number,
  laneHex: string,
  hotHex: string,
  dimHex: string,
  floor = 0,
): string {
  const t = pulseIntensity(d, tail); // 1 at head → 0 past the tail
  const laneAmt = Math.max(floor, t);
  if (laneAmt <= 0) return dimHex;
  const base = lerpHex(dimHex, laneHex, laneAmt);
  return lerpHex(base, hotHex, t * t);
}

// slow sine brightness for the parked head, mapped to [0.6, 1.0].
export function breathe(now: number, periodMs = 1800): number {
  const s = 0.5 + 0.5 * Math.sin((2 * Math.PI * now) / periodMs);
  return 0.6 + 0.4 * s;
}

import type { PlayMode } from "../core/player";

// Whether the buffered panels should run their continuous animation loop.
// True only while the player is live AND advanced within the last ~2 intervals;
// paused/history or a quiet live tail park the comet, so the loop can stop.
export function shouldAnimate(mode: PlayMode, lastAdvanceMs: number, intervalMs: number, now: number): boolean {
  if (mode !== "live") return false;
  if (lastAdvanceMs < 0 || intervalMs <= 0) return false;
  return now - lastAdvanceMs < intervalMs * 2;
}
