// Pure chrome helpers: fuzzy matcher, hint list, tab-cell layout, menu windowing.
// View-independent so they are unit-tested; the UI is a thin render of these.

import type { PanelId } from "./types";

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

// Filter + rank rows by fuzzy match on `search` (fallback `left`). Empty query
// returns rows unchanged. Sorted by score desc; ties keep original order.
export function rankRows<T extends { search?: string; left: string }>(rows: T[], query: string): T[] {
  if (!query) return rows;
  const scored: { r: T; s: number; i: number }[] = [];
  rows.forEach((r, i) => {
    const s = fuzzyScore(query, r.search ?? r.left);
    if (s !== null) scored.push({ r, s, i });
  });
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return scored.map((x) => x.r);
}

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

export type TabRole = "active" | "inactive" | "border";
export interface TabCell { x: number; row: number; ch: string; role: TabRole }

// Lay out the 2-row merged tab border. Row 0 holds tab tops/labels, row 1 holds
// the frame's top border with an opening punched under the active tab. Colors are
// expressed as roles; the renderer maps role -> RGBA (keeps hex out of core).
export function tabBarCells(tabs: TabSeg[], width: number): TabCell[] {
  const cells: TabCell[] = [];
  // Row 1: continuous rule with frame corners.
  const rule: string[] = new Array(width).fill("─");
  if (width > 0) rule[0] = "╭";
  if (width > 1) rule[width - 1] = "╮";

  // Row 0: place tabs left-to-right starting at x=1 (x=0 is the frame corner).
  let x = 1;
  const push = (cx: number, row: number, ch: string, role: TabRole) => {
    if (cx >= 0 && cx < width) cells.push({ x: cx, row, ch, role });
  };

  for (const tab of tabs) {
    const L = tab.label.length;
    if (tab.active) {
      const left = x;                 // `╭` / `┘`
      const right = x + L + 3;        // `╮` / `└`
      if (right >= width) break;  // no room — clip remaining tabs
      push(left, 0, "╭", "active");
      push(left + 1, 0, "─", "active");
      for (let i = 0; i < L; i++) push(left + 2 + i, 0, tab.label[i]!, "active");
      push(left + 2 + L, 0, "─", "active");
      push(right, 0, "╮", "active");
      // row 1 opening under the notch
      rule[left] = "┘";
      for (let i = left + 1; i < right; i++) rule[i] = " ";
      rule[right] = "└";
      x = right + 2;                  // gap after tab
    } else {
      const start = x + 1;            // 1-space lead
      if (start + L >= width) break;
      for (let i = 0; i < L; i++) push(start + i, 0, tab.label[i]!, "inactive");
      x = start + L + 2;              // trailing space + gap
    }
  }

  for (let i = 0; i < width; i++) push(i, 1, rule[i]!, "border");
  return cells;
}

export interface MenuWindow { start: number; count: number; selected: number; more: number }

export function menuWindow(total: number, index: number, rows: number): MenuWindow {
  const r = Math.max(1, rows);
  const start = Math.max(0, Math.min(index - Math.floor(r / 2), Math.max(0, total - r)));
  const count = Math.min(r, total - start);
  return { start, count, selected: Math.max(0, Math.min(index - start, count - 1)), more: Math.max(0, total - (start + count)) };
}
