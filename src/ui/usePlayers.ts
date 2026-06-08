import { useEffect, useRef, useState } from "react";
import { createPlayer } from "../core/player";
import type { Beat, SessionState } from "../core/types";

type Player = ReturnType<typeof createPlayer>;

// Seed one player per session. The SELECTED session is seeded from the full
// transcript fold (selectedFullBeats) — the live store's per-session beats are
// only a 64 KB backfill window and can be empty when large metadata entries
// crowd the tail (see tests/backfill-crowding.test.ts). Unselected sessions
// keep their backfill beats; their players never tick or render.
export function seedPlayers(
  players: Map<string, Player>,
  sessions: SessionState[],
  selectedId: string | null,
  selectedFullBeats: Beat[],
): void {
  for (const s of sessions) {
    let p = players.get(s.id);
    if (!p) { p = createPlayer(); players.set(s.id, p); }
    p.setBeats(s.id === selectedId ? selectedFullBeats : s.beats);
  }
}

export function usePlayers(sessions: SessionState[], selectedId: string | null, selectedFullBeats: Beat[]) {
  const players = useRef(new Map<string, Player>());
  const [, force] = useState(0);

  seedPlayers(players.current, sessions, selectedId, selectedFullBeats);

  // animation/pacing tick (~10/s) — advances the live head, triggers re-render
  useEffect(() => {
    const id = setInterval(() => {
      const p = selectedId ? players.current.get(selectedId) : null;
      if (p) p.tick(Date.now());
      force((v) => (v + 1) & 0xffff);
    }, 100);
    return () => clearInterval(id);
  }, [selectedId]);

  return players.current;
}
