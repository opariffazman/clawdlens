import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { statusGlyph, sparkline, truncate } from "./format";

interface Props {
  sessions: SessionState[];
  selectedIndex: number;
  blink: boolean; // toggles each ~500ms for pulsing rows
  width: number;
}

function tokenRate(s: SessionState): number[] {
  // crude per-beat output proxy: last few beats' counts
  return s.beats.slice(-12).map((b) => b.count);
}

export function SessionList({ sessions, selectedIndex, blink, width }: Props) {
  const live = sessions.filter((s) => s.status === "running" || s.status === "working").length;
  const waiting = sessions.filter((s) => s.status === "waiting").length;
  return (
    <box style={{ width, border: true, flexDirection: "column", padding: 1 }} title="SESSIONS">
      {sessions.length === 0 && <text fg={theme.dim}>no sessions yet…</text>}
      {sessions.map((s, i) => {
        const g = statusGlyph(s.status);
        const selected = i === selectedIndex;
        const dim = g.pulse && blink;
        const color = dim ? theme.dim : g.color;
        const title = truncate(s.title || s.project || s.id, width - 8);
        return (
          <box key={s.id} style={{ flexDirection: "row", backgroundColor: selected ? theme.sel : undefined }}>
            <text fg={color}>{(selected ? "▸" : " ") + g.glyph + " "}</text>
            <text fg={selected ? theme.fg : theme.dim}>{title}</text>
          </box>
        );
      })}
      <box style={{ flexDirection: "row", marginTop: 1 }}>
        <text fg={theme.dim}>{`${live} live · ${waiting} wait`}</text>
      </box>
      {sessions[selectedIndex] && (
        <text fg={theme.accent}>{sparkline(tokenRate(sessions[selectedIndex]!), width - 4)}</text>
      )}
    </box>
  );
}
