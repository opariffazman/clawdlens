import { useEffect, useState } from "react";

// Shared "creation animation" cadence for the aggregate panels (Files, Git) so
// they reveal at one coupled rhythm — a deliberate slow-burn like the Flow,
// rather than each panel inventing its own timing. One constant to tune.
export const REVEAL_MS = 300;

// Progressively reveal 1..total over time; restarts when `resetKey` changes
// (panel reopened / session switched / data refetched).
export function useReveal(total: number, resetKey: unknown): { revealed: number; animating: boolean } {
  const [revealed, setRevealed] = useState(total > 0 ? 1 : 0);

  useEffect(() => { setRevealed(total > 0 ? 1 : 0); }, [resetKey, total]);

  useEffect(() => {
    if (revealed >= total) return;
    const id = setInterval(() => setRevealed((r) => Math.min(total, r + 1)), REVEAL_MS);
    return () => clearInterval(id);
  }, [revealed, total]);

  return { revealed, animating: revealed < total };
}
