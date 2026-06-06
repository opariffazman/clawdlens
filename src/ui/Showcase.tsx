import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { truncate } from "./format";
import { PhaseRibbon } from "./PhaseRibbon";
import { StatusBar } from "./StatusBar";
import { Flow } from "./panels/Flow";
import { Files } from "./panels/Files";
import { Tasks } from "./panels/Tasks";
import { Git } from "./panels/Git";
import type { Beat } from "../core/types";
import type { Commit } from "../core/types";
import { usePowerline, POWERLINE_RIGHT } from "./icons";

export type PanelId = "flow" | "files" | "tasks" | "git";
export const PANELS: PanelId[] = ["flow", "files", "tasks", "git"];

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
}

export function Showcase({ session, panel, presented, cursor, pulse, lensOn, marker, width, height, commits, full }: Props) {
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
  // height budget: border(2) + padding(2) + header cluster(≤4) + body marginTop(1) + statusbar(1)
  const bodyHeight = Math.max(1, height - 10);
  return (
    <box style={{ flexGrow: 1, border: true, flexDirection: "column", padding: 1 }}>
      {/* fixed header cluster — never shrinks, so each line keeps its own row */}
      <box style={{ flexShrink: 0, flexDirection: "column" }}>
        <PhaseRibbon lens={lensOn ? session.lens : { ...session.lens, lensId: null }} />
        <text fg={theme.fg}>{`● ${session.project} · ${session.gitBranch || "?"} · ${session.model}`}</text>
        <text fg={theme.dim}>{truncate(session.title || session.lastPrompt, width - 6)}</text>
        <box style={{ flexDirection: "row" }}>
          {PANELS.map((p) => {
            const active = p === panel;
            const sep = usePowerline() ? POWERLINE_RIGHT : " ";
            return (
              <text key={p} fg={active ? theme.accent : theme.dim}>
                {active ? `${sep}${p}${sep}` : ` ${p} `}
              </text>
            );
          })}
        </box>
      </box>
      {/* body — absorbs the slack */}
      <box style={{ flexGrow: 1, flexShrink: 1, marginTop: 1 }}>
        {panel === "flow" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
        {panel === "files" && <Files heat={agg.fileHeat} height={bodyHeight} />}
        {panel === "tasks" && <Tasks todos={agg.todos} lens={tasksLens} height={bodyHeight} />}
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} />}
      </box>
      {/* fixed footer */}
      <box style={{ flexShrink: 0 }}>
        <StatusBar session={session} marker={marker} elapsedMs={Math.max(0, session.lastActivityTs - session.startedTs)} />
      </box>
    </box>
  );
}
