import type { SessionState } from "../core/types";
import { theme } from "./theme";
import { truncate } from "./format";
import { PhaseRibbon } from "./PhaseRibbon";
import { StatusBar } from "./StatusBar";
import { Flow } from "./panels/Flow";
import { Log } from "./panels/Log";
import { Files } from "./panels/Files";
import { Todos } from "./panels/Todos";
import type { Beat } from "../core/types";

export type PanelId = "flow" | "files" | "todos" | "log";
export const PANELS: PanelId[] = ["flow", "files", "todos", "log"];

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
}

export function Showcase({ session, panel, presented, cursor, pulse, lensOn, marker, width, height }: Props) {
  if (!session) {
    return (
      <box style={{ flexGrow: 1, border: true, padding: 1, justifyContent: "center", alignItems: "center" }}>
        <text fg={theme.dim}>No session selected. Launch Claude Code somewhere — it will appear on the left.</text>
      </box>
    );
  }
  const bodyHeight = height - 6;
  return (
    <box style={{ flexGrow: 1, border: true, flexDirection: "column", padding: 1 }}>
      <PhaseRibbon lens={lensOn ? session.lens : { ...session.lens, lensId: null }} />
      <text fg={theme.fg}>{`● ${session.project} · ${session.gitBranch || "?"} · ${session.model}`}</text>
      <text fg={theme.dim}>{truncate(session.title || session.lastPrompt, width - 6)}</text>
      <box style={{ flexDirection: "row", gap: 1 }}>
        {PANELS.map((p) => (
          <text key={p} fg={p === panel ? theme.accent : theme.dim}>{p === panel ? `[${p}]` : ` ${p} `}</text>
        ))}
      </box>
      <box style={{ flexGrow: 1, marginTop: 1 }}>
        {panel === "flow" && <Flow beats={presented} cursor={cursor} pulse={pulse} width={width - 4} height={bodyHeight} />}
        {panel === "log" && <Log beats={presented} height={bodyHeight} />}
        {panel === "files" && <Files heat={session.fileHeat} height={bodyHeight} />}
        {panel === "todos" && <Todos todos={session.todos} height={bodyHeight} />}
      </box>
      <StatusBar session={session} marker={marker} elapsedMs={Math.max(0, session.lastActivityTs - session.startedTs)} />
    </box>
  );
}
