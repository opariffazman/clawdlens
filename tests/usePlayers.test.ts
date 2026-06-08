import { test, expect } from "bun:test";
import { seedPlayers } from "../src/ui/usePlayers";
import { createPlayer } from "../src/core/player";
import { newSession } from "../src/core/reducer";
import type { Beat, SessionState } from "../src/core/types";

function beat(kind: Beat["kind"], label: string): Beat {
  return { id: `${label}`, kind, iconKey: "text", label, lane: "main", ts: 0, count: 1 };
}

function session(id: string, beats: Beat[]): SessionState {
  return { ...newSession(id, `${id}.jsonl`), beats };
}

test("seedPlayers seeds the SELECTED player from full beats, not its backfill beats", () => {
  const players = new Map<string, ReturnType<typeof createPlayer>>();
  const sessions = [session("a", []), session("b", [beat("text", "b-backfill")])];
  const fullBeats = [beat("thinking", "t1"), beat("tool", "t2"), beat("text", "t3")];

  // "a" is selected but its backfill beats are empty (the crowded-tail case).
  seedPlayers(players, sessions, "a", fullBeats);

  expect(players.get("a")!.all().length).toBe(3); // used fullBeats, not []
  expect(players.get("b")!.all().length).toBe(1); // unselected -> its own backfill
});

test("seedPlayers reuses existing players across calls (stable identity)", () => {
  const players = new Map<string, ReturnType<typeof createPlayer>>();
  const sessions = [session("a", [])];
  seedPlayers(players, sessions, "a", [beat("text", "x")]);
  const first = players.get("a");
  seedPlayers(players, sessions, "a", [beat("text", "x"), beat("text", "y")]);
  expect(players.get("a")).toBe(first); // same player instance, re-seeded
});
