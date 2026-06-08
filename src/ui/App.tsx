import { useCallback, useEffect, useRef, useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { createStore } from "../store/sessionStore";
import { mapKey } from "./keymap";
import { usePlayers } from "./usePlayers";
import { TRANSPARENT } from "./theme";
import { shouldAnimate } from "./anim";
import { Menu, pickerRows, helpRows } from "./Menu";
import { CommandBox } from "./CommandBox";
import { filterCommands, commandSuggestions } from "../core/commands";
import { rankRows } from "../core/chrome";
import { Showcase, PANELS, type PanelId } from "./Showcase";
import { DEFAULT_PANEL } from "../core/types";
import { createPlayer } from "../core/player";
import { gitLog } from "../store/gitFetch";

type Store = ReturnType<typeof createStore>;
type PickerState = { open: boolean; stage: "projects" | "sessions"; project: string | null; index: number; query: string; filtering: boolean };

// transparent canvas → inherit the user's terminal background (OLED-friendly)
const CLOSED: PickerState = { open: false, stage: "projects", project: null, index: 0, query: "", filtering: false };

export function App({ store }: { store: Store }) {
  const renderer = useRenderer();
  const [sessions, setSessions] = useState(store.sessions());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId>(DEFAULT_PANEL);
  const [showHelp, setShowHelp] = useState(false);
  const [size, setSize] = useState({ w: renderer.terminalWidth ?? 120, h: renderer.terminalHeight ?? 40 });
  const [replay, setReplay] = useState<{ player: ReturnType<typeof createPlayer> | null }>({ player: null });
  const [commits, setCommits] = useState<import("../core/types").Commit[]>([]);
  const [full, setFull] = useState<import("../core/types").SessionState | null>(null);
  const [picker, setPicker] = useState<PickerState>(CLOSED);
  const [palette, setPalette] = useState<{ open: boolean; query: string; sugIndex: number }>({ open: false, query: "", sugIndex: 0 });
  const [filesSort, setFilesSort] = useState<"edits" | "reads" | "recent">("edits");
  const [gitScope, setGitScope] = useState<"all" | "branch">("all");
  const [tasksHideDone, setTasksHideDone] = useState(false);
  const [infoOn, setInfoOn] = useState(false);

  useEffect(() => { const unsub = store.subscribe(() => setSessions(store.sessions())); return () => { unsub(); }; }, [store]);
  useEffect(() => { renderer.targetFps = 16; }, [renderer]); // steady-state render cadence
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

  // aggregate detail panels (lens/files/tasks/git) read the FULL session, not just the live window
  useEffect(() => {
    if (!selected) { setFull(null); setCommits([]); return; }
    if (panel === "lens" || panel === "files" || panel === "tasks" || panel === "git") {
      const fs = store.fullSession(selected.id);
      setFull(fs);
      setCommits(panel === "git" && fs?.cwd ? gitLog(fs.cwd, gitScope === "all") : []);
    } else {
      setCommits([]);
    }
  }, [panel, selected?.id, gitScope]);

  const player = selected ? players.get(selected.id) : null;
  const activePlayer = replay.player ?? player;
  // one shared timeline: all panels reveal in sync with the active player's cursor
  const playerTotal = activePlayer ? activePlayer.all().length : 0;
  const cursor = activePlayer ? activePlayer.cursor() : 0;
  const progress = activePlayer && playerTotal > 0 ? cursor / playerTotal : 1;
  const lastAdvanceMs = activePlayer ? activePlayer.lastAdvanceMs() : -1;
  const intervalMs = activePlayer ? activePlayer.intervalMs() : 1000;
  const animate = activePlayer ? shouldAnimate(activePlayer.mode(), lastAdvanceMs, intervalMs, Date.now()) : false;

  // Force a full repaint whenever the scroll position or layout changes — the
  // moments stale ghost cells form. Pulse-only frames (cursor unchanged) keep
  // the cheap incremental diff. See forceRepaint above for why.
  const prevCursor = useRef(-1);
  useEffect(() => {
    if (cursor !== prevCursor.current) { prevCursor.current = cursor; forceRepaint(); }
  });
  useEffect(() => { forceRepaint(); }, [panel, selected?.id, replay.player, picker.open, picker.stage, picker.query, picker.filtering, full, infoOn, showHelp, animate, palette.open, palette.query, palette.sugIndex, forceRepaint]);

  const switchTo = (id: string | null) => { setReplay({ player: null }); setSelectedId(id); };

  const runCommand = (id: string) => {
    switch (id) {
      case "panel.lens": setPanel("lens"); break;
      case "panel.files": setPanel("files"); break;
      case "panel.tasks": setPanel("tasks"); break;
      case "panel.git": setPanel("git"); break;
      case "panel.log": setPanel("log"); break;
      case "nav.sessions": setPicker({ open: true, stage: "projects", project: null, index: 0, query: "", filtering: false }); break;
      case "view.help": setShowHelp(true); break;
      case "play.pause": activePlayer && (activePlayer.mode() === "paused" ? activePlayer.play() : activePlayer.pause()); break;
      case "play.replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
      case "files.sort": setFilesSort((s) => (s === "edits" ? "reads" : s === "reads" ? "recent" : "edits")); break;
      case "git.scope": setGitScope((s) => (s === "all" ? "branch" : "all")); break;
      case "tasks.hideDone": setTasksHideDone((v) => !v); break;
      case "lens.info": setInfoOn((v) => !v); break;
      case "app.quit": renderer.destroy(); break;
    }
  };

  useKeyboard((key) => {
    const kn = key.name;
    if (palette.open) {
      const sug = commandSuggestions(palette.query, panel);
      if (kn === "escape") { setPalette({ open: false, query: "", sugIndex: 0 }); return; }
      if (kn === "return" || kn === "enter") {
        const cmd = sug[palette.sugIndex]?.command ?? filterCommands(palette.query, panel)[0];
        setPalette({ open: false, query: "", sugIndex: 0 });
        if (cmd) runCommand(cmd.id);
        return;
      }
      if (kn === "tab" || kn === "right") { const g = sug[palette.sugIndex]?.ghost; if (g) setPalette((p) => ({ ...p, query: p.query + g, sugIndex: 0 })); return; }
      if (kn === "up") { if (sug.length) setPalette((p) => ({ ...p, sugIndex: (p.sugIndex + 1) % sug.length })); return; }
      if (kn === "down") { if (sug.length) setPalette((p) => ({ ...p, sugIndex: (p.sugIndex - 1 + sug.length) % sug.length })); return; }
      if (kn === "backspace") { setPalette((p) => ({ ...p, query: p.query.slice(0, -1), sugIndex: 0 })); return; }
      if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") {
        setPalette((p) => ({ ...p, query: p.query + key.sequence, sugIndex: 0 }));
      }
      return;
    }
    if (picker.open) {
      const baseRows = pickerRows(sessions, picker.stage === "projects" ? null : picker.project);
      const rows = rankRows(baseRows, picker.query);
      const len = rows.length;
      const printable = key.sequence && key.sequence.length === 1 && key.sequence >= " " && key.sequence !== "/" && kn !== "return" && kn !== "space";
      if (kn === "/" ) { setPicker((p) => ({ ...p, filtering: true })); return; }
      if (picker.filtering && kn === "escape") { setPicker((p) => ({ ...p, filtering: false, query: "", index: 0 })); return; }
      if (picker.filtering && kn === "backspace") { setPicker((p) => ({ ...p, query: p.query.slice(0, -1), index: 0 })); return; }
      if (picker.filtering && printable) { setPicker((p) => ({ ...p, query: p.query + key.sequence, index: 0 })); return; }
      if (kn === "escape" || kn === ":") {
        setPicker(kn === "escape" && picker.stage === "sessions"
          ? { open: true, stage: "projects", project: null, index: 0, query: "", filtering: false }
          : CLOSED);
      } else if (kn === "down") {
        setPicker((p) => ({ ...p, index: Math.min(Math.max(0, len - 1), p.index + 1) }));
      } else if (kn === "up") {
        setPicker((p) => ({ ...p, index: Math.max(0, p.index - 1) }));
      } else if (kn === "return" || kn === "enter") {
        if (picker.stage === "projects") {
          const proj = (rows[Math.min(picker.index, len - 1)] as { id: string } | undefined)?.id ?? null;
          if (proj) setPicker({ open: true, stage: "sessions", project: proj, index: 0, query: "", filtering: false });
        } else {
          const id = (rows[Math.min(picker.index, len - 1)] as { id: string } | undefined)?.id;
          if (id) switchTo(id);
          setPicker(CLOSED);
        }
      }
      return;
    }
    if (kn === ":") { setPalette({ open: true, query: "", sugIndex: 0 }); return; }
    const action = mapKey({ name: key.name, shift: key.shift, ctrl: key.ctrl });
    if (!action) return;
    switch (action.type) {
      case "quit": renderer.destroy(); break;
      case "panel-next": setPanel((p) => PANELS[(PANELS.indexOf(p) + 1) % PANELS.length]!); break;
      case "panel-prev": setPanel((p) => PANELS[(PANELS.indexOf(p) + PANELS.length - 1) % PANELS.length]!); break;
      case "beat-back": activePlayer?.stepBack(); break;
      case "beat-fwd": activePlayer?.stepForward(); break; // stepForward snaps to live at head (player.ts:76)
      case "pause": activePlayer && (activePlayer.mode() === "paused" ? activePlayer.play() : activePlayer.pause()); break;
      case "speed-up": activePlayer?.setSpeed((activePlayer.speed() || 1) * 1.5); break;
      case "speed-down": activePlayer?.setSpeed((activePlayer.speed() || 1) / 1.5); break;
      case "info": setInfoOn((v) => !v); break;
      case "help": setShowHelp((h) => !h); break;
      case "replay": {
        if (replay.player) { setReplay({ player: null }); break; }
        if (!selected) break;
        const rp = createPlayer({ baseIntervalMs: 900, replay: true, loop: false });
        rp.setBeats(store.fullBeats(selected.id));
        setReplay({ player: rp });
        break;
      }
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

  // command palette: k9s-style inline ghost (prefix completion of the cycled suggestion)
  const paletteSug = palette.open ? commandSuggestions(palette.query, panel) : [];
  const paletteGhost = paletteSug[palette.sugIndex]?.ghost ?? "";

  return (
    <box style={{ width: w, height: h, backgroundColor: TRANSPARENT }}>
      {/* Fullscreen overlays (picker/help) render SOLO: hide the live panel behind them
          so the transparent menu composites over the terminal bg, not over live content.
          The command palette is NOT solo — it's an ephemeral box layered on top of the
          panel (Showcase renders it), so the panel stays visible beneath. */}
      {!picker.open && !showHelp && (
        <Showcase
          session={selected}
          panel={panel}
          presented={activePlayer ? activePlayer.presented() : []}
          cursor={cursor}
          playerTotal={playerTotal}
          infoOn={infoOn}
          lastAdvanceMs={lastAdvanceMs}
          intervalMs={intervalMs}
          animate={animate}
          marker={marker}
          width={w}
          height={h}
          commits={commits}
          full={full}
          progress={progress}
          filesSort={filesSort}
          tasksHideDone={tasksHideDone}
          paletteOpen={palette.open}
          paletteQuery={palette.query}
          paletteGhost={paletteGhost}
        />
      )}
      {picker.open && (
        <Menu
          title={picker.stage === "projects" ? " PROJECTS · ⏎ open · esc close " : ` ${picker.project ?? ""} · ⏎ open · esc back `}
          footer="⏎ open · ↑↓ move · esc back"
          rows={rankRows(pickerRows(sessions, picker.stage === "projects" ? null : picker.project), picker.query)}
          index={picker.index}
          width={w}
          height={h}
          filter={picker.filtering ? picker.query : undefined}
        />
      )}
      {showHelp && (
        <Menu title=" KEYS · esc close " footer="esc close" rows={helpRows()} index={-1} width={w} height={h} />
      )}
    </box>
  );
}
