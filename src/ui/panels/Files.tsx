import type { FileHeat } from "../../core/types";
import { theme } from "../theme";
import { gaugeBar, truncate } from "../format";

export function Files({ heat, height }: { heat: Record<string, FileHeat>; height: number }) {
  const entries = Object.entries(heat)
    .map(([file, h]) => ({ file, score: h.edits * 2 + h.reads, h }))
    .sort((a, b) => b.score - a.score)
    .slice(0, height);
  const max = Math.max(1, ...entries.map((e) => e.score));
  if (entries.length === 0) return <text fg={theme.dim}>no files touched yet</text>;
  return (
    <box style={{ flexDirection: "column" }}>
      {entries.map((e) => (
        <box key={e.file} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.warn}>{gaugeBar(e.score / max, 8)}</text>
          <text fg={theme.fg}>{truncate(e.file, 28)}</text>
          <text fg={theme.dim}>{`✎${e.h.edits} ◇${e.h.reads}`}</text>
        </box>
      ))}
    </box>
  );
}
