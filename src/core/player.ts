import type { Beat } from "./types";

export interface PlayerOpts { baseIntervalMs?: number; minIntervalMs?: number; replay?: boolean; loop?: boolean }
export type PlayMode = "live" | "paused" | "history";

export function createPlayer(opts: PlayerOpts = {}) {
  const base = opts.baseIntervalMs ?? 1000;
  const min = opts.minIntervalMs ?? 120;
  const replay = opts.replay ?? false;
  let loop = opts.loop ?? false;

  let coalesced: Beat[] = [];
  let head = 0;             // number of coalesced beats presented (live head)
  let cursor = 0;          // presentation cursor (== head in live mode)
  let mode: PlayMode = "live";
  let speed = 1;
  let lastAdvanceAt = -1;
  let started = false;

  function rebuild(beats: Beat[]) {
    const out: Beat[] = [];
    for (const b of beats) {
      const last = out[out.length - 1];
      if (last && last.kind === b.kind && last.label === b.label && last.lane === b.lane) {
        out[out.length - 1] = { ...last, count: last.count + b.count };
      } else {
        out.push({ ...b });
      }
    }
    coalesced = out;
    if (head > coalesced.length) head = coalesced.length;
    if (mode === "live") cursor = head;
  }

  function backlog(): number { return coalesced.length - head; }

  function interval(): number {
    // one adaptive cadence for live AND replay: faster when far behind, easing
    // to base as it catches up / nears the end — the whole timeline is "like flow"
    const factor = 1 / (1 + Math.min(backlog(), 20) * 0.5);
    return Math.max(min, (base / speed) * factor);
  }

  return {
    setBeats(beats: Beat[]) { rebuild(beats); started = true; },
    tick(now: number) {
      if (!started) return;
      if (mode !== "live") return; // pause/scrub freezes both live and replay
      if (lastAdvanceAt < 0) lastAdvanceAt = now;
      while (head < coalesced.length && now - lastAdvanceAt >= interval()) {
        head += 1;
        lastAdvanceAt += interval();
      }
      if (replay && loop && head >= coalesced.length && coalesced.length > 0) {
        head = 0; // screensaver wrap
        lastAdvanceAt = now;
      }
      cursor = head;
    },
    presented(): Beat[] { return coalesced.slice(0, cursor); },
    all(): Beat[] { return coalesced; },
    backlog,
    mode(): PlayMode { return mode; },
    cursor(): number { return cursor; },
    headIndex(): number { return head; },
    setSpeed(mult: number) { speed = Math.max(0.25, Math.min(8, mult)); },
    setLoop(on: boolean) { loop = on; },
    isLoop(): boolean { return loop; },
    speed(): number { return speed; },
    pause() { if (mode === "live") mode = "paused"; },
    play() { if (mode === "paused") mode = "live"; },
    stepBack() { mode = "history"; cursor = Math.max(0, cursor - 1); },
    stepForward() { if (mode === "history") { cursor = Math.min(coalesced.length, cursor + 1); if (cursor >= head) toLiveInternal(); } },
    toStart() { mode = "history"; cursor = 0; },
    toLive() { toLiveInternal(); },
  };

  function toLiveInternal() { mode = "live"; cursor = head; }
}
