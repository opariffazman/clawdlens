import type { SessionState, PanelId } from "../core/types";
import { effectiveContextLimit } from "../core/tokens";
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

export function Header({ session, panel, marker }: { session: SessionState; panel: PanelId; marker: string }) {
  const g = statusGlyph(session.status);
  const pct = session.tokens.contextPct;
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  const elapsed = fmtElapsed(Math.max(0, session.lastActivityTs - session.startedTs));
  const limit = effectiveContextLimit(session.model, session.tokens.contextTokens);
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
          <text fg={theme.dim}>{fmtTokens(session.tokens.contextTokens, limit)}</text>
          <text fg={theme.ok}>{fmtCost(session.costUSD)}</text>
          <text fg={theme.dim}>{elapsed}</text>
          <text fg={theme.accent}>{marker}</text>
          {session.parseErrors > 0 && <text fg={theme.err}>{`⚠ ${session.parseErrors}`}</text>}
        </box>
      </box>
      <box style={{ flexDirection: "column", alignItems: "flex-end", backgroundColor: TRANSPARENT }}>
        {rows.map((row, i) => (
          <box key={i} style={{ flexDirection: "row" }}>
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
