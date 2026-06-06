import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { truncate } from "./format";
import { PhaseRibbon } from "./PhaseRibbon";
import { StatusBar } from "./StatusBar";
import { Flow } from "./panels/Flow";
import { Log } from "./panels/Log";
import { Files } from "./panels/Files";
import { Todos } from "./panels/Todos";
import { Git } from "./panels/Git";
import type { Beat } from "../core/types";
import type { Commit } from "../core/types";
import { usePowerline, POWERLINE_RIGHT } from "./icons";

export type PanelId = "flow" | "files" | "todos" | "log" | "git";
export const PANELS: PanelId[] = ["flow", "files", "todos", "log", "git"];

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
}

export function Showcase({ session, panel, presented, cursor, pulse, lensOn, marker, width, height, commits }: Props) {
  if (!session) {
    return (
      <box style={{ flexGrow: 1, border: true, padding: 1, justifyContent: "center", alignItems: "center" }}>
        <text fg={theme.dim}>No session selected. Launch Claude Code somewhere — it will appear on the left.</text>
      </box>
    );
  }
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
          {PANELS.map((p, i) => {
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
        {panel === "log" && <Log beats={presented} height={bodyHeight} />}
        {panel === "files" && <Files heat={session.fileHeat} height={bodyHeight} />}
        {panel === "todos" && <Todos todos={session.todos} height={bodyHeight} />}
        {panel === "git" && <Git commits={commits} width={width - 4} height={bodyHeight} />}
      </box>
      {/* fixed footer */}
      <box style={{ flexShrink: 0 }}>
        <StatusBar session={session} marker={marker} elapsedMs={Math.max(0, session.lastActivityTs - session.startedTs)} />
      </box>
    </box>
  );
}
