import type { SessionState } from "../core/types";
import { theme, TRANSPARENT } from "./theme";
import { statusGlyph, truncate } from "./format";
import { menuWindow } from "../core/chrome";

export interface ProjectRow { project: string; count: number; live: number; lastTs: number }

export function projectsOf(sessions: SessionState[]): ProjectRow[] {
  const map = new Map<string, ProjectRow>();
  for (const s of sessions) {
    const p = s.project || "(unknown)";
    const cur = map.get(p) ?? { project: p, count: 0, live: 0, lastTs: 0 };
    cur.count += 1;
    if (s.status === "running" || s.status === "working") cur.live += 1;
    cur.lastTs = Math.max(cur.lastTs, s.lastActivityTs);
    map.set(p, cur);
  }
  return [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
}

export function sessionsOf(sessions: SessionState[], project: string): SessionState[] {
  return sessions
    .filter((s) => (s.project || "(unknown)") === project)
    .sort((a, b) => b.lastActivityTs - a.lastActivityTs);
}

export interface MenuRow { id: string; left: string; leftColor?: string; right?: string; rightColor?: string }

// Fullscreen bordered menu — transparent inside, selection = ▸ + accent fg.
export function Menu({ title, footer, rows, index, width, height }:
  { title: string; footer: string; rows: MenuRow[]; index: number; width: number; height: number }) {
  const inner = Math.max(1, height - 4);
  const win = menuWindow(rows.length, index, inner);
  const slice = rows.slice(win.start, win.start + win.count);
  return (
    <box
      style={{
        position: "absolute", left: 0, top: 0, width, height,
        border: true, borderStyle: "rounded", borderColor: theme.accent,
        padding: 1, backgroundColor: TRANSPARENT, flexDirection: "column",
      }}
      title={title}
    >
      {rows.length === 0 && <text fg={theme.dim}>nothing here</text>}
      {slice.map((r, i) => {
        const sel = win.start + i === index;
        return (
          <box key={r.id} style={{ flexShrink: 0, flexDirection: "row", backgroundColor: TRANSPARENT }}>
            <text fg={sel ? theme.accent : theme.dim}>{sel ? "▸ " : "  "}</text>
            <text fg={r.leftColor ?? (sel ? theme.fg : theme.dim)}>{r.left}</text>
            {r.right && <text fg={r.rightColor ?? theme.dim}>{`  ${r.right}`}</text>}
          </box>
        );
      })}
      {win.more > 0 && <text fg={theme.dim}>{`  +${win.more} more`}</text>}
      <box style={{ flexGrow: 1 }} />
      <text fg={theme.dim}>{footer}</text>
    </box>
  );
}

// Build picker rows (project stage or session stage).
export function pickerRows(sessions: SessionState[], project: string | null): MenuRow[] {
  if (!project) {
    return projectsOf(sessions).map((p) => ({
      id: p.project,
      left: truncate(p.project, 40),
      right: `${p.count}·${p.live}▲`,
      rightColor: p.live ? theme.ok : theme.dim,
    }));
  }
  return sessionsOf(sessions, project).map((s) => {
    const g = statusGlyph(s.status);
    return { id: s.id, left: `${g.glyph} ${truncate(s.title || s.id, 44)}`, leftColor: g.color };
  });
}

// Static help rows.
export function helpRows(): MenuRow[] {
  return [
    { id: "h1", left: ": command palette (fuzzy)", right: ":" },
    { id: "h2", left: "cycle panels", right: "Tab / Shift-Tab" },
    { id: "h3", left: "scrub beats", right: "h / l  ← →" },
    { id: "h4", left: "chunk scrub", right: "[ ]" },
    { id: "h5", left: "start / live", right: "g / G" },
    { id: "h6", left: "pause", right: "space" },
    { id: "h7", left: "speed", right: "+ / -" },
    { id: "h8", left: "pulse", right: "p" },
    { id: "h9", left: "lens ribbon", right: "w" },
    { id: "h10", left: "replay / loop", right: "R / L" },
    { id: "h11", left: "rescan", right: "r" },
    { id: "h12", left: "sessions", right: ": sessions" },
    { id: "h13", left: "quit", right: "q  ( :q )" },
  ];
}
