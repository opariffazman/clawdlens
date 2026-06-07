import type { Beat, BeatKind } from "./types";

export type PipeKind = "think" | "tool" | "skill" | "result" | "chat";
export type Grain = "coarse" | "fine";

const SLOT: Record<PipeKind, { col: number; row: number }> = {
  think:  { col: 0, row: 0 },
  tool:   { col: 1, row: 0 },
  skill:  { col: 1, row: 1 },
  result: { col: 2, row: 0 },
  chat:   { col: 3, row: 0 },
};

export function slotOf(kind: PipeKind): { col: number; row: number } {
  return SLOT[kind];
}

const COARSE_OF: Partial<Record<BeatKind, string>> = {
  thinking: "think", text: "chat", skill: "skill", tool: "tool",
};

// Map a beat to a node id at the requested grain. Coarse = BeatKind grain;
// fine = a tool beat becomes its specific iconKey (bash/edit/read/...).
// Returns null for beats with no stage (wait/phase, and the never-emitted result).
export function nodeKindOf(b: Beat, grain: Grain): string | null {
  const c = COARSE_OF[b.kind];
  if (!c) return null;
  if (grain === "fine" && b.kind === "tool") return b.iconKey;
  return c;
}

// Canonical left→right ordering for card layout (covers coarse + fine kinds).
const RANK: Record<string, number> = {
  think: 0, bash: 1, edit: 2, read: 3, search: 4, web: 5, task: 6, todo: 7,
  tool: 8, skill: 9, result: 10, chat: 11,
};
export function rankOf(kind: string): number {
  return RANK[kind] ?? 99;
}
