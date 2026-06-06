import type { Status } from "./types";

export interface StatusInput {
  lastEntryType: string;
  lastStopReason: string | null;
  lastBlockKind: string | null;
  pendingToolResult: boolean;
  lastErrored: boolean;
  ageMs: number;
}

export const WORKING_MS = 5_000;
export const IDLE_MS = 90_000;
export const DORMANT_MS = 30 * 60_000;

export function deriveStatus(i: StatusInput): Status {
  if (i.lastErrored) return "error";
  if (i.ageMs > DORMANT_MS) return "dormant";
  if (i.lastEntryType === "assistant" && i.lastStopReason === "end_turn") return "waiting";
  if (i.pendingToolResult && i.ageMs <= IDLE_MS) return "running";
  if (i.ageMs <= WORKING_MS) return "working";
  if (i.ageMs > IDLE_MS) return "idle";
  return "working";
}
