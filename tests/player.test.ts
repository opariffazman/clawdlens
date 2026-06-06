import { test, expect } from "bun:test";
import { createPlayer } from "../src/core/player";
import type { Beat } from "../src/core/types";

function beat(id: string, label = "Bash", kind: Beat["kind"] = "tool"): Beat {
  return { id, ts: 0, kind, icon: "x", label, count: 1, lane: "main" };
}

test("coalesces consecutive same-kind same-label beats", () => {
  const p = createPlayer();
  p.setBeats([beat("1"), beat("2"), beat("3")]);
  for (let t = 0; t < 10_000; t += 200) p.tick(t); // drain fully
  const shown = p.presented();
  expect(shown.length).toBe(1);
  expect(shown[0]!.count).toBe(3);
});

test("paces: presents fewer beats early than after enough time", () => {
  const p = createPlayer({ baseIntervalMs: 1000 });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C"), beat("4", "D")]);
  p.tick(0);
  const early = p.presented().length;
  p.tick(1100);
  const later = p.presented().length;
  expect(later).toBeGreaterThan(early);
});

test("history navigation: stepBack freezes, toLive resumes", () => {
  const p = createPlayer({ baseIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C")]);
  for (let t = 0; t < 100; t += 5) p.tick(t);
  expect(p.mode()).toBe("live");
  p.stepBack();
  expect(p.mode()).toBe("history");
  const frozen = p.cursor();
  p.tick(200);
  expect(p.cursor()).toBe(frozen); // does not advance while in history
  p.toLive();
  expect(p.mode()).toBe("live");
});
