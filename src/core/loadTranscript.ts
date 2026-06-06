import { readFileSync } from "node:fs";
import { parseLine } from "./parse";
import { newSession, applyEntry } from "./reducer";
import type { Beat } from "./types";

// Read an ENTIRE transcript file (no EOF/backfill window) and fold it into the
// full ordered beat list — used for cinematic replay from event #1.
export function loadBeats(file: string): Beat[] {
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return []; }
  let s = newSession("replay", file);
  const now = 0;
  for (const raw of text.split("\n")) {
    const entry = parseLine(raw);
    if (entry) s = applyEntry(s, entry, now);
  }
  return s.beats;
}
