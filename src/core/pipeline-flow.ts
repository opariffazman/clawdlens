import type { Beat, BeatKind, IconKey } from "./types";
import type { PipeKind } from "./pipeline";

const KIND_OF: Partial<Record<BeatKind, PipeKind>> = {
  thinking: "think", text: "chat", skill: "skill", tool: "tool",
};

export interface LaneFlow {
  lane: string;
  label: string;
  activeKind: PipeKind | null;
  trail: PipeKind[];                 // last K distinct stages, oldest -> newest
  actionIcon: IconKey | null;        // glyph for the active node
  detail: string | null;            // short, high-level (Lens clips it)
  errored: boolean;
  milestone: "commit" | "branch" | null;
  isOpen: boolean;
}

export interface FlowState {
  main: LaneFlow;
  subLanes: LaneFlow[];
  agentsLive: number;
}

// expand a lane's beats into pipeline steps, synthesizing `result` after a
// completed tool (mirrors buildPipeline's expansion)
function expand(beats: Beat[]): PipeKind[] {
  const steps: PipeKind[] = [];
  for (const b of beats) {
    const k = KIND_OF[b.kind];
    if (!k) continue;
    steps.push(k);
    if (b.kind === "tool" && b.ok !== undefined) steps.push("result");
  }
  return steps;
}

function lastDistinct(steps: PipeKind[], n: number): PipeKind[] {
  const c: PipeKind[] = [];
  for (const s of steps) if (c.at(-1) !== s) c.push(s);
  return c.slice(Math.max(0, c.length - n));
}

function laneFlow(lane: string, label: string, beats: Beat[], isOpen: boolean, trailLen: number): LaneFlow {
  const trail = lastDistinct(expand(beats), trailLen);
  const activeKind = trail.at(-1) ?? null;
  const head = beats.at(-1) ?? null;
  const errored = head?.kind === "tool" && head.ok === false;
  return {
    lane, label, activeKind, trail,
    actionIcon: activeKind === "result" ? "result" : (head?.iconKey ?? null),
    detail: head?.detail ?? head?.label ?? null,
    errored,
    milestone: head?.milestone ?? null,
    isOpen,
  };
}

function subLabel(taskBeat: Beat | undefined): string {
  if (!taskBeat) return "agent";
  return taskBeat.label.replace(/^Task · /, "") || (taskBeat.detail ?? "agent");
}

export function deriveFlow(beats: Beat[], cursor: number, trailLen: number): FlowState {
  const revealed = beats.slice(0, Math.max(0, cursor));
  const mainBeats = revealed.filter((b) => b.lane === "main");
  const main = laneFlow("main", "main", mainBeats, false, trailLen);

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
    subLanes.push(laneFlow(lane, subLabel(task), byLane.get(lane)!, true, trailLen));
  }

  return { main, subLanes, agentsLive: subLanes.length };
}
