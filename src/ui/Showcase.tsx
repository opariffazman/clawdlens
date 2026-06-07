import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { TRANSPARENT } from "./theme";
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

interface Props {
  session: SessionState | null;
  panel: PanelId;
  presented: Beat[];
  cursor: number;
  pulse: boolean;
  lensOn: boolean;
  marker: string;
  width: number;
  height: number;
  commits: Commit[];
  full: SessionState | null; // whole-session fold for aggregate panels
  progress: number;          // shared 0..1 reveal driven by the Flow player cursor
}

export function Showcase({ session, panel, presented, cursor, pulse, lensOn, marker, width, height, commits, full, progress }: Props) {
  if (!session) {
    return (
      <box style={{ flexGrow: 1, border: true, padding: 1, justifyContent: "center", alignItems: "center" }}>
        <text fg={theme.dim}>No session selected. Launch Claude Code somewhere — it will appear on the left.</text>
      </box>
    );
  }
  // aggregate panels use the full-session fold when available, else the live state
  const agg = full ?? session;
  const tasksLens = lensOn ? agg.lens : { ...agg.lens, lensId: null };
  // height budget: header(2) + tabbar(2) + bottom border(1) + slack = 6
  const bodyHeight = Math.max(1, height - 6);
  return (
    <box style={{ flexGrow: 1, flexDirection: "column", backgroundColor: TRANSPARENT }}>
      <Header session={session} panel={panel} marker={marker} />
      <TabBar panels={PANELS} active={panel} lens={lensOn ? session.lens : { ...session.lens, lensId: null }} width={width} />
      <box
        style={{
          flexGrow: 1, flexShrink: 1,
          border: ["left", "right", "bottom"], borderStyle: "rounded", borderColor: theme.accent,
          paddingLeft: 1, paddingRight: 1, backgroundColor: TRANSPARENT,
        }}
      >
        {panel === "lens" && <Lens />}
        {panel === "log" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
        {panel === "files" && <Files heat={agg.fileHeat} height={bodyHeight} progress={progress} />}
        {panel === "tasks" && <Tasks todos={agg.todos} lens={tasksLens} height={bodyHeight} progress={progress} />}
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} progress={progress} />}
      </box>
    </box>
  );
}
