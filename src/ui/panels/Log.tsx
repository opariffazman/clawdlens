import type { Beat } from "../../core/types";
import { theme } from "../theme";
import { truncate } from "../format";

export function Log({ beats, height }: { beats: Beat[]; height: number }) {
  const rows = beats.slice(-height);
  return (
    <box style={{ flexDirection: "column" }}>
      {rows.map((b) => (
        <box key={b.id} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={b.kind === "skill" ? theme.accent : theme.warn}>{b.icon || "·"}</text>
          <text fg={theme.fg}>{b.label}{b.count > 1 ? ` ×${b.count}` : ""}</text>
          {b.detail && <text fg={theme.dim}>· {truncate(b.detail, 50)}</text>}
          {b.ok === false && <text fg={theme.err}>✖</text>}
        </box>
      ))}
    </box>
  );
}
