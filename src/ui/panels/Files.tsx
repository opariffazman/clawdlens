import type { FileHeat } from "../../core/types";
import { theme } from "../theme";
import { gaugeBar, truncate } from "../format";

export function Files({ heat, height, progress, sort }: { heat: Record<string, FileHeat>; height: number; progress: number; sort: "edits" | "reads" | "recent" }) {
  const entries = Object.entries(heat)
    .map(([file, h]) => ({ file, score: h.edits * 2 + h.reads, h }))
    .sort((a, b) =>
      sort === "recent" ? b.h.lastTs - a.h.lastTs
      : sort === "reads" ? b.h.reads - a.h.reads
      : b.score - a.score)
    .slice(0, height);
  const max = Math.max(1, ...entries.map((e) => e.score));
  const revealed = Math.ceil(progress * entries.length); // synced to the Flow cursor
  if (entries.length === 0) return <text fg={theme.dim}>no files touched yet</text>;
  return (
    <box style={{ flexDirection: "column" }}>
      {entries.slice(0, revealed).map((e) => (
        <box key={e.file} style={{ flexDirection: "row", gap: 1 }}>
          <text fg={theme.warn}>{gaugeBar(e.score / max, 8)}</text>
          <text fg={theme.fg}>{truncate(e.file, 28)}</text>
          <text fg={theme.dim}>{`✎${e.h.edits} ◇${e.h.reads}`}</text>
        </box>
      ))}
    </box>
  );
}
