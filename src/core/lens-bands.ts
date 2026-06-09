import type { Beat } from "./types";
import { detectLensFromBeats } from "./lens";

export interface Span { key: string; label: string; startTs: number; endTs: number }
export interface TimeRange { startTs: number; endTs: number; cursorTs: number }
export interface LensTimeline {
  range: TimeRange;
  skills: Span[];
  agents: Span[];
  milestones: { ts: number; kind: "commit" | "branch" }[];
}

// map a timestamp to an x column within [0, width-1] over the range; safe when
// the range is degenerate (single beat / zero span).
export function tsToX(ts: number, range: TimeRange, width: number): number {
  const w = Math.max(1, width);
  const span = range.endTs - range.startTs;
  if (span <= 0) return 0;
  const f = (ts - range.startTs) / span;
  return Math.max(0, Math.min(w - 1, Math.floor(f * (w - 1))));
}

function rangeOf(beats: Beat[], cursor: number): TimeRange {
  const startTs = beats[0]?.ts ?? 0;
  const endTs = beats[beats.length - 1]?.ts ?? startTs;
  const idx = Math.min(Math.max(0, cursor), beats.length);
  const cursorTs = idx > 0 ? beats[idx - 1]!.ts : startTs;
  return { startTs, endTs, cursorTs };
}

// skill + agent spans + milestones over the WHOLE beat list; the renderer clips
// to range.cursorTs for the reveal.
export function lensTimeline(beats: Beat[], cursor: number): LensTimeline {
  const range = rangeOf(beats, cursor);

  const groups = detectLensFromBeats(beats).skillGroups;
  const skills: Span[] = groups.map((g, i) => ({
    key: `${g.skill}:${i}`,
    label: g.skill,
    startTs: g.ts,
    endTs: groups[i + 1]?.ts ?? range.cursorTs,
  }));

  const agentByLane = new Map<string, { label: string; startTs: number; endTs: number }>();
  for (const b of beats) {
    if (b.iconKey === "task" && b.toolUseId) {
      agentByLane.set(b.toolUseId, { label: b.label.replace(/^Task · /, ""), startTs: b.ts, endTs: b.ts });
    }
  }
  for (const b of beats) {
    const a = agentByLane.get(b.lane);
    if (a) a.endTs = Math.max(a.endTs, b.ts);
  }
  const agents: Span[] = [...agentByLane.entries()].map(([key, a]) => ({ key, label: a.label, startTs: a.startTs, endTs: a.endTs }));

  const milestones = beats.filter((b) => b.milestone).map((b) => ({ ts: b.ts, kind: b.milestone! }));

  return { range, skills, agents, milestones };
}

export interface HeartBucket { count: number; kind: string }

// beats-per-time-window across the full [start..end] axis; only beats with
// index < cursor are counted (so the band fills left->right on reveal). Each
// bucket reports its dominant beat kind for coloring.
export function heartbeatBuckets(beats: Beat[], cursor: number, width: number): HeartBucket[] {
  const w = Math.max(1, width);
  const buckets: HeartBucket[] = Array.from({ length: w }, () => ({ count: 0, kind: "" }));
  if (beats.length === 0) return buckets;
  const startTs = beats[0]!.ts;
  const endTs = beats[beats.length - 1]!.ts;
  const span = Math.max(1, endTs - startTs);
  const kindCounts: Record<string, number>[] = buckets.map(() => ({}));
  const n = Math.min(Math.max(0, cursor), beats.length);
  for (let i = 0; i < n; i++) {
    const b = beats[i]!;
    const idx = Math.min(w - 1, Math.floor(((b.ts - startTs) / span) * w));
    buckets[idx]!.count += 1;
    kindCounts[idx]![b.kind] = (kindCounts[idx]![b.kind] ?? 0) + 1;
  }
  for (let i = 0; i < w; i++) {
    let best = "", bestN = 0;
    for (const [k, c] of Object.entries(kindCounts[i]!)) if (c > bestN) { bestN = c; best = k; }
    buckets[i]!.kind = best;
  }
  return buckets;
}
