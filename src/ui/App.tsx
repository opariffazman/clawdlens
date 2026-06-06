import { useEffect, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { RGBA } from "@opentui/core";
import type { createStore } from "../store/sessionStore";
import { mapKey } from "./keymap";
import { usePlayers } from "./usePlayers";
import { SessionList } from "./SessionList";
import { Showcase, PANELS, type PanelId } from "./Showcase";
import { theme } from "./theme";
import { createPlayer } from "../core/player";

type Store = ReturnType<typeof createStore>;

// transparent canvas → inherit the user's terminal background (OLED-friendly)
const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);

export function App({ store }: { store: Store }) {
  const renderer = useRenderer();
  const [sessions, setSessions] = useState(store.sessions());
  const [sel, setSel] = useState(0);
  const [panel, setPanel] = useState<PanelId>("flow");
  const [pulse, setPulse] = useState(true);
  const [blink, setBlink] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lensOn, setLensOn] = useState(true);
  const [size, setSize] = useState({ w: renderer.terminalWidth ?? 120, h: renderer.terminalHeight ?? 40 });
  const [replay, setReplay] = useState<{ player: ReturnType<typeof createPlayer> | null }>({ player: null });

  useEffect(() => {
    const unsub = store.subscribe(() => setSessions(store.sessions()));
    return () => { unsub(); };
  }, [store]);
  useEffect(() => { renderer.targetFps = 16; }, [renderer]); // steady-state for pulse
  useEffect(() => { const id = setInterval(() => setBlink((b) => !b), 500); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onResize = (cols: number, rows: number) => setSize({ w: cols, h: rows });
    renderer.on("resize", onResize);
    return () => { renderer.off("resize", onResize); };
  }, [renderer]);

  useEffect(() => {
    if (!replay.player) return;
    const id = setInterval(() => { replay.player!.tick(Date.now()); }, 100);
    return () => clearInterval(id);
  }, [replay.player]);

  const selected = sessions[Math.min(sel, Math.max(0, sessions.length - 1))] ?? null;
  const players = usePlayers(sessions, selected?.id ?? null);
  const player = selected ? players.get(selected.id) : null;
  const activePlayer = replay.player ?? player;

  useKeyboard((key) => {
    const action = mapKey({ name: key.name, shift: key.shift, ctrl: key.ctrl });
    if (!action) return;
    switch (action.type) {
      case "quit": renderer.destroy(); break;
      case "sess-down": setSel((i) => Math.min(sessions.length - 1, i + 1)); break;
      case "sess-up": setSel((i) => Math.max(0, i - 1)); break;
      case "jump": setSel(Math.min(sessions.length - 1, action.n - 1)); break;
      case "panel-next": setPanel((p) => PANELS[(PANELS.indexOf(p) + 1) % PANELS.length]!); break;
      case "panel-prev": setPanel((p) => PANELS[(PANELS.indexOf(p) + PANELS.length - 1) % PANELS.length]!); break;
      case "beat-back": player?.stepBack(); break;
      case "beat-fwd": player?.stepForward(); break;
      case "chunk-back": for (let i = 0; i < 10; i++) player?.stepBack(); break;
      case "chunk-fwd": for (let i = 0; i < 10; i++) player?.stepForward(); break;
      case "to-start": player?.toStart(); break;
      case "to-live": player?.toLive(); break;
      case "pause": player && (player.mode() === "paused" ? player.play() : player.pause()); break;
      case "speed-up": player?.setSpeed((player.speed() || 1) * 1.5); break;
      case "speed-down": player?.setSpeed((player.speed() || 1) / 1.5); break;
      case "pulse": setPulse((p) => !p); break;
      case "lens": setLensOn((v) => !v); break;
      case "help": setShowHelp((h) => !h); break;
      case "rescan": store.pollOnce(Date.now()); break;
      case "replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
      case "loop": replay.player?.setLoop(!replay.player.isLoop()); break;
    }
  });

  const { w, h } = size;
  const listWidth = Math.min(30, Math.floor(w * 0.28));

  const marker = (() => {
    if (replay.player) return `⏮ replay ${replay.player.cursor()}/${replay.player.all().length}${replay.player.isLoop() ? " · ⟳" : ""}`;
    if (!player) return "";
    if (player.mode() === "history") return `⏪ ${player.cursor()}/${player.all().length}`;
    if (player.mode() === "paused") return "⏸ paused";
    const back = player.backlog();
    return back > 0 ? `▸+${back}` : "▸ live";
  })();

  return (
    <box style={{ flexDirection: "row", width: w, height: h, backgroundColor: TRANSPARENT }}>
      <SessionList sessions={sessions} selectedIndex={sel} blink={blink} width={listWidth} height={h} />
      <Showcase
        session={selected}
        panel={panel}
        presented={activePlayer ? activePlayer.presented() : []}
        cursor={activePlayer ? activePlayer.cursor() : 0}
        pulse={pulse}
        lensOn={lensOn}
        marker={marker}
        width={w - listWidth}
        height={h}
      />
      {showHelp && (
        <box style={{ position: "absolute", border: true, padding: 1, backgroundColor: theme.panel }} title="keys">
          <text fg={theme.fg}>j/k sessions · Tab panels · h/l scrub · g/G start/live · space pause</text>
          <text fg={theme.fg}>+/- speed · p pulse · w lens · r rescan · q quit</text>
        </box>
      )}
    </box>
  );
}
