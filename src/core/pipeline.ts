import type { Beat, BeatKind } from "./types";

export type PipeKind = "think" | "tool" | "skill" | "result" | "chat";

export interface PipeNode {
  kind: PipeKind;
  count: number;   // frequency over ALL steps (not coalesced)
  ok?: number;     // result node only
  err?: number;    // result node only
  col: number;     // fixed slot column
  row: number;     // fixed slot row
}

export interface PipeEdge {
  from: PipeKind;
  to: PipeKind;
  weight: number;  // frequency over the coalesced transition sequence
  back: boolean;   // runs against column order -> drawn as an arc
}

export interface PipelineGraph {
  nodes: PipeNode[];
  edges: PipeEdge[];
  maxCount: number;
  maxWeight: number;
}

// rare-edge cutoff: an edge is drawn iff weight >= max(1, ceil(EDGE_MIN_FRAC*maxWeight))
export const EDGE_MIN_FRAC = 0.05;

const SLOT: Record<PipeKind, { col: number; row: number }> = {
  think:  { col: 0, row: 0 },
  tool:   { col: 1, row: 0 },
  skill:  { col: 1, row: 1 },
  result: { col: 2, row: 0 },
  chat:   { col: 3, row: 0 },
};
const ORDER: PipeKind[] = ["think", "tool", "skill", "result", "chat"];

function kindOf(k: BeatKind): PipeKind | null {
  switch (k) {
    case "thinking": return "think";
    case "text":     return "chat";
    case "skill":    return "skill";
    case "tool":     return "tool";
    default:         return null; // wait, phase (result is synthetic, never a beat)
  }
}

export function edgeVisible(weight: number, maxWeight: number): boolean {
  return weight >= Math.max(1, Math.ceil(EDGE_MIN_FRAC * maxWeight));
}

export function buildPipeline(beats: Beat[]): PipelineGraph {
  // 1. expand beats -> step sequence, synthesizing `result` after completed tools
  const steps: PipeKind[] = [];
  let ok = 0;
  let err = 0;
  for (const b of beats) {
    const k = kindOf(b.kind);
    if (!k) continue;
    steps.push(k);
    if (b.kind === "tool" && b.ok !== undefined) {
      steps.push("result");
      if (b.ok) ok += 1; else err += 1;
    }
  }

  // 2. node counts over ALL steps
  const counts = new Map<PipeKind, number>();
  for (const s of steps) counts.set(s, (counts.get(s) ?? 0) + 1);

  const nodes: PipeNode[] = [];
  for (const k of ORDER) {
    const count = counts.get(k) ?? 0;
    if (count === 0) continue;
    const slot = SLOT[k];
    const node: PipeNode = { kind: k, count, col: slot.col, row: slot.row };
    if (k === "result") { node.ok = ok; node.err = err; }
    nodes.push(node);
  }

  // 3. edges over the COALESCED sequence (drop consecutive dupes -> no self-loops)
  const coalesced: PipeKind[] = [];
  for (const s of steps) if (coalesced[coalesced.length - 1] !== s) coalesced.push(s);

  const edgeMap = new Map<string, PipeEdge>();
  for (let i = 0; i + 1 < coalesced.length; i++) {
    const from = coalesced[i]!;
    const to = coalesced[i + 1]!;
    const key = `${from}>${to}`;
    const e = edgeMap.get(key);
    if (e) e.weight += 1;
    else edgeMap.set(key, { from, to, weight: 1, back: SLOT[to].col <= SLOT[from].col });
  }
  const edges = [...edgeMap.values()];

  const maxCount = nodes.reduce((m, n) => Math.max(m, n.count), 0);
  const maxWeight = edges.reduce((m, e) => Math.max(m, e.weight), 0);
  return { nodes, edges, maxCount, maxWeight };
}
