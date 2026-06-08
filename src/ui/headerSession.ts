import type { SessionState } from "../core/types";

// The header's cumulative fields (costUSD, and startedTs -> elapsed) must reflect
// the WHOLE session, but the live store seeds only a 64 KB backfill window, so
// they undercount the tail (see docs/superpowers/specs/2026-06-09-header-full-fold-cost-design.md).
// Graft those two fields from the full-transcript fold (`full`) while keeping every
// LIVE field (status, contextPct/contextTokens) from the live session: the full fold
// never runs deriveStatus, so its status stays "idle" and must not drive the badge.
// The full fold is a superset of the backfill window, so full.costUSD >= live.costUSD
// always — the override never lowers the displayed cost.
export function mergeHeaderSession(
  live: SessionState | null,
  full: SessionState | null,
): SessionState | null {
  if (!live || !full) return live;
  return {
    ...live,
    costUSD: full.costUSD > 0 ? full.costUSD : live.costUSD,
    startedTs: full.startedTs > 0 ? full.startedTs : live.startedTs,
  };
}
