import type { Status } from "../core/types";
import { theme } from "./theme";

export function statusGlyph(s: Status): { glyph: string; color: string; pulse: boolean } {
  switch (s) {
    case "running": return { glyph: "●", color: theme.ok, pulse: false };
    case "working": return { glyph: "◐", color: theme.accent, pulse: false };
    case "waiting": return { glyph: "◑", color: theme.warn, pulse: true };
    case "error":   return { glyph: "✖", color: theme.err, pulse: true };
    case "done":    return { glyph: "✓", color: theme.ok, pulse: false };
    case "dormant": return { glyph: "·", color: theme.dim, pulse: false };
    default:        return { glyph: "○", color: theme.dim, pulse: false };
  }
}

const FILL = "▓", EMPTY = "░";
export function gaugeBar(pct: number, width: number): string {
  const p = Math.max(0, Math.min(1, pct));
  const n = Math.round(p * width);
  return FILL.repeat(n) + EMPTY.repeat(width - n);
}

const SPARK = "▁▂▃▄▅▆▇█";
export function sparkline(values: number[], width: number): string {
  if (values.length === 0) return " ".repeat(width);
  const vals = values.slice(-width);
  const max = Math.max(1, ...vals);
  const cells = vals.map((v) => SPARK[Math.min(SPARK.length - 1, Math.floor((v / max) * (SPARK.length - 1)))]);
  const s = cells.join("");
  return s.length < width ? " ".repeat(width - s.length) + s : s;
}

export function truncate(str: string, n: number): string {
  return str.length <= n ? str : str.slice(0, n - 1) + "…";
}

export function fmtCost(usd: number): string { return "$" + usd.toFixed(2); }

function k(n: number): string { return n >= 1000 ? Math.round(n / 1000) + "k" : String(n); }
export function fmtTokens(ctx: number, limit: number): string { return `${k(ctx)}/${k(limit)}`; }
