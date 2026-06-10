import type { Beat } from "./types";

export interface PlayerOpts { baseIntervalMs?: number; minIntervalMs?: number; loop?: boolean }
export type PlayMode = "playing" | "paused";

export function createPlayer(opts: PlayerOpts = {}) {
  const base = opts.baseIntervalMs ?? 1000;
  const min = opts.minIntervalMs ?? 120;
  let loop = opts.loop ?? false;

  let coalesced: Beat[] = [];
  let cursor = 0;                // the ONE position — view and playback head
  let mode: PlayMode = "playing"; // "live" is derived: playing && backlog 0
  let speed = 1;
  let lastAdvanceAt = -1;        // -1 → next tick re-bases (prevents time-debt bursts)
  let started = false;

  function rebuild(beats: Beat[]) {
    const out: Beat[] = [];
    for (const b of beats) {
      const last = out[out.length - 1];
      if (last && last.kind === b.kind && last.label === b.label && last.lane === b.lane) {
        out[out.length - 1] = { ...last, count: last.count + b.count, snap: b.snap ?? last.snap };
      } else {
        out.push({ ...b });
      }
    }
    coalesced = out;
    if (cursor > coalesced.length) cursor = coalesced.length;
  }

  function backlog(): number { return coalesced.length - cursor; }

  function interval(): number {
    // adaptive (eases toward base as it catches up / nears the end), but gentle
    // enough to stay a readable slow-burn. `speed` divides the WHOLE interval —
    // including the min floor — so +/- always change the pace.
    const factor = 1 / (1 + Math.min(backlog(), 20) * 0.1);
    return Math.max(min, base * factor) / speed;
  }

  function pause() { mode = "paused"; }
  function play() { mode = "playing"; lastAdvanceAt = -1; }

  return {
    setBeats(beats: Beat[]) { rebuild(beats); started = true; },
    tick(now: number) {
      if (!started || mode !== "playing") return;
      if (lastAdvanceAt < 0) lastAdvanceAt = now;
      while (cursor < coalesced.length && now - lastAdvanceAt >= interval()) {
        cursor += 1;
        lastAdvanceAt += interval();
      }
      if (loop && cursor >= coalesced.length && coalesced.length > 0) {
        cursor = 0; // screensaver wrap
        lastAdvanceAt = now;
      }
    },
    presented(): Beat[] { return coalesced.slice(0, cursor); },
    all(): Beat[] { return coalesced; },
    backlog,
    mode(): PlayMode { return mode; },
    cursor(): number { return cursor; },
    setSpeed(mult: number) { speed = Math.max(0.25, Math.min(8, mult)); },
    setLoop(on: boolean) { loop = on; },
    isLoop(): boolean { return loop; },
    speed(): number { return speed; },
    intervalMs(): number { return interval(); },
    lastAdvanceMs(): number { return lastAdvanceAt; },
    pause,
    play,
    toggle() { if (mode === "playing") pause(); else play(); },
    stepBack() { pause(); cursor = Math.max(0, cursor - 1); },
    stepForward() { pause(); cursor = Math.min(coalesced.length, cursor + 1); },
    replay() { cursor = 0; play(); },
    toLive() { cursor = coalesced.length; play(); },
  };
}
