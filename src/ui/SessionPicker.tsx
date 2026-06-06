import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { statusGlyph, truncate } from "./format";

export interface PickerState {
  open: boolean;
  stage: "projects" | "sessions";
  project: string | null;
  index: number;
}

export interface ProjectRow { project: string; count: number; live: number; lastTs: number }

// group sessions by project (folder), most-recently-active first
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

export function SessionPicker({ sessions, picker, width, height }: { sessions: SessionState[]; picker: PickerState; width: number; height: number }) {
  const rows = Math.max(1, height - 4);
  const window = <T,>(items: T[]) => {
    const start = Math.max(0, Math.min(picker.index - Math.floor(rows / 2), Math.max(0, items.length - rows)));
    return { start, slice: items.slice(start, start + rows), more: Math.max(0, items.length - (start + rows)) };
  };

  if (picker.stage === "projects") {
    const projects = projectsOf(sessions);
    const { start, slice, more } = window(projects);
    return (
      <box style={{ position: "absolute", border: true, padding: 1, width, height, backgroundColor: theme.panel, flexDirection: "column" }} title="PROJECTS · ⏎ open · esc close">
        {projects.length === 0 && <text fg={theme.dim}>no sessions</text>}
        {slice.map((p, i) => {
          const sel = start + i === picker.index;
          return (
            <box key={p.project} style={{ flexShrink: 0, flexDirection: "row", backgroundColor: sel ? theme.sel : undefined }}>
              <text fg={sel ? theme.accent : theme.fg}>{(sel ? "▸ " : "  ") + truncate(p.project, width - 18)}</text>
              <text fg={p.live ? theme.ok : theme.dim}>{`  ${p.count}·${p.live}▲`}</text>
            </box>
          );
        })}
        {more > 0 && <text fg={theme.dim}>{`  +${more} more`}</text>}
      </box>
    );
  }

  const list = picker.project ? sessionsOf(sessions, picker.project) : [];
  const { start, slice, more } = window(list);
  return (
    <box style={{ position: "absolute", border: true, padding: 1, width, height, backgroundColor: theme.panel, flexDirection: "column" }} title={`${truncate(picker.project ?? "", width - 18)} · ⏎ open · esc back`}>
      {list.length === 0 && <text fg={theme.dim}>no sessions</text>}
      {slice.map((s, i) => {
        const sel = start + i === picker.index;
        const g = statusGlyph(s.status);
        return (
          <box key={s.id} style={{ flexShrink: 0, flexDirection: "row", backgroundColor: sel ? theme.sel : undefined }}>
            <text fg={g.color}>{(sel ? "▸" : " ") + g.glyph + " "}</text>
            <text fg={sel ? theme.fg : theme.dim}>{truncate(s.title || s.id, width - 8)}</text>
          </box>
        );
      })}
      {more > 0 && <text fg={theme.dim}>{`  +${more} more`}</text>}
    </box>
  );
}
