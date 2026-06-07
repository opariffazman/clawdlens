import { theme, TRANSPARENT } from "./theme";
import { filterCommands } from "../core/commands";
import { menuWindow } from "../core/chrome";
import type { PanelId } from "../core/types";
import { iconFor } from "./icons";

const ROWS = 8;

export function CommandPalette({ query, index, panel, width }:
  { query: string; index: number; panel: PanelId; width: number }) {
  const matches = filterCommands(query, panel);
  const win = menuWindow(matches.length, Math.max(0, index), ROWS);
  const slice = matches.slice(win.start, win.start + win.count);
  const w = Math.min(60, Math.max(20, width - 4));
  return (
    <box
      style={{
        position: "absolute", left: 1, top: 1, width: w,
        border: true, borderStyle: "rounded", borderColor: theme.accent,
        paddingLeft: 1, paddingRight: 1, backgroundColor: TRANSPARENT, flexDirection: "column",
      }}
      title=" command "
    >
      <box style={{ flexDirection: "row" }}>
        <text fg={theme.accent}>{": "}</text>
        <text fg={theme.fg}>{query}</text>
        <text fg={theme.accent}>▏</text>
      </box>
      {matches.length === 0 && <text fg={theme.dim}>no match</text>}
      {slice.map((c, i) => {
        const sel = win.start + i === index;
        return (
          <box key={c.id} style={{ flexShrink: 0, flexDirection: "row" }}>
            <text fg={sel ? theme.accent : theme.dim}>{sel ? "▸ " : "  "}</text>
            {c.icon && <text fg={theme.dim}>{iconFor(c.icon) + " "}</text>}
            <text fg={sel ? theme.fg : theme.dim}>{c.title}</text>
            {c.hint && <text fg={theme.dim}>{`  ${c.hint}`}</text>}
          </box>
        );
      })}
      <text fg={theme.dim}>{"⏎ run · Tab complete · esc close"}</text>
    </box>
  );
}
