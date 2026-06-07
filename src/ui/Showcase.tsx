import type { SessionState } from "../core/types";
import { theme, TRANSPARENT } from "./theme";
import { Flow } from "./panels/Flow";
import { Files } from "./panels/Files";
import { Tasks } from "./panels/Tasks";
import { Git } from "./panels/Git";
import { Lens } from "./panels/Lens";
import type { Beat } from "../core/types";
import type { Commit } from "../core/types";
import { type PanelId, PANELS } from "../core/types";
export type { PanelId };
export { PANELS };
import { Header } from "./Header";
import { TabBar } from "./TabBar";
import { CommandBox } from "./CommandBox";

interface Props {
  session: SessionState | null;
  panel: PanelId;
  presented: Beat[];
  cursor: number;
  playerTotal: number;
  infoOn: boolean;
  lastAdvanceMs: number;     // player cadence for the pulse
  intervalMs: number;        // player cadence for the pulse
  pulse: boolean;
  lensOn: boolean;
  marker: string;
  width: number;
  height: number;
  commits: Commit[];
  full: SessionState | null; // whole-session fold for aggregate panels
  progress: number;          // shared 0..1 reveal driven by the Flow player cursor
  filesSort: "edits" | "reads" | "recent";
  tasksHideDone: boolean;
  paletteOpen: boolean;      // command palette active → overlay the CommandBox on top of the panel
  paletteQuery: string;
  paletteGhost: string;      // inline ghost completion
}

export function Showcase({ session, panel, presented, cursor, playerTotal, infoOn, lastAdvanceMs, intervalMs, pulse, lensOn, marker, width, height, commits, full, progress, filesSort, tasksHideDone, paletteOpen, paletteQuery, paletteGhost }: Props) {
  if (!session) {
    return (
      <box style={{ flexGrow: 1, border: true, borderStyle: "rounded", borderColor: theme.accent, backgroundColor: TRANSPARENT, padding: 1, justifyContent: "center", alignItems: "center" }}>
        <text fg={theme.dim}>No session selected. Launch Claude Code somewhere — it will appear on the left.</text>
      </box>
    );
  }
  // aggregate panels use the full-session fold when available, else the live state
  const agg = full ?? session;
  const tasksLens = lensOn ? agg.lens : { ...agg.lens, lensId: null };
  // height budget: header(2) + tabbar(2) + bottom border(1) + slack = 6; the command
  // box (when open) is its own 3-row element above the tabs, so reserve those rows too.
  const bodyHeight = Math.max(1, height - 6 - (paletteOpen ? 3 : 0));
  return (
    <box style={{ flexGrow: 1, flexDirection: "column", backgroundColor: TRANSPARENT }}>
      <Header session={session} panel={panel} marker={marker} />
      {/* command palette sits ABOVE the panel (y-axis), pushing tabs + frame down */}
      {paletteOpen && <CommandBox query={paletteQuery} ghost={paletteGhost} width={width} />}
      <TabBar panels={PANELS} active={panel} lens={tasksLens} width={width} />
      <box
        style={{
          flexGrow: 1, flexShrink: 1,
          border: ["left", "right", "bottom"], borderStyle: "rounded", borderColor: theme.accent,
          paddingLeft: 1, paddingRight: 1, backgroundColor: TRANSPARENT,
        }}
      >
        {panel === "lens" && <Lens presented={presented} cursor={cursor} total={playerTotal} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} status={session.status} infoOn={infoOn} width={width - 4} height={bodyHeight} />}
        {panel === "log" && <Flow beats={presented} cursor={cursor} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} width={width - 4} height={bodyHeight} />}
        {panel === "files" && <Files heat={agg.fileHeat} height={bodyHeight} progress={progress} sort={filesSort} />}
        {panel === "tasks" && <Tasks todos={agg.todos} lens={tasksLens} height={bodyHeight} progress={progress} hideDone={tasksHideDone} />}
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} progress={progress} pulse={pulse} lastAdvanceMs={lastAdvanceMs} intervalMs={intervalMs} />}
      </box>
    </box>
  );
}
