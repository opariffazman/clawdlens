import { useEffect, useRef, useState } from "react";
import { createPlayer } from "../core/player";
import type { SessionState } from "../core/types";

type Player = ReturnType<typeof createPlayer>;

export function usePlayers(sessions: SessionState[], selectedId: string | null) {
  const players = useRef(new Map<string, Player>());
  const [, force] = useState(0);

  // ensure a player per session and keep its beats in sync
  for (const s of sessions) {
    let p = players.current.get(s.id);
    if (!p) { p = createPlayer(); players.current.set(s.id, p); }
    p.setBeats(s.beats);
  }

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
