import type { SessionState, PanelId, BeatSnap } from "../core/types";
import { headerValues } from "./headerReveal";
import { hintsFor } from "../core/chrome";
import { theme, TRANSPARENT } from "./theme";
import { statusGlyph, gaugeBar, fmtCost, fmtTokens } from "./format";

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

export function Header({ session, panel, marker, reveal }: { session: SessionState; panel: PanelId; marker: string; reveal?: BeatSnap | null }) {
  const g = statusGlyph(session.status);
  const { cost, ctxTokens, pct, limit } = headerValues(session, reveal ?? null);
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  const elapsed = fmtElapsed(Math.max(0, session.lastActivityTs - session.startedTs));
  const rows = chunk(hintsFor(panel), 3);

  return (
    <box style={{ flexShrink: 0, flexDirection: "row", justifyContent: "space-between", backgroundColor: TRANSPARENT }}>
      <box style={{ flexDirection: "column", backgroundColor: TRANSPARENT }}>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={g.color}>{g.glyph}</text>
          <text fg={theme.fg}>{`${session.project} · ${session.gitBranch || "?"} · ${session.model} · ${session.status}`}</text>
        </box>
        <box style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.dim}>ctx</text>
          <text fg={pctColor}>{gaugeBar(pct, 10)}</text>
          <text fg={pctColor}>{Math.round(pct * 100) + "%"}</text>
          <text fg={theme.dim}>{fmtTokens(ctxTokens, limit)}</text>
          <text fg={theme.ok}>{fmtCost(cost)}</text>
          <text fg={theme.dim}>{elapsed}</text>
          <text fg={theme.accent}>{marker}</text>
          {session.parseErrors > 0 && <text fg={theme.err}>{`⚠ ${session.parseErrors}`}</text>}
        </box>
      </box>
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
