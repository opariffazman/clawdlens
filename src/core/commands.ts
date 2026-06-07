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
  { id: "view.rescan", title: "Rescan", aliases: ["rescan", "refresh", "reload"] },
  { id: "play.pause", title: "Pause / Play", aliases: ["pause", "play"] },
  { id: "play.replay", title: "Replay", aliases: ["replay"] },
  { id: "play.loop", title: "Loop", aliases: ["loop"] },
  { id: "view.pulse", title: "Toggle Pulse", aliases: ["pulse"] },
  { id: "files.sort", title: "Sort: edits / reads / recent", aliases: ["sort"], context: (p) => p === "files" },
  { id: "git.scope", title: "Scope: all / branch", aliases: ["scope"], context: (p) => p === "git" },
  { id: "tasks.hideDone", title: "Toggle hide-completed", aliases: ["hide-done", "hide"], context: (p) => p === "tasks" },
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
