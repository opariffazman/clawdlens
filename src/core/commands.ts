import type { PanelId, IconKey } from "./types";
import { fuzzyScore } from "./chrome";

export interface Command {
  id: string;
  title: string;
  aliases?: string[];
  hint?: string;
  icon?: IconKey;
  context?: (panel: PanelId) => boolean; // shown only when true (default: always)
}

export const COMMANDS: Command[] = [
  { id: "panel.lens", title: "Show Lens", aliases: ["lens"], icon: "skill" },
  { id: "panel.files", title: "Show Files", aliases: ["files"], icon: "read" },
  { id: "panel.tasks", title: "Show Tasks", aliases: ["tasks"], icon: "todo" },
  { id: "panel.git", title: "Show Git", aliases: ["git"], icon: "tool" },
  { id: "panel.log", title: "Show Log", aliases: ["log"], icon: "text" },
  { id: "nav.sessions", title: "Sessions…", aliases: ["sessions", "proj", "projects"], icon: "task" },
  { id: "view.help", title: "Help", aliases: ["help"], hint: "?" },
  { id: "play.pause", title: "Pause / Play", aliases: ["pause", "play"] },
  { id: "play.replay", title: "Replay", aliases: ["replay"] },
  { id: "play.live", title: "Go Live", aliases: ["live"] },
  { id: "errors.next", title: "Next Error", aliases: ["error", "errors"] },
  { id: "errors.prev", title: "Prev Error", aliases: ["error-prev"] },
  { id: "files.sort", title: "Sort: edits / reads / recent", aliases: ["sort"], context: (p) => p === "files" },
  { id: "git.scope", title: "Scope: all / branch", aliases: ["scope"], context: (p) => p === "git" },
  { id: "tasks.hideDone", title: "Toggle hide-completed", aliases: ["hide-done", "hide"], context: (p) => p === "tasks" },
  { id: "lens.info", title: "Toggle info detail", aliases: ["info", "detail"], context: (p) => p === "lens" },
  { id: "app.quit", title: "Quit", aliases: ["q", "quit", "exit"] },
];

// Context-filter for the active panel, then fuzzy-rank by best score over
// title + aliases. Empty query keeps registry order; ties keep registry order.
export function filterCommands(query: string, panel: PanelId): Command[] {
  const scored: { c: Command; score: number; i: number }[] = [];
  COMMANDS.forEach((c, i) => {
    if (c.context && !c.context(panel)) return;
    const targets = [c.title, ...(c.aliases ?? [])];
    let best: number | null = null;
    for (const t of targets) {
      const s = fuzzyScore(query, t);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best !== null) scored.push({ c, score: best, i });
  });
  scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return scored.map((x) => x.c);
}

export interface Suggestion { ghost: string; command: Command }

// k9s-style inline completion: among panel-applicable commands, find aliases/titles
// that have `query` as a PREFIX (case-insensitive) and return the remaining text as
// the ghost. Shortest completion first, then registry order. Empty/no-prefix → [].
// (Drives the inline ghost + Up/Down cycling; Enter falls back to filterCommands.)
export function commandSuggestions(query: string, panel: PanelId): Suggestion[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const out: { s: Suggestion; len: number; i: number }[] = [];
  COMMANDS.forEach((c, i) => {
    if (c.context && !c.context(panel)) return;
    let best: string | null = null;
    for (const cand of [...(c.aliases ?? []), c.title]) {
      if (cand.length > query.length && cand.toLowerCase().startsWith(q)) {
        if (best === null || cand.length < best.length) best = cand;
      }
    }
    if (best !== null) out.push({ s: { ghost: best.slice(query.length), command: c }, len: best.length, i });
  });
  out.sort((a, b) => (a.len - b.len) || (a.i - b.i));
  return out.map((x) => x.s);
}
