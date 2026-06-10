import { test, expect } from "bun:test";
import { createPlayer } from "../src/core/player";
import type { Beat } from "../src/core/types";

function beat(id: string, label = "Bash", kind: Beat["kind"] = "tool"): Beat {
  return { id, ts: 0, kind, iconKey: "tool", label, count: 1, lane: "main" };
}
function beats(n: number): Beat[] {
  return Array.from({ length: n }, (_, i) => beat(String(i), "L" + i));
}
function drain(p: ReturnType<typeof createPlayer>, from: number, to: number, step = 50) {
  for (let t = from; t <= to; t += step) p.tick(t);
}

test("coalesces consecutive same-kind same-label beats", () => {
  const p = createPlayer();
  p.setBeats([beat("1"), beat("2"), beat("3")]);
  drain(p, 0, 10_000, 200);
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
  expect(p.presented().length).toBeGreaterThan(early);
});

test("starts playing from 0 (autoplay is the default) and live-follows appended beats", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(3));
  expect(p.mode()).toBe("playing");
  drain(p, 0, 500, 10);
  expect(p.cursor()).toBe(3); // caught up = live
  p.setBeats(beats(5)); // two more arrive
  drain(p, 600, 1200, 10);
  expect(p.cursor()).toBe(5); // followed the tail
});

test("trace A regression: scrub (stepBack) then toggle resumes playback", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(20));
  drain(p, 0, 1000, 10);
  p.stepBack();
  expect(p.mode()).toBe("paused"); // scrub auto-pauses
  const at = p.cursor();
  p.toggle(); // space
  expect(p.mode()).toBe("playing");
  drain(p, 2000, 3000, 10);
  expect(p.cursor()).toBeGreaterThan(at); // resumed from cursor — not dead
});

test("trace B regression: resume after a long pause advances paced, not in a burst", () => {
  const p = createPlayer({ baseIntervalMs: 100, minIntervalMs: 1 });
  p.setBeats(beats(100));
  drain(p, 0, 500);
  p.pause();
  const at = p.cursor();
  p.play(); // 60s later
  p.tick(61_000); // first tick after resume re-bases the clock
  expect(p.cursor() - at).toBeLessThanOrEqual(1); // no time-debt burst
});

test("trace C regression: stepForward works while paused", () => {
  const p = createPlayer({ baseIntervalMs: 100, minIntervalMs: 1 });
  p.setBeats(beats(100));
  drain(p, 0, 500);
  p.pause();
  const at = p.cursor();
  p.stepForward();
  expect(p.cursor()).toBe(at + 1);
});

test("trace D regression: scrub back then toggle plays forward from the scrub point", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(40));
  drain(p, 0, 2000, 10);
  for (let i = 0; i < 10; i++) p.stepBack();
  const at = p.cursor();
  p.toggle();
  drain(p, 3000, 3500, 10);
  expect(p.cursor()).toBeGreaterThan(at);
  expect(p.mode()).toBe("playing");
});

test("pause/play/toggle are total from every state", () => {
  const p = createPlayer();
  p.setBeats(beats(5));
  p.pause(); p.pause();
  expect(p.mode()).toBe("paused");
  p.play(); p.play();
  expect(p.mode()).toBe("playing");
  p.stepBack(); // paused again
  p.toggle();
  expect(p.mode()).toBe("playing");
});

test("replay() rewinds to 0 and plays; toLive() jumps to the tail and plays", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 1000, 10);
  p.replay();
  expect(p.cursor()).toBe(0);
  expect(p.mode()).toBe("playing");
  p.toLive();
  expect(p.cursor()).toBe(p.all().length);
  expect(p.mode()).toBe("playing");
});

test("toLive from a paused scrub returns to live follow", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 1000, 10);
  p.stepBack(); p.stepBack();
  p.toLive();
  expect(p.cursor()).toBe(p.all().length);
  p.setBeats(beats(12));
  drain(p, 2000, 3000, 10);
  expect(p.cursor()).toBe(p.all().length); // still following
});

test("loop wraps the cursor for screensaver replay", () => {
  const p = createPlayer({ baseIntervalMs: 100, minIntervalMs: 1, loop: true });
  p.setBeats([beat("1", "A"), beat("2", "B"), beat("3", "C")]);
  drain(p, 0, 1000, 100);
  expect(p.cursor()).toBeLessThanOrEqual(3); // wrapped rather than stuck
});

test("setBeats clamps the cursor when the transcript shrinks", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 1000, 10);
  p.setBeats(beats(4));
  expect(p.cursor()).toBeLessThanOrEqual(4);
});

test("setBeats preserves a paused cursor", () => {
  const p = createPlayer({ baseIntervalMs: 10, minIntervalMs: 1 });
  p.setBeats(beats(10));
  drain(p, 0, 300, 10);
  p.pause();
  const at = p.cursor();
  p.setBeats(beats(15));
  expect(p.cursor()).toBe(at);
  expect(p.mode()).toBe("paused");
});

test("intervalMs reflects speed (faster speed → smaller interval)", () => {
  const p = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B")]);
  const base = p.intervalMs();
  p.setSpeed(2);
  expect(p.intervalMs()).toBeLessThan(base);
  expect(p.intervalMs()).toBeCloseTo(base / 2, 5);
});

test("lastAdvanceMs is -1 before first tick, then set", () => {
  const p = createPlayer({ baseIntervalMs: 1 });
  p.setBeats([beat("1", "A"), beat("2", "B")]);
  expect(p.lastAdvanceMs()).toBe(-1);
  p.tick(500);
  expect(p.lastAdvanceMs()).toBeGreaterThanOrEqual(0);
});

test("intervalMs shrinks as backlog grows (adaptive cadence)", () => {
  const few = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  few.setBeats([beat("1", "A")]);
  const many = createPlayer({ baseIntervalMs: 1000, minIntervalMs: 1 });
  many.setBeats(beats(5));
  expect(many.intervalMs()).toBeLessThan(few.intervalMs());
});
