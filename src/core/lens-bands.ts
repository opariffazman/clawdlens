import type { Beat, SessionTokens, ToolTiming, CtxPools } from "./types";
import { detectLensFromBeats } from "./lens";

export interface Span { key: string; label: string; startTs: number; endTs: number }
export interface TimeRange { startTs: number; endTs: number; cursorTs: number }
export interface LensTimeline {
  range: TimeRange;
  skills: Span[];
  agents: Span[];
  milestones: { ts: number; kind: "commit" | "branch" }[];
  errors: { ts: number }[];
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

  // A Task beat (iconKey "task", toolUseId = subagent lane id) opens an agent span;
  // it ends at the last beat seen on that lane (the subagent's last activity in the
  // revealed window) — a robust proxy for "agent done" that doesn't need the close ts.
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
  const errors = beats.filter((b) => b.ok === false).map((b) => ({ ts: b.ts }));

  return { range, skills, agents, milestones, errors };
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

export interface ToolTimingRow { name: string; count: number; avgMs: number; minMs: number; maxMs: number; totalMs: number }

// bottleneck-first: total time spent waiting on each tool
export function toolTimingView(timings: Record<string, ToolTiming>): ToolTimingRow[] {
  return Object.entries(timings)
    .map(([name, t]) => ({ name, count: t.count, avgMs: Math.round(t.totalMs / t.count), minMs: t.minMs, maxMs: t.maxMs, totalMs: t.totalMs }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

// cursor-bounded twin of toolTimingView: aggregate per-tool timings from the
// resolved tool beats revealed up to `cursor`, so the Lens info sub-row reveals
// tools in cadence with the timeline rather than dumping the whole session.
export function toolTimingsFromBeats(beats: Beat[], cursor: number): ToolTimingRow[] {
  const n = Math.min(Math.max(0, cursor), beats.length);
  const acc: Record<string, ToolTiming> = {};
  for (let i = 0; i < n; i++) {
    const b = beats[i]!;
    if (b.kind !== "tool" || b.durMs === undefined) continue;
    const d = b.durMs;
    const cur = acc[b.label];
    acc[b.label] = cur
      ? { count: cur.count + 1, totalMs: cur.totalMs + d, minMs: Math.min(cur.minMs, d), maxMs: Math.max(cur.maxMs, d) }
      : { count: 1, totalMs: d, minMs: d, maxMs: d };
  }
  return toolTimingView(acc);
}

export interface EconomyView { inTok: string; outTok: string; cachePct: number; web: number }

export function kfmt(n: number): string { return n >= 1000 ? Math.round(n / 1000) + "k" : String(n); }

export function economyView(t: SessionTokens): EconomyView {
  const denom = t.cacheRead + t.cacheCreate + t.input;
  return {
    inTok: kfmt(t.input),
    outTok: kfmt(t.output),
    cachePct: denom > 0 ? Math.round((t.cacheRead / denom) * 100) : 0,
    web: t.webCalls,
  };
}

export interface CtxSegment { key: string; label: string; tokens: number; frac: number }
export interface CtxBreakdownView { total: number; segments: CtxSegment[] }

// composition of what's IN context (vs contextTokens, not the model limit);
// system prompt/tool defs/memory aren't in the transcript → residual, clamped ≥ 0.
export function ctxBreakdownView(t: SessionTokens, p: CtxPools): CtxBreakdownView {
  const total = t.contextTokens;
  const sys = Math.max(0, total - (p.user + p.tools + p.subagents + p.reasoning));
  const segs = [
    { key: "system", label: "sys", tokens: sys },
    { key: "user", label: "usr", tokens: p.user },
    { key: "tools", label: "tool", tokens: p.tools },
    { key: "subagents", label: "sub", tokens: p.subagents },
    { key: "reasoning", label: "think", tokens: p.reasoning },
  ];
  return { total, segments: segs.map((s) => ({ ...s, frac: total > 0 ? s.tokens / total : 0 })) };
}
