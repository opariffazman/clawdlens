import type { SessionState, PanelId, BeatSnap } from "../core/types";
import { headerValues } from "./headerReveal";
import { hintsFor } from "../core/chrome";
import { theme, TRANSPARENT } from "./theme";
import { statusGlyph, gaugeBar, fmtCost, fmtTokens } from "./format";
import { WORDMARK, WORDMARK_W } from "./panels/lens/iconArt.gen";

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// brand wordmark fills the dead gap to the LEFT of the shortcut tips. It scales
// with the room left over once both columns are measured: full miniwi art when it
// fits, a plain word when only a sliver remains, nothing when the columns collide.
function markTier(width: number, leftW: number, rightW: number): "art" | "word" | "none" {
  const gap = width - leftW - rightW;
  if (gap >= WORDMARK_W + 4) return "art";
  if (gap >= "clawdlens".length + 4) return "word";
  return "none";
}

export function Header({ session, panel, marker, reveal, locked, width }: { session: SessionState; panel: PanelId; marker: string; reveal?: BeatSnap | null; locked?: boolean; width?: number }) {
  const g = statusGlyph(session.status);
  const { cost, ctxTokens, pct, limit } = headerValues(session, reveal ?? null);
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  const elapsed = fmtElapsed(Math.max(0, session.lastActivityTs - session.startedTs));
  const rows = chunk(hintsFor(panel), 3);

  // measure both columns (in cells) so the wordmark only claims genuinely empty space
  const line1 = `${locked ? "⌂ " : ""}${session.project} · ${session.gitBranch || "?"} · ${session.model} · ${session.status}`;
  const row1W = 2 + [...line1].length; // status glyph + gap:1 + text
  const row2parts = ["ctx", gaugeBar(pct, 10), Math.round(pct * 100) + "%", fmtTokens(ctxTokens, limit), fmtCost(cost), elapsed, marker, ...(session.parseErrors > 0 ? [`⚠ ${session.parseErrors}`] : [])];
  const row2W = row2parts.reduce((s, p) => s + [...p].length, 0) + (row2parts.length - 1); // gap:1 between
  const leftW = Math.max(row1W, row2W);
  const rightW = Math.max(...rows.map((r) => r.reduce((s, h) => s + h.key.length + h.label.length + 3, 0))); // key + " " + label + "  "
  const tier = width ? markTier(width, leftW, rightW) : "none";
  // overlay (absolute, out of flex flow) so the keybar keeps its exact spot and
  // Yoga never tries to measure the block-glyph wordmark. Centered in the gap.
  const markW = tier === "art" ? WORDMARK_W : "clawdlens".length;
  const markLeft = width ? leftW + Math.max(0, ((width - leftW - rightW - markW) >> 1)) : 0;

  return (
    <box style={{ flexShrink: 0, flexDirection: "row", justifyContent: "space-between", backgroundColor: TRANSPARENT }}>
      <box style={{ flexDirection: "column", backgroundColor: TRANSPARENT }}>
        {/* wrapMode none: squeezed header text must clip, not wrap — a wrapped row
            grows the header past 3 rows and breaks Showcase's fixed height budget
            (panel body then overflows the bottom border at narrow widths). */}
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={g.color}>{g.glyph}</text>
          <text fg={theme.fg} wrapMode="none">{`${locked ? "⌂ " : ""}${session.project} · ${session.gitBranch || "?"} · ${session.model} · ${session.status}`}</text>
        </box>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.dim}>ctx</text>
          <text fg={pctColor} wrapMode="none">{gaugeBar(pct, 10)}</text>
          <text fg={pctColor}>{Math.round(pct * 100) + "%"}</text>
          <text fg={theme.dim} wrapMode="none">{fmtTokens(ctxTokens, limit)}</text>
          <text fg={theme.ok}>{fmtCost(cost)}</text>
          <text fg={theme.dim}>{elapsed}</text>
          <text fg={theme.accent} wrapMode="none">{marker}</text>
          {session.parseErrors > 0 && <text fg={theme.err}>{`⚠ ${session.parseErrors}`}</text>}
        </box>
      </box>
      {tier === "art" ? (
        <box style={{ position: "absolute", left: markLeft, top: 0, flexDirection: "column", alignItems: "center", backgroundColor: TRANSPARENT }}>
          {WORDMARK.map((line, i) => (
            <text key={i} fg={theme.coral} wrapMode="none">{line}</text>
          ))}
        </box>
      ) : tier === "word" ? (
        <box style={{ position: "absolute", left: markLeft, top: 1, backgroundColor: TRANSPARENT }}>
          <text fg={theme.coral} wrapMode="none">clawdlens</text>
        </box>
      ) : null}
      <box style={{ flexDirection: "column", alignItems: "flex-end", backgroundColor: TRANSPARENT }}>
        {rows.map((row) => (
          <box key={row.map((h) => h.key).join(",")} style={{ flexDirection: "row" }}>
            {row.map((h) => (
              <box key={h.key} style={{ flexDirection: "row" }}>
                <text fg={theme.accent}>{h.key}</text>
                <text fg={theme.dim}>{` ${h.label}  `}</text>
              </box>
            ))}
          </box>
        ))}
      </box>
    </box>
  );
}
