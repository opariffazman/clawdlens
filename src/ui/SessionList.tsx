import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { statusGlyph, sparkline, truncate } from "./format";

interface Props {
  sessions: SessionState[];
  selectedIndex: number;
  blink: boolean; // toggles each ~500ms for pulsing rows
  width: number;
  height: number;
}

function tokenRate(s: SessionState): number[] {
  // crude per-beat output proxy: last few beats' counts
  return s.beats.slice(-12).map((b) => b.count);
}

export function SessionList({ sessions, selectedIndex, blink, width, height }: Props) {
  const live = sessions.filter((s) => s.status === "running" || s.status === "working").length;
  const waiting = sessions.filter((s) => s.status === "waiting").length;

  // reserve rows: border(2) + padding(2) + marginTop(1) + footer counts(1) + sparkline(1) + "+N more"(1)
  const maxVisible = Math.max(1, height - 8);
  // keep the selected row in view by windowing around it
  const start = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, sessions.length - maxVisible)));
  const visible = sessions.slice(start, start + maxVisible);
  const hidden = sessions.length - visible.length;

  return (
    <box style={{ width, border: true, flexDirection: "column", padding: 1 }} title="SESSIONS">
      {sessions.length === 0 && <text fg={theme.dim}>no sessions yet…</text>}
      {visible.map((s, i) => {
        const idx = start + i;
        const g = statusGlyph(s.status);
        const selected = idx === selectedIndex;
        const dim = g.pulse && blink;
        const color = dim ? theme.dim : g.color;
        const title = truncate(s.title || s.project || s.id, width - 8);
        return (
          <box key={s.id} style={{ flexShrink: 0, flexDirection: "row", backgroundColor: selected ? theme.sel : undefined }}>
            <text fg={color}>{(selected ? "▸" : " ") + g.glyph + " "}</text>
            <text fg={selected ? theme.fg : theme.dim}>{title}</text>
          </box>
        );
      })}
      {hidden > 0 && <text fg={theme.dim}>{`  +${hidden} more`}</text>}
      <box style={{ flexShrink: 0, flexDirection: "column", marginTop: 1 }}>
        <text fg={theme.dim}>{`${live} live · ${waiting} wait`}</text>
        {sessions[selectedIndex] && (
          <text fg={theme.accent}>{sparkline(tokenRate(sessions[selectedIndex]!), width - 4)}</text>
        )}
      </box>
    </box>
  );
}
