import type { SessionState } from "../core/types";

// The header's cumulative/occupancy fields — costUSD, startedTs -> elapsed, and
// the context gauge (tokens.contextTokens/contextPct) — must reflect the WHOLE
// session, but the live store seeds only a 64 KB backfill window. When that tail
// is all metadata (the crowded-tail case), the live window holds no usage entry,
// so cost AND ctx% both read 0 even though the session is large. The full fold
// recovers them (see docs/superpowers/specs/2026-06-09-header-full-fold-cost-design.md).
//
// The model name is assistant-derived too, so a crowded tail leaves it blank in
// the live window — graft it from the full fold as well. Keep `status` from the
// live session because the full fold never runs deriveStatus (its status stays
// "idle" and must not drive the badge). Each graft is guarded against an
// empty/failed fold (loadSession swallows read errors -> a zero SessionState) so
// a transient read never blanks a live value to $0 / 0% / no-model.
export function mergeHeaderSession(
  live: SessionState | null,
  full: SessionState | null,
): SessionState | null {
  if (!live || !full) return live;
  return {
    ...live,
    model: full.model || live.model,
    costUSD: full.costUSD > 0 ? full.costUSD : live.costUSD,
    startedTs: full.startedTs > 0 ? full.startedTs : live.startedTs,
    tokens: full.tokens.contextTokens > 0 ? full.tokens : live.tokens,
  };
}
