import type { Beat, IconKey } from "./types";
import { nodeKindOf, type Grain } from "./pipeline";

export interface LaneFlow {
  lane: string;
  label: string;
  activeKind: string | null;
  trail: string[];                       // last K distinct stages, oldest -> newest
  actionIcon: IconKey | null;            // glyph for the active node
  detail: string | null;
  errored: boolean;
  milestone: "commit" | "branch" | null;
  isOpen: boolean;
  counts: Record<string, number>;        // live, cursor-synced node tallies
  ok: number;                            // completed-tool successes (live)
  err: number;                           // completed-tool failures (live)
  toolBreakdown: Record<string, number>; // live tool counts keyed by iconKey
  activeTool: string | null;             // head tool's iconKey (for the expand highlight)
  activeToolName: string | null;         // head tool's human name (e.g. "Bash") for the live sub-node
  skillBreakdown: Record<string, number>; // live skill counts keyed by skill name
  activeSkill: string | null;             // head skill beat's name (for the expand highlight)
  hops: Record<string, number>;          // "think>tool" -> distinct-collapsed traversal count
  lastHop: string | null;                // newest transition, e.g. "tool>result"
}

export interface FlowState {
  main: LaneFlow;
  subLanes: LaneFlow[];
  agentsLive: number;
}

// expand beats -> node-id steps at the given grain, synthesizing `result` after
// a completed tool (ok defined)
function expand(beats: Beat[], grain: Grain): string[] {
  const steps: string[] = [];
  for (const b of beats) {
    const k = nodeKindOf(b, grain);
    if (!k) continue;
    steps.push(k);
    if (b.kind === "tool" && b.ok !== undefined) steps.push("result");
  }
  return steps;
}

function lastDistinct(steps: string[], n: number): string[] {
  const c: string[] = [];
  for (const s of steps) if (c.at(-1) !== s) c.push(s);
  return c.slice(Math.max(0, c.length - n));
}

function laneFlow(lane: string, label: string, beats: Beat[], isOpen: boolean, trailLen: number, grain: Grain): LaneFlow {
  const steps = expand(beats, grain);
  const trail = lastDistinct(steps, trailLen);
  const activeKind = trail.at(-1) ?? null;
  const head = beats.at(-1) ?? null;
  const errored = head?.kind === "tool" && head.ok === false;
  const counts: Record<string, number> = {};
  for (const s of steps) counts[s] = (counts[s] ?? 0) + 1;
  let ok = 0;
  let err = 0;
  for (const b of beats) if (b.kind === "tool" && b.ok !== undefined) { if (b.ok) ok += 1; else err += 1; }
  const toolBreakdown: Record<string, number> = {};
  for (const b of beats) if (b.kind === "tool") toolBreakdown[b.iconKey] = (toolBreakdown[b.iconKey] ?? 0) + 1;
  const activeTool = head?.kind === "tool" ? head.iconKey : null;
  const skillBreakdown: Record<string, number> = {};
  for (const b of beats) if (b.kind === "skill") { const n = b.skill ?? b.label; skillBreakdown[n] = (skillBreakdown[n] ?? 0) + 1; }
  const activeSkill = head?.kind === "skill" ? (head.skill ?? head.label) : null;
  const seq = lastDistinct(steps, steps.length);
  const hops: Record<string, number> = {};
  for (let i = 0; i + 1 < seq.length; i++) {
    const k = `${seq[i]}>${seq[i + 1]}`;
    hops[k] = (hops[k] ?? 0) + 1;
  }
  const lastHop = seq.length >= 2 ? `${seq[seq.length - 2]}>${seq[seq.length - 1]}` : null;
  return {
    lane, label, activeKind, trail,
    actionIcon: activeKind === "result" ? "result" : (head?.iconKey ?? null),
    detail: head?.detail ?? head?.label ?? null,
    errored, milestone: head?.milestone ?? null, isOpen, counts, ok, err, toolBreakdown, activeTool, activeToolName: head?.kind === "tool" ? head.label : null, skillBreakdown, activeSkill, hops, lastHop,
  };
}

function subLabel(taskBeat: Beat | undefined): string {
  if (!taskBeat) return "agent";
  return taskBeat.label.replace(/^Task · /, "") || (taskBeat.detail ?? "agent");
}

export function deriveFlow(beats: Beat[], cursor: number, trailLen: number, grain: Grain = "coarse"): FlowState {
  const revealed = beats.slice(0, Math.max(0, cursor));
  const mainBeats = revealed.filter((b) => b.lane === "main");
  const main = laneFlow("main", "main", mainBeats, false, trailLen, grain);

  const order: string[] = [];
  const byLane = new Map<string, Beat[]>();
  for (const b of revealed) {
    if (b.lane === "main") continue;
    if (!byLane.has(b.lane)) { byLane.set(b.lane, []); order.push(b.lane); }
    byLane.get(b.lane)!.push(b);
  }

  const subLanes: LaneFlow[] = [];
  for (const lane of order) {
    const task = mainBeats.find((b) => b.toolUseId === lane);
    const isOpen = task ? task.ok === undefined : false;
    if (!isOpen) continue;
    subLanes.push(laneFlow(lane, subLabel(task), byLane.get(lane)!, true, trailLen, grain));
  }

  return { main, subLanes, agentsLive: subLanes.length };
}
