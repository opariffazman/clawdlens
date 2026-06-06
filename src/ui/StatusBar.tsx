import type { SessionState } from "../core/types";
import { contextLimit } from "../core/tokens";
import { theme } from "./theme";
import { gaugeBar, fmtCost, fmtTokens } from "./format";

interface Props {
  session: SessionState;
  marker: string;       // "▸ live" | "▸ +7 catching up" | "⏸ paused" | "⏪ 142/318"
  elapsedMs: number;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function StatusBar({ session, marker, elapsedMs }: Props) {
  const pct = session.tokens.contextPct;
  const pctColor = pct > 0.85 ? theme.err : pct > 0.6 ? theme.warn : theme.ok;
  return (
    <box style={{ flexDirection: "row", gap: 2 }}>
      <text fg={theme.dim}>ctx </text>
      <text fg={pctColor}>{gaugeBar(pct, 10)}</text>
      <text fg={pctColor}>{Math.round(pct * 100) + "%"}</text>
      <text fg={theme.dim}>{fmtTokens(session.tokens.contextTokens, contextLimit(session.model))}</text>
      <text fg={theme.ok}>{fmtCost(session.costUSD)}</text>
      <text fg={theme.dim}>{fmtElapsed(elapsedMs)}</text>
      <text fg={theme.accent}>{marker}</text>
      {session.parseErrors > 0 && <text fg={theme.err}>{`⚠ ${session.parseErrors}`}</text>}
    </box>
  );
}
