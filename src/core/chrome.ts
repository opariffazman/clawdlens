// Pure chrome helpers: fuzzy matcher, hint list, tab-cell layout, menu windowing.
// View-independent so they are unit-tested; the UI is a thin render of these.

// Subsequence fuzzy match. Returns a ranking score (higher = better) or null if
// `query` is not a subsequence of `target`. Boosts consecutive runs and matches
// at word starts (index 0 or after a non-alphanumeric char). Case-insensitive.
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  let score = 0;
  let ti = 0;
  let prev = -2;
  let streak = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const c = q[qi]!;
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === c) { found = j; break; }
    }
    if (found === -1) return null;
    let pts = 1;
    if (found === prev + 1) { streak += 1; pts += streak; } else { streak = 0; }
    const before = found > 0 ? t[found - 1]! : " ";
    if (found === 0 || /[^a-z0-9]/.test(before)) pts += 2; // word-start boost
    score += pts;
    prev = found;
    ti = found + 1;
  }
  return score;
}

import type { PanelId } from "./types";

export interface Hint { key: string; label: string }

const GLOBAL_HINTS: Hint[] = [
  { key: ":", label: "cmd" },
  { key: "Tab", label: "cycle" },
  { key: "h/l", label: "scrub" },
  { key: "space", label: "pause" },
  { key: "?", label: "help" },
  { key: "q", label: "quit" },
];

const PANEL_HINTS: Record<PanelId, Hint[]> = {
  lens: [],
  log: [{ key: "[ ]", label: "chunk" }, { key: "p", label: "pulse" }],
  files: [{ key: ":sort", label: "sort" }],
  git: [{ key: ":scope", label: "scope" }],
  tasks: [{ key: ":hide-done", label: "hide done" }],
};

export function hintsFor(panel: PanelId): Hint[] {
  return [...GLOBAL_HINTS, ...PANEL_HINTS[panel]];
}

export interface TabSeg { id: PanelId; label: string; active: boolean }

const TAB_LABELS: Record<PanelId, string> = {
  lens: "Lens", files: "Files", tasks: "Tasks", git: "Git", log: "Log",
};

export function tabModel(panels: PanelId[], active: PanelId): TabSeg[] {
  return panels.map((id) => ({ id, label: TAB_LABELS[id], active: id === active }));
}
