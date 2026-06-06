import { readFileSync } from "node:fs";
import { parseLine } from "./parse";
import { newSession, applyEntry } from "./reducer";
import type { Beat, SessionState } from "./types";

// Fold an ENTIRE transcript file (no EOF/backfill window) into a complete
// SessionState. Used by replay (full beats from event #1) and by the aggregate
// detail panels (Files heatmap, Tasks) which need whole-session counts — the
// live store only keeps the recent backfill window.
export function loadSession(file: string, now = 0): SessionState {
  const s = newSession("full", file);
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return s; }
  let cur = s;
  for (const raw of text.split("\n")) {
    const entry = parseLine(raw);
    if (entry) cur = applyEntry(cur, entry, now);
  }
  return cur;
}

export function loadBeats(file: string): Beat[] {
  return loadSession(file).beats;
}
