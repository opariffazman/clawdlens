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

export interface MenuRow { id: string; left: string; leftColor?: string; right?: string; rightColor?: string; search?: string }

// Fullscreen bordered menu — transparent inside, selection = ▸ + accent fg.
export function Menu({ title, footer, rows, index, width, height, filter }: { title: string; footer: string; rows: MenuRow[]; index: number; width: number; height: number; filter?: string }) {
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
      {filter !== undefined && <text fg={theme.accent}>{`/${filter}▎`}</text>}
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
      search: p.project,
    }));
  }
  return sessionsOf(sessions, project).map((s) => {
    const g = statusGlyph(s.status);
    return { id: s.id, left: `${g.glyph} ${truncate(s.title || s.id, 44)}`, leftColor: g.color, search: s.title || s.id };
  });
}

// Static help rows.
export function helpRows(): MenuRow[] {
  return [
    { id: "h1", left: "command palette (fuzzy)", right: ":" },
    { id: "h2", left: "cycle panels", right: "Tab / Shift-Tab" },
    { id: "h3", left: "scrub timeline", right: "↑ / ↓" },
    { id: "h4", left: "speed down / up", right: "← / →" },
    { id: "h5", left: "pause / play", right: "space" },
    { id: "h6", left: "replay", right: "r" },
    { id: "h6b", left: "jump to live", right: "l" },
    { id: "h6c", left: "jump to next / prev error", right: "e / E" },
    { id: "h7", left: "lens detail", right: "i" },
    { id: "h8", left: "sessions (with / filter)", right: ": sessions" },
    { id: "h9", left: "help", right: "?" },
    { id: "h10", left: "quit", right: "q" },
  ];
}
