import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { RGBA } from "@opentui/core";
import type { createStore } from "../store/sessionStore";
import { mapKey } from "./keymap";
import { usePlayers } from "./usePlayers";
import { Menu, pickerRows, helpRows, projectsOf, sessionsOf } from "./Menu";
import { CommandPalette } from "./CommandPalette";
import { filterCommands } from "../core/commands";
import { Showcase, PANELS, type PanelId } from "./Showcase";
import { DEFAULT_PANEL } from "../core/types";
import { createPlayer } from "../core/player";
import { gitLog } from "../store/gitFetch";

type Store = ReturnType<typeof createStore>;
type PickerState = { open: boolean; stage: "projects" | "sessions"; project: string | null; index: number };

// transparent canvas → inherit the user's terminal background (OLED-friendly)
const TRANSPARENT = RGBA.fromValues(0, 0, 0, 0);
const CLOSED: PickerState = { open: false, stage: "projects", project: null, index: 0 };

export function App({ store }: { store: Store }) {
  const renderer = useRenderer();
  const [sessions, setSessions] = useState(store.sessions());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>(DEFAULT_PANEL);
  const [pulse, setPulse] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [lensOn, setLensOn] = useState(true);
  const [size, setSize] = useState({ w: renderer.terminalWidth ?? 120, h: renderer.terminalHeight ?? 40 });
  const [replay, setReplay] = useState<{ player: ReturnType<typeof createPlayer> | null }>({ player: null });
  const [commits, setCommits] = useState<import("../core/types").Commit[]>([]);
  const [full, setFull] = useState<import("../core/types").SessionState | null>(null);
  const [picker, setPicker] = useState<PickerState>(CLOSED);
  const [palette, setPalette] = useState<{ open: boolean; query: string; index: number }>({ open: false, query: "", index: 0 });
  const [filesSort, setFilesSort] = useState<"edits" | "reads" | "recent">("edits");
  const [gitScope, setGitScope] = useState<"all" | "branch">("all");
  const [tasksHideDone, setTasksHideDone] = useState(false);

  useEffect(() => { const unsub = store.subscribe(() => setSessions(store.sessions())); return () => { unsub(); }; }, [store]);
  useEffect(() => { renderer.targetFps = 16; }, [renderer]); // steady-state for pulse
  // Multiplexers (tmux) compute some glyph widths differently than OpenTUI's
  // detected width method. The incremental diff then mis-tracks the cursor and
  // leaves stale "ghost" cells when text scrolls/scrubs. Re-emitting the whole
  // frame (full repaint) overwrites them — this is what tmux detach/reattach or
  // a resize does. Trigger it whenever content moves.
  const forceRepaint = useCallback(() => {
    (renderer as unknown as { forceFullRepaintRequested?: boolean }).forceFullRepaintRequested = true;
    renderer.requestRender();
  }, [renderer]);
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

  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;
  const players = usePlayers(sessions, selected?.id ?? null);

  // aggregate detail panels (files/tasks/git) read the FULL session, not just the live window
  useEffect(() => {
    if (!selected) { setFull(null); setCommits([]); return; }
    if (panel === "files" || panel === "tasks" || panel === "git") {
      const fs = store.fullSession(selected.id);
      setFull(fs);
      setCommits(panel === "git" && fs?.cwd ? gitLog(fs.cwd) : []);
    } else {
      setCommits([]);
    }
  }, [panel, selected?.id]);

  const player = selected ? players.get(selected.id) : null;
  const activePlayer = replay.player ?? player;
  // one shared timeline: all panels reveal in sync with the active player's cursor
  const playerTotal = activePlayer ? activePlayer.all().length : 0;
  const cursor = activePlayer ? activePlayer.cursor() : 0;
  const progress = activePlayer && playerTotal > 0 ? cursor / playerTotal : 1;

  // Force a full repaint whenever the scroll position or layout changes — the
  // moments stale ghost cells form. Pulse-only frames (cursor unchanged) keep
  // the cheap incremental diff. See forceRepaint above for why.
  const prevCursor = useRef(-1);
  useEffect(() => {
    if (cursor !== prevCursor.current) { prevCursor.current = cursor; forceRepaint(); }
  });
  useEffect(() => { forceRepaint(); }, [panel, selected?.id, replay.player, picker.open, picker.stage, full, lensOn, showHelp, pulse, palette.open, palette.query, forceRepaint]);

  const switchTo = (id: string | null) => { setReplay({ player: null }); setSelectedId(id); };
  const stepSel = (dir: number) => {
    const i = sessions.findIndex((s) => s.id === selected?.id);
    switchTo(sessions[Math.max(0, Math.min(sessions.length - 1, (i < 0 ? 0 : i) + dir))]?.id ?? null);
  };

  const runCommand = (id: string) => {
    switch (id) {
      case "panel.lens": setPanel("lens"); break;
      case "panel.files": setPanel("files"); break;
      case "panel.tasks": setPanel("tasks"); break;
      case "panel.git": setPanel("git"); break;
      case "panel.log": setPanel("log"); break;
      case "nav.sessions": setPicker({ open: true, stage: "projects", project: null, index: 0 }); break;
      case "view.help": setShowHelp(true); break;
      case "view.rescan":
        store.pollOnce(Date.now());
        if (selected && (panel === "files" || panel === "tasks" || panel === "git")) {
          const fs = store.fullSession(selected.id); setFull(fs);
          if (panel === "git") setCommits(fs?.cwd ? gitLog(fs.cwd) : []);
        }
        break;
      case "play.pause": activePlayer && (activePlayer.mode() === "paused" ? activePlayer.play() : activePlayer.pause()); break;
      case "play.replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
      case "play.loop": if (replay.player) { replay.player.setLoop(!replay.player.isLoop()); setReplay({ player: replay.player }); } break;
      case "view.pulse": setPulse((p) => !p); break;
      case "files.sort": setFilesSort((s) => (s === "edits" ? "reads" : s === "reads" ? "recent" : "edits")); break;
      case "git.scope": setGitScope((s) => (s === "all" ? "branch" : "all")); break;
      case "tasks.hideDone": setTasksHideDone((v) => !v); break;
      case "app.quit": renderer.destroy(); break;
    }
  };

  useKeyboard((key) => {
    const kn = key.name;
    if (palette.open) {
      const matches = filterCommands(palette.query, panel);
      if (kn === "escape") { setPalette({ open: false, query: "", index: 0 }); return; }
      if (kn === "return" || kn === "enter") {
        const cmd = matches[palette.index] ?? matches[0];
        setPalette({ open: false, query: "", index: 0 });
        if (cmd) runCommand(cmd.id);
        return;
      }
      if (kn === "tab") { const top = matches[0]; if (top) setPalette((p) => ({ ...p, query: top.title, index: 0 })); return; }
      if (kn === "up") { setPalette((p) => ({ ...p, index: Math.max(0, p.index - 1) })); return; }
      if (kn === "down") { setPalette((p) => ({ ...p, index: Math.min(Math.max(0, matches.length - 1), p.index + 1) })); return; }
      if (kn === "backspace") { setPalette((p) => ({ ...p, query: p.query.slice(0, -1), index: 0 })); return; }
      if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setPalette((p) => ({ ...p, query: p.query + key.sequence, index: 0 }));
      }
      return;
    }
    if (picker.open) {
      const len = picker.stage === "projects"
        ? projectsOf(sessions).length
        : (picker.project ? sessionsOf(sessions, picker.project).length : 0);
      if (kn === "escape" || kn === ":") {
        setPicker(kn === "escape" && picker.stage === "sessions" ? { open: true, stage: "projects", project: null, index: 0 } : CLOSED);
      } else if (kn === "j" || kn === "down") {
        setPicker((p) => ({ ...p, index: Math.min(Math.max(0, len - 1), p.index + 1) }));
      } else if (kn === "k" || kn === "up") {
        setPicker((p) => ({ ...p, index: Math.max(0, p.index - 1) }));
      } else if (kn === "return" || kn === "enter") {
        if (picker.stage === "projects") {
          const proj = projectsOf(sessions)[Math.min(picker.index, len - 1)]?.project ?? null;
          if (proj) setPicker({ open: true, stage: "sessions", project: proj, index: 0 });
        } else {
          const s = (picker.project ? sessionsOf(sessions, picker.project) : [])[Math.min(picker.index, len - 1)];
          if (s) switchTo(s.id);
          setPicker(CLOSED);
        }
      }
      return;
    }
    if (kn === ":") { setPalette({ open: true, query: "", index: 0 }); return; }
    const action = mapKey({ name: key.name, shift: key.shift, ctrl: key.ctrl });
    if (!action) return;
    switch (action.type) {
      case "quit": renderer.destroy(); break;
      case "sess-down": stepSel(1); break;
      case "sess-up": stepSel(-1); break;
      case "jump": switchTo(sessions[Math.min(sessions.length - 1, action.n - 1)]?.id ?? null); break;
      case "panel-next": setPanel((p) => PANELS[(PANELS.indexOf(p) + 1) % PANELS.length]!); break;
      case "panel-prev": setPanel((p) => PANELS[(PANELS.indexOf(p) + PANELS.length - 1) % PANELS.length]!); break;
      case "beat-back": activePlayer?.stepBack(); break;
      case "beat-fwd": activePlayer?.stepForward(); break;
      case "chunk-back": for (let i = 0; i < 10; i++) activePlayer?.stepBack(); break;
      case "chunk-fwd": for (let i = 0; i < 10; i++) activePlayer?.stepForward(); break;
      case "to-start": activePlayer?.toStart(); break;
      case "to-live": activePlayer?.toLive(); break;
      case "pause": activePlayer && (activePlayer.mode() === "paused" ? activePlayer.play() : activePlayer.pause()); break;
      case "speed-up": activePlayer?.setSpeed((activePlayer.speed() || 1) * 1.5); break;
      case "speed-down": activePlayer?.setSpeed((activePlayer.speed() || 1) / 1.5); break;
      case "pulse": setPulse((p) => !p); break;
      case "lens": setLensOn((v) => !v); break;
      case "help": setShowHelp((h) => !h); break;
      case "rescan":
        store.pollOnce(Date.now());
        if (selected && (panel === "files" || panel === "tasks" || panel === "git")) {
          const fs = store.fullSession(selected.id); setFull(fs);
          if (panel === "git") setCommits(fs?.cwd ? gitLog(fs.cwd) : []);
        }
        break;
      case "replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
      case "loop": if (replay.player) { replay.player.setLoop(!replay.player.isLoop()); setReplay({ player: replay.player }); } break;
    }
  });

  const { w, h } = size;

  const marker = (() => {
    const sp = activePlayer ? activePlayer.speed() : 1;
    const spd = ` ${Number(sp.toFixed(2))}×`;
    let m: string;
    if (replay.player) m = `⏮ replay ${replay.player.cursor()}/${replay.player.all().length}${replay.player.mode() === "paused" ? " ⏸" : ""}${replay.player.isLoop() ? " · ⟳" : ""}`;
    else if (!player) return "";
    else if (player.mode() === "history") m = `⏪ ${player.cursor()}/${player.all().length}`;
    else if (player.mode() === "paused") m = "⏸ paused";
    else { const back = player.backlog(); m = back > 0 ? `▸+${back}` : "▸ live"; }
    return m + spd;
  })();

  return (
    <box style={{ width: w, height: h, backgroundColor: TRANSPARENT }}>
      {/* Fullscreen overlays render SOLO: hide the live panel behind them so the
          transparent menu composites over the terminal bg, not over live content
          (otherwise both layers interleave and the menu is unreadable). */}
      {!picker.open && !showHelp && !palette.open && (
        <Showcase
          session={selected}
          panel={panel}
          presented={activePlayer ? activePlayer.presented() : []}
          cursor={cursor}
          pulse={pulse}
          lensOn={lensOn}
          marker={marker}
          width={w}
          height={h}
          commits={commits}
          full={full}
          progress={progress}
        />
      )}
      {picker.open && (
        <Menu
          title={picker.stage === "projects" ? " PROJECTS · ⏎ open · esc close " : ` ${picker.project ?? ""} · ⏎ open · esc back `}
          footer="⏎ open · j/k move · esc back"
          rows={pickerRows(sessions, picker.stage === "projects" ? null : picker.project)}
          index={picker.index}
          width={w}
          height={h}
        />
      )}
      {showHelp && (
        <Menu title=" KEYS · esc close " footer="esc close" rows={helpRows()} index={-1} width={w} height={h} />
      )}
      {palette.open && <CommandPalette query={palette.query} index={palette.index} panel={panel} width={w} />}
    </box>
  );
}
