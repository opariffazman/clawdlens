import type { Beat, BeatSnap, SessionState } from "../core/types";
import { effectiveContextLimit } from "../core/tokens";

// The cumulative {cost, ctxTokens} to show for the current cursor position. Beats
// carry a snapshot as of each beat (see reducer.pushBeat); during the reveal /
// replay / scrub the header shows the snapshot AT the cursor so cost/ctx count up
// in lockstep with the panels, and at the head it is the whole-session total.
export function cursorSnapshot(beats: Beat[], cursor: number): BeatSnap | null {
  if (beats.length === 0) return null;                 // no timeline -> caller shows session totals
  if (cursor <= 0) return { cost: 0, ctxTokens: 0 };   // start of reveal
  if (cursor >= beats.length) return null;             // at/after the head -> show the authoritative
                                                       // session totals (a trailing usage entry can
                                                       // advance cost/ctx without producing a beat, so
                                                       // the last beat's snap can lag the real total)
  return beats[cursor - 1]?.snap ?? null;              // below the head: snapshot at the cursor (null if snapshot-less)
}

// Resolve the header's displayed cost / ctx tokens / ctx pct / limit. The context
// limit is derived from the session's FINAL ctx, so it stays constant across the
// whole reveal: a 1M session's gauge fills smoothly 0->final% instead of resetting
// when effectiveContextLimit flips from 200k to 1M at the 200k boundary.
export function headerValues(
  session: SessionState,
  reveal: BeatSnap | null,
): { cost: number; ctxTokens: number; pct: number; limit: number } {
  const limit = effectiveContextLimit(session.model, session.tokens.contextTokens);
  if (!reveal) {
    return { cost: session.costUSD, ctxTokens: session.tokens.contextTokens, pct: session.tokens.contextPct, limit };
  }
  return { cost: reveal.cost, ctxTokens: reveal.ctxTokens, pct: limit > 0 ? reveal.ctxTokens / limit : 0, limit };
}
