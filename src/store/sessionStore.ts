import { discoverSessions, projectsRoot } from "../core/discover";
import { createTailer } from "../core/tailer";
import { parseLine } from "../core/parse";
import { newSession, applyEntry } from "../core/reducer";
import { deriveStatus } from "../core/status";
import { detectLens } from "../core/lens";
import type { SessionState } from "../core/types";

export interface StoreOpts { root?: string; pollMs?: number; seenAtStart?: boolean }
type Listener = () => void;

export function createStore(opts: StoreOpts = {}) {
  const root = opts.root ?? projectsRoot();
  const pollMs = opts.pollMs ?? 750;
  const tailer = createTailer();
  const map = new Map<string, SessionState>();
  const firstRead = new Set<string>();
  const listeners = new Set<Listener>();
  let timer: ReturnType<typeof setInterval> | null = null;

  function emit() { for (const l of listeners) l(); }

  function pollOnce(now: number) {
    const found = discoverSessions(root);
    let changed = false;
    for (const fs of found) {
      const startAtEof = !firstRead.has(fs.file);
      const lines = tailer.read(fs.file, { startAtEof });
      firstRead.add(fs.file);
      if (!map.has(fs.id)) map.set(fs.id, newSession(fs.id, fs.file));
      if (lines.length === 0) continue;
      let s = map.get(fs.id)!;
      for (const raw of lines) {
        const entry = parseLine(raw);
        if (!entry) { s = { ...s, parseErrors: s.parseErrors + 1 }; continue; }
        s = applyEntry(s, entry, now);
      }
      s = recompute(s, now);
      map.set(fs.id, s);
      changed = true;
    }
    // refresh status (ages change even without new lines)
    for (const [id, s] of map) {
      const next = recompute(s, now);
      if (next.status !== s.status) { map.set(id, next); changed = true; }
    }
    if (changed) emit();
  }

  function recompute(s: SessionState, now: number): SessionState {
    const status = deriveStatus({
      lastEntryType: s.lastEntryType,
      lastStopReason: s.lastStopReason,
      lastBlockKind: s.lastBlockKind,
      pendingToolResult: Object.keys(s.pendingTools).length > 0,
      lastErrored: s.lastErrored,
      ageMs: s.lastActivityTs ? now - s.lastActivityTs : 0,
    });
    const lens = detectLens(s);
    return { ...s, status, lens };
  }

  return {
    pollOnce,
    sessions(): SessionState[] {
      return [...map.values()].sort((a, b) => b.lastActivityTs - a.lastActivityTs);
    },
    get(id: string) { return map.get(id); },
    subscribe(l: Listener) { listeners.add(l); return () => listeners.delete(l); },
    start() {
      if (timer) return;
      pollOnce(Date.now());
      timer = setInterval(() => pollOnce(Date.now()), pollMs);
    },
    stop() { if (timer) { clearInterval(timer); timer = null; } },
  };
}
